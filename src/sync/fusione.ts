/**
 * Fusione a tre vie dell'archivio: `base` (ultima versione sincronizzata),
 * `locale` (questo dispositivo) e `remoto` (pubblicato da un altro dispositivo).
 *
 * Le chiavi i cui valori sono array di oggetti con `id` (pazienti, fatture, …)
 * si fondono record per record. Le altre (profilo, impostazioni) valgono come
 * un unico record. Un record presente nella base e assente da una parte è
 * stato eliminato da quella parte: per questo non servono cancellazioni logiche.
 */

import type { Archivio } from './cifratura'

export type Scelta = 'locale' | 'remoto'

export interface Conflitto {
  chiave: string
  /** null per le chiavi che non contengono record (profilo, impostazioni). */
  id: string | null
  /** Valore di questo dispositivo; null se qui è stato eliminato. */
  locale: unknown
  /** Valore dell'altro dispositivo; null se là è stato eliminato. */
  remoto: unknown
}

export const idConflitto = (c: Pick<Conflitto, 'chiave' | 'id'>): string =>
  `${c.chiave}:${c.id ?? ''}`

export interface EsitoFusione {
  archivio: Archivio
  /** Conflitti incontrati. Quelli senza scelta sono stati risolti col remoto. */
  conflitti: Conflitto[]
}

type Valore = string | undefined

const leggi = (v: Valore): unknown => (v === undefined ? null : JSON.parse(v))

/** Esito per un singolo elemento: il valore scelto, o un conflitto. */
function scegli(
  b: Valore,
  l: Valore,
  r: Valore,
  conflitto: Omit<Conflitto, 'locale' | 'remoto'>,
  scelte: ReadonlyMap<string, Scelta>,
  predefinita: Scelta,
  conflitti: Conflitto[],
): Valore {
  if (l === r) return l
  if (l === b) return r
  if (r === b) return l
  conflitti.push({ ...conflitto, locale: leggi(l), remoto: leggi(r) })
  return (scelte.get(idConflitto(conflitto)) ?? predefinita) === 'locale' ? l : r
}

/** Record indicizzati per id, nell'ordine dell'array; null se il valore non è un array di record. */
function comeRecord(v: Valore): Map<string, string> | null {
  if (v === undefined) return new Map()
  let letto: unknown
  try {
    letto = JSON.parse(v)
  } catch {
    return null
  }
  if (!Array.isArray(letto)) return null
  const mappa = new Map<string, string>()
  for (const r of letto) {
    if (typeof r !== 'object' || r === null || typeof (r as { id?: unknown }).id !== 'string') {
      return null
    }
    mappa.set((r as { id: string }).id, JSON.stringify(r))
  }
  return mappa
}

export function fondi(
  base: Archivio,
  locale: Archivio,
  remoto: Archivio,
  scelte: ReadonlyMap<string, Scelta> = new Map(),
  /** Esito dei conflitti senza una scelta esplicita. */
  predefinita: Scelta = 'remoto',
): EsitoFusione {
  const archivio: Archivio = {}
  const conflitti: Conflitto[] = []
  const chiavi = new Set([...Object.keys(remoto), ...Object.keys(locale), ...Object.keys(base)])

  for (const chiave of chiavi) {
    const b = base[chiave]
    const l = locale[chiave]
    const r = remoto[chiave]

    // Una sola parte ha cambiato (o nessuna): nessun confronto per record.
    if (l === r || l === b || r === b) {
      const v = l === b ? r : l
      if (v !== undefined) archivio[chiave] = v
      continue
    }

    const [rb, rl, rr] = [comeRecord(b), comeRecord(l), comeRecord(r)]
    if (!rb || !rl || !rr) {
      const v = scegli(b, l, r, { chiave, id: null }, scelte, predefinita, conflitti)
      if (v !== undefined) archivio[chiave] = v
      continue
    }

    // Ordine: quello remoto, poi i record nati qui.
    const ids = new Set([...rr.keys(), ...rl.keys()])
    const risultato: unknown[] = []
    for (const id of ids) {
      const v = scegli(rb.get(id), rl.get(id), rr.get(id), { chiave, id }, scelte, predefinita, conflitti)
      if (v !== undefined) risultato.push(JSON.parse(v))
    }
    archivio[chiave] = JSON.stringify(risultato)
  }

  return { archivio, conflitti }
}

// ─── Fatture con lo stesso numero ─────────────────────────────────────────────

export const CHIAVE_FATTURE = 'fatture'

export interface Rinumerazione {
  id: string
  da: string
  a: string
}

interface FatturaMinima {
  id: string
  invoiceNumber: string
  updatedAt?: string
  /** Bozza del PC offline: numero provvisorio, lo assegna `numeraBozze`. */
  bozza?: boolean
}

function parteNumero(numero: string): { progressivo: number; anno: string } {
  const [p, anno = ''] = (numero ?? '').split('/')
  const progressivo = parseInt(p, 10)
  return { progressivo: Number.isNaN(progressivo) ? 0 : progressivo, anno }
}

/**
 * Due dispositivi possono assegnare lo stesso numero se creano una fattura
 * senza vedere quella dell'altro. Vince la fattura già pubblicata (presente in
 * `remoto`); quelle nate su questo dispositivo prendono il primo numero libero
 * dello stesso anno. Restituisce l'archivio aggiornato e le rinumerazioni, da
 * mostrare all'utente: un documento già generato va rifatto.
 *
 * Le bozze restano fuori: il loro numero è provvisorio e non deve né
 * spostare il "primo numero libero" (lascerebbe buchi nella serie) né essere
 * rinumerato qui, perché alle bozze ci pensa `numeraBozze`.
 */
export function rinumeraFattureDuplicate(
  archivio: Archivio,
  remoto: Archivio,
  adesso: () => string = () => new Date().toISOString(),
): { archivio: Archivio; rinumerate: Rinumerazione[] } {
  const grezzo = archivio[CHIAVE_FATTURE]
  if (grezzo === undefined) return { archivio, rinumerate: [] }

  const fatture = JSON.parse(grezzo) as FatturaMinima[]
  const pubblicate = comeRecord(remoto[CHIAVE_FATTURE]) ?? new Map<string, string>()
  const definitive = fatture.filter((f) => !f.bozza)

  const perNumero = new Map<string, FatturaMinima[]>()
  for (const f of definitive) {
    const gruppo = perNumero.get(f.invoiceNumber) ?? []
    gruppo.push(f)
    perNumero.set(f.invoiceNumber, gruppo)
  }

  const massimoPerAnno = new Map<string, number>()
  for (const f of definitive) {
    const { progressivo, anno } = parteNumero(f.invoiceNumber)
    massimoPerAnno.set(anno, Math.max(massimoPerAnno.get(anno) ?? 0, progressivo))
  }

  const rinumerate: Rinumerazione[] = []
  for (const [numero, gruppo] of perNumero) {
    if (gruppo.length < 2) continue
    // Se nessuna è pubblicata (caso impossibile dopo una fusione) se ne tiene una.
    const daTenere = gruppo.find((f) => pubblicate.has(f.id)) ?? gruppo[0]
    const { anno } = parteNumero(numero)
    for (const f of gruppo) {
      if (f === daTenere || pubblicate.has(f.id)) continue
      const prossimo = (massimoPerAnno.get(anno) ?? 0) + 1
      massimoPerAnno.set(anno, prossimo)
      const nuovo = `${prossimo}/${anno}`
      rinumerate.push({ id: f.id, da: f.invoiceNumber, a: nuovo })
      f.invoiceNumber = nuovo
      f.updatedAt = adesso()
    }
  }

  if (rinumerate.length === 0) return { archivio, rinumerate }
  return { archivio: { ...archivio, [CHIAVE_FATTURE]: JSON.stringify(fatture) }, rinumerate }
}
