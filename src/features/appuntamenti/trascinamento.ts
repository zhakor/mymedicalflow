/**
 * Trascinamento degli appuntamenti — API native del browser.
 *
 * Nessuna libreria: l'HTML5 drag and drop copre il caso d'uso, e una
 * dipendenza in più andrebbe poi aggiornata e caricata a ogni avvio in
 * un'app che deve restare leggera e offline.
 *
 * Il tipo MIME è specifico dell'app: così un file trascinato dal desktop,
 * o del testo da un'altra finestra, non viene scambiato per un appuntamento.
 */

export const TIPO_TRASCINAMENTO = 'application/x-mymedicalflow-appuntamento'

/**
 * Appuntamento attualmente in viaggio.
 *
 * Il `dataTransfer` sarebbe la sede giusta, ma non tutte le webview espongono
 * i tipi personalizzati durante `dragover` — ed è proprio lì che serve
 * decidere se accettare il rilascio. Questo riferimento non dipende dal
 * trasporto e resta valido anche quando `types` arriva vuoto.
 */
let inViaggio: string | null = null

export function iniziaTrascinamento(e: React.DragEvent, idAppuntamento: string): void {
  inViaggio = idAppuntamento
  e.dataTransfer.setData(TIPO_TRASCINAMENTO, idAppuntamento)
  // `text/plain` come ripiego per chi non accetta i tipi personalizzati
  e.dataTransfer.setData('text/plain', idAppuntamento)
  e.dataTransfer.effectAllowed = 'move'
}

/** Da chiamare a fine trascinamento, riuscito o annullato. */
export function fineTrascinamento(): void {
  inViaggio = null
}

/** Vero se ciò che si sta trascinando è un appuntamento di questa app. */
export function eUnAppuntamento(e: React.DragEvent): boolean {
  return inViaggio !== null || e.dataTransfer.types.includes(TIPO_TRASCINAMENTO)
}

/** Identificativo trasportato, `null` se il rilascio non ci riguarda. */
export function idTrascinato(e: React.DragEvent): string | null {
  return e.dataTransfer.getData(TIPO_TRASCINAMENTO) || inViaggio
}

/**
 * Prepara un elemento ad accogliere il rilascio.
 *
 * Senza `preventDefault` il browser rifiuta il drop: è il comportamento
 * predefinito, non un dettaglio opzionale.
 */
export function accettaRilascio(e: React.DragEvent): boolean {
  if (!eUnAppuntamento(e)) return false
  e.preventDefault()
  e.dataTransfer.dropEffect = 'move'
  return true
}
