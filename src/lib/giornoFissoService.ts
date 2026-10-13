/**
 * Giorno fisso del paziente: le operazioni che toccano insieme la scheda del
 * paziente e i suoi appuntamenti.
 */

import { appuntamentoService } from './appuntamentoService'
import { pazienteService } from './pazienteService'
import type { PianoRicorrenza } from './appuntamentoService'
import { giornoSettimana, inMinuti, oggi, prossimaData, spostaGiorni } from './agendaService'
import { STATO_PRESENZA_DEFAULT } from '../types/appuntamento'
import type { Appointment } from '../types/appuntamento'
import type { FixedSlot, Patient } from '../types/paziente'

export const giornoFissoService = {
  /** Il primo giorno utile della serie: oggi stesso, se è il giorno giusto. */
  primaData(slot: FixedSlot): string {
    return prossimaData(slot.weekday, oggi())
  },

  /**
   * Le date della serie dal primo giorno utile fino a `fino` compreso,
   * divise fra libere e già occupate da altri appuntamenti.
   */
  pianoSerie(slot: FixedSlot, fino: string): PianoRicorrenza {
    // La ricorrenza parte dalla settimana dopo la data che riceve: partendo da
    // una settimana prima, il primo giorno utile rientra nella serie.
    const vigilia = spostaGiorni(giornoFissoService.primaData(slot), -7)
    return appuntamentoService.pianoRicorrenza(vigilia, slot.time, fino)
  },

  /** Crea in calendario la serie settimanale del paziente. Restituisce quanti. */
  creaSerie(paziente: Patient, slot: FixedSlot, serviceId: string, fino: string): number {
    return appuntamentoService.creaRicorrenza(
      {
        patientId: paziente.id,
        patientFirstName: paziente.firstName,
        patientLastName: paziente.lastName,
        serviceId,
        presenza: STATO_PRESENZA_DEFAULT,
        appointmentDate: spostaGiorni(giornoFissoService.primaData(slot), -7),
        appointmentTime: slot.time,
      },
      fino,
    )
  },

  /**
   * Gli appuntamenti futuri del paziente che cadono nel suo giorno fisso e
   * non sono ancora stati svolti: di fatto la serie creata da quel giorno.
   *
   * Il passato e le sedute già segnate presente o assente restano fuori: sono
   * storia clinica e base delle fatture, non programmazione.
   */
  appuntamentiFuturi(patientId: string, slot: FixedSlot): Appointment[] {
    const da = oggi()
    const minuti = inMinuti(slot.time)
    return appuntamentoService
      .getByPatientId(patientId)
      .filter(
        (a) =>
          a.appointmentDate >= da &&
          giornoSettimana(a.appointmentDate) === slot.weekday &&
          inMinuti(a.appointmentTime) === minuti &&
          (a.presenza ?? STATO_PRESENZA_DEFAULT) === STATO_PRESENZA_DEFAULT,
      )
      .reverse() // getByPatientId ordina dal più recente
  },

  /**
   * Toglie il giorno fisso dal paziente e, se richiesto, anche i suoi
   * appuntamenti futuri da svolgere. Restituisce quanti ne ha eliminati.
   */
  rimuovi(patientId: string, eliminaFuturi: boolean): number {
    const paziente = pazienteService.getById(patientId)
    if (!paziente?.fixedSlot) return 0
    const futuri = eliminaFuturi
      ? giornoFissoService.appuntamentiFuturi(patientId, paziente.fixedSlot)
      : []
    appuntamentoService.deleteMany(futuri.map((a) => a.id))
    pazienteService.setFixedSlot(patientId, undefined)
    return futuri.length
  },
}
