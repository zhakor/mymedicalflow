/**
 * Motore di sincronizzazione dell'archivio unico (CR §5).
 *
 * Ciclo di scrittura, a copia su scrittura:
 *   1. legge il puntatore; se un altro dispositivo ha pubblicato, scarica e fonde
 *   2. carica l'archivio risultante come NUOVO file
 *   3. sposta il puntatore con una transazione condizionata alla revisione letta
 *   4. se la transazione fallisce ricomincia; il file orfano va nel cestino
 *
 * Le esecuzioni sono serializzate: mai due cicli in parallelo sullo stesso dispositivo.
 */

import { cifraArchivio, decifraArchivio, type Archivio } from './cifratura'
import {
  ErroreConnessione,
  type DepositoFile,
  type Puntatore,
  type Registro,
  type StatoRegistro,
} from './contratti'
import { fondi, rinumeraFattureDuplicate, type Conflitto, type Rinumerazione, type Scelta } from './fusione'

const MAX_TENTATIVI = 5

/** Ultima versione allineata con il cloud. Il desktop la conserva fra un avvio e l'altro. */
export interface StatoSincronizzato {
  base: Archivio
  revisione: number
}

export type EsitoSincronizzazione =
  | {
      tipo: 'allineato'
      revisione: number
      /** true se questo ciclo ha pubblicato una nuova revisione. */
      pubblicato: boolean
      rinumerate: Rinumerazione[]
      /** Modifiche locali non ancora pubblicate dopo MAX_TENTATIVI: serve un altro ciclo. */
      inAttesa: boolean
    }
  | { tipo: 'offline'; errore: string }

export interface OpzioniMotore {
  deposito: DepositoFile
  registro: Registro
  chiave: CryptoKey
  dispositivo: string
  leggiLocale(): Archivio
  /** Sostituisce l'archivio locale (e aggiorna l'interfaccia). */
  scriviLocale(archivio: Archivio): void
  /** Chiede all'utente quale versione tenere. Le voci senza scelta prendono il remoto. */
  risolviConflitti(conflitti: Conflitto[]): Promise<Map<string, Scelta>>
  salvaStato?(stato: StatoSincronizzato): void | Promise<void>
  /** Esito di ogni ciclo, anche di quelli avviati da una notifica. */
  onEsito?(esito: EsitoSincronizzazione): void
  onErrore?(errore: unknown): void
  statoIniziale?: StatoSincronizzato | null
  adesso?: () => string
}

function uguali(a: Archivio, b: Archivio): boolean {
  const ka = Object.keys(a)
  return ka.length === Object.keys(b).length && ka.every((k) => a[k] === b[k])
}

export class MotoreSincronizzazione {
  private stato: StatoSincronizzato | null
  private coda: Promise<unknown> = Promise.resolve()
  private readonly adesso: () => string
  /**
   * Ultimo puntatore ricevuto dall'ascolto. Finché l'ascolto è attivo evita di
   * rileggere il documento a ogni salvataggio: se è vecchio, la transazione
   * di pubblicazione fallisce e il ciclo successivo lo rilegge.
   */
  private ultimoNoto: Puntatore | null = null
  private inAscolto = false

  constructor(private readonly o: OpzioniMotore) {
    this.stato = o.statoIniziale ?? null
    this.adesso = o.adesso ?? (() => new Date().toISOString())
  }

  get revisione(): number | null {
    return this.stato?.revisione ?? null
  }

  /** true se l'archivio locale contiene modifiche non ancora pubblicate. */
  get inAttesa(): boolean {
    return this.stato !== null && !uguali(this.o.leggiLocale(), this.stato.base)
  }

  /** Attende la fine dei cicli in corso. */
  inattivo(): Promise<void> {
    return this.coda.then(() => undefined)
  }

  /**
   * Prima pubblicazione dal desktop (CR §8): l'archivio locale diventa la
   * revisione 1. Fallisce se esiste già un archivio remoto.
   */
  inizializzaRemoto(): Promise<void> {
    return this.inCoda(async () => {
      const locale = this.o.leggiLocale()
      const fileId = await this.o.deposito.carica(1, await cifraArchivio(locale, this.o.chiave))
      const ok = await this.o.registro.pubblica(0, this.puntatore(1, fileId))
      if (!ok) {
        await this.o.deposito.cestina(fileId).catch(() => {})
        throw new Error('Esiste già un archivio su Drive: collegarsi a quello invece di crearne uno nuovo.')
      }
      await this.adotta(locale, 1, locale)
    })
  }

  /** Collega il dispositivo all'archivio remoto, che SOSTITUISCE quello locale. */
  collega(): Promise<void> {
    return this.inCoda(async () => {
      const p = (await this.o.registro.leggi()).puntatore
      if (!p) throw new Error('Nessun archivio su Drive: configurarlo prima dal desktop.')
      const remoto = await this.scarica(p)
      this.stato = { base: remoto, revisione: p.revisione }
      this.o.scriviLocale(remoto)
      await this.o.salvaStato?.(this.stato)
    })
  }

  /**
   * Allinea locale e cloud. Senza rete restituisce `offline` e le modifiche
   * restano in coda. Con l'ascolto attivo e nulla da pubblicare non tocca la rete.
   * `fresco` rilegge comunque il documento: serve prima delle operazioni delicate.
   */
  sincronizza(opzioni: { fresco?: boolean } = {}): Promise<EsitoSincronizzazione> {
    return this.inCoda(async () => {
      let esito: EsitoSincronizzazione
      try {
        esito = await this.ciclo(opzioni.fresco ?? false)
      } catch (err) {
        if (!(err instanceof ErroreConnessione)) throw err
        esito = { tipo: 'offline', errore: err.message }
      }
      this.o.onEsito?.(esito)
      return esito
    })
  }

  /**
   * Da chiamare prima di un'operazione delicata (CR §6), per esempio prima di
   * calcolare il numero di una fattura. Senza connessione solleva un errore.
   */
  async allineaPerOperazioneDelicata(): Promise<EsitoSincronizzazione & { tipo: 'allineato' }> {
    const esito = await this.sincronizza({ fresco: true })
    if (esito.tipo === 'offline') {
      throw new ErroreConnessione('Serve la connessione per completare questa operazione.')
    }
    return esito
  }

  /**
   * Sincronizza a ogni nuova revisione pubblicata da un altro dispositivo.
   * È l'unico ascolto del documento: `ancheA` riceve lo stesso stato (per le
   * bozze di fattura) senza aprire un secondo ascolto.
   */
  ascolta(ancheA?: (stato: StatoRegistro) => void): () => void {
    this.inAscolto = true
    const smetti = this.o.registro.ascolta((s) => {
      // Una notifica in ritardo non deve far tornare indietro il puntatore noto.
      if (!this.ultimoNoto || (s.puntatore && s.puntatore.revisione >= this.ultimoNoto.revisione)) {
        this.ultimoNoto = s.puntatore
      }
      if (this.stato && s.puntatore && s.puntatore.revisione !== this.stato.revisione) {
        this.sincronizza().catch((err) => this.o.onErrore?.(err))
      }
      ancheA?.(s)
    })
    return () => {
      this.inAscolto = false
      this.ultimoNoto = null
      smetti()
    }
  }

  // ─── Interni ────────────────────────────────────────────────────────────────

  private inCoda<T>(lavoro: () => Promise<T>): Promise<T> {
    const risultato = this.coda.then(lavoro)
    this.coda = risultato.catch(() => {})
    return risultato
  }

  private puntatore(revisione: number, fileId: string): Puntatore {
    return { revisione, fileId, dispositivo: this.o.dispositivo, aggiornatoIl: this.adesso() }
  }

  private async scarica(p: Puntatore): Promise<Archivio> {
    return decifraArchivio(await this.o.deposito.scarica(p.fileId), this.o.chiave)
  }

  private async ciclo(fresco: boolean): Promise<EsitoSincronizzazione> {
    if (!this.stato) throw new Error('Dispositivo non collegato all\'archivio su Drive.')
    let pubblicato = false
    let rinumerate: Rinumerazione[] = []

    for (let tentativo = 0; tentativo < MAX_TENTATIVI; tentativo++) {
      const { base, revisione } = this.stato
      const usaNoto = tentativo === 0 && !fresco && this.inAscolto && this.ultimoNoto !== null
      const p = usaNoto ? this.ultimoNoto : (await this.o.registro.leggi()).puntatore
      if (this.inAscolto) this.ultimoNoto = p
      if (!p) throw new Error('L\'archivio su Drive non è più disponibile.')

      const istantanea = this.o.leggiLocale()
      const remoto = p.revisione === revisione ? base : await this.scarica(p)

      let { archivio: fuso, conflitti } = fondi(base, istantanea, remoto)
      if (conflitti.length > 0) {
        const scelte = await this.o.risolviConflitti(conflitti)
        fuso = fondi(base, istantanea, remoto, scelte).archivio
      }
      const rinumerazione = rinumeraFattureDuplicate(fuso, remoto, this.adesso)
      const finale = rinumerazione.archivio

      if (uguali(finale, remoto)) {
        // Nulla da pubblicare: si adotta la versione remota.
        await this.adotta(finale, p.revisione, istantanea)
      } else {
        const nuovo = p.revisione + 1
        const fileId = await this.o.deposito.carica(nuovo, await cifraArchivio(finale, this.o.chiave))
        // Se la risposta della transazione va persa il file NON si cestina:
        // potrebbe essere già il puntatore pubblicato. Il ciclo successivo
        // lo riconosce come revisione remota e la fusione converge.
        const pubblicando = this.puntatore(nuovo, fileId)
        const ok = await this.o.registro.pubblica(p.revisione, pubblicando)
        if (!ok) {
          await this.o.deposito.cestina(fileId).catch(() => {})
          continue
        }
        if (this.inAscolto) this.ultimoNoto = pubblicando
        pubblicato = true
        rinumerate = [...rinumerate, ...rinumerazione.rinumerate]
        await this.adotta(finale, nuovo, istantanea)
      }

      if (!this.inAttesa) {
        return { tipo: 'allineato', revisione: this.stato.revisione, pubblicato, rinumerate, inAttesa: false }
      }
      // Modifiche locali arrivate durante il ciclo: si pubblicano subito.
    }

    return {
      tipo: 'allineato',
      revisione: this.stato.revisione,
      pubblicato,
      rinumerate,
      inAttesa: this.inAttesa,
    }
  }

  /**
   * Registra `finale` come nuova base. Se l'utente ha modificato i dati mentre
   * il ciclo era in corso, quelle modifiche si conservano sopra `finale`.
   */
  private async adotta(finale: Archivio, revisione: number, istantanea: Archivio): Promise<void> {
    const attuale = this.o.leggiLocale()
    const daScrivere = uguali(attuale, istantanea)
      ? finale
      : fondi(istantanea, attuale, finale, new Map(), 'locale').archivio

    this.stato = { base: finale, revisione }
    if (!uguali(daScrivere, attuale)) this.o.scriviLocale(daScrivere)
    await this.o.salvaStato?.(this.stato)
  }
}
