import type { PatientInput, PatientFilters } from '../../types/paziente'

export interface PatientFormErrors {
  firstName?: string
  lastName?: string
  fiscalCode?: string
  phoneNumber?: string
  gender?: string
  birthDate?: string
  address?: string
  postalCode?: string
  city?: string
  province?: string
  guardianFirstName?: string
  guardianLastName?: string
  guardianPhone?: string
}

export function validatePatient(
  input: Partial<PatientInput>,
): PatientFormErrors {
  const errors: PatientFormErrors = {}
  const isEvo = !!input.developmentalAge

  // Sempre obbligatori
  if (!input.firstName?.trim()) errors.firstName = 'Il nome è obbligatorio.'
  if (!input.lastName?.trim()) errors.lastName = 'Il cognome è obbligatorio.'
  if (!input.fiscalCode?.trim()) errors.fiscalCode = 'Il codice fiscale è obbligatorio.'
  if (!input.gender) errors.gender = 'Il sesso è obbligatorio.'
  if (!input.birthDate) errors.birthDate = 'La data di nascita è obbligatoria.'

  if (!isEvo) {
    // Paziente standard: cellulare e intera residenza obbligatori
    if (!input.phoneNumber?.trim()) errors.phoneNumber = 'Il cellulare è obbligatorio.'
    if (!input.address?.trim()) errors.address = "L'indirizzo è obbligatorio."
    if (!input.postalCode?.trim()) errors.postalCode = 'Il CAP è obbligatorio.'
    if (!input.city?.trim()) errors.city = 'La città è obbligatoria.'
    if (!input.province?.trim()) {
      errors.province = 'La provincia è obbligatoria.'
    } else if (!/^[A-Z]{2}$/.test(input.province.toUpperCase())) {
      errors.province = 'La provincia deve essere di 2 lettere.'
    }
  } else {
    // Età evolutiva
    if (!input.guardian?.firstName?.trim()) errors.guardianFirstName = 'Il nome del tutore è obbligatorio.'
    if (!input.guardian?.lastName?.trim()) errors.guardianLastName = 'Il cognome del tutore è obbligatorio.'
    if (!input.guardian?.phoneNumber?.trim()) errors.guardianPhone = 'Il cellulare del tutore è obbligatorio.'

    // Residenza: almeno un set completo (paziente oppure tutore)
    const patHasRes = !!(input.address?.trim() && input.postalCode?.trim() && input.city?.trim() && input.province?.trim())
    const guaHasRes = !!(input.guardian?.address?.trim() && input.guardian?.postalCode?.trim() && input.guardian?.city?.trim() && input.guardian?.province?.trim())
    if (!patHasRes && !guaHasRes) {
      errors.address = 'Compila la residenza completa del paziente o del tutore.'
    }

    // Formato provincia se compilata
    if (input.province?.trim() && !/^[A-Z]{2}$/.test(input.province.toUpperCase()))
      errors.province = 'La provincia deve essere di 2 lettere.'
  }

  return errors
}

export function hasErrors(errors: PatientFormErrors): boolean {
  return Object.keys(errors).length > 0
}

export const EMPTY_FILTERS: PatientFilters = {
  firstName: '',
  lastName: '',
  fiscalCode: '',
  gender: '',
  developmentalAge: null,
}
