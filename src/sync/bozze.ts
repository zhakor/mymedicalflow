/**
 * Bozze di fattura "da numerare" (CR §6.1, D5).
 *
 * Esistono solo in un caso: il PC è stato avviato offline dopo una chiusura
 * normale e non può verificare sul cloud se dal telefono sono state emesse
 * fatture. La fattura si compila e si salva senza numero; al ritorno della rete
 * il PC verifica sul cloud e la numera dopo l'ultima emessa.
 *
 * La numerazione deve restare coerente con le date: se la data della bozza è
 * precedente all'ultima fattura dello stesso anno (per esempio una emessa dal
 * telefono nel frattempo), la bozza prende la data in cui viene numerata.
 */

export interface FatturaNumerabile {
  id: string
  invoiceNumber: string
  /** YYYY-MM-DD */
  issueDate: string
  createdAt: string
  updatedAt?: string
  bozza?: boolean
}

export interface Numerazione {
  id: string
  numero: string
  data: string
  /** true se la data della bozza è stata spostata per non precedere l'ultima fattura. */
  dataSpostata: boolean
}

const anno = (data: string) => data.slice(0, 4)
const progressivo = (numero: string) => {
  const n = parseInt(numero.split('/')[0], 10)
  return Number.isNaN(n) ? 0 : n
}

/**
 * Numera le bozze nell'ordine in cui sono state create.
 * `oggi` (YYYY-MM-DD) è la data di numerazione, `adesso` l'istante per `updatedAt`.
 */
export function numeraBozze<T extends FatturaNumerabile>(
  fatture: T[],
  oggi: string,
  adesso: string,
): { fatture: T[]; numerate: Numerazione[] } {
  const bozze = fatture.filter((f) => f.bozza).sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  if (bozze.length === 0) return { fatture, numerate: [] }

  const emesse = fatture.filter((f) => !f.bozza).map((f) => ({ numero: f.invoiceNumber, data: f.issueDate }))
  const numerate: Numerazione[] = []
  const aggiornate = new Map<string, T>()

  for (const b of bozze) {
    const ultimaData = emesse
      .filter((e) => anno(e.data) === anno(b.issueDate))
      .reduce((max, e) => (e.data > max ? e.data : max), '')
    const dataSpostata = b.issueDate < ultimaData
    const data = dataSpostata ? (oggi > ultimaData ? oggi : ultimaData) : b.issueDate

    const ultimo = emesse
      .filter((e) => e.numero.endsWith(`/${anno(data)}`))
      .reduce((max, e) => Math.max(max, progressivo(e.numero)), 0)
    const numero = `${ultimo + 1}/${anno(data)}`

    const { bozza: _bozza, ...resto } = b
    aggiornate.set(b.id, { ...resto, invoiceNumber: numero, issueDate: data, updatedAt: adesso } as T)
    emesse.push({ numero, data })
    numerate.push({ id: b.id, numero, data, dataSpostata })
  }

  return { fatture: fatture.map((f) => aggiornate.get(f.id) ?? f), numerate }
}
