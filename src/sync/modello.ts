/**
 * Modello Word delle fatture cartacee fra PC e Drive (CR §4.1, §8).
 *
 * Il PC lo conserva in base64 dentro `impostazioni.templateFattura.contenuto`.
 * Alla configurazione della sincronizzazione lo estrae e lo carica su Drive in
 * chiaro (`DepositoModello`); nell'archivio cifrato restano solo nome, peso e
 * data. Il telefono lo scarica da Drive quando deve generare una fattura.
 */

import type { Archivio, Byte } from './cifratura'
import type { FileModello } from './contratti'

const CHIAVE_IMPOSTAZIONI = 'impostazioni'

interface ImpostazioniConModello {
  templateFattura?: { nomeFile?: string; contenuto?: string }
}

/** Base64 (anche con il prefisso `data:...;base64,` rimasto dal caricamento) → byte. */
export function base64InByte(base64: string): Byte {
  const puro = base64.includes(',') ? base64.slice(base64.indexOf(',') + 1) : base64
  const binario = atob(puro)
  const byte = new Uint8Array(binario.length)
  for (let i = 0; i < binario.length; i++) byte[i] = binario.charCodeAt(i)
  return byte
}

/** Byte → base64, a blocchi: un modello di qualche centinaio di KB non sta in un solo argomento. */
export function byteInBase64(byte: Uint8Array): string {
  let binario = ''
  for (let i = 0; i < byte.length; i += 0x8000) {
    binario += String.fromCharCode(...byte.subarray(i, i + 0x8000))
  }
  return btoa(binario)
}

/**
 * Passo 4 della configurazione (§8): separa il modello dalle impostazioni.
 * Restituisce l'archivio con i soli metadati del modello e il file da caricare
 * su Drive, oppure `modello: null` (archivio invariato) se non ce n'è uno.
 */
export function estraiModello(archivio: Archivio): { archivio: Archivio; modello: FileModello | null } {
  const grezzo = archivio[CHIAVE_IMPOSTAZIONI]
  if (!grezzo) return { archivio, modello: null }
  const impostazioni = JSON.parse(grezzo) as ImpostazioniConModello
  const template = impostazioni.templateFattura
  if (!template?.contenuto) return { archivio, modello: null }

  const { contenuto, ...metadati } = template
  return {
    archivio: { ...archivio, [CHIAVE_IMPOSTAZIONI]: JSON.stringify({ ...impostazioni, templateFattura: metadati }) },
    modello: { nomeFile: template.nomeFile ?? 'template-fattura.docx', dati: base64InByte(contenuto) },
  }
}
