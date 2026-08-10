/**
 * Sistema Tessera Sanitaria — stato delle trasmissioni e validazione locale.
 *
 * La comunicazione con il Sistema TS avviene interamente nel backend Rust:
 * qui si conserva solo lo stato applicativo e si verifica che i dati siano
 * completi **prima** di tentare una trasmissione, così una richiesta già
 * invalida non raggiunge la rete.
 */

import { storageService } from './storageService'
import { profiloService } from './profiloService'
import type { Invoice } from '../types/fattura'
import type { ProfiloProfessionista } from '../types'
import {
  numeroDocumentoPerSts,
  operazioniAmmesse,
  richiedeTipoDocumentoEOpposizione,
} from '../types/sistemaTs'
import type {
  AmbienteTs,
  OperazioneTs,
  StatoSistemaTS,
  TentativoTs,
  TrasmissioneTs,
} from '../types/sistemaTs'

export const STORAGE_KEY = 'trasmissioniTs'

const KEY = STORAGE_KEY

function generateId(prefisso: string): string {
  return `${prefisso}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

function getAll(): TrasmissioneTs[] {
  return (storageService.get<TrasmissioneTs[]>(KEY) ?? []).filter(Boolean)
}

function saveAll(elenco: TrasmissioneTs[]): void {
  storageService.set(KEY, elenco)
}

// ─── Validazione locale ───────────────────────────────────────────────────────

export interface EsitoValidazione {
  valido: boolean
  /** Elenco leggibile di ciò che manca, mostrato all'utente prima dell'invio. */
  mancanti: string[]
}

/**
 * Verifica che ci sia tutto il necessario per costruire un documento di spesa.
 * Controlla sia la fattura sia il profilo: il Sistema TS identifica l'erogatore
 * con codice fiscale e partita IVA, che vivono nel profilo.
 */
export function validaPerTrasmissione(
  invoice: Invoice,
  profilo: ProfiloProfessionista | null = profiloService.get(),
): EsitoValidazione {
  const mancanti: string[] = []

  // ── Dati dell'erogatore ──
  if (!profilo?.partitaIva?.trim()) mancanti.push('Partita IVA del professionista (in Profilo)')
  if (!profilo?.codiceFiscale?.trim()) mancanti.push('Codice fiscale del professionista (in Profilo)')

  const dispositivo = profilo?.dispositivo
  if (dispositivo === undefined || dispositivo < 1 || dispositivo > 999) {
    mancanti.push('Dispositivo di emissione, da 1 a 999 (in Profilo)')
  }

  // ── Dati del documento ──
  if (!invoice.issueDate) mancanti.push('Data di emissione')
  if (!numeroDocumentoPerSts(invoice.invoiceNumber ?? '')) mancanti.push('Numero fattura')
  if (!(invoice.amount > 0)) mancanti.push('Importo maggiore di zero')

  const ts = invoice.sistemaTs
  if (!ts) {
    mancanti.push('Dati del Sistema TS sulla fattura')
    return { valido: false, mancanti }
  }

  if (!ts.dataPagamento) mancanti.push('Data di pagamento')
  if (!ts.tipoSpesa) mancanti.push('Tipo di spesa')
  if (!ts.pagamentoTracciato) mancanti.push('Indicazione di pagamento tracciato')

  // Aliquota e natura IVA sono alternative: l'XSD le dichiara in xs:choice
  const haAliquota = ts.aliquotaIva !== undefined && ts.aliquotaIva !== null
  const haNatura = !!ts.naturaIva?.trim()
  if (haAliquota && haNatura) {
    mancanti.push('Indica aliquota IVA oppure natura IVA, non entrambe')
  }
  if (!haAliquota && !haNatura) {
    mancanti.push('Aliquota IVA oppure natura IVA')
  }

  // Il codice fiscale dell'assistito può mancare solo in caso di opposizione
  if (!ts.opposizione && !invoice.patientFiscalCode?.trim()) {
    mancanti.push('Codice fiscale dell\'assistito')
  }

  return { valido: mancanti.length === 0, mancanti }
}

/** Vero se, per la data di pagamento indicata, i due campi sono obbligatori. */
export function tipoDocumentoObbligatorio(invoice: Invoice): boolean {
  const data = invoice.sistemaTs?.dataPagamento ?? invoice.issueDate
  return richiedeTipoDocumentoEOpposizione(data ?? '')
}

// ─── Stato delle trasmissioni ─────────────────────────────────────────────────

export const sistemaTsService = {
  perFattura(fatturaId: string): TrasmissioneTs | null {
    return getAll().find((t) => t.fatturaId === fatturaId) ?? null
  },

  /** Stato corrente, tenendo conto che una fattura può non essere soggetta. */
  statoPerFattura(invoice: Invoice): StatoSistemaTS {
    if (!invoice.sistemaTs) return 'non_previsto'
    return sistemaTsService.perFattura(invoice.id)?.stato ?? 'da_inviare'
  },

  operazioniAmmessePerFattura(invoice: Invoice): OperazioneTs[] {
    return operazioniAmmesse(sistemaTsService.statoPerFattura(invoice))
  },

  /** Crea la riga di stato se assente, senza sovrascrivere quella esistente. */
  assicura(fatturaId: string): TrasmissioneTs {
    const esistente = sistemaTsService.perFattura(fatturaId)
    if (esistente) return esistente

    const ora = new Date().toISOString()
    const nuova: TrasmissioneTs = {
      id: generateId('sts'),
      fatturaId,
      stato: 'da_inviare',
      tentativi: [],
      createdAt: ora,
      updatedAt: ora,
    }
    saveAll([...getAll(), nuova])
    return nuova
  },

  /**
   * Registra l'esito di un tentativo e aggiorna lo stato.
   * Lo storico conserva metadati, mai il contenuto XML.
   */
  registraTentativo(
    fatturaId: string,
    tentativo: Omit<TentativoTs, 'id'>,
    nuovoStato: StatoSistemaTS,
  ): TrasmissioneTs {
    sistemaTsService.assicura(fatturaId)
    const elenco = getAll()
    const idx = elenco.findIndex((t) => t.fatturaId === fatturaId)
    const corrente = elenco[idx]

    const aggiornata: TrasmissioneTs = {
      ...corrente,
      stato: nuovoStato,
      protocollo: tentativo.protocollo ?? corrente.protocollo,
      dataInvio: tentativo.riuscito ? tentativo.istante : corrente.dataInvio,
      codiceEsito: tentativo.codice,
      descrizioneEsito: tentativo.descrizione,
      tentativi: [...corrente.tentativi, { ...tentativo, id: generateId('tent') }],
      updatedAt: new Date().toISOString(),
    }

    elenco[idx] = aggiornata
    saveAll(elenco)
    return aggiornata
  },

  /** Rimuove lo stato quando la fattura smette di essere soggetta a invio. */
  rimuoviSeNonInviata(fatturaId: string): void {
    const corrente = sistemaTsService.perFattura(fatturaId)
    // Una trasmissione già accettata resta a storico: cancellarla farebbe
    // perdere il protocollo necessario a variazioni o cancellazioni future.
    if (!corrente || corrente.stato === 'inviata' || corrente.stato === 'variata') return
    saveAll(getAll().filter((t) => t.fatturaId !== fatturaId))
  },

  ambienteCorrente(): AmbienteTs {
    // Valore reale letto dal backend; qui solo il ripiego prudente
    return 'mock'
  },
}
