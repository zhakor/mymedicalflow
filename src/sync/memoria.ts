/**
 * Drive e Firestore simulati in memoria, per i test e per la modalità di
 * sviluppo senza Google. Ogni dispositivo ottiene un proprio `client` con una
 * connessione che si può spegnere, così si simulano il desktop offline e
 * risposte perse.
 *
 * Il registro conta letture e scritture come le fattura Firestore: una
 * lettura semplice = 1 lettura, una transazione = 1 lettura (+ 1 scrittura se
 * modifica), ogni notifica a un ascoltatore collegato = 1 lettura.
 */

import type { Byte } from './cifratura'
import {
  ErroreConnessione,
  type DepositoFile,
  type Puntatore,
  type Registro,
  type StatoRegistro,
} from './contratti'

export interface Connessione {
  online: boolean
  /** La prossima transazione riesce ma la risposta non arriva. */
  perdiRispostaPubblica?: boolean
}

export class CloudInMemoria {
  readonly file = new Map<string, Byte>()
  puntatore: Puntatore | null = null
  /** Consumo Firestore simulato. */
  readonly consumo = { letture: 0, scritture: 0 }

  private ascoltatori = new Set<{ callback: (s: StatoRegistro) => void; connessione: Connessione }>()
  private contatore = 0

  private stato(): StatoRegistro {
    return { puntatore: this.puntatore ? { ...this.puntatore } : null }
  }

  /** Una scrittura: come Firestore, la notifica arriva in modo asincrono a chi è collegato. */
  private scritto(): void {
    this.consumo.scritture++
    const stato = this.stato()
    for (const a of this.ascoltatori) {
      if (!a.connessione.online) continue
      this.consumo.letture++
      queueMicrotask(() => a.callback(stato))
    }
  }

  client(connessione: Connessione = { online: true }): { deposito: DepositoFile; registro: Registro } {
    const rete = (): void => {
      if (!connessione.online) throw new ErroreConnessione()
    }
    /** Inizio di una transazione: verifica la rete e conta la lettura. */
    const transazione = (): void => {
      rete()
      this.consumo.letture++
    }

    const deposito: DepositoFile = {
      carica: async (revisione, dati) => {
        rete()
        const id = `archivio-${revisione}-${++this.contatore}`
        this.file.set(id, dati.slice())
        return id
      },
      scarica: async (fileId) => {
        rete()
        const dati = this.file.get(fileId)
        if (!dati) throw new Error(`file inesistente: ${fileId}`)
        return dati.slice()
      },
      cestina: async (fileId) => {
        rete()
        this.file.delete(fileId)
      },
    }

    const registro: Registro = {
      leggi: async () => {
        transazione()
        return this.stato()
      },
      pubblica: async (attesa, nuovo) => {
        transazione()
        if ((this.puntatore?.revisione ?? 0) !== attesa) return false
        this.puntatore = { ...nuovo }
        this.scritto()
        if (connessione.perdiRispostaPubblica) {
          connessione.perdiRispostaPubblica = false
          throw new ErroreConnessione('risposta persa')
        }
        return true
      },
      ascolta: (callback) => {
        const voce = { callback, connessione }
        this.ascoltatori.add(voce)
        // Come onSnapshot: subito lo stato attuale, al costo di una lettura.
        if (connessione.online) {
          this.consumo.letture++
          const stato = this.stato()
          queueMicrotask(() => callback(stato))
        }
        return () => this.ascoltatori.delete(voce)
      },
    }

    return { deposito, registro }
  }
}
