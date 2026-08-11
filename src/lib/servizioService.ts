/**
 * Servizi del professionista — persistenza e lettura.
 *
 * Alla prima apertura la raccolta viene seminata con i due tipi storici, così
 * chi aggiorna l'app ritrova l'agenda esattamente com'era. Gli appuntamenti
 * salvati non vengono riscritti: `servizioDi` risale al servizio dal campo
 * `appointmentType` quando `serviceId` manca.
 */

import { storageService } from './storageService'
import type { Appointment } from '../types/appuntamento'
import { APPOINTMENT_TYPE_LABELS } from '../types/appuntamento'
import type { ClassiColore, Servizio, ServizioInput } from '../types/servizio'
import {
  COLORI_SERVIZIO,
  DURATA_DI_RIPIEGO,
  SERVIZIO_DA_TIPO,
  SERVIZI_INIZIALI,
} from '../types/servizio'

export const STORAGE_KEY = 'servizi'

const KEY = STORAGE_KEY

function generateId(): string {
  return `srv_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

function leggi(): Servizio[] | null {
  const salvati = storageService.get<Servizio[]>(KEY)
  return Array.isArray(salvati) ? salvati.filter(Boolean) : null
}

function saveAll(servizi: Servizio[]): void {
  storageService.set(KEY, servizi)
}

/** I due servizi di partenza, con gli identificativi attesi dallo storico. */
function seminaIniziali(): Servizio[] {
  const ora = new Date().toISOString()
  const iniziali: Servizio[] = SERVIZI_INIZIALI.map((s) => ({
    ...s,
    // Nessuna tariffa inventata: la imposta chi usa l'app.
    prezzo: 0,
    attivo: true,
    createdAt: ora,
    updatedAt: ora,
  }))
  saveAll(iniziali)
  return iniziali
}

export const servizioService = {
  /** Tutti i servizi, seminando quelli iniziali alla prima apertura. */
  getAll(): Servizio[] {
    return leggi() ?? seminaIniziali()
  },

  /** Solo quelli proponibili in un nuovo appuntamento. */
  getAttivi(): Servizio[] {
    return servizioService.getAll().filter((s) => s.attivo)
  },

  getById(id: string): Servizio | null {
    return servizioService.getAll().find((s) => s.id === id) ?? null
  },

  create(input: ServizioInput): Servizio {
    const ora = new Date().toISOString()
    const servizio: Servizio = { ...input, id: generateId(), createdAt: ora, updatedAt: ora }
    saveAll([...servizioService.getAll(), servizio])
    return servizio
  },

  update(id: string, input: Partial<ServizioInput>): Servizio | null {
    const tutti = servizioService.getAll()
    const i = tutti.findIndex((s) => s.id === id)
    if (i === -1) return null
    const aggiornato: Servizio = { ...tutti[i], ...input, id, updatedAt: new Date().toISOString() }
    tutti[i] = aggiornato
    saveAll(tutti)
    return aggiornato
  },

  /**
   * Elimina un servizio solo se nessun appuntamento lo usa; altrimenti lo
   * disattiva. Lo storico deve restare leggibile: un appuntamento che punta
   * a un servizio scomparso non saprebbe più dire cosa è stato erogato.
   */
  rimuovi(id: string, appuntamenti: Appointment[]): { eliminato: boolean } {
    const inUso = appuntamenti.some((a) => servizioService.idServizioDi(a) === id)
    if (inUso) {
      servizioService.update(id, { attivo: false })
      return { eliminato: false }
    }
    saveAll(servizioService.getAll().filter((s) => s.id !== id))
    return { eliminato: true }
  },

  /** Identificativo del servizio di un appuntamento, anche se salvato prima. */
  idServizioDi(a: Appointment): string | undefined {
    return a.serviceId ?? (a.appointmentType ? SERVIZIO_DA_TIPO[a.appointmentType] : undefined)
  },

  /** Il servizio di un appuntamento, `null` se non più esistente. */
  servizioDi(a: Appointment, servizi: Servizio[] = servizioService.getAll()): Servizio | null {
    const id = servizioService.idServizioDi(a)
    return servizi.find((s) => s.id === id) ?? null
  },

  /** Quanto occupa in agenda: dal servizio, o dal ripiego se non risolvibile. */
  durataDi(a: Appointment, servizi: Servizio[] = servizioService.getAll()): number {
    return servizioService.servizioDi(a, servizi)?.durataMinuti ?? DURATA_DI_RIPIEGO
  },

  /**
   * Nome da mostrare. Un servizio eliminato non deve lasciare una riga muta:
   * si ripiega sul tipo storico e, in ultima istanza, lo si dichiara rimosso.
   */
  nomeDi(a: Appointment, servizi: Servizio[] = servizioService.getAll()): string {
    const servizio = servizioService.servizioDi(a, servizi)
    if (servizio) return servizio.nome
    if (a.appointmentType) return APPOINTMENT_TYPE_LABELS[a.appointmentType]
    return 'Servizio rimosso'
  },

  /** Classi del colore assegnato al servizio, con ripiego neutro. */
  classiDi(a: Appointment, servizi: Servizio[] = servizioService.getAll()): ClassiColore {
    const servizio = servizioService.servizioDi(a, servizi)
    return servizio ? COLORI_SERVIZIO[servizio.colore] : CLASSI_NEUTRE
  },
}

/** Usato quando il servizio non esiste più: visibile, senza fingere un colore. */
const CLASSI_NEUTRE: ClassiColore = {
  blocco: 'border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800/50',
  anteprima: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  punto: 'bg-gray-400',
}
