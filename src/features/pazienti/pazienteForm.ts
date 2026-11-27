/**
 * Conversione fra paziente e campi del modulo, condivisa da desktop
 * (`PazienteModal`) e app mobile: lo stesso archivio deve ricevere gli stessi
 * dati da entrambi.
 */

import type { Gender, Patient, PatientInput, Weekday } from '../../types/paziente'

export type FormState = Omit<PatientInput, 'developmentalAge' | 'guardian' | 'fixedSlot'> & {
  developmentalAge: boolean
  guardianFirstName: string
  guardianLastName: string
  guardianFiscalCode: string
  guardianPhone: string
  guardianGender: string
  guardianBirthDate: string
  guardianAddress: string
  guardianPostalCode: string
  guardianCity: string
  guardianProvince: string
  address: string
  postalCode: string
  city: string
  province: string
  notes: string
  fixedSlotWeekday: string
  fixedSlotTime: string
}

export const EMPTY_FORM: FormState = {
  firstName: '',
  lastName: '',
  fiscalCode: '',
  phoneNumber: '',
  gender: '' as Gender,
  birthDate: '',
  developmentalAge: false,
  guardianFirstName: '',
  guardianLastName: '',
  guardianFiscalCode: '',
  guardianPhone: '',
  guardianGender: '',
  guardianBirthDate: '',
  guardianAddress: '',
  guardianPostalCode: '',
  guardianCity: '',
  guardianProvince: '',
  address: '',
  postalCode: '',
  city: '',
  province: '',
  notes: '',
  fixedSlotWeekday: '',
  fixedSlotTime: '',
}

export function patientToForm(p: Patient): FormState {
  return {
    firstName: p.firstName,
    lastName: p.lastName,
    fiscalCode: p.fiscalCode ?? '',
    phoneNumber: p.phoneNumber ?? '',
    gender: p.gender ?? ('' as Gender),
    birthDate: p.birthDate ?? '',
    developmentalAge: p.developmentalAge,
    guardianFirstName: p.guardian?.firstName ?? '',
    guardianLastName: p.guardian?.lastName ?? '',
    guardianFiscalCode: p.guardian?.fiscalCode ?? '',
    guardianPhone: p.guardian?.phoneNumber ?? '',
    guardianGender: p.guardian?.gender ?? '',
    guardianBirthDate: p.guardian?.birthDate ?? '',
    guardianAddress: p.guardian?.address ?? '',
    guardianPostalCode: p.guardian?.postalCode ?? '',
    guardianCity: p.guardian?.city ?? '',
    guardianProvince: p.guardian?.province ?? '',
    address: p.address ?? '',
    postalCode: p.postalCode ?? '',
    city: p.city ?? '',
    province: p.province ?? '',
    notes: p.notes ?? '',
    fixedSlotWeekday: p.fixedSlot ? String(p.fixedSlot.weekday) : '',
    fixedSlotTime: p.fixedSlot?.time ?? '',
  }
}

export function formToInput(form: FormState): PatientInput {
  return {
    firstName: form.firstName.trim(),
    lastName: form.lastName.trim(),
    fiscalCode: form.fiscalCode?.trim().toUpperCase() || undefined,
    phoneNumber: form.phoneNumber?.trim() || undefined,
    gender: (form.gender as Gender) || undefined,
    birthDate: form.birthDate || undefined,
    developmentalAge: form.developmentalAge,
    address: form.address.trim() || undefined,
    postalCode: form.postalCode.trim() || undefined,
    city: form.city.trim() || undefined,
    province: form.province.trim().toUpperCase() || undefined,
    notes: form.notes.trim() || undefined,
    fixedSlot:
      form.fixedSlotWeekday && form.fixedSlotTime
        ? { weekday: Number(form.fixedSlotWeekday) as Weekday, time: form.fixedSlotTime }
        : undefined,
    guardian: form.developmentalAge
      ? {
          firstName: form.guardianFirstName.trim(),
          lastName: form.guardianLastName.trim(),
          fiscalCode: form.guardianFiscalCode.trim().toUpperCase() || undefined,
          phoneNumber: form.guardianPhone.trim() || undefined,
          gender: (form.guardianGender as Gender) || undefined,
          birthDate: form.guardianBirthDate || undefined,
          address: form.guardianAddress.trim() || undefined,
          postalCode: form.guardianPostalCode.trim() || undefined,
          city: form.guardianCity.trim() || undefined,
          province: form.guardianProvince.trim().toUpperCase() || undefined,
        }
      : undefined,
  }
}
