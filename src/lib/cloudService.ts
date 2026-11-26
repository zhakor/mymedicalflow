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
import { initializeFirestore, type Firestore } from 'firebase/firestore'
import { codiceInChiave, importaChiave } from '../sync/cifratura'
import { ErroreAccesso, ErroreConnessione } from '../sync/contratti'
import { Drive } from '../sync/drive'
import { registroFirestore } from '../sync/firestore'
import { configuraDalDesktop, type EsitoConfigurazione } from '../sync/configurazione'
import { codiceRecupero } from './backupService'
import { storageService } from './storageService'

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

export async function esciGoogle(): Promise<void> {
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
