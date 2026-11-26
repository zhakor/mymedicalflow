/**
 * Conversione fra appuntamento e campi del modulo, condivisa da desktop
 * (`AppuntamentoModal`) e app mobile.
 */

import { servizioService } from '../../lib/servizioService'
import type { Appointment, AppointmentInput, StatoPresenza } from '../../types/appuntamento'
import { STATO_PRESENZA_DEFAULT } from '../../types/appuntamento'

export interface FormState {
  patientFirstName: string
  patientLastName: string
  patientId: string
  serviceId: string
  presenza: StatoPresenza
  appointmentDate: string
  appointmentTime: string
  description: string
}

export const EMPTY_FORM: FormState = {
  patientFirstName: '',
  patientLastName: '',
  patientId: '',
  serviceId: '',
  presenza: STATO_PRESENZA_DEFAULT,
  appointmentDate: '',
  appointmentTime: '',
  description: '',
}

export function appointmentToForm(a: Appointment): FormState {
  return {
    patientFirstName: a.patientFirstName,
    patientLastName: a.patientLastName,
    patientId: a.patientId,
    // Gli appuntamenti salvati prima portano il tipo storico, non il servizio
    serviceId: servizioService.idServizioDi(a) ?? '',
    presenza: a.presenza ?? STATO_PRESENZA_DEFAULT,
    appointmentDate: a.appointmentDate,
    appointmentTime: a.appointmentTime,
    description: a.description ?? '',
  }
}

export function formToInput(form: FormState): AppointmentInput {
  return {
    patientId: form.patientId,
    patientFirstName: form.patientFirstName.trim(),
    patientLastName: form.patientLastName.trim(),
    serviceId: form.serviceId,
    presenza: form.presenza,
    appointmentDate: form.appointmentDate,
    appointmentTime: form.appointmentTime,
    description: form.description.trim() || undefined,
  }
}
