import { storageService } from './storageService'
import type {
  Appointment,
  AppointmentInput,
  AppointmentFilters,
  AppointmentQuery,
  PaginatedAppointments,
} from '../types/appuntamento'

const KEY = 'appuntamenti'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateId(): string {
  return `app_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

function getAll(): Appointment[] {
  return storageService.get<Appointment[]>(KEY) ?? []
}

function saveAll(appointments: Appointment[]): void {
  storageService.set(KEY, appointments)
}

function matchesFilters(a: Appointment, filters: AppointmentFilters): boolean {
  if (!a) return false
  if (filters.dateFrom && a.appointmentDate < filters.dateFrom) return false
  if (filters.dateTo && a.appointmentDate > filters.dateTo) return false
  if (filters.appointmentType && a.appointmentType !== filters.appointmentType) return false
  if (
    filters.patientLastName &&
    !a.patientLastName?.toLowerCase().includes(filters.patientLastName.toLowerCase())
  )
    return false
  return true
}

// ─── Servizio appuntamenti ────────────────────────────────────────────────────

export const appuntamentoService = {
  getAppointments(query: AppointmentQuery): PaginatedAppointments {
    const { page, pageSize, filters = {} } = query
    const all = getAll().filter(Boolean)
    const filtered = all.filter((a) => matchesFilters(a, filters))

    // Ordina per data desc, poi per orario desc
    filtered.sort((a, b) => {
      const dateDiff = b.appointmentDate.localeCompare(a.appointmentDate)
      if (dateDiff !== 0) return dateDiff
      return b.appointmentTime.localeCompare(a.appointmentTime)
    })

    const totalItems = filtered.length
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize))
    const safePage = Math.min(page, totalPages)
    const start = (safePage - 1) * pageSize
    const data = filtered.slice(start, start + pageSize)

    return { data, totalItems, totalPages, page: safePage, pageSize }
  },

  getById(id: string): Appointment | null {
    return getAll().find((a) => a.id === id) ?? null
  },

  create(input: AppointmentInput): Appointment {
    const now = new Date().toISOString()
    const appointment: Appointment = {
      ...input,
      id: generateId(),
      createdAt: now,
      updatedAt: now,
    }
    const all = getAll()
    saveAll([...all, appointment])
    return appointment
  },

  update(id: string, input: AppointmentInput): Appointment | null {
    const all = getAll()
    const index = all.findIndex((a) => a.id === id)
    if (index === -1) return null
    const updated: Appointment = {
      ...input,
      id,
      createdAt: all[index].createdAt,
      updatedAt: new Date().toISOString(),
    }
    all[index] = updated
    saveAll(all)
    return updated
  },

  delete(id: string): void {
    const all = getAll().filter((a) => a.id !== id)
    saveAll(all)
  },

  getCount(): number {
    return getAll().length
  },

  getByPatientId(patientId: string): Appointment[] {
    return getAll()
      .filter((a) => a.patientId === patientId)
      .sort((a, b) => {
        const dateDiff = b.appointmentDate.localeCompare(a.appointmentDate)
        if (dateDiff !== 0) return dateDiff
        return b.appointmentTime.localeCompare(a.appointmentTime)
      })
  },
}
