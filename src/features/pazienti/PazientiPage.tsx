import { useEffect, useState } from 'react'
import { Button } from '../../components/ui/Button'
import { usePazienteStore } from '../../stores/pazienteStore'
import { PazientiFilters } from './PazientiFilters'
import { PazientiTable } from './PazientiTable'
import { PazienteModal } from './PazienteModal'
import { DeleteConfirm } from './DeleteConfirm'
import { CartellaPaziente } from './CartellaPaziente'
import type { Patient, PatientFilters } from '../../types/paziente'
import { EMPTY_FILTERS as _EMPTY } from './pazienteValidation'
import { UserPlus, Check, AlertTriangle } from 'lucide-react'

function hasActiveFilters(filters: PatientFilters): boolean {
  return !!(
    filters.firstName ||
    filters.lastName ||
    filters.fiscalCode ||
    filters.gender ||
    filters.developmentalAge !== null && filters.developmentalAge !== undefined
  )
}

export function PazientiPage() {
  const {
    result,
    query,
    feedbackMessage,
    feedbackType,
    loadPatients,
    setPage,
    setPageSize,
    setFilters,
    resetFilters,
    deletePatient,
    showFeedback,
  } = usePazienteStore()

  // Stato modale creazione/modifica
  const [modalOpen, setModalOpen] = useState(false)
  const [editingPatient, setEditingPatient] = useState<Patient | null>(null)

  // Stato conferma cancellazione
  const [deletingPatient, setDeletingPatient] = useState<Patient | null>(null)

  // Stato cartella clinica
  const [cartellaPatient, setCartellaPatient] = useState<Patient | null>(null)

  // Carica pazienti al mount
  useEffect(() => {
    loadPatients()
  }, [loadPatients])

  // ── Handlers ────────────────────────────────────────────────────────────────

  function handleSearch(filters: PatientFilters) {
    setFilters(filters)
  }

  function handleReset() {
    resetFilters()
  }

  function handleAddNew() {
    setEditingPatient(null)
    setModalOpen(true)
  }

  function handleEdit(patient: Patient) {
    setEditingPatient(patient)
    setModalOpen(true)
  }

  function handleSaved(message: string) {
    setModalOpen(false)
    setEditingPatient(null)
    loadPatients()
    showFeedback(message)
  }

  function handleDeleteRequest(patient: Patient) {
    setDeletingPatient(patient)
  }

  function handleDeleteConfirm() {
    if (!deletingPatient) return
    deletePatient(deletingPatient.id)
    setDeletingPatient(null)
  }

  function handleOpenCartella(patient: Patient) {
    setCartellaPatient(patient)
  }

  // ── Vista cartella clinica ──────────────────────────────────────────────────

  if (cartellaPatient) {
    return (
      <CartellaPaziente
        patient={cartellaPatient}
        onBack={() => setCartellaPatient(null)}
      />
    )
  }

  // ── Vista lista pazienti ────────────────────────────────────────────────────

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <p className="text-gray-500 dark:text-gray-400 text-sm font-medium uppercase tracking-wide">
            Pazienti
          </p>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
            Gestione pazienti
          </h2>
        </div>

        <Button onClick={handleAddNew}>
          <UserPlus size={16} />
          Aggiungi paziente
        </Button>
      </div>

      {/* Feedback */}
      {feedbackMessage && (
        <div
          className={`flex items-center gap-2 px-4 py-3 rounded-xl border text-sm ${
            feedbackType === 'error'
              ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-700 dark:text-red-400'
              : 'bg-teal-50 dark:bg-teal-900/20 border-teal-200 dark:border-teal-800 text-teal-700 dark:text-teal-400'
          }`}
        >
          {feedbackType === 'error' ? <AlertTriangle size={16} /> : <Check size={16} />}
          {feedbackMessage}
        </div>
      )}

      {/* Filtri */}
      <PazientiFilters onSearch={handleSearch} onReset={handleReset} />

      {/* Contatore risultati */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {result.totalItems === 0
            ? 'Nessun paziente'
            : `${result.totalItems} pazient${result.totalItems === 1 ? 'e' : 'i'}`}
        </p>
      </div>

      {/* Tabella */}
      <PazientiTable
        result={result}
        hasActiveFilters={hasActiveFilters(query.filters)}
        onOpenCartella={handleOpenCartella}
        onEdit={handleEdit}
        onDelete={handleDeleteRequest}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
      />

      {/* Modale creazione/modifica */}
      {modalOpen && (
        <PazienteModal
          patient={editingPatient}
          onClose={() => { setModalOpen(false); setEditingPatient(null) }}
          onSaved={handleSaved}
        />
      )}

      {/* Dialog conferma cancellazione */}
      {deletingPatient && (
        <DeleteConfirm
          nome={`${deletingPatient.firstName} ${deletingPatient.lastName}`}
          onConfirm={handleDeleteConfirm}
          onCancel={() => setDeletingPatient(null)}
        />
      )}
    </div>
  )
}
