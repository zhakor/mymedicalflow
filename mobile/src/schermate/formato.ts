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

/**
 * Collegamento alla chat WhatsApp del numero (`https://wa.me/39333…`).
 * WhatsApp vuole il prefisso internazionale e solo cifre: un cellulare
 * italiano scritto senza prefisso ("333 123 4567") riceve il 39; "+39" e
 * "0039" vengono ripuliti. Null se il numero non è utilizzabile.
 */
export function collegamentoWhatsApp(numero: string): string | null {
  let cifre = numero.replace(/\D/g, '')
  if (numero.trim().startsWith('00')) cifre = cifre.slice(2)
  if (/^3\d{8,9}$/.test(cifre)) cifre = `39${cifre}`
  return cifre.length >= 10 ? `https://wa.me/${cifre}` : null
}
