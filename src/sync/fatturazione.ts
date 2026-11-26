/**
 * Fatturazione da più dispositivi (CR §6.1, D2 rivista il 26/11/2026).
 *
 * Una sola serie NUM/ANNO, ma nessun dispositivo blocca l'altro: online
 * desktop e telefono fatturano quando vogliono, anche insieme.
 *
 * - Prima di calcolare il numero si scarica l'ultima versione dal cloud.
 * - Subito dopo la fattura si pubblica. Se nel frattempo l'altro dispositivo
 *   ha pubblicato lo stesso numero, vince la fattura già sul cloud e questa
 *   prende il primo numero libero (`rinumeraFattureDuplicate`) PRIMA di essere
 *   mostrata: `usa` termina solo a pubblicazione avvenuta, quindi il numero che
 *   si legge dopo è definitivo e un numero già mostrato non cambia mai.
 * - Offline non si numera: il PC salva una bozza (`bozze.ts`), numerata da
 *   sola alla prima notifica dopo il ritorno della rete. Il telefono lavora
 *   solo online.
 *
 * Consumi: nessun campo in più su Firestore. Le bozze si numerano sull'unico
 * ascolto del motore (`motore.ascolta(fatturazione.suCambio)`).
 */

import { ErroreConnessione, type StatoRegistro } from './contratti'
import type { MotoreSincronizzazione } from './motore'

/** Massimo di cicli per pubblicare la fattura quando l'altro dispositivo pubblica di continuo. */
const MAX_PUBBLICAZIONI = 3

export class FatturazioneOffline extends Error {
  constructor() {
    super(
      "Per numerare la fattura serve la connessione: collega il PC a internet, anche tramite l'hotspot del telefono. Intanto puoi salvarla come bozza: verrà numerata appena torna la connessione.",
    )
    this.name = 'FatturazioneOffline'
  }
}

export interface OpzioniFatturazione {
  motore: MotoreSincronizzazione
  /**
   * Desktop: bozze "da numerare" salvate offline. Al ritorno della rete le
   * numera con `numera`, che riceve dati già scaricati dal cloud.
   */
  bozze?: {
    inSospeso(): boolean
    numera(): Promise<unknown>
  }
  onErrore?(errore: unknown): void
}

export class Fatturazione {
  private catena: Promise<unknown> = Promise.resolve()
  private numerando = false

  constructor(private readonly o: OpzioniFatturazione) {}

  /** Da passare a `motore.ascolta`: le notifiche arrivano solo online, il momento di numerare le bozze. */
  readonly suCambio = (_stato: StatoRegistro): void => {
    if (this.o.bozze?.inSospeso()) this.numeraBozze()
  }

  /**
   * Esegue `operazione`, che calcola il numero e salva la fattura in locale,
   * fra un allineamento col cloud (dati freschi) e la pubblicazione. Al
   * termine il numero salvato è quello definitivo. Offline solleva
   * `FatturazioneOffline` senza eseguire `operazione`.
   *
   * Se la rete cade proprio fra il salvataggio e la pubblicazione, la fattura
   * resta in coda: la pubblica il motore al ritorno della rete e, se nel
   * frattempo il numero è stato preso, la rinumera e lo segnala in `onEsito`.
   */
  usa<T>(operazione: () => Promise<T>): Promise<T> {
    return this.esclusivo(async () => {
      try {
        await this.o.motore.allineaPerOperazioneDelicata()
      } catch (err) {
        if (err instanceof ErroreConnessione) throw new FatturazioneOffline()
        throw err
      }
      const risultato = await operazione()
      for (let i = 0; i < MAX_PUBBLICAZIONI; i++) {
        const esito = await this.o.motore.sincronizza()
        if (esito.tipo !== 'allineato' || !esito.inAttesa) break
      }
      return risultato
    })
  }

  // ─── Interni ────────────────────────────────────────────────────────────────

  /** Numera le bozze con dati scaricati dal cloud; offline riprova alla prossima notifica. */
  private numeraBozze(): void {
    if (this.numerando) return
    this.numerando = true
    this.usa(() => this.o.bozze!.numera())
      .catch((err) => {
        if (!(err instanceof FatturazioneOffline)) this.o.onErrore?.(err)
      })
      .finally(() => {
        this.numerando = false
      })
  }

  /** Le fatture di questo dispositivo non si sovrappongono mai fra loro. */
  private esclusivo<T>(lavoro: () => Promise<T>): Promise<T> {
    const risultato = this.catena.then(lavoro)
    this.catena = risultato.catch(() => {})
    return risultato
  }
}
