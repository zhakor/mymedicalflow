import { Input } from '../../components/ui/Input'
import { Select } from '../../components/ui/Select'
import {
  PAGAMENTO_TRACCIATO_OPTIONS,
  TIPO_DOCUMENTO_DEFAULT,
  TIPO_DOCUMENTO_OPTIONS,
  TIPO_SPESA_OPTIONS,
  datiSistemaTsPredefiniti,
} from '../../types/sistemaTs'
import type {
  DatiSistemaTs,
  PagamentoTracciato,
  TipoDocumentoTs,
  TipoSpesa,
} from '../../types/sistemaTs'

export interface SistemaTsErrori {
  dataPagamento?: string
  tipoSpesa?: string
  iva?: string
}

interface SistemaTsSectionProps {
  /** Assente quando la fattura non è soggetta a trasmissione. */
  dati: DatiSistemaTs | undefined
  onChange: (dati: DatiSistemaTs | undefined) => void
  dataEmissione: string
  errori?: SistemaTsErrori
  /** Disattiva ogni modifica. */
  bloccato?: boolean
  /**
   * Impedisce di togliere la fattura dalla trasmissione, lasciando però
   * modificabili i dati. Serve dopo un invio riuscito: il contenuto si può
   * ancora correggere con una variazione, ma il documento esiste ormai presso
   * il Sistema TS e non può sparire dall'archivio locale.
   */
  bloccaAttivazione?: boolean
}

/**
 * Sezione Sistema Tessera Sanitaria del form fattura.
 *
 * Chiede solo ciò che non è già presente altrove: partita IVA, numero, data di
 * emissione e codice fiscale dell'assistito vengono ripresi dalla fattura e dal
 * profilo, non richiesti una seconda volta.
 */
export function SistemaTsSection({
  dati,
  onChange,
  dataEmissione,
  errori = {},
  bloccato = false,
  bloccaAttivazione = false,
}: SistemaTsSectionProps) {
  const soggetta = dati !== undefined

  function aggiorna<K extends keyof DatiSistemaTs>(campo: K, valore: DatiSistemaTs[K]) {
    if (!dati) return
    onChange({ ...dati, [campo]: valore })
  }

  function commuta(attiva: boolean) {
    onChange(attiva ? datiSistemaTsPredefiniti(dataEmissione) : undefined)
  }

  const usaNaturaIva = !!dati?.naturaIva

  return (
    <div className="border-t border-gray-100 dark:border-gray-800 pt-5">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
        Sistema Tessera Sanitaria
      </p>

      <label className="flex items-center gap-2.5 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={soggetta}
          disabled={bloccato || bloccaAttivazione}
          onChange={(e) => commuta(e.target.checked)}
          className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-teal-600 focus:ring-teal-500 cursor-pointer disabled:opacity-50"
        />
        <span className="text-sm text-gray-700 dark:text-gray-300">
          Soggetta a trasmissione al Sistema TS
        </span>
      </label>

      {soggetta && dati && (
        <div className="mt-4 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Data di pagamento"
              type="date"
              required
              value={dati.dataPagamento}
              disabled={bloccato}
              onChange={(e) => aggiorna('dataPagamento', e.target.value)}
              error={errori.dataPagamento}
              hint="Può essere diversa dalla data di emissione."
            />
            <Select
              label="Pagamento tracciato"
              required
              options={PAGAMENTO_TRACCIATO_OPTIONS}
              value={dati.pagamentoTracciato}
              disabled={bloccato}
              onChange={(e) => aggiorna('pagamentoTracciato', e.target.value as PagamentoTracciato)}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Quasi sempre "Fattura", ma il tracciato ammette anche il
                documento commerciale e la scelta deve restare all'utente. */}
            <Select
              label="Tipo documento"
              required
              options={TIPO_DOCUMENTO_OPTIONS}
              value={dati.tipoDocumento ?? TIPO_DOCUMENTO_DEFAULT}
              disabled={bloccato}
              onChange={(e) => aggiorna('tipoDocumento', e.target.value as TipoDocumentoTs)}
            />
            <Select
              label="Tipo di spesa"
              required
              options={TIPO_SPESA_OPTIONS}
              value={dati.tipoSpesa}
              disabled={bloccato}
              onChange={(e) => aggiorna('tipoSpesa', e.target.value as TipoSpesa)}
              error={errori.tipoSpesa}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Aliquota e natura sono alternative: l'XSD le dichiara in xs:choice.
                I due radio stanno sulla riga dell'etichetta, altrimenti
                aggiungerebbero una riga e il campo si disallineerebbe dal
                select accanto. */}
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between gap-3 mb-1.5">
                <span className="label mb-0">IVA</span>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-400 cursor-pointer">
                    <input
                      type="radio"
                      checked={!usaNaturaIva}
                      disabled={bloccato}
                      onChange={() => onChange({ ...dati, naturaIva: undefined, aliquotaIva: 0 })}
                      className="text-teal-600 focus:ring-teal-500"
                    />
                    Aliquota
                  </label>
                  <label className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-400 cursor-pointer">
                    <input
                      type="radio"
                      checked={usaNaturaIva}
                      disabled={bloccato}
                      onChange={() => onChange({ ...dati, aliquotaIva: undefined, naturaIva: 'N4' })}
                      className="text-teal-600 focus:ring-teal-500"
                    />
                    Natura
                  </label>
                </div>
              </div>

              {usaNaturaIva ? (
                <Input
                  placeholder="Es. N4"
                  value={dati.naturaIva ?? ''}
                  disabled={bloccato}
                  onChange={(e) => aggiorna('naturaIva', e.target.value.toUpperCase())}
                  error={errori.iva}
                  className="uppercase"
                />
              ) : (
                <Input
                  type="number"
                  step="0.01"
                  min={0}
                  max={100}
                  placeholder="0.00"
                  value={dati.aliquotaIva ?? 0}
                  disabled={bloccato}
                  onChange={(e) =>
                    aggiorna('aliquotaIva', e.target.value === '' ? undefined : Number(e.target.value))
                  }
                  error={errori.iva}
                />
              )}
            </div>
          </div>

          <div className="space-y-2.5">
            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={dati.opposizione}
                disabled={bloccato}
                onChange={(e) => aggiorna('opposizione', e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-teal-600 focus:ring-teal-500 cursor-pointer disabled:opacity-50"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">
                L'assistito si oppone all'invio dei propri dati
              </span>
            </label>

            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={dati.pagamentoAnticipato ?? false}
                disabled={bloccato}
                onChange={(e) => aggiorna('pagamentoAnticipato', e.target.checked || undefined)}
                className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-teal-600 focus:ring-teal-500 cursor-pointer disabled:opacity-50"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">Pagamento anticipato</span>
            </label>
          </div>
        </div>
      )}
    </div>
  )
}
