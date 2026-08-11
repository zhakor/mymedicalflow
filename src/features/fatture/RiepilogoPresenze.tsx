import { useMemo } from 'react'
import { CalendarCheck, TriangleAlert } from 'lucide-react'
import { riepilogoMensile, meseDi } from '../../lib/presenzaService'
import { dataDaChiave } from '../../lib/agendaService'

interface RiepilogoPresenzeProps {
  patientId: string
  /** Data di emissione: il mese da riepilogare si ricava da qui. */
  issueDate: string
  /** Importo attualmente nel form, per il confronto. */
  importoCorrente: number
  onUsaImporto: (importo: number) => void
}

const formatEuro = (v: number) =>
  new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(v)

function nomeMeseEsteso(mese: string): string {
  return dataDaChiave(`${mese}-01`).toLocaleDateString('it-IT', {
    month: 'long',
    year: 'numeric',
  })
}

/** "ad aprile" ma "a maggio": la d eufonica vuole una vocale dopo. */
function preposizione(parola: string): string {
  return /^[aeiou]/i.test(parola) ? 'ad' : 'a'
}

/**
 * Confronta l'importo della fattura con le sedute svolte nel mese.
 *
 * Non impone nulla: una fattura può coprire un periodo diverso, includere
 * materiali o applicare uno sconto. Mostra il conto delle presenze e lascia
 * decidere, offrendo la scorciatoia quando i due numeri devono coincidere.
 */
export function RiepilogoPresenze({
  patientId,
  issueDate,
  importoCorrente,
  onUsaImporto,
}: RiepilogoPresenzeProps) {
  const mese = meseDi(issueDate)
  const riepilogo = useMemo(
    () => (patientId && mese ? riepilogoMensile(patientId, mese) : null),
    [patientId, mese],
  )

  // Senza paziente collegato o senza sedute svolte non c'è nulla da confrontare
  if (!riepilogo || riepilogo.presenti === 0) return null

  const combacia = Math.abs(riepilogo.totale - importoCorrente) < 0.01
  const mostraScorciatoia = riepilogo.totale > 0 && !combacia
  const nomeMese = nomeMeseEsteso(mese)

  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800/50">
      <div className="mb-2 flex items-center gap-2">
        <CalendarCheck size={15} className="flex-shrink-0 text-teal-600" />
        <p className="text-xs font-semibold text-gray-700 dark:text-gray-200">
          Sedute svolte {preposizione(nomeMese)} {nomeMese}
        </p>
      </div>

      <ul className="space-y-1">
        {riepilogo.voci.map((v) => (
          <li
            key={v.nome}
            className="flex items-baseline justify-between gap-3 text-xs text-gray-600 dark:text-gray-300"
          >
            <span className="truncate">
              {v.quantita}× {v.nome}
            </span>
            <span className="flex-shrink-0 tabular-nums">
              {v.senzaPrezzo ? (
                <span className="text-amber-600 dark:text-amber-400">senza tariffa</span>
              ) : (
                formatEuro(v.totale)
              )}
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-2 flex items-baseline justify-between gap-3 border-t border-gray-200 pt-2 dark:border-gray-700">
        <span className="text-xs font-semibold text-gray-700 dark:text-gray-200">
          Totale delle sedute
        </span>
        <span className="text-sm font-bold tabular-nums text-gray-900 dark:text-white">
          {formatEuro(riepilogo.totale)}
        </span>
      </div>

      {riepilogo.totaleParziale && (
        <p className="mt-1.5 flex items-start gap-1.5 text-[11px] text-amber-700 dark:text-amber-400">
          <TriangleAlert size={12} className="mt-0.5 flex-shrink-0" />
          Alcuni servizi non hanno una tariffa: il totale è parziale. Impostala
          nelle Impostazioni.
        </p>
      )}

      {(riepilogo.assenti > 0 || riepilogo.daSvolgere > 0) && (
        <p className="mt-1.5 text-[11px] text-gray-500 dark:text-gray-400">
          Nel mese:{' '}
          {[
            riepilogo.assenti > 0 &&
              `${riepilogo.assenti} ${riepilogo.assenti === 1 ? 'assenza' : 'assenze'}`,
            riepilogo.daSvolgere > 0 &&
              `${riepilogo.daSvolgere} ${riepilogo.daSvolgere === 1 ? 'seduta ancora da svolgere' : 'sedute ancora da svolgere'}`,
          ]
            .filter(Boolean)
            .join(', ')}
          {' '}— non conteggiate.
        </p>
      )}

      {combacia && (
        <p className="mt-1.5 text-[11px] font-medium text-teal-700 dark:text-teal-400">
          L'importo della fattura corrisponde.
        </p>
      )}

      {mostraScorciatoia && (
        <button
          type="button"
          onClick={() => onUsaImporto(riepilogo.totale)}
          className="mt-2 w-full rounded-lg border border-teal-300 px-3 py-1.5 text-xs font-medium text-teal-700 transition-colors hover:bg-teal-50 dark:border-teal-800 dark:text-teal-400 dark:hover:bg-teal-900/20"
        >
          Usa {formatEuro(riepilogo.totale)} come importo
        </button>
      )}
    </div>
  )
}
