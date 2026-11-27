/**
 * Google Drive e Firestore dal desktop (CR §7.1 e §8).
 *
 * L'accesso Google lo fa il backend Rust (browser di sistema, loopback, PKCE,
 * refresh token nel portachiavi): qui arrivano solo access token di un'ora.
 * Lo stesso accesso apre la sessione Firebase per Firestore.
 *
 * I riferimenti della configurazione (id dell'installazione, radice su Drive)
 * sono di questo PC e non vanno nell'archivio, che si sincronizza: stanno nel
 * localStorage della finestra dell'app.
 */

import { invoke } from '@tauri-apps/api/core'
import { initializeApp, type FirebaseApp } from 'firebase/app'
import {
  GoogleAuthProvider,
  indexedDBLocalPersistence,
  initializeAuth,
  signInWithCredential,
  signOut,
  type Auth,
} from 'firebase/auth'
import { doc, getDocFromServer, initializeFirestore, type Firestore } from 'firebase/firestore'
import { codiceInChiave, decifraArchivio, importaChiave, type Archivio } from '../sync/cifratura'
import { ErroreAccesso, ErroreConnessione } from '../sync/contratti'
import { Drive, type Cartelle } from '../sync/drive'
import { registroFirestore, traduciErrore } from '../sync/firestore'
import type { Licenza } from './abbonamentoService'
import { configuraDalDesktop, type EsitoConfigurazione } from '../sync/configurazione'
import { MotoreSincronizzazione, type EsitoSincronizzazione, type StatoSincronizzato } from '../sync/motore'
import { estraiModello, reinserisciModello } from '../sync/modello'
import { Fatturazione, FatturazioneOffline } from '../sync/fatturazione'
import { novitaArrivate } from '../sync/novita'
import { useNotificheStore } from '../stores/notificheStore'
import { oggi } from './agendaService'
import { fatturaService } from './fatturaService'
import { aggiornaWord } from './wordFatturaService'
import { codiceRecupero } from './backupService'
import { sostituisciArchivio, storageService, suModificaUtente } from './storageService'
import { useSincronizzazioneStore } from '../stores/sincronizzazioneStore'
import { useProfiloStore } from '../stores/profiloStore'
import { useImpostazioniStore } from '../stores/impostazioniStore'
import { usePazienteStore } from '../stores/pazienteStore'
import { useAppuntamentoStore } from '../stores/appuntamentoStore'
import { useFatturaStore } from '../stores/fatturaStore'

// ─── Errori dal backend ──────────────────────────────────────────────────────

/** Il backend marca gli errori: `[accesso]` serve un nuovo login, `[rete]` si ritenta. */
function tradotto(err: unknown): Error {
  const testo = err instanceof Error ? err.message : String(err)
  if (testo.startsWith('[accesso]')) return new ErroreAccesso(testo.slice(9).trim())
  if (testo.startsWith('[rete]')) return new ErroreConnessione(testo.slice(6).trim())
  return new Error(testo)
}

async function backend<T>(comando: string, argomenti?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(comando, argomenti)
  } catch (err) {
    throw tradotto(err)
  }
}

const tokenDrive = (rinnova?: boolean) => backend<string>('google_token', { rinnova: !!rinnova })

// ─── Firebase ────────────────────────────────────────────────────────────────

let firebase: { app: FirebaseApp; auth: Auth; db: Firestore } | null = null

function avviaFirebase() {
  if (firebase) return firebase
  const app = initializeApp({
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
  })
  // Senza il gestore di popup e reindirizzamenti di `getAuth`: nella finestra
  // dell'app non servono, e caricherebbero una pagina di Google in un iframe.
  const auth = initializeAuth(app, { persistence: indexedDBLocalPersistence })
  firebase = { app, auth, db: initializeFirestore(app, {}) }
  return firebase
}

// ─── Account ─────────────────────────────────────────────────────────────────

export interface AccountGoogle {
  uid: string
  email: string
}

/** Apre il browser per l'accesso Google e, completato, la sessione Firebase. */
export async function accediGoogle(): Promise<AccountGoogle> {
  const { accessToken, idToken } = await backend<{ accessToken: string; idToken: string | null }>('google_accedi')
  const { user } = await signInWithCredential(avviaFirebase().auth, GoogleAuthProvider.credential(idToken, accessToken))
  return { uid: user.uid, email: user.email ?? '' }
}

/** L'account collegato, se c'è un accesso salvato e Firebase ricorda l'utente. */
export async function accountCollegato(): Promise<AccountGoogle | null> {
  if (!(await backend<boolean>('google_collegato'))) return null
  const { auth } = avviaFirebase()
  await auth.authStateReady()
  const user = auth.currentUser
  return user ? { uid: user.uid, email: user.email ?? '' } : null
}

/**
 * La licenza dell'account collegato, letta dal server (mai dalla cache):
 * `licenze/{email}` su Firestore, che le regole lasciano leggere solo a lui.
 * Senza rete solleva `ErroreConnessione`.
 */
export async function leggiLicenza(): Promise<Licenza> {
  const { auth, db } = avviaFirebase()
  await auth.authStateReady()
  const user = auth.currentUser
  if (!user?.email) throw new ErroreAccesso("Accedi con Google per verificare l'abbonamento.")
  try {
    const dati = (await getDocFromServer(doc(db, 'licenze', user.email))).data()
    const scadenza = dati?.scadenza as { toMillis?: () => number } | undefined
    return {
      email: user.email,
      emailVerificata: user.emailVerified,
      attiva: dati?.attiva === true,
      scadenza: typeof scadenza?.toMillis === 'function' ? scadenza.toMillis() : null,
    }
  } catch (err) {
    throw traduciErrore(err)
  }
}

export async function esciGoogle(): Promise<void> {
  fermaSincronizzazione()
  await backend<void>('google_esci')
  if (firebase) await signOut(firebase.auth)
  // L'id dell'installazione resta: è il marcatore della radice che questo PC
  // ha creato, e riaccedendo la ritrova invece di scambiarla per un'altra
  const istanza = leggiConfigurazione()?.istanza
  salvaConfigurazione(istanza ? { istanza } : null)
}

// ─── Configurazione di questo PC ─────────────────────────────────────────────

const CHIAVE_CONFIGURAZIONE = 'mmf.sincronizzazione'

export interface ConfigurazioneSync {
  /** Id di questa installazione: marca la radice su Drive e i salvataggi. */
  istanza: string
  /** Radice MyMedicalFlow su Drive, se la configurazione è completata. */
  radice?: string
  email?: string
  configurataIl?: string
}

export function leggiConfigurazione(): ConfigurazioneSync | null {
  try {
    return JSON.parse(localStorage.getItem(CHIAVE_CONFIGURAZIONE) ?? 'null') as ConfigurazioneSync | null
  } catch {
    return null
  }
}

function salvaConfigurazione(c: ConfigurazioneSync | null): void {
  if (c) localStorage.setItem(CHIAVE_CONFIGURAZIONE, JSON.stringify(c))
  else localStorage.removeItem(CHIAVE_CONFIGURAZIONE)
}

/**
 * Configurazione dal PC (CR §8): archivio locale su Drive come revisione 1,
 * modello Word in `template/`, verifica. Si può ripetere: dallo stesso PC
 * ricollega senza ricaricare nulla.
 */
export async function configuraSincronizzazione(passo?: (descrizione: string) => void): Promise<EsitoConfigurazione> {
  const account = await accountCollegato()
  if (!account) throw new ErroreAccesso('Accedi con Google per configurare la sincronizzazione.')
  // L'istanza si conserva fra un tentativo e l'altro: è il marcatore della radice
  const istanza = leggiConfigurazione()?.istanza ?? crypto.randomUUID()
  salvaConfigurazione({ istanza })

  const esito = await configuraDalDesktop({
    drive: new Drive({ token: tokenDrive }),
    registro: registroFirestore(avviaFirebase().db, account.uid),
    chiave: await importaChiave(codiceInChiave(await codiceRecupero())),
    istanza,
    archivio: storageService.istantanea(),
    passo,
  })
  salvaConfigurazione({ istanza, radice: esito.radice, email: account.email, configurataIl: new Date().toISOString() })
  return esito
}

// ─── Sincronizzazione continua (CR §5) ───────────────────────────────────────

const imposta = useSincronizzazioneStore.setState

let attiva: { smetti: () => void } | null = null
let avvio: Promise<void> | null = null
let fatturazione: Fatturazione | null = null
let motoreAttivo: MotoreSincronizzazione | null = null

/**
 * Emissione di una fattura dal PC (CR §6.1). `operazione` calcola il numero e
 * salva: con la sincronizzazione attiva gira dopo aver scaricato l'ultima
 * versione dal cloud e prima di pubblicare, così il numero non è già stato
 * preso dal telefono. Senza connessione solleva `FatturazioneOffline`: la
 * fattura va salvata come bozza. `pubblicata` è falso se la rete è caduta fra
 * il salvataggio e la pubblicazione: anche quella fattura va trattata come
 * bozza. Senza sincronizzazione configurata, come prima.
 */
export async function emettiFatturaPc<T>(operazione: () => Promise<T>): Promise<{ risultato: T; pubblicata: boolean }> {
  if (!leggiConfigurazione()?.radice) return { risultato: await operazione(), pubblicata: true }
  if (!fatturazione || !motoreAttivo) throw new FatturazioneOffline()
  const motore = motoreAttivo
  const risultato = await fatturazione.usa(operazione)
  return { risultato, pubblicata: !motore.inAttesa }
}

/** Con la sincronizzazione configurata il numero si assegna al salvataggio. */
export const numerazioneAutomatica = (): boolean => !!leggiConfigurazione()?.radice

/** Dopo una numerazione o rinumerazione: Word col numero giusto e avviso. */
async function dopoCambioNumero(fatture: { id: string; da?: string }[], comeBozze: boolean): Promise<void> {
  for (const { id, da } of fatture) {
    const f = fatturaService.getById(id)
    if (!f) continue
    let word = false
    try {
      word = await aggiornaWord(f)
    } catch (err) {
      registraErrore(err)
    }
    const testo = comeBozze
      ? `Bozza numerata: fattura ${f.invoiceNumber}${da && da !== f.invoiceNumber ? ` (era ${da})` : ''}.`
      : `La fattura ${da} è diventata ${f.invoiceNumber}: il telefono aveva appena usato quel numero.`
    useFatturaStore.getState().showFeedback(word ? `${testo} Word aggiornato nella cartella delle fatture.` : testo)
  }
  if (fatture.length > 0) ricaricaSchermate()
}

/** Bozze emesse offline (CR §6.2): numerate dopo l'ultima emessa, anche dal telefono. */
async function numeraBozze(): Promise<void> {
  await dopoCambioNumero(fatturaService.numberDrafts(oggi(), new Date().toISOString()), true)
}

/**
 * Collega il PC all'archivio su Drive e lo tiene allineato: pubblica le
 * modifiche fatte qui e porta dentro, in tempo reale, quelle del telefono.
 * Non fa nulla se la sincronizzazione non è configurata. Si può chiamare più
 * volte: parte una sola volta.
 */
export function avviaSincronizzazione(): Promise<void> {
  if (attiva) return Promise.resolve()
  avvio ??= collegaMotore().finally(() => (avvio = null))
  return avvio
}

export function fermaSincronizzazione(): void {
  attiva?.smetti()
  attiva = null
  fatturazione = null
  motoreAttivo = null
  imposta({ stato: 'spenta', revisione: null })
}

// Partita senza rete (o con Google irraggiungibile) si ritenta da sola: al
// ritorno della connessione e, nel dubbio, ogni minuto finché resta offline.
if (typeof window !== 'undefined') {
  const riprova = () => {
    if (!attiva && useSincronizzazioneStore.getState().stato === 'offline') void avviaSincronizzazione()
  }
  window.addEventListener('online', riprova)
  setInterval(riprova, 60_000)
}

/** Ripresa dopo un errore o un nuovo accesso (pulsante nella scheda). */
export async function riprovaSincronizzazione(): Promise<void> {
  fermaSincronizzazione()
  await avviaSincronizzazione()
}

/** L'archivio del PC come va sul cloud: il modello Word resta fuori (sta in `template/`). */
const archivioDaPubblicare = (): Archivio => estraiModello(storageService.istantanea()).archivio

/** Firma del modello Word del PC: cambia quando se ne carica un altro nelle Impostazioni. */
function firmaModello(): string {
  const t = useImpostazioniStore.getState().impostazioni.templateFattura
  return t ? `${t.nomeFile}|${t.dimensione}|${t.dataCaricamento}` : ''
}

/** Dopo un archivio arrivato dal cloud le schermate rileggono i dati (filtri e pagine restano). */
function ricaricaSchermate(): void {
  useProfiloStore.getState().caricaProfilo()
  useImpostazioniStore.getState().caricaImpostazioni()
  usePazienteStore.getState().loadPatients()
  useAppuntamentoStore.getState().loadAppointments()
  useFatturaStore.getState().loadInvoices()
}

async function leggiBase(): Promise<StatoSincronizzato | null> {
  const testo = await backend<string | null>('sync_base_load')
  return testo ? (JSON.parse(testo) as StatoSincronizzato) : null
}

const salvaBase = (stato: StatoSincronizzato) => backend<void>('sync_base_save', { data: JSON.stringify(stato) })

/**
 * Senza base salvata (configurazione fatta prima di questa versione) la base
 * è l'archivio caricato alla configurazione, la revisione 1: così ciò che il
 * telefono ha fatto da allora arriva come modifica sua, non come cancellazione
 * del PC. Se non c'è più, l'archivio attuale del PC.
 */
async function baseIniziale(drive: Drive, cartelle: Cartelle, chiave: CryptoKey): Promise<StatoSincronizzato> {
  const id = await drive.archivioDellaRevisione(cartelle, 1)
  if (id) {
    try {
      return { base: await decifraArchivio(await drive.deposito(cartelle).scarica(id), chiave), revisione: 1 }
    } catch {
      // Illeggibile: si ripiega sull'archivio del PC
    }
  }
  return { base: archivioDaPubblicare(), revisione: 1 }
}

function registraEsito(esito: EsitoSincronizzazione): void {
  if (esito.tipo === 'offline') {
    imposta({ stato: 'offline', errore: null })
    return
  }
  imposta({ stato: 'allineato', revisione: esito.revisione, aggiornatoIl: new Date().toISOString(), errore: null })
  // Fatture del PC rinumerate perché il telefono aveva pubblicato lo stesso numero
  if (esito.rinumerate.length > 0) void dopoCambioNumero(esito.rinumerate, false)
}

function registraErrore(err: unknown): void {
  console.error('[sincronizzazione]', err)
  const errore = err instanceof Error ? err.message : String(err)
  if (err instanceof ErroreAccesso) imposta({ stato: 'accesso', errore })
  else if (err instanceof ErroreConnessione) imposta({ stato: 'offline', errore: null })
  else imposta({ stato: 'errore', errore })
}

async function collegaMotore(): Promise<void> {
  const config = leggiConfigurazione()
  if (!config?.radice) return
  imposta({ stato: 'avvio', errore: null })
  try {
    const account = await accountCollegato()
    if (!account) throw new ErroreAccesso('Accedi con Google per riprendere la sincronizzazione.')
    const drive = new Drive({ token: tokenDrive })
    const cartelle = await drive.trovaStruttura(config.radice)
    if (!cartelle) throw new Error("La cartella MyMedicalFlow su Drive non c'è più: rifai la configurazione.")
    const chiave = await importaChiave(codiceInChiave(await codiceRecupero()))
    const statoIniziale = (await leggiBase()) ?? (await baseIniziale(drive, cartelle, chiave))
    const modello = drive.modello(cartelle)

    const motore = new MotoreSincronizzazione({
      deposito: drive.deposito(cartelle),
      registro: registroFirestore(avviaFirebase().db, account.uid, { onErrore: registraErrore }),
      chiave,
      dispositivo: config.istanza,
      statoIniziale,
      leggiLocale: archivioDaPubblicare,
      scriviLocale: (arrivato) => {
        const prima = storageService.istantanea()
        // Arriva senza il modello Word: si riprende quello del PC. La cache
        // cambia subito, la scrittura su disco segue.
        sostituisciArchivio(JSON.stringify(reinserisciModello(arrivato, prima))).catch(registraErrore)
        ricaricaSchermate()
        // Pazienti, appuntamenti e fatture nuovi: notifica in basso a destra
        const novita = novitaArrivate(prima, arrivato)
        if (novita.length > 0) useNotificheStore.getState().aggiungi(novita)
      },
      salvaStato: salvaBase,
      // TODO Fase 3: finestra dei conflitti. Per ora prevale l'altro dispositivo.
      risolviConflitti: async () => new Map(),
      onEsito: registraEsito,
      onErrore: registraErrore,
    })

    const sincronizza = () => {
      imposta({ stato: 'in-corso' })
      motore.sincronizza().catch(registraErrore)
    }

    // Primo allineamento: porta dentro quanto fatto dal telefono a PC spento
    imposta({ stato: 'in-corso' })
    registraEsito(await motore.sincronizza({ fresco: true }))

    let firma = firmaModello()
    let attesa: ReturnType<typeof setTimeout> | undefined
    const smettiModifiche = suModificaUtente(() => {
      imposta({ stato: 'in-corso' })
      clearTimeout(attesa)
      attesa = setTimeout(() => {
        // Modello Word cambiato nelle Impostazioni: va su Drive per il telefono
        const nuova = firmaModello()
        const { modello: file } = estraiModello(storageService.istantanea())
        if (nuova !== firma && file) {
          modello
            .carica(file)
            .then(() => (firma = nuova))
            .catch(registraErrore)
        }
        sincronizza()
      }, 300)
    })
    // Unico ascolto: le notifiche arrivano solo online, il momento di numerare le bozze
    fatturazione = new Fatturazione({
      motore,
      bozze: { inSospeso: () => fatturaService.hasDrafts(), numera: numeraBozze },
      onErrore: registraErrore,
    })
    const smettiAscolto = motore.ascolta(fatturazione.suCambio)
    motoreAttivo = motore
    window.addEventListener('online', sincronizza)

    attiva = {
      smetti: () => {
        clearTimeout(attesa)
        smettiModifiche()
        smettiAscolto()
        window.removeEventListener('online', sincronizza)
      },
    }
  } catch (err) {
    registraErrore(err)
  }
}
