// ─── Genere ────────────────────────────────────────────────────────────────

export type Gender = 'male' | 'female' | 'other' | 'notSpecified'

export const GENDER_LABELS: Record<Gender, string> = {
  male: 'Maschio',
  female: 'Femmina',
  other: 'Altro',
  notSpecified: 'Non specificato',
}

export const GENDER_OPTIONS = Object.entries(GENDER_LABELS).map(([value, label]) => ({
  value,
  label,
}))

// ─── Tutore ─────────────────────────────────────────────────────────────────

export interface Guardian {
  firstName: string
  lastName: string
  fiscalCode?: string
  phoneNumber?: string
  gender?: Gender
  birthDate?: string   // ISO date YYYY-MM-DD
  address?: string
  postalCode?: string
  city?: string
  province?: string    // 2 lettere maiuscole
}

// ─── Giorno fisso ──────────────────────────────────────────────────────────────

/** Giorno della settimana ISO: 1 = lunedì … 7 = domenica */
export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7

export const WEEKDAY_LABELS: Record<Weekday, string> = {
  1: 'Lunedì',
  2: 'Martedì',
  3: 'Mercoledì',
  4: 'Giovedì',
  5: 'Venerdì',
  6: 'Sabato',
  7: 'Domenica',
}

export const WEEKDAY_OPTIONS = ([1, 2, 3, 4, 5, 6, 7] as Weekday[]).map((value) => ({
  value: String(value),
  label: WEEKDAY_LABELS[value],
}))

/** Giorno e ora ricorrenti in cui il paziente viene abitualmente */
export interface FixedSlot {
  weekday: Weekday
  time: string         // HH:MM
}

// ─── Paziente ────────────────────────────────────────────────────────────────

export interface Patient {
  id: string
  firstName: string
  lastName: string
  fiscalCode?: string
  phoneNumber?: string
  gender?: Gender
  birthDate?: string   // ISO date YYYY-MM-DD
  developmentalAge: boolean
  guardian?: Guardian  // presente solo se developmentalAge === true
  // Residenza
  address?: string
  postalCode?: string
  city?: string
  province?: string    // 2 lettere maiuscole
  notes?: string
  fixedSlot?: FixedSlot
  createdAt: string    // ISO datetime
  updatedAt: string    // ISO datetime
}

// ─── Input creazione/modifica ────────────────────────────────────────────────

export type PatientInput = Omit<Patient, 'id' | 'createdAt' | 'updatedAt'>

// ─── Filtri ──────────────────────────────────────────────────────────────────

export interface PatientFilters {
  firstName?: string
  lastName?: string
  fiscalCode?: string
  gender?: Gender | ''
  developmentalAge?: boolean | null
}

// ─── Paginazione ─────────────────────────────────────────────────────────────

export interface PaginatedResult<T> {
  data: T[]
  totalItems: number
  totalPages: number
  page: number
  pageSize: number
}

export interface PatientsQuery {
  page: number
  pageSize: number
  filters: PatientFilters
}
