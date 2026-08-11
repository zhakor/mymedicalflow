import type { AppointmentInput, AppointmentFilters } from '../../types/appuntamento'

export interface AppointmentFormErrors {
  patientFirstName?: string
  patientLastName?: string
  patientId?: string
  serviceId?: string
  appointmentDate?: string
  appointmentTime?: string
}

export function validateAppointment(
  input: Partial<AppointmentInput>,
): AppointmentFormErrors {
  const errors: AppointmentFormErrors = {}

  if (!input.patientFirstName?.trim()) errors.patientFirstName = 'Il nome è obbligatorio.'
  if (!input.patientLastName?.trim()) errors.patientLastName = 'Il cognome è obbligatorio.'
  if (!input.patientId) errors.patientId = 'Seleziona un paziente dalla lista pazienti.'
  if (!input.serviceId) errors.serviceId = 'Il servizio è obbligatorio.'
  if (!input.appointmentDate) errors.appointmentDate = 'La data è obbligatoria.'
  if (!input.appointmentTime) errors.appointmentTime = "L'orario è obbligatorio."

  return errors
}

export function hasAppointmentErrors(errors: AppointmentFormErrors): boolean {
  return Object.keys(errors).length > 0
}

export const EMPTY_APPOINTMENT_FILTERS: AppointmentFilters = {
  dateFrom: '',
  dateTo: '',
  serviceId: '',
  presenza: '',
  patientLastName: '',
}
