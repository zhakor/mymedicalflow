/**
 * Il Word di una fattura cartacea quando il suo numero cambia dopo la
 * generazione (CR §6.1–6.2): bozza emessa offline e numerata al ritorno della
 * rete, o fattura rinumerata perché il telefono aveva appena usato lo stesso
 * numero. Il Word si rigenera con il numero giusto e si salva nella cartella
 * delle fatture, senza aprirlo.
 */

import type { GeneratedInvoiceFile, Invoice } from '../types/fattura'
import { buildTemplateData, downloadDocx, generateDocument } from './documentService'
import { fatturaService } from './fatturaService'
import { impostazioniService } from './impostazioniService'
import { pazienteService } from './pazienteService'

const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

const prefisso = (numero: string) => `Fattura_${numero.replace(/\//g, '-')}_`

/** Nome del Word, uguale su PC e telefono: `Fattura_3-2026_Rossi.docx`. */
export const nomeWord = (f: Pick<Invoice, 'invoiceNumber' | 'patientLastName'>) =>
  `${prefisso(f.invoiceNumber)}${f.patientLastName}.docx`

/** Il Word allegato riporta un numero diverso da quello attuale della fattura. */
export const wordDaAggiornare = (f: Invoice) =>
  f.invoiceType === 'cartacea' && !!f.generatedFile && !f.generatedFile.fileName.startsWith(prefisso(f.invoiceNumber))

/**
 * Rigenera il Word se il numero è cambiato. Restituisce true se l'ha fatto.
 * Senza modello Word nelle Impostazioni lascia quello vecchio.
 */
export async function aggiornaWord(fattura: Invoice): Promise<boolean> {
  if (!wordDaAggiornare(fattura)) return false
  const impostazioni = impostazioniService.get()
  const modello = impostazioni.templateFattura?.contenuto
  if (!modello) return false

  const paziente =
    (fattura.patientId ? pazienteService.getById(fattura.patientId) : null) ??
    (fattura.patientFiscalCode ? pazienteService.getByFiscalCode(fattura.patientFiscalCode) : null)
  const contenuto = generateDocument(modello, buildTemplateData(fattura, paziente))
  const file: GeneratedInvoiceFile = {
    fileName: nomeWord(fattura),
    fileBase64: contenuto,
    generatedAt: new Date().toISOString(),
    mimeType: DOCX,
  }
  await downloadDocx(contenuto, file.fileName, impostazioni.cartellaSalvataggio, { apri: false })
  fatturaService.saveGeneratedFile(fattura.id, file)
  return true
}
