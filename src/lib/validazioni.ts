// Validazioni frontend per campi comuni italiani

// ─── Tipi ─────────────────────────────────────────────────────────────────────

export interface RisultatoValidazione {
  valido: boolean
  errore?: string
}

// ─── Email ────────────────────────────────────────────────────────────────────

export function validaEmail(email: string): RisultatoValidazione {
  if (!email.trim()) return { valido: false, errore: "L'email è obbligatoria." }
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
  if (!re.test(email.trim()))
    return { valido: false, errore: 'Inserisci un indirizzo email valido.' }
  return { valido: true }
}

// ─── Partita IVA italiana ─────────────────────────────────────────────────────
// 11 cifre + algoritmo di Luhn adattato

export function validaPIva(piva: string): RisultatoValidazione {
  const v = piva.replace(/\s/g, '')
  if (!v) return { valido: false, errore: 'La Partita IVA è obbligatoria.' }
  if (!/^\d{11}$/.test(v))
    return { valido: false, errore: 'La Partita IVA deve contenere esattamente 11 cifre.' }

  let somma = 0
  for (let i = 0; i < 10; i++) {
    const cifra = parseInt(v[i], 10)
    if (i % 2 === 0) {
      somma += cifra
    } else {
      const doppio = cifra * 2
      somma += doppio > 9 ? doppio - 9 : doppio
    }
  }
  const checkDigit = (10 - (somma % 10)) % 10
  if (checkDigit !== parseInt(v[10], 10))
    return { valido: false, errore: 'Partita IVA non valida (cifra di controllo errata).' }

  return { valido: true }
}

// ─── Codice Fiscale italiano (persone fisiche) ────────────────────────────────

// Tabella valori per posizioni dispari (1-based: 1,3,5,...,15)
const CF_DISPARI: Record<string, number> = {
  '0': 1,  '1': 0,  '2': 5,  '3': 7,  '4': 9,
  '5': 13, '6': 15, '7': 17, '8': 19, '9': 21,
  A: 1,  B: 0,  C: 5,  D: 7,  E: 9,  F: 13, G: 15, H: 17,
  I: 19, J: 21, K: 2,  L: 4,  M: 18, N: 20, O: 11, P: 3,
  Q: 6,  R: 8,  S: 12, T: 14, U: 16, V: 10, W: 22, X: 25,
  Y: 24, Z: 23,
}

export function validaCodiceFiscale(cf: string): RisultatoValidazione {
  const v = cf.replace(/\s/g, '').toUpperCase()
  if (!v) return { valido: false, errore: 'Il codice fiscale è obbligatorio.' }

  // Accetta codice fiscale numerico (11 cifre = P.IVA per soggetti giuridici)
  if (/^\d{11}$/.test(v)) return { valido: true }

  // Formato persona fisica: 16 caratteri alfanumerici
  if (!/^[A-Z]{6}[0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{3}[A-Z]$/.test(v))
    return { valido: false, errore: 'Codice fiscale non valido (formato errato).' }

  // Verifica carattere di controllo
  let somma = 0
  for (let i = 0; i < 15; i++) {
    const c = v[i]
    if (i % 2 === 0) {
      // posizione dispari (1-based)
      somma += CF_DISPARI[c] ?? 0
    } else {
      // posizione pari (1-based): cifra = valore numerico, lettera = A=0...Z=25
      somma += /\d/.test(c) ? parseInt(c, 10) : c.charCodeAt(0) - 65
    }
  }
  const atteso = String.fromCharCode(65 + (somma % 26))
  if (v[15] !== atteso)
    return { valido: false, errore: 'Codice fiscale non valido (carattere di controllo errato).' }

  return { valido: true }
}

// ─── Cellulare italiano ───────────────────────────────────────────────────────
// Formato: inizia con 3, 10 cifre totali. Accetta +39/0039 come prefisso.

export function validaCellulare(tel: string): RisultatoValidazione {
  const v = tel.replace(/[\s\-.()/]/g, '')
  if (!v) return { valido: false, errore: 'Il numero di cellulare è obbligatorio.' }
  const norm = v.startsWith('+39') ? v.slice(3) : v.startsWith('0039') ? v.slice(4) : v
  if (!/^3\d{9}$/.test(norm))
    return {
      valido: false,
      errore: 'Numero di cellulare non valido (deve iniziare con 3 e avere 10 cifre).',
    }
  return { valido: true }
}

// ─── Telefono italiano (fisso o mobile) ───────────────────────────────────────

export function validaTelefono(tel: string): RisultatoValidazione {
  const v = tel.replace(/[\s\-.()/]/g, '')
  if (!v) return { valido: false, errore: 'Il numero di telefono è obbligatorio.' }
  const norm = v.startsWith('+39') ? v.slice(3) : v.startsWith('0039') ? v.slice(4) : v
  if (!/^[03]\d{8,10}$/.test(norm))
    return {
      valido: false,
      errore: 'Numero di telefono non valido (es. 0234567890 o 3XXXXXXXXX).',
    }
  return { valido: true }
}

// ─── Data di nascita ──────────────────────────────────────────────────────────

export function validaDataNascita(data: string): RisultatoValidazione {
  if (!data) return { valido: false, errore: 'La data di nascita è obbligatoria.' }
  const d = new Date(data)
  if (isNaN(d.getTime())) return { valido: false, errore: 'Data di nascita non valida.' }

  const oggi = new Date()
  oggi.setHours(0, 0, 0, 0)
  if (d >= oggi)
    return { valido: false, errore: 'La data di nascita non può essere nel futuro.' }

  const maxAnni = new Date(oggi)
  maxAnni.setFullYear(maxAnni.getFullYear() - 130)
  if (d < maxAnni)
    return { valido: false, errore: 'La data di nascita non sembra corretta.' }

  return { valido: true }
}

// ─── Helper: validazione opzionale ───────────────────────────────────────────
// Esegue il validatore solo se il campo non è vuoto

export function validaSePresente(
  valore: string | undefined,
  validatore: (v: string) => RisultatoValidazione,
): RisultatoValidazione {
  if (!valore?.trim()) return { valido: true }
  return validatore(valore)
}
