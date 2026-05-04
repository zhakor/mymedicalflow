import { storageService } from './storageService'
import type {
  Patient,
  PatientInput,
  PatientFilters,
  PaginatedResult,
  PatientsQuery,
} from '../types/paziente'

const KEY = 'pazienti'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateId(): string {
  return `pat_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

function getAll(): Patient[] {
  return storageService.get<Patient[]>(KEY) ?? []
}

function saveAll(patients: Patient[]): void {
  storageService.set(KEY, patients)
}

function matchesFilters(p: Patient, filters: PatientFilters): boolean {
  if (!p) return false
  if (
    filters.firstName &&
    !p.firstName?.toLowerCase().includes(filters.firstName.toLowerCase())
  )
    return false
  if (
    filters.lastName &&
    !p.lastName?.toLowerCase().includes(filters.lastName.toLowerCase())
  )
    return false
  if (
    filters.fiscalCode &&
    !p.fiscalCode?.toLowerCase().includes(filters.fiscalCode.toLowerCase())
  )
    return false
  if (filters.gender && p.gender !== filters.gender) return false
  if (
    filters.developmentalAge !== null &&
    filters.developmentalAge !== undefined &&
    p.developmentalAge !== filters.developmentalAge
  )
    return false
  return true
}

// ─── Servizio pazienti ────────────────────────────────────────────────────────

export const pazienteService = {
  /**
   * Restituisce la lista paginata e filtrata.
   * Simula un comportamento server-side anche su dati locali.
   */
  getPatients(query: PatientsQuery): PaginatedResult<Patient> {
    const { page, pageSize, filters = {} } = query
    const all = getAll().filter(Boolean)
    const filtered = all.filter((p) => matchesFilters(p, filters))

    // Ordina per cognome + nome
    filtered.sort((a, b) =>
      `${a.lastName}${a.firstName}`.localeCompare(`${b.lastName}${b.firstName}`),
    )

    const totalItems = filtered.length
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize))
    const safePage = Math.min(page, totalPages)
    const start = (safePage - 1) * pageSize
    const data = filtered.slice(start, start + pageSize)

    return { data, totalItems, totalPages, page: safePage, pageSize }
  },

  getById(id: string): Patient | null {
    return getAll().find((p) => p.id === id) ?? null
  },

  getByFiscalCode(fiscalCode: string): Patient | null {
    const fc = fiscalCode.trim().toUpperCase()
    return getAll().find((p) => p.fiscalCode?.toUpperCase() === fc) ?? null
  },

  create(input: PatientInput): Patient {
    const now = new Date().toISOString()
    const patient: Patient = {
      ...input,
      id: generateId(),
      createdAt: now,
      updatedAt: now,
    }
    const all = getAll()
    all.push(patient)
    saveAll(all)
    return patient
  },

  update(id: string, input: PatientInput): Patient | null {
    const all = getAll()
    const idx = all.findIndex((p) => p.id === id)
    if (idx === -1) return null
    const updated: Patient = {
      ...all[idx],
      ...input,
      id,
      updatedAt: new Date().toISOString(),
    }
    all[idx] = updated
    saveAll(all)
    return updated
  },

  delete(id: string): boolean {
    const all = getAll()
    const filtered = all.filter((p) => p.id !== id)
    if (filtered.length === all.length) return false
    saveAll(filtered)
    return true
  },
}
