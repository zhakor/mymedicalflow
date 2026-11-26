/**
 * Collegamento fra l'archivio del telefono e il cloud, tramite il motore del
 * nucleo (`src/sync`). In modalità simulata Drive e Firestore sono in memoria
 * e un "PC simulato" sullo stesso cloud permette di vedere il tempo reale; in
 * modalità Google (`--mode google`) sono quelli veri, dopo l'accesso.
 */

import { create } from 'zustand'
import { ChiaveErrata, codiceInChiave, importaChiave, type Archivio } from '@desktop/sync/cifratura'
import { CloudInMemoria, type Connessione } from '@desktop/sync/memoria'
import { MotoreSincronizzazione, type EsitoSincronizzazione } from '@desktop/sync/motore'
import { Fatturazione } from '@desktop/sync/fatturazione'
import { byteInBase64, estraiModello } from '@desktop/sync/modello'
import {
  ErroreAccesso,
  ErroreConnessione,
  ErroreLicenza,
  type DepositoFile,
  type DepositoModello,
  type Registro,
} from '@desktop/sync/contratti'
import { Drive, type Cartelle } from '@desktop/sync/drive'
import { registroFirestore } from '@desktop/sync/firestore'
import { oggi, inOrario } from '@desktop/lib/agendaService'
import type { Appointment } from '@desktop/types/appuntamento'
import type { Patient } from '@desktop/types/paziente'
import { SERVIZIO_DA_TIPO } from '@desktop/types/servizio'
import { impostaArchivio, leggiArchivio, suModificaUtente } from './archivio'
import { avvisa } from '../navigazione'
import { archivioDemo } from './demo'
import { sessioneRipresa, type Sessione } from './google'
import { chiaveSalvata, dimenticaChiave, salvaChiave } from './chiave'

/** Codice di recupero della modalità simulata (chiave 0..31): mai usato con dati reali. */
const CODICE_PROVA = 'AAAT-EA2E-AYDA-RCAK-BJFT-2DJR-B6JB-CETX-CTMV-PF22-DEQB-0HA7-D2ST'

export type StatoSync = 'allineato' | 'in-corso' | 'offline' | 'errore'

/**
 * Dove si trova l'avvio. In modalità Google, prima di `pronta` (CR §9):
 * `accesso` serve il tocco su «Accedi con Google», `licenza` l'account non ha
 * una licenza attiva, `senza-archivio` il PC non ha ancora configurato Drive,
 * `codice` l'archivio c'è e serve il codice di recupero.
 */
export type FaseApp = 'avvio' | 'accesso' | 'licenza' | 'senza-archivio' | 'codice' | 'pronta' | 'errore'

interface StatoSincronizzazione {
  app: FaseApp
  /** Account Google collegato (modalità Google). */
  email: string | null
  sync: StatoSync
  revisione: number | null
  aggiornatoIl: string | null
  errore: string | null
  simulatore: SimulatorePc | null
}

export const useSincronizzazione = create<StatoSincronizzazione>(() => ({
  app: 'avvio',
  email: null,
  sync: 'allineato',
  revisione: null,
  aggiornatoIl: null,
  errore: null,
  simulatore: null,
}))

const imposta = useSincronizzazione.setState

function registraEsito(esito: EsitoSincronizzazione): void {
  if (esito.tipo === 'offline') {
    imposta({ sync: 'offline' })
    return
  }
  imposta({ sync: 'allineato', revisione: esito.revisione, aggiornatoIl: new Date().toISOString() })
}

function registraErrore(err: unknown): void {
  console.error('[sincronizzazione]', err)
  // Token di Drive scaduto o licenza revocata ad app aperta: si torna alla
  // schermata relativa; i dati in memoria e le modifiche in attesa restano
  if (err instanceof ErroreAccesso) imposta({ app: 'accesso', errore: err.message })
  else if (err instanceof ErroreLicenza) imposta({ app: 'licenza' })
  else imposta({ sync: 'errore', errore: err instanceof Error ? err.message : String(err) })
}

/**
 * Il PC dello studio, simulato: un secondo dispositivo con il proprio archivio
 * sullo stesso cloud. Serve solo a vedere arrivare le modifiche sul telefono.
 */
export class SimulatorePc {
  private locale: Archivio
  private readonly client: ReturnType<CloudInMemoria['client']>
  readonly motore: MotoreSincronizzazione

  constructor(cloud: CloudInMemoria, chiave: CryptoKey, iniziale: Archivio) {
    this.locale = { ...iniziale }
    this.client = cloud.client({ online: true })
    this.motore = new MotoreSincronizzazione({
      ...this.client,
      chiave,
      dispositivo: 'pc-simulato',
      leggiLocale: () => ({ ...this.locale }),
      scriviLocale: (a) => {
        this.locale = { ...a }
      },
      risolviConflitti: async () => new Map(),
    })
  }

  /**
   * Configurazione dal PC (CR §8, passo 4): il modello Word delle impostazioni
   * va su Drive in chiaro, l'archivio (con i soli metadati) diventa la revisione 1.
   */
  async configura(): Promise<void> {
    const { archivio, modello } = estraiModello(this.locale)
    this.locale = archivio
    if (modello) await this.client.modello.carica(modello)
    await this.motore.inizializzaRemoto()
  }

  /** Aggiunge dal "PC" un appuntamento oggi, alla prima ora libera, e lo pubblica. */
  async aggiungiAppuntamento(): Promise<string> {
    await this.motore.sincronizza()
    const pazienti = JSON.parse(this.locale.pazienti ?? '[]') as Patient[]
    const appuntamenti = JSON.parse(this.locale.appuntamenti ?? '[]') as Appointment[]
    const occupati = new Set(appuntamenti.filter((a) => a.appointmentDate === oggi()).map((a) => a.appointmentTime))

    const ora = new Date()
    let minuti = Math.max(8 * 60, (ora.getHours() + 1) * 60)
    while (occupati.has(inOrario(minuti)) && minuti < 19 * 60) minuti += 30
    const p = pazienti[Math.floor(Math.random() * pazienti.length)]
    const adesso = ora.toISOString()

    const nuovo: Appointment = {
      id: `pc-${Date.now()}`,
      patientId: p.id,
      patientFirstName: p.firstName,
      patientLastName: p.lastName,
      serviceId: SERVIZIO_DA_TIPO.sessione,
      appointmentDate: oggi(),
      appointmentTime: inOrario(Math.min(minuti, 19 * 60)),
      presenza: 'programmato',
      description: 'Aggiunto dal PC (simulazione)',
      createdAt: adesso,
      updatedAt: adesso,
    }
    this.locale = { ...this.locale, appuntamenti: JSON.stringify([...appuntamenti, nuovo]) }
    await this.motore.sincronizza()
    return `${p.lastName} ${p.firstName} alle ${nuovo.appointmentTime}`
  }
}

let avviata = false
let motoreTelefono: MotoreSincronizzazione | null = null
let fatturazioneTelefono: Fatturazione | null = null
let depositoModello: DepositoModello | null = null
let modelloInMemoria: Promise<string | null> | null = null

/**
 * Il modello Word caricato dal PC alla configurazione, in base64 per
 * `generateDocument`; null se il PC non ne ha caricato uno. Si scarica da
 * Drive una volta per sessione; se lo scaricamento fallisce si riprova alla
 * richiesta successiva.
 */
export function modelloFattura(): Promise<string | null> {
  if (!depositoModello) return Promise.reject(new Error("L'archivio non è ancora pronto: riprova tra un istante."))
  const deposito = depositoModello
  modelloInMemoria ??= deposito.scarica().then((m) => (m ? byteInBase64(m.dati) : null))
  modelloInMemoria.catch(() => {
    modelloInMemoria = null
  })
  return modelloInMemoria
}

/**
 * Emette una fattura (CR §6.1): `operazione` calcola il numero e la salva;
 * prima si scarica l'ultima versione dal cloud, dopo si pubblica. Al termine
 * il numero salvato è definitivo, anche se il PC ha appena usato lo stesso.
 * Offline solleva `FatturazioneOffline`.
 */
export function emettiFattura<T>(operazione: () => Promise<T>): Promise<T> {
  if (!fatturazioneTelefono) return Promise.reject(new Error("L'archivio non è ancora pronto: riprova tra un istante."))
  return fatturazioneTelefono.usa(operazione)
}

/**
 * Aggiornamento forzato (gesto "tira per aggiornare"): rilegge il documento
 * Firestore senza fidarsi della notifica e, se c'è una revisione nuova,
 * scarica l'archivio da Drive. Pubblica anche eventuali modifiche in sospeso.
 */
export async function aggiornaDalCloud(): Promise<void> {
  if (!motoreTelefono) return
  const prima = motoreTelefono.revisione
  imposta({ sync: 'in-corso' })
  const esito = await motoreTelefono.sincronizza({ fresco: true })
  if (esito.tipo === 'offline') {
    avvisa('Drive non raggiungibile: riprova tra poco.', 'errore')
  } else if (esito.revisione === prima) {
    avvisa('Dati già aggiornati', 'info')
  }
  // Con una revisione nuova l'avviso "Aggiornato dall'altro dispositivo" arriva già dal motore.
}

export async function avviaModalitaSimulata(): Promise<void> {
  if (avviata) return
  avviata = true
  try {
    const connessione: Connessione = { online: navigator.onLine }
    const cloud = new CloudInMemoria()
    const chiave = await importaChiave(codiceInChiave(CODICE_PROVA))

    const simulatore = new SimulatorePc(cloud, chiave, archivioDemo())
    await simulatore.configura()

    imposta({ simulatore })
    await avviaMotore(cloud.client(connessione), chiave, 'telefono', (online) => (connessione.online = online))
  } catch (err) {
    imposta({ app: 'errore', errore: err instanceof Error ? err.message : String(err) })
  }
}

/**
 * Collega il telefono all'archivio (che SOSTITUISCE quello in memoria) e
 * avvia ascolto e pubblicazione delle modifiche: da qui l'app è pronta.
 * Fallisce se la chiave non decifra l'archivio.
 */
async function avviaMotore(
  cloud: { deposito: DepositoFile; registro: Registro; modello: DepositoModello },
  chiave: CryptoKey,
  dispositivo: string,
  rete?: (online: boolean) => void,
): Promise<void> {
  let collegato = false
  const motore = new MotoreSincronizzazione({
    deposito: cloud.deposito,
    registro: cloud.registro,
    chiave,
    dispositivo,
    leggiLocale: leggiArchivio,
    scriviLocale: (a) => {
      impostaArchivio(a)
      if (collegato) avvisa("Aggiornato dall'altro dispositivo", 'info')
    },
    // TODO Fase 3: finestra dei conflitti. Per ora prevale l'altro dispositivo.
    risolviConflitti: async () => new Map(),
    onEsito: registraEsito,
    onErrore: registraErrore,
  })

  await motore.collega()
  collegato = true
  motoreTelefono = motore
  depositoModello = cloud.modello
  // Il telefono lavora solo online: niente bozze da numerare
  const fatturazione = new Fatturazione({ motore, onErrore: registraErrore })
  fatturazioneTelefono = fatturazione
  motore.ascolta(fatturazione.suCambio)

  let attesa: ReturnType<typeof setTimeout> | undefined
  suModificaUtente(() => {
    imposta({ sync: 'in-corso' })
    clearTimeout(attesa)
    attesa = setTimeout(() => motore.sincronizza().catch(registraErrore), 300)
  })

  window.addEventListener('online', () => {
    rete?.(true)
    motore.sincronizza().catch(registraErrore)
  })
  window.addEventListener('offline', () => {
    rete?.(false)
    imposta({ sync: 'offline' })
  })

  imposta({ app: 'pronta', revisione: motore.revisione, aggiornatoIl: new Date().toISOString() })
}

// ─── Modalità Google ──────────────────────────────────────────────────────────

/**
 * Avvio con Google (CR §9, primo accesso): sessione → licenza → archivio su
 * Drive. Senza `sessione` riprende quella di prima, se il token è ancora
 * valido; altrimenti chiede il tocco su «Accedi con Google».
 */
let avvioGoogle: Promise<void> | null = null

export function avviaModalitaGoogle(sessione?: Sessione): Promise<void> {
  // Una sola alla volta (React in sviluppo esegue gli effetti due volte)
  avvioGoogle ??= avvioConGoogle(sessione).finally(() => (avvioGoogle = null))
  return avvioGoogle
}

/** L'archivio trovato su Drive, in attesa del codice di recupero. */
let archivioTrovato: { sessione: Sessione; cloud: { deposito: DepositoFile; registro: Registro; modello: DepositoModello } } | null = null

async function avvioConGoogle(sessione?: Sessione): Promise<void> {
  imposta({ app: 'avvio', errore: null })
  try {
    const s = sessione ?? (await sessioneRipresa())
    if (!s) {
      imposta({ app: 'accesso' })
      return
    }

    // Accesso rinnovato ad app già aperta (token scaduto): il motore usa il
    // token nuovo alla prossima richiesta, nulla da ricaricare. Con un altro
    // account invece si riparte da zero.
    if (motoreTelefono) {
      if (s.uid !== archivioTrovato?.sessione.uid) return location.reload()
      imposta({ app: 'pronta' })
      motoreTelefono.sincronizza().catch(registraErrore)
      return
    }
    imposta({ email: s.email })

    // Ogni lettura del puntatore passa dalle regole di Firestore: è anche il
    // controllo della licenza, fatto dal server di Google.
    const registro = registroFirestore(s.db, s.uid, { onErrore: registraErrore })
    const drive = new Drive({ token: s.token })
    const cloudDi = (c: Cartelle) => ({ deposito: drive.deposito(c), registro, modello: drive.modello(c) })
    // La chiave salvata al primo accesso evita di richiedere il codice
    const chiave = await chiaveSalvata(s.uid)

    // Via veloce, ogni apertura dopo la prima: cartelle ricordate e chiave
    // salvata, ci si collega subito senza cercare nulla su Drive.
    const ricordate = cartelleRicordate(s.uid)
    if (ricordate && chiave) {
      archivioTrovato = { sessione: s, cloud: cloudDi(ricordate) }
      try {
        await avviaMotore(archivioTrovato.cloud, chiave, idDispositivo())
        verificaCartelle(drive, s.uid, ricordate)
        return
      } catch (err) {
        if (erroreDiChiave(err)) {
          // Il codice di recupero è cambiato sul PC: quella salvata non serve più
          await dimenticaChiave(s.uid)
          imposta({ app: 'codice' })
          return
        }
        if (err instanceof ErroreAccesso || err instanceof ErroreLicenza || err instanceof ErroreConnessione) throw err
        // Archivio spostato o ricreato dal PC: si cerca di nuovo
        ricordaCartelle(s.uid, null)
      }
    }

    // Via completa: puntatore e cartelle insieme
    const [{ puntatore }, cartelle] = await Promise.all([registro.leggi(), trovaCartelle(drive)])
    if (!puntatore || !cartelle) {
      imposta({ app: 'senza-archivio' })
      return
    }
    ricordaCartelle(s.uid, cartelle)
    archivioTrovato = { sessione: s, cloud: cloudDi(cartelle) }

    if (chiave) {
      try {
        await avviaMotore(archivioTrovato.cloud, chiave, idDispositivo())
        return
      } catch (err) {
        if (!erroreDiChiave(err)) throw err
        await dimenticaChiave(s.uid)
      }
    }
    imposta({ app: 'codice' })
  } catch (err) {
    erroreDiAvvio(err)
  }
}

async function trovaCartelle(drive: Drive): Promise<Cartelle | null> {
  for (const radice of await drive.cercaRadici()) {
    const cartelle = await drive.trovaStruttura(radice.id)
    if (cartelle) return cartelle
  }
  return null
}

/**
 * Gli id delle cartelle su Drive, ricordati fra un'apertura e l'altra per
 * non cercarli ogni volta (CR §12, velocità). Solo identificativi: nessun dato.
 */
const chiaveCartelle = (uid: string) => `mmf.mobile.cartelle.${uid}`

function cartelleRicordate(uid: string): Cartelle | null {
  try {
    const c = JSON.parse(localStorage.getItem(chiaveCartelle(uid)) ?? 'null') as Cartelle | null
    return c?.radice && c.archivio && c.copie && c.template ? c : null
  } catch {
    return null
  }
}

function ricordaCartelle(uid: string, cartelle: Cartelle | null): void {
  try {
    if (cartelle) localStorage.setItem(chiaveCartelle(uid), JSON.stringify(cartelle))
    else localStorage.removeItem(chiaveCartelle(uid))
  } catch {
    // Senza spazio si cercano a ogni apertura
  }
}

/** Dopo la via veloce, in sottofondo: se le cartelle sono cambiate, la prossima apertura le cerca. */
function verificaCartelle(drive: Drive, uid: string, ricordate: Cartelle): void {
  drive
    .trovaStruttura(ricordate.radice)
    .then((attuali) => {
      if (JSON.stringify(attuali) !== JSON.stringify(ricordate)) ricordaCartelle(uid, null)
    })
    .catch(() => {})
}

function erroreDiAvvio(err: unknown): void {
  if (err instanceof ErroreAccesso) imposta({ app: 'accesso', errore: err.message })
  else if (err instanceof ErroreLicenza) imposta({ app: 'licenza' })
  else imposta({ app: 'errore', errore: err instanceof Error ? err.message : String(err) })
}

const erroreDiChiave = (err: unknown) => err instanceof ChiaveErrata

/** Id casuale di questo telefono, per i salvataggi (CR §12: mai nomi di dispositivi). */
function idDispositivo(): string {
  const CHIAVE = 'mmf.mobile.dispositivo'
  try {
    const id = localStorage.getItem(CHIAVE) ?? `telefono-${crypto.randomUUID()}`
    localStorage.setItem(CHIAVE, id)
    return id
  } catch {
    return `telefono-${crypto.randomUUID()}`
  }
}

/**
 * Primo accesso su questo telefono: il codice di recupero apre l'archivio.
 * Riuscito, la chiave resta salvata (non esportabile) e il codice no.
 * Un codice sbagliato solleva un errore da mostrare sotto il campo.
 */
export async function apriConCodice(codice: string): Promise<void> {
  if (!archivioTrovato) throw new Error("L'archivio non è più disponibile: riapri l'app.")
  let chiave: CryptoKey
  try {
    chiave = await importaChiave(codiceInChiave(codice))
  } catch {
    throw new Error('Il codice non è completo o contiene caratteri non validi: controllalo e riprova.')
  }
  try {
    await avviaMotore(archivioTrovato.cloud, chiave, idDispositivo())
  } catch (err) {
    if (erroreDiChiave(err)) throw new Error("Questo codice non apre l'archivio dello studio: controllalo e riprova.")
    erroreDiAvvio(err)
    return
  }
  await salvaChiave(archivioTrovato.sessione.uid, chiave)
}
