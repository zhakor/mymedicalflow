import { dataDaChiave } from '@desktop/lib/agendaService'

/** Età in anni compiuti da una data `AAAA-MM-GG`. */
export function eta(nascita: string, oggi = new Date()): number {
  const d = dataDaChiave(nascita)
  let anni = oggi.getFullYear() - d.getFullYear()
  if (oggi.getMonth() < d.getMonth() || (oggi.getMonth() === d.getMonth() && oggi.getDate() < d.getDate())) anni--
  return anni
}

export function iniziali(p: { firstName: string; lastName: string }): string {
  return `${p.lastName.charAt(0)}${p.firstName.charAt(0)}`.toUpperCase()
}

/** `AAAA-MM-GG` → `12/04/2018`. */
export function dataBreve(chiave: string): string {
  return dataDaChiave(chiave).toLocaleDateString('it-IT')
}
