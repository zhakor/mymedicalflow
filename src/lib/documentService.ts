/**
 * Servizio generazione fatture Word (.docx) tramite docxtemplater + pizzip.
 * Funziona completamente offline senza backend.
 *
 * Il template deve usare i placeholder con sintassi [nome_placeholder].
 * Il contenuto del template deve essere disponibile come base64 nelle Impostazioni.
 *
 * Placeholder supportati:
 *   [genere]              → "o" / "a" / "*"
 *   [nome_cognome]        → Nome e Cognome paziente
 *   [indirizzo]           → Indirizzo paziente
 *   [cap]                 → CAP paziente
 *   [citta]               → Città paziente
 *   [prov]                → Provincia paziente
 *   [data_odierna]        → Data odierna in formato italiano
 *   [numero_fattura]      → Numero fattura
 *   [desc]                → Descrizione fattura
 *   [importo]             → Importo (senza valuta)
 *   [bollo]               → Bollo (0 se non presente)
 *   [num_bollo]           → Numero bollo (stringa vuota se non presente)
 *   [totale_bollo_fattura]→ Importo + Bollo
 */

import PizZip from 'pizzip'
import Docxtemplater from 'docxtemplater'
import type { Invoice } from '../types/fattura'
import type { Patient } from '../types/paziente'

export interface DocTemplateData {
  genere: string
  nome_cognome: string
  cod_fiscale: string
  indirizzo: string
  cap: string
  citta: string
  prov: string
  data_odierna: string
  numero_fattura: string
  desc: string
  importo: string
  bollo: string
  num_bollo: string
  totale_bollo_fattura: string
}

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

function formatAmount(n: number): string {
  return n.toFixed(2).replace('.', ',')
}

/**
 * Costruisce il DTO dei dati per il template.
 */
export function buildTemplateData(invoice: Invoice, patient?: Patient | null): DocTemplateData {
  // Genere: male→"o", female→"a", altri→"*"
  let genere = '*'
  if (patient?.gender === 'male') genere = 'o'
  else if (patient?.gender === 'female') genere = 'a'

  const dataOdierna = new Date().toLocaleDateString('it-IT', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })

  const totale = invoice.amount + (invoice.stampDuty ?? 0)

  return {
    genere,
    nome_cognome: `${invoice.patientFirstName} ${invoice.patientLastName}`.trim(),
    cod_fiscale: invoice.patientFiscalCode ?? patient?.fiscalCode ?? '',
    indirizzo: patient?.address ?? '',
    cap: patient?.postalCode ?? '',
    citta: patient?.city ?? '',
    prov: patient?.province ?? '',
    data_odierna: dataOdierna,
    numero_fattura: invoice.invoiceNumber,
    desc: invoice.description,
    importo: formatAmount(invoice.amount),
    bollo: formatAmount(invoice.stampDuty ?? 0),
    num_bollo: invoice.stampDutyNumber ?? '',
    totale_bollo_fattura: formatAmount(totale),
  }
}

/**
 * Genera il documento .docx sostituendo i placeholder nel template base64.
 * Restituisce il documento generato come stringa base64.
 * Lancia eccezione se il template non è valido.
 */
export function generateDocument(templateBase64: string, data: DocTemplateData): string {
  // Rimuove eventuale prefisso data URL rimasto
  const rawBase64 = templateBase64.includes(',')
    ? templateBase64.split(',')[1]
    : templateBase64

  const templateBytes = base64ToUint8Array(rawBase64)
  const zip = new PizZip(templateBytes)

  const doc = new Docxtemplater(zip, {
    delimiters: { start: '[', end: ']' },
    paragraphLoop: true,
    linebreaks: true,
    // Tag non riconosciuti → stringa vuota invece di errore
    nullGetter: () => '',
    // Non loggare errori di template non critici
    errorLogging: false,
  })

  try {
    doc.render(data as unknown as Record<string, string>)
  } catch (renderErr: unknown) {
    // docxtemplater lancia oggetti speciali, convertiamo in errore leggibile
    const e = renderErr as { properties?: { errors?: Array<{ message?: string }> }; message?: string }
    const details =
      e?.properties?.errors?.map((x) => x.message).filter(Boolean).join('; ') ??
      e?.message ??
      String(renderErr)
    throw new Error(`Template non valido: ${details}`)
  }

  const output = doc.getZip().generate({
    type: 'base64',
    compression: 'DEFLATE',
  })

  return output
}

/**
 * Scarica/apre il file .docx.
 * - In Tauri (desktop): salva nella cartella Download e apre con l'app predefinita.
 *   Se il comando Rust non è disponibile, fallback al blob URL.
 * - In browser: usa blob URL + <a download>.
 */
const isTauri = (): boolean =>
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

function blobDownload(base64Content: string, fileName: string): void {
  const binary = atob(base64Content)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  const blob = new Blob([bytes], {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

/**
 * Apre il dialogo nativo di selezione cartella tramite tauri-plugin-dialog.
 * Nessun processo PowerShell — usa direttamente IFileOpenDialog di Windows.
 * Restituisce il percorso scelto o null se l'utente annulla / non in Tauri.
 */
export async function pickDirectory(): Promise<string | null> {
  if (!isTauri()) return null
  try {
    const { open } = await import('@tauri-apps/plugin-dialog')
    const result = await open({ directory: true, multiple: false, title: 'Seleziona la cartella per salvare le fatture' })
    if (typeof result === 'string') return result
    return null
  } catch (e) {
    console.error('[documentService] pick_directory fallito:', e)
    return null
  }
}

export async function downloadDocx(
  base64Content: string,
  fileName: string,
  saveDir?: string,
): Promise<void> {
  if (isTauri()) {
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      await invoke<string>('save_and_open_docx', {
        fileName,
        base64Content,
        saveDir: saveDir ?? null,
      })
      return
    } catch (e) {
      // Se il comando non esiste nel binario corrente, avvisa l'utente
      const msg = typeof e === 'string' ? e : (e instanceof Error ? e.message : String(e))
      console.error('[documentService] save_and_open_docx fallito:', e)
      throw new Error(`Riavvia l'app per abilitare l'apertura dei file. (${msg})`)
    }
  }
  blobDownload(base64Content, fileName)
}
