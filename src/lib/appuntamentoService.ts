import { storageService } from './storageService'
import { servizioService } from './servizioService'
import { inMinuti, spostaGiorni } from './agendaService'
import { STATO_PRESENZA_DEFAULT } from '../types/appuntamento'
import type { StatoPresenza } from '../types/appuntamento'
import type {
  Appointment,
  AppointmentInput,
  AppointmentFilters,
  AppointmentQuery,
  PaginatedAppointments,
} from '../types/appuntamento'

/** Le date settimanali di una serie, divise fra libere e già occupate. */
export interface PianoRicorrenza {
  /** Date in cui si creeranno gli appuntamenti, dopo il primo. */
  date: string[]
  /** Date saltate perché a quell'ora c'è già un altro appuntamento. */
  occupate: string[]
}

/** Tetto di sicurezza: un anno di sedute settimanali. */
export const MAX_RIPETIZIONI = 52

export const STORAGE_KEY = 'appuntamenti'

const KEY = STORAGE_KEY

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
  if (filters.serviceId && servizioService.idServizioDi(a) !== filters.serviceId) return false
  if (filters.presenza && (a.presenza ?? STATO_PRESENZA_DEFAULT) !== filters.presenza) return false
  if (
    filters.patientLastName &&
    !a.patientLastName?.toLowerCase().includes(filters.patientLastName.toLowerCase())
  )
    return false
  return true
}

/** Stessa chiave per "09:00" e "9:00": il confronto è sui minuti, come in agenda. */
function chiaveSlot(data: string, ora: string): string {
  return `${data}|${inMinuti(ora) ?? ora}`
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

  /**
   * Tutti gli appuntamenti, senza paginazione.
   * Il calendario mostra un mese intero e non può lavorare a pagine.
   */
  getAllAppointments(): Appointment[] {
    return getAll().filter(Boolean)
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

  /**
   * Sposta un appuntamento nel tempo, lasciando intatto tutto il resto.
   *
   * Il trascinamento cambia solo quando: ricostruire l'intero appuntamento
   * per muoverlo di mezz'ora rischierebbe di perdere per strada campi che
   * l'interfaccia non conosce.
   */
  sposta(id: string, appointmentDate: string, appointmentTime: string): Appointment | null {
    const all = getAll()
    const index = all.findIndex((a) => a.id === id)
    if (index === -1) return null
    const spostato: Appointment = {
      ...all[index],
      appointmentDate,
      appointmentTime,
      updatedAt: new Date().toISOString(),
    }
    all[index] = spostato
    saveAll(all)
    return spostato
  },

  /** Aggiorna la sola presenza, senza rimaneggiare il resto. */
  segnaPresenza(id: string, presenza: StatoPresenza): Appointment | null {
    const all = getAll()
    const index = all.findIndex((a) => a.id === id)
    if (index === -1) return null
    const aggiornato: Appointment = {
      ...all[index],
      presenza,
      updatedAt: new Date().toISOString(),
    }
    all[index] = aggiornato
    saveAll(all)
    return aggiornato
  },

  delete(id: string): void {
    const all = getAll().filter((a) => a.id !== id)
    saveAll(all)
  },

  /** Elimina più appuntamenti con una sola scrittura. */
  deleteMany(ids: string[]): void {
    if (ids.length === 0) return
    const daTogliere = new Set(ids)
    saveAll(getAll().filter((a) => !daTogliere.has(a.id)))
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


  /**
   * Le settimane successive al primo appuntamento, fino a `fino` compreso,
   * stesso giorno della settimana e stessa ora. Il primo appuntamento non
   * rientra: lo crea il form.
   *
   * Un orario già preso è occupato chiunque sia il
   * paziente, e quella settimana si salta invece di sovrapporla.
   */
  pianoRicorrenza(primaData: string, ora: string, fino: string): PianoRicorrenza {
    const presi = new Set(
      getAll()
        .filter(Boolean)
        .map((a) => chiaveSlot(a.appointmentDate, a.appointmentTime)),
    )
    const date: string[] = []
    const occupate: string[] = []
    let data = spostaGiorni(primaData, 7)
    while (fino && data <= fino && date.length + occupate.length < MAX_RIPETIZIONI) {
      if (presi.has(chiaveSlot(data, ora))) occupate.push(data)
      else date.push(data)
      data = spostaGiorni(data, 7)
    }
    return { date, occupate }
  },

  /** Crea le ripetizioni settimanali di un appuntamento. Restituisce quante. */
  creaRicorrenza(input: AppointmentInput, fino: string): number {
    const { date } = appuntamentoService.pianoRicorrenza(
      input.appointmentDate,
      input.appointmentTime,
      fino,
    )
    const now = new Date().toISOString()
    const serie: Appointment[] = date.map((appointmentDate) => ({
      ...input,
      appointmentDate,
      // Le sedute future non sono ancora svolte, qualunque cosa si sia
      // segnato sulla prima
      presenza: STATO_PRESENZA_DEFAULT,
      id: generateId(),
      createdAt: now,
      updatedAt: now,
    }))
    if (serie.length > 0) saveAll([...getAll(), ...serie])
    return serie.length
  },
}
