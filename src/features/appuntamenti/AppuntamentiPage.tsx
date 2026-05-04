import { useEffect, useState } from 'react'
import { Button } from '../../components/ui/Button'
import { useAppuntamentoStore } from '../../stores/appuntamentoStore'
import { AppuntamentiFilters } from './AppuntamentiFilters'
import { AppuntamentiTable } from './AppuntamentiTable'
import { AppuntamentoModal } from './AppuntamentoModal'
import { DeleteAppuntamentoConfirm } from './DeleteAppuntamentoConfirm'
import type { Appointment, AppointmentFilters, AppointmentInput } from '../../types/appuntamento'
import { Plus } from 'lucide-react'
import { clsx } from 'clsx'

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

  useEffect(() => {
    loadAppointments()
  }, [loadAppointments])

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
    setModalOpen(true)
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
        <Button
          onClick={() => {
            setEditingAppointment(null)
            setModalOpen(true)
          }}
        >
          <Plus size={16} />
          Aggiungi appuntamento
        </Button>
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

      {/* Modal crea/modifica */}
      {modalOpen && (
        <AppuntamentoModal
          appointment={editingAppointment}
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
