/**
 * Agenda — calcoli di calendario e occupazione degli slot.
 *
 * Solo lettura: gli appuntamenti restano quelli salvati da `appuntamentoService`,
 * qui non si scrive nulla e il formato memorizzato non cambia.
 *
 * Nota sulla durata: un appuntamento salvato ha data e orario di inizio, non
 * una durata. La griglia oraria è quindi una convenzione dell'interfaccia, non
 * un dato: serve a mostrare la giornata e a segnalare le sovrapposizioni
 * probabili, non a decidere al posto di chi la usa.
 */

import { servizioService } from './servizioService'
import type { Appointment } from '../types/appuntamento'
import type { Weekday } from '../types/paziente'
import { DURATA_DI_RIPIEGO } from '../types/servizio'

// ─── Convenzioni della giornata lavorativa ────────────────────────────────────

/** Durata usata quando il servizio non è noto. Vedi `types/servizio`. */
export const DURATA_PRESUNTA_MINUTI = DURATA_DI_RIPIEGO

export const ORA_APERTURA = 8
export const ORA_CHIUSURA = 20
/** Distanza fra due slot mostrati nella giornata. */
export const PASSO_SLOT_MINUTI = 30

// ─── Date ─────────────────────────────────────────────────────────────────────

/**
 * Data in formato `AAAA-MM-GG` secondo il fuso locale.
 *
 * `toISOString()` lavora in UTC: in Italia, dopo la mezzanotte, restituirebbe
 * ancora il giorno precedente e l'agenda si aprirebbe sul giorno sbagliato.
 */
export function chiaveData(d: Date): string {
  const mese = String(d.getMonth() + 1).padStart(2, '0')
  const giorno = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mese}-${giorno}`
}

export function oggi(): string {
  return chiaveData(new Date())
}

/** Da `AAAA-MM-GG` a `Date` locale, evitando il parsing UTC di `new Date(str)`. */
export function dataDaChiave(chiave: string): Date {
  const [anno, mese, giorno] = chiave.split('-').map(Number)
  return new Date(anno, (mese ?? 1) - 1, giorno ?? 1)
}

/** La stessa data spostata di `giorni` giorni, avanti o indietro. */
export function spostaGiorni(chiave: string, giorni: number): string {
  const d = dataDaChiave(chiave)
  return chiaveData(new Date(d.getFullYear(), d.getMonth(), d.getDate() + giorni))
}

/** Giorno della settimana con il lunedì a 1 e la domenica a 7. */
export function giornoSettimana(chiave: string): Weekday {
  // getDay() mette la domenica a 0
  return (((dataDaChiave(chiave).getDay() + 6) % 7) + 1) as Weekday
}

/** La prima data, a partire da `da` compreso, che cade nel giorno indicato. */
export function prossimaData(giorno: Weekday, da: string = oggi()): string {
  return spostaGiorni(da, (giorno - giornoSettimana(da) + 7) % 7)
}

const GIORNI_SETTIMANA = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom']
const MESI = [
  'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
  'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre',
]

export const INTESTAZIONI_SETTIMANA = GIORNI_SETTIMANA

export function nomeMese(anno: number, mese: number): string {
  return `${MESI[mese]} ${anno}`
}

/** Etichetta estesa: "Lunedì 11 agosto 2026". */
export function etichettaGiorno(chiave: string): string {
  const d = dataDaChiave(chiave)
  return d.toLocaleDateString('it-IT', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

/**
 * Le 42 caselle del mese, dal lunedì della prima settimana alla domenica
 * dell'ultima. Sei righe fisse: così la griglia non cambia altezza passando
 * da un mese all'altro.
 */
export function grigliaMese(anno: number, mese: number): string[] {
  const primo = new Date(anno, mese, 1)
  // getDay() mette la domenica a 0; qui la settimana comincia di lunedì.
  const scarto = (primo.getDay() + 6) % 7
  const inizio = new Date(anno, mese, 1 - scarto)

  return Array.from({ length: 42 }, (_, i) =>
    chiaveData(new Date(inizio.getFullYear(), inizio.getMonth(), inizio.getDate() + i)),
  )
}

export function stessoMese(chiave: string, anno: number, mese: number): boolean {
  const d = dataDaChiave(chiave)
  return d.getFullYear() === anno && d.getMonth() === mese
}

export function eWeekend(chiave: string): boolean {
  const giorno = dataDaChiave(chiave).getDay()
  return giorno === 0 || giorno === 6
}

// ─── Orari ────────────────────────────────────────────────────────────────────

/** `"09:30"` → `570`. Restituisce `null` se l'orario non è leggibile. */
export function inMinuti(ora: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(ora?.trim() ?? '')
  if (!m) return null
  const ore = Number(m[1])
  const minuti = Number(m[2])
  if (ore > 23 || minuti > 59) return null
  return ore * 60 + minuti
}

/** `570` → `"09:30"`. */
export function inOrario(minuti: number): string {
  const ore = Math.floor(minuti / 60)
  return `${String(ore).padStart(2, '0')}:${String(minuti % 60).padStart(2, '0')}`
}

/** Gli orari della giornata lavorativa, a passo costante. */
export function orariDelGiorno(): string[] {
  const orari: string[] = []
  for (let m = ORA_APERTURA * 60; m < ORA_CHIUSURA * 60; m += PASSO_SLOT_MINUTI) {
    orari.push(inOrario(m))
  }
  return orari
}

// ─── Occupazione ──────────────────────────────────────────────────────────────

export interface SlotGiornata {
  ora: string
  /** Appuntamenti che iniziano dentro questo slot. Più di uno = sovrapposti. */
  appuntamenti: Appointment[]
  libero: boolean
}

function ordinaPerOrario(a: Appointment, b: Appointment): number {
  return (inMinuti(a.appointmentTime) ?? 0) - (inMinuti(b.appointmentTime) ?? 0)
}

/** Appuntamenti di un giorno, in ordine di orario. */
export function appuntamentiDelGiorno(
  tutti: Appointment[],
  chiave: string,
): Appointment[] {
  return tutti.filter((a) => a?.appointmentDate === chiave).sort(ordinaPerOrario)
}

/** Quanti appuntamenti per ciascun giorno: alimenta i contatori del mese. */
export function conteggioPerGiorno(tutti: Appointment[]): Map<string, number> {
  const mappa = new Map<string, number>()
  for (const a of tutti) {
    if (!a?.appointmentDate) continue
    mappa.set(a.appointmentDate, (mappa.get(a.appointmentDate) ?? 0) + 1)
  }
  return mappa
}

/**
 * La giornata divisa in slot, con dentro gli appuntamenti che vi ricadono.
 *
 * Un appuntamento non deve allinearsi alla griglia: le 9:15 finiscono nello
 * slot delle 9:00. Chi resta fuori dall'orario di lavoro non viene perso, ma
 * raccolto a parte da `fuoriOrario`.
 */
export function slotDelGiorno(
  tutti: Appointment[],
  chiave: string,
): SlotGiornata[] {
  const delGiorno = appuntamentiDelGiorno(tutti, chiave)

  return orariDelGiorno().map((ora) => {
    const inizio = inMinuti(ora)!
    const fine = inizio + PASSO_SLOT_MINUTI
    const dentro = delGiorno.filter((a) => {
      const m = inMinuti(a.appointmentTime)
      return m !== null && m >= inizio && m < fine
    })
    return { ora, appuntamenti: dentro, libero: dentro.length === 0 }
  })
}

/** Appuntamenti del giorno che cadono fuori dall'orario di lavoro. */
export function fuoriOrario(tutti: Appointment[], chiave: string): Appointment[] {
  return appuntamentiDelGiorno(tutti, chiave).filter((a) => {
    const m = inMinuti(a.appointmentTime)
    return m === null || m < ORA_APERTURA * 60 || m >= ORA_CHIUSURA * 60
  })
}

// ─── Controllo delle sovrapposizioni ──────────────────────────────────────────

export interface EsitoSlot {
  /** Un altro appuntamento alla stessa ora esatta: quasi certamente un doppione. */
  identico: Appointment | null
  /**
   * Appuntamenti che si accavallano davvero, secondo la durata del rispettivo
   * servizio. Non si impediscono: la seconda seduta può cominciare in ritardo,
   * o due prestazioni possono convivere. Si dichiarano.
   */
  vicini: Appointment[]
}

export const SLOT_LIBERO: EsitoSlot = { identico: null, vicini: [] }

/**
 * Verifica se data e ora sono già impegnate.
 *
 * `escludiId` serve in modifica: un appuntamento non deve risultare in
 * conflitto con se stesso.
 */
export function verificaSlot(
  tutti: Appointment[],
  data: string,
  ora: string,
  escludiId?: string,
  /** Durata di ciò che si sta collocando; senza, si usa il ripiego. */
  durataMinuti: number = DURATA_PRESUNTA_MINUTI,
): EsitoSlot {
  const minuti = inMinuti(ora)
  if (!data || minuti === null) return SLOT_LIBERO

  const candidati = tutti.filter(
    (a) => a?.appointmentDate === data && a.id !== escludiId,
  )

  const identico =
    candidati.find((a) => inMinuti(a.appointmentTime) === minuti) ?? null

  const fine = minuti + durataMinuti
  const vicini = candidati
    .filter((a) => {
      const altroInizio = inMinuti(a.appointmentTime)
      if (altroInizio === null || altroInizio === minuti) return false
      // Sovrapposizione vera fra i due intervalli, ciascuno con la durata del
      // proprio servizio: [inizio, fine) contro [altroInizio, altroFine)
      const altroFine = altroInizio + servizioService.durataDi(a)
      return altroInizio < fine && minuti < altroFine
    })
    .sort(ordinaPerOrario)

  return { identico, vicini }
}

export function slotOccupato(esito: EsitoSlot): boolean {
  return esito.identico !== null
}
