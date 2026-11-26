/**
 * Collegamento fra l'archivio del telefono e il cloud, tramite il motore del
 * nucleo (`src/sync`). In modalità simulata Drive e Firestore sono in memoria
 * e un "PC simulato" sullo stesso cloud permette di vedere il tempo reale; in
 * modalità Google (`--mode google`) sono quelli veri, dopo l'accesso.
 */

import { create } from 'zustand'
import { codiceInChiave, importaChiave, type Archivio } from '@desktop/sync/cifratura'
import { CloudInMemoria, type Connessione } from '@desktop/sync/memoria'
import { MotoreSincronizzazione, type EsitoSincronizzazione } from '@desktop/sync/motore'
import { Fatturazione } from '@desktop/sync/fatturazione'
import { byteInBase64, estraiModello } from '@desktop/sync/modello'
import { ErroreAccesso, ErroreLicenza, type DepositoModello } from '@desktop/sync/contratti'
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
  imposta({ sync: 'errore', errore: err instanceof Error ? err.message : String(err) })
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

    let collegato = false
    const client = cloud.client(connessione)
    depositoModello = client.modello
    const motore = new MotoreSincronizzazione({
      ...client,
      chiave,
      dispositivo: 'telefono',
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
      connessione.online = true
      motore.sincronizza().catch(registraErrore)
    })
    window.addEventListener('offline', () => {
      connessione.online = false
      imposta({ sync: 'offline' })
    })

    imposta({ app: 'pronta', revisione: motore.revisione, aggiornatoIl: new Date().toISOString(), simulatore })
  } catch (err) {
    imposta({ app: 'errore', errore: err instanceof Error ? err.message : String(err) })
  }
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

async function avvioConGoogle(sessione?: Sessione): Promise<void> {
  imposta({ app: 'avvio', errore: null })
  try {
    const s = sessione ?? (await sessioneRipresa())
    if (!s) {
      imposta({ app: 'accesso' })
      return
    }
    imposta({ email: s.email })

    // La lettura del puntatore passa dalle regole di Firestore: è anche il
    // controllo della licenza, fatto dal server di Google.
    const { puntatore } = await registroFirestore(s.db, s.uid).leggi()

    const drive = new Drive({ token: s.token })
    let cartelle: Cartelle | null = null
    for (const radice of await drive.cercaRadici()) {
      cartelle = await drive.trovaStruttura(radice.id)
      if (cartelle) break
    }
    if (!puntatore || !cartelle) {
      imposta({ app: 'senza-archivio' })
      return
    }
    // TODO prossimo passo: codice di recupero, verifica e collegamento del motore
    imposta({ app: 'codice' })
  } catch (err) {
    if (err instanceof ErroreAccesso) imposta({ app: 'accesso', errore: err.message })
    else if (err instanceof ErroreLicenza) imposta({ app: 'licenza' })
    else imposta({ app: 'errore', errore: err instanceof Error ? err.message : String(err) })
  }
}
