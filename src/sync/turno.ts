/**
 * Turno di fatturazione (CR §6): una sola serie NUM/ANNO, quindi un solo
 * dispositivo alla volta può assegnare i numeri.
 *
 * - Il desktop ("principale") prende il turno all'avvio e lo TIENE anche quando
 *   la connessione cade: così fattura offline senza chiedere nulla a nessuno.
 *   Lo cede da solo quando il telefono lo chiede, purché sia online e non abbia
 *   nulla da pubblicare, e lo libera alla chiusura dopo aver sincronizzato.
 * - Il telefono ("ospite") prende il turno solo per il tempo di una fattura e
 *   lo libera subito. Se il desktop lo tiene e non risponde (offline o chiuso
 *   con fatture non caricate) la fatturazione dal telefono è bloccata.
 * - Desktop avviato offline dopo una chiusura normale: non tiene il turno e non
 *   può verificare sul cloud, quindi non numera. La fattura si salva come bozza
 *   e viene numerata da sola appena torna la rete (`bozze`).
 *
 * Consumi: nessun battito periodico. Il turno sta nello stesso documento del
 * puntatore e passa dall'unico ascolto del motore (`motore.ascolta(turno.suCambio)`).
 */

import { ErroreConnessione, type Registro, type StatoRegistro } from './contratti'
import type { MotoreSincronizzazione } from './motore'

export type Ruolo = 'principale' | 'ospite'

export type MotivoBlocco =
  /** L'altro dispositivo sta emettendo una fattura in questo momento. */
  | 'occupato'
  /** Desktop offline senza turno: serve la verifica sul cloud, intanto si salva una bozza. */
  | 'verifica-necessaria'
  /** Il desktop tiene il turno e non risponde: è offline o chiuso con fatture non caricate. */
  | 'pc-non-raggiungibile'

const MESSAGGI: Record<MotivoBlocco, string> = {
  occupato: "L'altro dispositivo sta emettendo una fattura: riprova tra qualche secondo.",
  'verifica-necessaria':
    "Fatturazione in attesa di verifica con il cloud: collega il PC a internet, anche tramite l'hotspot del telefono. Intanto puoi salvare la fattura come bozza: verrà numerata appena torna la connessione.",
  'pc-non-raggiungibile':
    'Il PC dello studio potrebbe avere fatture non ancora sincronizzate: collegalo a internet per continuare.',
}

export class TurnoNonDisponibile extends Error {
  constructor(readonly motivo: MotivoBlocco) {
    super(MESSAGGI[motivo])
    this.name = 'TurnoNonDisponibile'
  }
}

export interface OpzioniTurno {
  registro: Registro
  motore: MotoreSincronizzazione
  dispositivo: string
  ruolo: Ruolo
  /** Desktop: se teneva il turno all'ultima esecuzione (serve per fatturare avviando offline). */
  tenutoAllAvvio?: boolean
  /** Desktop: conserva `tenuto` fra un avvio e l'altro. */
  salva?(tenuto: boolean): void | Promise<void>
  onErrore?(errore: unknown): void
  /** Telefono: quanto attendere che il desktop ceda il turno. */
  attesaMs?: number
  /**
   * Desktop: bozze "da numerare" salvate offline. Appena il PC ottiene il
   * turno online le numera con `numera`, che riceve dati già verificati sul cloud.
   */
  bozze?: {
    inSospeso(): boolean
    numera(): Promise<unknown>
  }
}

export class TurnoFatturazione {
  private tenuto: boolean
  private inUso = false
  private chiuso = false
  private ultimo: StatoRegistro | null = null
  private catena: Promise<unknown> = Promise.resolve()
  private attese = new Set<() => void>()
  private numerando = false

  constructor(private readonly o: OpzioniTurno) {
    this.tenuto = o.tenutoAllAvvio ?? false
  }

  /** true se questo dispositivo può numerare fatture adesso (per il desktop anche offline). */
  get mio(): boolean {
    return this.tenuto
  }

  /** Da passare a `motore.ascolta`: riceve ogni cambio del documento. */
  readonly suCambio = (s: StatoRegistro): void => {
    this.ultimo = s
    const mio = s.turno?.dispositivo === this.o.dispositivo
    if (mio !== this.tenuto && !this.inUso) this.imposta(mio)
    for (const sveglia of this.attese) sveglia()

    if (this.o.ruolo === 'principale') {
      if (!s.turno && !this.chiuso) this.inSottofondo(() => this.prendi())
      if (mio && s.richiesta && s.richiesta.dispositivo !== this.o.dispositivo) {
        this.inSottofondo(() => this.valutaCessione())
      }
      // Ogni notifica arriva solo se si è online: è il momento di verificare e numerare.
      if (this.o.bozze?.inSospeso()) this.numeraBozze()
    } else if (mio && !this.inUso) {
      // Turno rimasto al telefono (rete caduta durante una fattura): lo
      // restituisce appena la fattura è pubblicata.
      this.inSottofondo(() => this.esclusivo(() => this.restituisci()))
    }
  }

  /** Desktop, all'avvio: prende il turno se è libero. Offline resta valido l'ultimo stato noto. */
  avvia(): Promise<void> {
    return this.esclusivo(async () => {
      try {
        this.imposta(await this.o.registro.prendiTurno(this.o.dispositivo))
      } catch (err) {
        if (!(err instanceof ErroreConnessione)) throw err
      }
    })
  }

  /**
   * Desktop, alla chiusura: libera il turno solo se tutto è pubblicato.
   * Offline lo tiene, così al prossimo avvio può ancora fatturare.
   */
  rilascia(): Promise<void> {
    this.chiuso = true
    return this.esclusivo(async () => {
      if (!this.tenuto) return
      const esito = await this.o.motore.sincronizza()
      if (esito.tipo !== 'allineato' || this.o.motore.inAttesa) return
      try {
        if (await this.o.registro.cediTurno(this.o.dispositivo, null)) this.imposta(false)
      } catch (err) {
        if (!(err instanceof ErroreConnessione)) throw err
      }
    })
  }

  /**
   * Esegue `operazione` tenendo il turno. `operazione` calcola il numero e
   * salva la fattura in locale; la sincronizzazione prima (dati freschi) e dopo
   * (pubblicazione) la fa il turno. Solleva `TurnoNonDisponibile` se non si può numerare.
   */
  usa<T>(operazione: () => Promise<T>): Promise<T> {
    const lavoro =
      this.o.ruolo === 'principale' ? this.usaPrincipale(operazione) : this.usaOspite(operazione)
    return lavoro.finally(() => {
      // Richiesta arrivata mentre il desktop fatturava: ora si può valutare.
      const r = this.ultimo?.richiesta
      if (this.o.ruolo === 'principale' && r && r.dispositivo !== this.o.dispositivo) {
        this.inSottofondo(() => this.valutaCessione())
      }
    })
  }

  // ─── Interni ────────────────────────────────────────────────────────────────

  private usaPrincipale<T>(operazione: () => Promise<T>): Promise<T> {
    return this.esclusivo(async () => {
      if (!this.tenuto) {
        let preso: boolean
        try {
          preso = await this.o.registro.prendiTurno(this.o.dispositivo)
        } catch (err) {
          if (err instanceof ErroreConnessione) throw new TurnoNonDisponibile('verifica-necessaria')
          throw err
        }
        if (!preso) throw new TurnoNonDisponibile('occupato')
        this.imposta(true)
      }
      this.inUso = true
      try {
        // Online scarica l'ultima fattura del telefono; offline si prosegue coi
        // dati locali, che sono completi perché il turno è rimasto qui.
        await this.o.motore.sincronizza({ fresco: true })
        const risultato = await operazione()
        await this.o.motore.sincronizza()
        return risultato
      } finally {
        this.inUso = false
      }
    })
  }

  private usaOspite<T>(operazione: () => Promise<T>): Promise<T> {
    return this.esclusivo(async () => {
      // In uso già durante l'attesa: la notifica del turno ricevuto non deve
      // far partire la restituzione automatica.
      this.inUso = true
      try {
        if ((await this.o.registro.chiediTurno(this.o.dispositivo)) === 'richiesto') {
          if (!(await this.attendiTurno())) {
            await this.o.registro.annullaRichiesta(this.o.dispositivo).catch(() => {})
            throw new TurnoNonDisponibile('pc-non-raggiungibile')
          }
        }
        this.imposta(true)
        try {
          await this.o.motore.allineaPerOperazioneDelicata()
          const risultato = await operazione()
          // La fattura deve essere pubblicata PRIMA di cedere il turno.
          await this.o.motore.allineaPerOperazioneDelicata()
          return risultato
        } finally {
          await this.restituisci().catch((err) => this.o.onErrore?.(err))
        }
      } finally {
        this.inUso = false
      }
    })
  }

  /** Telefono: libera il turno solo se non resta nulla da pubblicare, altrimenti lo tiene. */
  private async restituisci(): Promise<void> {
    const esito = await this.o.motore.sincronizza()
    if (esito.tipo === 'allineato' && !this.o.motore.inAttesa) await this.libera()
  }

  private async libera(): Promise<void> {
    if (await this.o.registro.cediTurno(this.o.dispositivo, null)) this.imposta(false)
  }

  private prendi(): Promise<void> {
    return this.esclusivo(async () => {
      if (this.tenuto || this.chiuso || this.ultimo?.turno) return
      this.imposta(await this.o.registro.prendiTurno(this.o.dispositivo))
    })
  }

  /** Cede il turno a chi lo chiede, solo se il desktop non ha nulla da pubblicare. */
  private valutaCessione(): Promise<void> {
    return this.esclusivo(async () => {
      const richiesta = this.ultimo?.richiesta
      // Gira nello stesso blocco esclusivo delle fatture: non può interromperne una.
      if (!this.tenuto || !richiesta || richiesta.dispositivo === this.o.dispositivo) return
      // Le bozze del PC vanno numerate prima di cedere il turno.
      if (this.o.bozze?.inSospeso()) return
      const esito = await this.o.motore.sincronizza({ fresco: true })
      if (esito.tipo !== 'allineato' || this.o.motore.inAttesa) return
      if (await this.o.registro.cediTurno(this.o.dispositivo, richiesta.dispositivo)) this.imposta(false)
    })
  }

  /** Verifica sul cloud (dentro `usa`) e numera le bozze. Se il turno è del telefono riprova alla prossima notifica. */
  private numeraBozze(): void {
    if (this.numerando) return
    this.numerando = true
    this.inSottofondo(() =>
      this.usa(() => this.o.bozze!.numera())
        .then(() => undefined)
        .catch((err) => {
          if (!(err instanceof TurnoNonDisponibile)) throw err
        })
        .finally(() => {
          this.numerando = false
        }),
    )
  }

  private attendiTurno(): Promise<boolean> {
    return new Promise((risolvi) => {
      const fine = (esito: boolean) => {
        clearTimeout(timer)
        this.attese.delete(controlla)
        risolvi(esito)
      }
      const controlla = () => {
        if (this.ultimo?.turno?.dispositivo === this.o.dispositivo) fine(true)
      }
      const timer = setTimeout(() => fine(false), this.o.attesaMs ?? 8000)
      this.attese.add(controlla)
      controlla()
    })
  }

  private imposta(tenuto: boolean): void {
    if (this.tenuto === tenuto) return
    this.tenuto = tenuto
    void this.o.salva?.(tenuto)
  }

  /** Le operazioni sul turno di questo dispositivo non si sovrappongono mai. */
  private esclusivo<T>(lavoro: () => Promise<T>): Promise<T> {
    const risultato = this.catena.then(lavoro)
    this.catena = risultato.catch(() => {})
    return risultato
  }

  private inSottofondo(lavoro: () => Promise<void>): void {
    lavoro().catch((err) => {
      if (!(err instanceof ErroreConnessione)) this.o.onErrore?.(err)
    })
  }
}
