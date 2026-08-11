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

export function iniziaTrascinamento(e: React.DragEvent, idAppuntamento: string): void {
  e.dataTransfer.setData(TIPO_TRASCINAMENTO, idAppuntamento)
  // `text/plain` come ripiego: alcuni browser non espongono i tipi
  // personalizzati durante `dragover`, dove serve decidere se accettare.
  e.dataTransfer.setData('text/plain', idAppuntamento)
  e.dataTransfer.effectAllowed = 'move'
}

/** Vero se ciò che si sta trascinando è un appuntamento di questa app. */
export function eUnAppuntamento(e: React.DragEvent): boolean {
  return e.dataTransfer.types.includes(TIPO_TRASCINAMENTO)
}

/** Identificativo trasportato, `null` se il rilascio non ci riguarda. */
export function idTrascinato(e: React.DragEvent): string | null {
  return e.dataTransfer.getData(TIPO_TRASCINAMENTO) || null
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
