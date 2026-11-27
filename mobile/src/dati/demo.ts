/**
 * Dati di esempio della modalità simulata. Nomi inventati: nessun dato reale.
 * Rispettano le stesse validazioni del desktop (codice fiscale con carattere di
 * controllo, cellulare, residenza), così si possono modificare dal telefono.
 */

import PizZip from 'pizzip'
import type { Archivio } from '@desktop/sync/cifratura'
import type { Patient } from '@desktop/types/paziente'
import type { Appointment, StatoPresenza } from '@desktop/types/appuntamento'
import type { Invoice } from '@desktop/types/fattura'
import type { Servizio } from '@desktop/types/servizio'
import { SERVIZIO_DA_TIPO } from '@desktop/types/servizio'
import type { ImpostazioniApp, ProfiloProfessionista } from '@desktop/types'
import { oggi, spostaGiorni, giornoSettimana } from '@desktop/lib/agendaService'
import { validaCodiceFiscale } from '@desktop/lib/validazioni'
import { buildTemplateData, generateDocument } from '@desktop/lib/documentService'

const ADESSO = new Date().toISOString()

// ─── Codice fiscale verosimile (comune di Bologna, A944) ──────────────────────

const MESI_CF = 'ABCDEHLMPRST'
const soloLettere = (s: string) => s.toUpperCase().replace(/[^A-Z]/g, '')
const consonanti = (s: string) => soloLettere(s).replace(/[AEIOU]/g, '')
const vocali = (s: string) => soloLettere(s).replace(/[^AEIOU]/g, '')

function codiceFiscale(nome: string, cognome: string, nascita: string, femmina: boolean): string {
  const k = consonanti(nome)
  const parteNome = k.length >= 4 ? k[0] + k[2] + k[3] : (k + vocali(nome) + 'XXX').slice(0, 3)
  const parteCognome = (consonanti(cognome) + vocali(cognome) + 'XXX').slice(0, 3)
  const [a, m, g] = nascita.split('-')
  const giorno = String(Number(g) + (femmina ? 40 : 0)).padStart(2, '0')
  const base = `${parteCognome}${parteNome}${a.slice(2)}${MESI_CF[Number(m) - 1]}${giorno}A944`
  // Il carattere di controllo è quello che la validazione del desktop accetta
  for (const c of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') if (validaCodiceFiscale(base + c).valido) return base + c
  return base + 'X'
}

// ─── Pazienti ─────────────────────────────────────────────────────────────────

type Seme = Pick<Patient, 'firstName' | 'lastName' | 'gender' | 'birthDate' | 'developmentalAge'> & Partial<Patient>

const RESIDENZA = { postalCode: '40121', city: 'Bologna', province: 'BO' }

const PAZIENTI: Seme[] = [
  { firstName: 'Luca', lastName: 'Ferrari', gender: 'male', birthDate: '2018-04-12', developmentalAge: true,
    guardian: { firstName: 'Paola', lastName: 'Ferrari', phoneNumber: '3330000001', gender: 'female', address: 'Via Saragozza 10', ...RESIDENZA },
    address: 'Via Saragozza 10', ...RESIDENZA, notes: 'Disturbo fonologico. Lavorare su /r/ e /s/.' },
  { firstName: 'Sofia', lastName: 'Ricci', gender: 'female', birthDate: '2019-09-03', developmentalAge: true,
    guardian: { firstName: 'Marco', lastName: 'Ricci', phoneNumber: '3330000002', gender: 'male' }, ...RESIDENZA },
  { firstName: 'Giovanni', lastName: 'Esposito', gender: 'male', birthDate: '1956-02-20', developmentalAge: false,
    phoneNumber: '3330000003', address: 'Via Emilia 45', postalCode: '40026', city: 'Imola', province: 'BO',
    notes: 'Afasia post-ictus, sedute in mattinata.' },
  { firstName: 'Emma', lastName: 'Bianchi', gender: 'female', birthDate: '2017-11-28', developmentalAge: true,
    guardian: { firstName: 'Chiara', lastName: 'Bianchi', phoneNumber: '3330000004', gender: 'female' },
    address: 'Via Porrettana 3', postalCode: '40033', city: 'Casalecchio di Reno', province: 'BO' },
  { firstName: 'Marta', lastName: 'Colombo', gender: 'female', birthDate: '1988-06-15', developmentalAge: false,
    phoneNumber: '3330000005', address: 'Via Indipendenza 22', ...RESIDENZA },
  { firstName: 'Tommaso', lastName: 'Romano', gender: 'male', birthDate: '2020-01-30', developmentalAge: true,
    guardian: { firstName: 'Elena', lastName: 'Romano', phoneNumber: '3330000006', gender: 'female' },
    postalCode: '40068', city: 'San Lazzaro di Savena', province: 'BO' },
  { firstName: 'Anna', lastName: 'Greco', gender: 'female', birthDate: '1972-03-08', developmentalAge: false,
    phoneNumber: '3330000007', address: 'Via Castiglione 8', ...RESIDENZA },
  { firstName: 'Matteo', lastName: 'Conti', gender: 'male', birthDate: '2016-07-21', developmentalAge: true,
    guardian: { firstName: 'Luisa', lastName: 'Conti', phoneNumber: '3330000008', gender: 'female' }, ...RESIDENZA },
]

/** Appuntamenti: [giorni da oggi, ora, indice paziente, servizio]. */
const AGENDA: Array<[number, string, number, 'valutazione' | 'sessione']> = [
  [-8, '14:30', 0, 'sessione'], [-6, '09:00', 2, 'sessione'], [-3, '15:00', 3, 'sessione'],
  [-1, '09:00', 2, 'sessione'], [-1, '15:00', 0, 'sessione'], [-1, '16:00', 1, 'valutazione'],
  [0, '09:00', 2, 'sessione'], [0, '10:00', 4, 'valutazione'], [0, '14:30', 0, 'sessione'],
  [0, '15:30', 3, 'sessione'], [0, '17:00', 7, 'sessione'],
  [1, '09:30', 6, 'sessione'], [1, '15:00', 5, 'valutazione'], [1, '16:30', 1, 'sessione'],
  [2, '10:00', 2, 'sessione'], [2, '15:00', 3, 'sessione'],
  [4, '14:30', 0, 'sessione'], [4, '16:00', 7, 'sessione'], [7, '14:30', 0, 'sessione'],
]

// ─── Fattura .docx di esempio ─────────────────────────────────────────────────

/** Modello .docx minimo con i segnaposto del desktop, creato al volo. */
function modelloFattura(): string {
  const righe = [
    'FATTURA n. [numero_fattura]',
    'Data: [data_odierna]',
    'Gentil[genere] [nome_cognome] — C.F. [cod_fiscale]',
    '[indirizzo] [cap] [citta] ([prov])',
    'Prestazione: [desc]',
    'Importo: € [importo]',
    'Marca da bollo: € [bollo] [num_bollo]',
    'Totale: € [totale_bollo_fattura]',
    'Documento di esempio generato dalla modalità simulata.',
  ]
  const corpo = righe.map((t) => `<w:p><w:r><w:t xml:space="preserve">${t}</w:t></w:r></w:p>`).join('')
  const zip = new PizZip()
  zip.file('[Content_Types].xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>')
  zip.file('_rels/.rels',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>')
  zip.file('word/document.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${corpo}</w:body></w:document>`)
  return zip.generate({ type: 'base64' })
}

// ─── Archivio ─────────────────────────────────────────────────────────────────

export function archivioDemo(): Archivio {
  const pazienti: Patient[] = PAZIENTI.map((p, i) => ({
    id: `demo-paz-${i + 1}`,
    fiscalCode: codiceFiscale(p.firstName, p.lastName, p.birthDate!, p.gender === 'female'),
    createdAt: ADESSO,
    updatedAt: ADESSO,
    ...p,
  }))
  // Un giorno fisso, per mostrarlo nella cartella e nel modulo appuntamento.
  pazienti[0].fixedSlot = { weekday: giornoSettimana(oggi()), time: '14:30' }

  const appuntamenti: Appointment[] = AGENDA.map(([giorni, ora, i, tipo], n) => {
    const p = pazienti[i]
    const presenza: StatoPresenza = giorni < 0 ? (n % 4 === 2 ? 'assente' : 'presente') : 'programmato'
    return {
      id: `demo-app-${n + 1}`,
      patientId: p.id,
      patientFirstName: p.firstName,
      patientLastName: p.lastName,
      serviceId: SERVIZIO_DA_TIPO[tipo],
      appointmentDate: spostaGiorni(oggi(), giorni),
      appointmentTime: ora,
      presenza,
      createdAt: ADESSO,
      updatedAt: ADESSO,
    }
  })

  const servizi: Servizio[] = [
    { id: SERVIZIO_DA_TIPO.valutazione, nome: 'Valutazione', durataMinuti: 60, prezzo: 60, colore: 'ambra', attivo: true, createdAt: ADESSO, updatedAt: ADESSO },
    { id: SERVIZIO_DA_TIPO.sessione, nome: 'Sessione', durataMinuti: 45, prezzo: 45, colore: 'teal', attivo: true, createdAt: ADESSO, updatedAt: ADESSO },
  ]

  const modello = modelloFattura()
  const anno = oggi().slice(0, 4)
  const semiFatture: Array<[number, string, number, Invoice['status'], Invoice['invoiceType'], number]> = [
    [0, 'Ciclo di 4 sedute di logopedia', 180, 'pagata', 'cartacea', -20],
    [2, 'Sedute di riabilitazione del linguaggio', 90, 'in_attesa', 'cartacea', -6],
    [4, 'Valutazione logopedica', 60, 'pagata', 'elettronica', -2],
  ]
  const fatture: Invoice[] = semiFatture.map(([i, desc, importo, status, tipo, giorni], n) => {
    const p = pazienti[i]
    const bollo = importo > 77.47 ? 2 : 0
    const fattura: Invoice = {
      id: `demo-fat-${n + 1}`,
      invoiceNumber: `${n + 1}/${anno}`,
      patientId: p.id,
      patientFiscalCode: p.fiscalCode!,
      patientFirstName: p.firstName,
      patientLastName: p.lastName,
      description: desc,
      amount: importo,
      stampDuty: bollo,
      stampDutyNumber: bollo ? `0123456789${n}` : undefined,
      status,
      issueDate: spostaGiorni(oggi(), giorni),
      invoiceType: tipo,
      createdAt: ADESSO,
      updatedAt: ADESSO,
    }
    fattura.generatedFile = {
      fileName: `Fattura_${n + 1}_${anno}_${p.lastName}.docx`,
      fileBase64: generateDocument(modello, buildTemplateData(fattura, p)),
      generatedAt: ADESSO,
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    }
    return fattura
  })

  const profilo: ProfiloProfessionista = {
    professione: 'Logopedista',
    nome: 'Giulia',
    cognome: 'Esempio',
    partitaIva: '00000000000',
    dataNascita: '1990-01-01',
    sesso: 'female',
  }

  // L'archivio vero conserva il tema scelto; quello di esempio, rigenerato a ogni
  // apertura, riparte dall'ultimo tema usato invece di tornare sempre al chiaro.
  let ultimoTema: ImpostazioniApp['tema'] = 'light'
  try {
    if (localStorage.getItem('mmf.mobile.tema') === 'dark') ultimoTema = 'dark'
  } catch {
    // Nessuna memoria disponibile: chiaro
  }
  // Il modello Word caricato nelle Impostazioni del PC: alla configurazione va su Drive (CR §8)
  const impostazioni: ImpostazioniApp = {
    tema: ultimoTema,
    templateFattura: {
      nomeFile: 'Modello fattura (esempio).docx',
      dimensione: Math.round((modello.length * 3) / 4),
      dataCaricamento: ADESSO,
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      contenuto: modello,
    },
  }

  return {
    pazienti: JSON.stringify(pazienti),
    appuntamenti: JSON.stringify(appuntamenti),
    servizi: JSON.stringify(servizi),
    fatture: JSON.stringify(fatture),
    profilo: JSON.stringify(profilo),
    impostazioni: JSON.stringify(impostazioni),
  }
}
