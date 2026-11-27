/**
 * Verifica dell'abbonamento sul desktop (CR §7.2, D4).
 *
 * All'avvio serve un accesso Google con l'email verificata e una licenza
 * attiva su Firestore (`licenze/{email}`). L'esito vale 30 giorni: poi
 * l'accesso si rifà, anche per controllare la scadenza. Senza rete l'app
 * funziona finché la verifica è valida; oltre, si blocca fino al prossimo
 * accesso.
 *
 * Limite onesto (CR §7.2): un controllo nel PC si può aggirare modificando
 * l'app. Le barriere vere stanno sui server di Google: senza licenza attiva
 * le regole di Firestore negano la sincronizzazione.
 */

/** Ogni quanti giorni l'accesso Google va rifatto. */
export const GIORNI_VALIDITA = 30
const MS_GIORNO = 86_400_000
const CHIAVE = 'mmf.abbonamento'

export interface Verifica {
  email: string
  /** Quando è stato fatto l'accesso (ms). */
  verificataIl: number
  /** Scadenza della licenza (ms), se impostata. */
  scadenza: number | null
}

export type EsitoVerifica =
  | { tipo: 'valida'; giorniRimasti: number }
  | { tipo: 'da-rifare' }
  | { tipo: 'scaduta'; scadenza: number }

/** Decide se la verifica salvata vale ancora. Pura: si prova senza PC né rete. */
export function valutaVerifica(v: Verifica | null, adesso: number): EsitoVerifica {
  if (!v) return { tipo: 'da-rifare' }
  if (v.scadenza !== null && adesso >= v.scadenza) return { tipo: 'scaduta', scadenza: v.scadenza }
  const trascorsi = (adesso - v.verificataIl) / MS_GIORNO
  // Un orologio spostato indietro non deve allungare la validità
  if (trascorsi < 0 || trascorsi >= GIORNI_VALIDITA) return { tipo: 'da-rifare' }
  return { tipo: 'valida', giorniRimasti: Math.ceil(GIORNI_VALIDITA - trascorsi) }
}

/** Esito della lettura della licenza su Firestore. */
export interface Licenza {
  email: string
  emailVerificata: boolean
  attiva: boolean
  scadenza: number | null
}

/** Perché una licenza letta non apre l'app, oppure null se la apre. */
export function motivoBlocco(l: Licenza, adesso: number): string | null {
  if (!l.emailVerificata) return "L'email dell'account Google non è verificata."
  if (!l.attiva) return `Nessun abbonamento attivo per ${l.email}.`
  if (l.scadenza !== null && adesso >= l.scadenza) {
    return `L'abbonamento di ${l.email} è scaduto il ${new Date(l.scadenza).toLocaleDateString('it-IT')}.`
  }
  return null
}

export function leggiVerifica(): Verifica | null {
  try {
    const v = JSON.parse(localStorage.getItem(CHIAVE) ?? 'null') as Verifica | null
    return v && typeof v.verificataIl === 'number' && typeof v.email === 'string' ? v : null
  } catch {
    return null
  }
}

export function salvaVerifica(v: Verifica | null): void {
  if (v) localStorage.setItem(CHIAVE, JSON.stringify(v))
  else localStorage.removeItem(CHIAVE)
}
