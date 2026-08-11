import { useEffect, useMemo, useState } from 'react'
import { Button } from '../../components/ui/Button'
import { useAppuntamentoStore } from '../../stores/appuntamentoStore'
import { appuntamentoService } from '../../lib/appuntamentoService'
import { dataDaChiave, oggi } from '../../lib/agendaService'
import { AppuntamentiFilters } from './AppuntamentiFilters'
import { AppuntamentiTable } from './AppuntamentiTable'
import { AppuntamentoModal } from './AppuntamentoModal'
import { CalendarioMese } from './CalendarioMese'
import { GiornataSlot } from './GiornataSlot'
import { DeleteAppuntamentoConfirm } from './DeleteAppuntamentoConfirm'
import type { Appointment, AppointmentFilters, AppointmentInput } from '../../types/appuntamento'
import { CalendarDays, List, Plus } from 'lucide-react'
import { clsx } from 'clsx'

type Vista = 'calendario' | 'elenco'

export function AppuntamentiPage() {
  const {
    result,
    query,
    feedbackMessage,
    feedbackType,
    loadAppointments,
    setPage,
    setPageSize,
    setFilters,
    resetFilters,
    createAppointment,
    updateAppointment,
    deleteAppointment,
    showFeedback,
  } = useAppuntamentoStore()

  const [modalOpen, setModalOpen] = useState(false)
  const [editingAppointment, setEditingAppointment] = useState<Appointment | null>(null)
  const [deletingAppointment, setDeletingAppointment] = useState<Appointment | null>(null)

  const [vista, setVista] = useState<Vista>('calendario')
  const [giornoSelezionato, setGiornoSelezionato] = useState(oggi)
  const [meseVisibile, setMeseVisibile] = useState(() => {
    const d = new Date()
    return { anno: d.getFullYear(), mese: d.getMonth() }
  })
  /** Orario di partenza quando il nuovo appuntamento nasce da uno slot libero. */
  const [oraProposta, setOraProposta] = useState<string | undefined>()

  useEffect(() => {
    loadAppointments()
  }, [loadAppointments])

  // Il calendario mostra il mese intero e non può usare la pagina corrente.
  // `result` cambia a ogni salvataggio: basta come innesco per rileggere.
  const tuttiAppuntamenti = useMemo(
    () => appuntamentoService.getAllAppointments(),
    [result],
  )

  function hasActiveFilters(): boolean {
    const f = query.filters
    return !!(f.dateFrom || f.dateTo || f.appointmentType || f.patientLastName)
  }

  function handleSearch(filters: AppointmentFilters) {
    setFilters(filters)
  }

  function handleReset() {
    resetFilters()
  }

  function handleEdit(appointment: Appointment) {
    setEditingAppointment(appointment)
    setOraProposta(undefined)
    setModalOpen(true)
  }

  /** Nuovo appuntamento da uno slot libero: data e ora arrivano già scelte. */
  function handleNuovoDaSlot(ora: string) {
    setEditingAppointment(null)
    setOraProposta(ora)
    setModalOpen(true)
  }

  function handleSelezioneGiorno(chiave: string) {
    setGiornoSelezionato(chiave)
    // Toccare un giorno di coda o di testa porta il calendario sul suo mese
    const d = dataDaChiave(chiave)
    if (d.getFullYear() !== meseVisibile.anno || d.getMonth() !== meseVisibile.mese) {
      setMeseVisibile({ anno: d.getFullYear(), mese: d.getMonth() })
    }
  }

  function handleDeleteRequest(appointment: Appointment) {
    setDeletingAppointment(appointment)
  }

  function handleDeleteConfirm() {
    if (deletingAppointment) {
      deleteAppointment(deletingAppointment.id)
      setDeletingAppointment(null)
    }
  }

  function handleModalClose() {
    setModalOpen(false)
    setEditingAppointment(null)
    setOraProposta(undefined)
  }

  function handleSave(input: AppointmentInput, id?: string) {
    if (id) {
      updateAppointment(id, input)
    } else {
      createAppointment(input)
    }
  }

  function handleSaved(message: string) {
    handleModalClose()
    showFeedback(message)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <p className="text-gray-500 dark:text-gray-400 text-sm font-medium uppercase tracking-wide">
            Appuntamenti
          </p>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
            Gestione appuntamenti
          </h2>
        </div>
        <div className="flex items-center gap-3">
          {/* Selettore di vista */}
          <div className="flex items-center gap-0.5 rounded-xl border border-gray-200 bg-white p-0.5 dark:border-gray-700 dark:bg-gray-800">
            {([
              { valore: 'calendario', etichetta: 'Calendario', icona: CalendarDays },
              { valore: 'elenco', etichetta: 'Elenco', icona: List },
            ] as const).map(({ valore, etichetta, icona: Icona }) => (
              <button
                key={valore}
                type="button"
                onClick={() => setVista(valore)}
                aria-pressed={vista === valore}
                className={clsx(
                  'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
                  vista === valore
                    ? 'bg-teal-50 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400'
                    : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200',
                )}
              >
                <Icona size={15} />
                {etichetta}
              </button>
            ))}
          </div>

          <Button
            onClick={() => {
              setEditingAppointment(null)
              setOraProposta(undefined)
              setModalOpen(true)
            }}
          >
            <Plus size={16} />
            Aggiungi appuntamento
          </Button>
        </div>
      </div>

      {/* Feedback */}
      {feedbackMessage && (
        <div
          className={clsx(
            'px-4 py-3 rounded-xl flex items-center gap-2 text-sm border',
            feedbackType === 'error'
              ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-700 dark:text-red-400'
              : 'bg-teal-50 dark:bg-teal-900/20 border-teal-200 dark:border-teal-800 text-teal-700 dark:text-teal-400',
          )}
        >
          {feedbackMessage}
        </div>
      )}

      {vista === 'calendario' ? (
        /* Il mese dà il colpo d'occhio, la colonna a fianco entra nel dettaglio
           della giornata scelta. Sotto il breakpoint si impilano. */
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
          <CalendarioMese
            appuntamenti={tuttiAppuntamenti}
            anno={meseVisibile.anno}
            mese={meseVisibile.mese}
            selezionato={giornoSelezionato}
            onSelezione={handleSelezioneGiorno}
            onCambioMese={(anno, mese) => setMeseVisibile({ anno, mese })}
          />
          <GiornataSlot
            appuntamenti={tuttiAppuntamenti}
            giorno={giornoSelezionato}
            onNuovo={handleNuovoDaSlot}
            onModifica={handleEdit}
            onElimina={handleDeleteRequest}
          />
        </div>
      ) : (
        <>
          {/* Filtri */}
          <AppuntamentiFilters onSearch={handleSearch} onReset={handleReset} />

          {/* Tabella */}
          <AppuntamentiTable
            result={result}
            hasActiveFilters={hasActiveFilters()}
            onEdit={handleEdit}
            onDelete={handleDeleteRequest}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
          />
        </>
      )}

      {/* Modal crea/modifica */}
      {modalOpen && (
        <AppuntamentoModal
          appointment={editingAppointment}
          dataIniziale={giornoSelezionato}
          oraIniziale={oraProposta}
          onClose={handleModalClose}
          onSaved={handleSaved}
          onSave={handleSave}
        />
      )}

      {/* Confirm elimina */}
      {deletingAppointment && (
        <DeleteAppuntamentoConfirm
          appointment={deletingAppointment}
          onConfirm={handleDeleteConfirm}
          onCancel={() => setDeletingAppointment(null)}
        />
      )}
    </div>
  )
}
