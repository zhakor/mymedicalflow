import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Eye, MoreVertical, Pencil, Send, Trash2 } from 'lucide-react'
import { clsx } from 'clsx'
import type { Invoice } from '../../types/fattura'

/** Distanza fra il bottone e il menu. */
const SCARTO = 6

interface VoceMenu {
  chiave: string
  etichetta: string
  icona: ReactNode
  onSelect: () => void
  disabilitata?: boolean
  /** Mostrata sotto l'etichetta quando la voce non è utilizzabile. */
  motivo?: string
  pericolosa?: boolean
}

interface MenuAzioniFatturaProps {
  invoice: Invoice
  onView: (invoice: Invoice) => void
  onEdit: (invoice: Invoice) => void
  onSistemaTs: (invoice: Invoice) => void
  onDelete: (invoice: Invoice) => void
}

/**
 * Azioni della riga raccolte sotto i tre puntini.
 *
 * Il menu vive in un **portale**: la tabella scorre in orizzontale, e un
 * elemento posizionato al suo interno verrebbe tagliato dal contenitore.
 * Per la stessa ragione la posizione è calcolata dal rettangolo del bottone e
 * il menu si chiude appena la pagina scorre, altrimenti resterebbe indietro.
 */
export function MenuAzioniFattura({
  invoice,
  onView,
  onEdit,
  onSistemaTs,
  onDelete,
}: MenuAzioniFatturaProps) {
  const [aperto, setAperto] = useState(false)
  const [posizione, setPosizione] = useState<{ top: number; right: number } | null>(null)
  const bottoneRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  function apri() {
    const rettangolo = bottoneRef.current?.getBoundingClientRect()
    if (!rettangolo) return
    setPosizione({
      top: rettangolo.bottom + SCARTO,
      right: window.innerWidth - rettangolo.right,
    })
    setAperto(true)
  }

  // Se sotto non c'è spazio il menu si ribalta sopra il bottone. Si misura ad
  // apertura avvenuta: l'altezza dipende dalle voci effettivamente presenti.
  useLayoutEffect(() => {
    if (!aperto || !menuRef.current || !bottoneRef.current) return
    const menu = menuRef.current.getBoundingClientRect()
    if (menu.bottom <= window.innerHeight - SCARTO) return
    const bottone = bottoneRef.current.getBoundingClientRect()
    setPosizione((precedente) =>
      precedente
        ? { ...precedente, top: Math.max(SCARTO, bottone.top - menu.height - SCARTO) }
        : precedente,
    )
  }, [aperto])

  useEffect(() => {
    if (!aperto) return

    function chiudi() {
      setAperto(false)
    }
    function suTasto(e: KeyboardEvent) {
      if (e.key === 'Escape') setAperto(false)
    }
    function suClick(e: MouseEvent) {
      const bersaglio = e.target as Node
      if (menuRef.current?.contains(bersaglio) || bottoneRef.current?.contains(bersaglio)) return
      setAperto(false)
    }

    document.addEventListener('mousedown', suClick)
    document.addEventListener('keydown', suTasto)
    // In cattura, per intercettare anche lo scorrimento dei contenitori interni
    window.addEventListener('scroll', chiudi, true)
    window.addEventListener('resize', chiudi)
    return () => {
      document.removeEventListener('mousedown', suClick)
      document.removeEventListener('keydown', suTasto)
      window.removeEventListener('scroll', chiudi, true)
      window.removeEventListener('resize', chiudi)
    }
  }, [aperto])

  const elettronica = invoice.invoiceType === 'elettronica'

  const voci: VoceMenu[] = [
    {
      chiave: 'apri',
      etichetta: 'Apri fattura generata',
      icona: <Eye size={15} />,
      onSelect: () => onView(invoice),
      disabilitata: !invoice.generatedFile,
      motivo: 'Fattura non ancora generata',
    },
    {
      chiave: 'modifica',
      etichetta: 'Modifica',
      icona: <Pencil size={15} />,
      onSelect: () => onEdit(invoice),
    },
    {
      chiave: 'sistema-ts',
      etichetta: 'Sistema Tessera Sanitaria',
      icona: <Send size={15} />,
      onSelect: () => onSistemaTs(invoice),
      disabilitata: elettronica,
      motivo: 'Le fatture elettroniche seguono un percorso proprio',
    },
    {
      chiave: 'elimina',
      etichetta: 'Elimina',
      icona: <Trash2 size={15} />,
      onSelect: () => onDelete(invoice),
      pericolosa: true,
    },
  ]

  return (
    <>
      <button
        ref={bottoneRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={aperto}
        aria-label={`Azioni sulla fattura ${invoice.invoiceNumber}`}
        onClick={() => (aperto ? setAperto(false) : apri())}
        className={clsx(
          'w-8 h-8 rounded-lg flex items-center justify-center transition-colors',
          'text-gray-400 hover:text-gray-600 dark:hover:text-gray-200',
          aperto
            ? 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-200'
            : 'hover:bg-gray-100 dark:hover:bg-gray-800',
        )}
      >
        <MoreVertical size={16} />
      </button>

      {aperto &&
        posizione &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            style={{ top: posizione.top, right: posizione.right }}
            className="fixed z-50 min-w-[15rem] py-1.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl"
          >
            {voci.map((voce) => (
              <button
                key={voce.chiave}
                type="button"
                role="menuitem"
                disabled={voce.disabilitata}
                title={voce.disabilitata ? voce.motivo : undefined}
                onClick={() => {
                  setAperto(false)
                  voce.onSelect()
                }}
                className={clsx(
                  'w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-left transition-colors',
                  voce.disabilitata
                    ? 'text-gray-300 dark:text-gray-600 cursor-not-allowed'
                    : voce.pericolosa
                      ? 'text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20'
                      : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800',
                )}
              >
                <span className="flex-shrink-0">{voce.icona}</span>
                {voce.etichetta}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  )
}
