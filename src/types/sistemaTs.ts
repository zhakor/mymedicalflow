/**
 * Sistema Tessera Sanitaria — modello applicativo.
 *
 * Questi tipi appartengono al dominio dell'app, non al tracciato ministeriale:
 * la conversione verso `DocumentoSpesa730p` avviene nel modulo Rust, così una
 * futura modifica dell'XSD non si propaga qui.
 *
 * Riferimento: DocumentoSpesa730pSchema.xsd, Development Kit ver. 20240214
 * (src-tauri/resources/sistema_ts/TracciatiWS/WS_SincronoSingoloDato730).
 */

// ─── Stato della trasmissione ─────────────────────────────────────────────────

/**
 * Stato rispetto al Sistema TS. È indipendente dal tipo di fattura
 * (cartacea/elettronica): una fattura resta ciò che è, e separatamente può
 * essere soggetta o meno alla trasmissione.
 */
export type StatoSistemaTS =
  | 'non_previsto'
  | 'da_inviare'
  | 'inviata'
  | 'errore'
  | 'variata'
  | 'cancellata'

export const STATO_STS_LABELS: Record<StatoSistemaTS, string> = {
  non_previsto: 'Non prevista',
  da_inviare: 'Da inviare',
  inviata: 'Trasmessa',
  errore: 'Errore',
  variata: 'Variata',
  cancellata: 'Cancellata',
}

// ─── Voce di spesa ────────────────────────────────────────────────────────────

/** Codici ammessi da `tipoSpesa` nell'XSD. */
export type TipoSpesa =
  | 'TK' | 'FC' | 'FV' | 'AS' | 'SR' | 'CT'
  | 'PI' | 'IC' | 'AA' | 'AD' | 'SV' | 'SP'

/**
 * Etichette dei codici usati da un professionista sanitario.
 * `SP` è quello impiegato dai logopedisti: confermato da una trasmissione reale.
 */
export const TIPO_SPESA_LABELS: Partial<Record<TipoSpesa, string>> = {
  SP: 'SP — Prestazione sanitaria',
  AS: 'AS — Spese sanitarie relative a patologie esenti',
  SR: 'SR — Spese sanitarie relative a patologie che danno diritto a detrazione',
  CT: 'CT — Cure termali',
  AD: 'AD — Spese per addetti all\'assistenza personale',
}

export const TIPO_SPESA_DEFAULT: TipoSpesa = 'SP'

export const TIPO_SPESA_OPTIONS = Object.entries(TIPO_SPESA_LABELS).map(
  ([value, label]) => ({ value, label: label ?? value }),
)

// ─── Dati inseriti dall'utente sulla fattura ──────────────────────────────────

export type PagamentoTracciato = 'SI' | 'NO'

export const PAGAMENTO_TRACCIATO_OPTIONS = [
  { value: 'SI', label: 'Sì — bancomat, carta, bonifico' },
  { value: 'NO', label: 'No — contanti' },
]

/** Codici ammessi da `tipoDocumento` nell'XSD: fattura o documento commerciale. */
export type TipoDocumentoTs = 'F' | 'D'

export const TIPO_DOCUMENTO_OPTIONS = [
  { value: 'F', label: 'Fattura' },
  { value: 'D', label: 'Documento commerciale' },
]

export const TIPO_DOCUMENTO_DEFAULT: TipoDocumentoTs = 'F'

/**
 * Dati aggiuntivi richiesti dal Sistema TS e non ricavabili dalla fattura.
 * Presenti solo quando la fattura è soggetta a trasmissione.
 */
export interface DatiSistemaTs {
  /** Data dell'incasso: può differire dalla data di emissione. */
  dataPagamento: string
  pagamentoTracciato: PagamentoTracciato
  /** L'assistito si oppone all'invio dei propri dati all'Agenzia delle Entrate. */
  opposizione: boolean
  /**
   * Assente sulle fatture registrate prima dell'introduzione del campo: in
   * trasmissione vale allora il valore predefinito.
   */
  tipoDocumento?: TipoDocumentoTs
  tipoSpesa: TipoSpesa
  /** Alternativi fra loro, come impone l'`xs:choice` dell'XSD. */
  aliquotaIva?: number
  naturaIva?: string
  pagamentoAnticipato?: boolean
}

/** Valori iniziali: quelli usati nella pratica corrente. */
export function datiSistemaTsPredefiniti(dataEmissione: string): DatiSistemaTs {
  return {
    dataPagamento: dataEmissione,
    pagamentoTracciato: 'SI',
    opposizione: false,
    tipoDocumento: TIPO_DOCUMENTO_DEFAULT,
    tipoSpesa: TIPO_SPESA_DEFAULT,
    aliquotaIva: 0,
  }
}

// ─── Esito e storico ──────────────────────────────────────────────────────────

export type OperazioneTs = 'inserimento' | 'variazione' | 'cancellazione' | 'rimborso'

export const OPERAZIONE_TS_LABELS: Record<OperazioneTs, string> = {
  inserimento: 'Inserimento',
  variazione: 'Variazione',
  cancellazione: 'Cancellazione',
  rimborso: 'Rimborso',
}

export type AmbienteTs = 'mock' | 'test' | 'produzione'

export const AMBIENTE_TS_LABELS: Record<AmbienteTs, string> = {
  mock: 'Simulazione locale',
  test: 'Ambiente di test',
  produzione: 'Produzione',
}

/** Classificazione del campo `tipo` restituito dal Sistema TS per un messaggio. */
export type CategoriaMessaggioTs = 'errore' | 'avviso' | 'informazione' | 'sconosciuta'

/**
 * Un messaggio applicativo del Sistema TS. `accettata` e `messaggi` sono
 * dimensioni indipendenti: un'operazione accettata può portare avvisi, e un
 * rifiuto può contenere più di un messaggio.
 */
export interface MessaggioTs {
  codice: string
  descrizione: string
  /** Valore originale restituito dal Sistema TS (es. "E", "W", "I"). */
  tipo: string
  categoria: CategoriaMessaggioTs
}

/**
 * Un tentativo di comunicazione. Conserva metadati, mai il contenuto XML:
 * conterrebbe codice fiscale e dati sanitari.
 */
export interface TentativoTs {
  id: string
  operazione: OperazioneTs
  ambiente: AmbienteTs
  istante: string
  riuscito: boolean
  protocollo?: string
  /** Tutti i messaggi restituiti dal Sistema TS per questo tentativo. */
  messaggi?: MessaggioTs[]
  /** @deprecated sostituito da `messaggi`; resta per i tentativi salvati prima dell'introduzione dell'elenco. */
  codice?: string
  /** @deprecated sostituito da `messaggi`; resta per i tentativi salvati prima dell'introduzione dell'elenco. */
  descrizione?: string
}

/**
 * Stato corrente della trasmissione di una fattura, con il proprio storico.
 * Vive in una collezione separata: la fattura non deve riempirsi di dettagli
 * tecnici del Sistema TS.
 */
export interface TrasmissioneTs {
  id: string
  fatturaId: string
  stato: StatoSistemaTS
  protocollo?: string
  dataInvio?: string
  codiceEsito?: string
  descrizioneEsito?: string
  tentativi: TentativoTs[]
  createdAt: string
  updatedAt: string
}

// ─── Regole ───────────────────────────────────────────────────────────────────

/**
 * Dal 01/01/2021 tipo documento e opposizione sono obbligatori.
 * La regola è indicata nella pagina di inserimento del portale Sistema TS e
 * dipende dalla data di pagamento, non da quella di emissione.
 */
export const DATA_OBBLIGO_TIPO_DOCUMENTO = '2021-01-01'

export function richiedeTipoDocumentoEOpposizione(dataPagamento: string): boolean {
  return dataPagamento >= DATA_OBBLIGO_TIPO_DOCUMENTO
}

/**
 * Numero da trasmettere: il Sistema TS identifica il documento con
 * `pIva + dataEmissione + dispositivo + numDocumento`, quindi il valore deve
 * restare stabile nel tempo. L'app numera come "40/2026" ma sul portale viene
 * trasmesso "40": si invia perciò la sola parte prima della barra, altrimenti
 * una variazione successiva non ritroverebbe il documento.
 */
export function numeroDocumentoPerSts(invoiceNumber: string): string {
  return invoiceNumber.split('/')[0].trim()
}

/** Operazioni ammesse a partire dallo stato corrente. */
export function operazioniAmmesse(stato: StatoSistemaTS): OperazioneTs[] {
  switch (stato) {
    case 'non_previsto':
      return []
    case 'da_inviare':
    case 'errore':
      return ['inserimento']
    case 'inviata':
    case 'variata':
      return ['variazione', 'cancellazione']
    case 'cancellata':
      // Dopo la cancellazione il documento può essere reinserito
      return ['inserimento']
  }
}
