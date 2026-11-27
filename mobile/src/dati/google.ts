/**
 * Accesso Google del telefono (CR §7.1): Google Identity Services dà il token
 * di Drive (1 ora), lo stesso token apre la sessione Firebase per Firestore.
 *
 * Il token di Drive si chiede con un popup di Google, che i browser lasciano
 * aprire solo dal tocco di un pulsante: per questo la richiesta parte
 * SINCRONA dal clic (`accedi`), con la libreria già caricata (`preparaAccesso`).
 * Rinnovarlo senza tocco non si può: scaduto, l'app chiede di nuovo il tocco.
 *
 * Il token resta in sessionStorage fino alla scadenza: sopravvive al
 * ricaricamento della pagina (cambio di tema) ma non alla chiusura dell'app.
 */

import { initializeApp, type FirebaseApp } from 'firebase/app'
import { GoogleAuthProvider, getAuth, signInWithCredential, signOut, type Auth } from 'firebase/auth'
import { initializeFirestore, type Firestore } from 'firebase/firestore'
import { ErroreAccesso } from '@desktop/sync/contratti'
import { dimenticaChiave } from './chiave'

const DRIVE = 'https://www.googleapis.com/auth/drive.file'
const AMBITI = `openid email profile ${DRIVE}`
const CHIAVE_TOKEN = 'mmf.google'
/** Margine sulla scadenza: un token che scade tra poco non si usa per un caricamento. */
const MARGINE_MS = 2 * 60 * 1000

// ─── Google Identity Services (tipi minimi) ──────────────────────────────────

interface RispostaToken {
  access_token?: string
  expires_in?: number
  error?: string
}

interface ClientToken {
  requestAccessToken(opzioni?: { prompt?: string; login_hint?: string }): void
}

interface Gis {
  accounts: {
    oauth2: {
      initTokenClient(config: {
        client_id: string
        scope: string
        callback: (r: RispostaToken) => void
        error_callback?: (e: { type: string }) => void
      }): ClientToken
      hasGrantedAllScopes(r: RispostaToken, ...ambiti: string[]): boolean
      revoke(token: string, fatto?: () => void): void
    }
  }
}

declare global {
  interface Window {
    google?: Gis
  }
}

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
  firebase = { app, auth: getAuth(app), db: initializeFirestore(app, {}) }
  return firebase
}

export interface Sessione {
  uid: string
  email: string
  db: Firestore
  /** Per l'adattatore Drive: il token valido, oppure `ErroreAccesso`. */
  token: (rinnova?: boolean) => Promise<string>
}

// ─── Token di Drive ──────────────────────────────────────────────────────────

interface TokenSalvato {
  token: string
  scade: number
}

function tokenSalvato(): TokenSalvato | null {
  try {
    const t = JSON.parse(sessionStorage.getItem(CHIAVE_TOKEN) ?? 'null') as TokenSalvato | null
    return t && t.scade - MARGINE_MS > Date.now() ? t : null
  } catch {
    return null
  }
}

function salvaToken(t: TokenSalvato | null): void {
  try {
    if (t) sessionStorage.setItem(CHIAVE_TOKEN, JSON.stringify(t))
    else sessionStorage.removeItem(CHIAVE_TOKEN)
  } catch {
    // Senza sessionStorage il token vale fino al ricaricamento
  }
}

let inMemoria: TokenSalvato | null = null

const tokenValido = (): TokenSalvato | null =>
  inMemoria && inMemoria.scade - MARGINE_MS > Date.now() ? inMemoria : (inMemoria = tokenSalvato())

/**
 * Il token per Drive. Se è scaduto, o Google l'ha rifiutato (`rinnova`), non
 * se ne può avere un altro senza un tocco: `ErroreAccesso`, e l'app torna alla
 * schermata di accesso.
 */
async function tokenDrive(rinnova = false): Promise<string> {
  const t = tokenValido()
  if (t && !rinnova) return t.token
  inMemoria = null
  salvaToken(null)
  throw new ErroreAccesso("L'accesso a Google è scaduto: tocca «Accedi con Google» per continuare.")
}

// ─── Accesso ─────────────────────────────────────────────────────────────────

let gis: Promise<Gis> | null = null

/** Carica la libreria di Google prima del tocco su «Accedi», che deve restare sincrono. */
export function preparaAccesso(): Promise<Gis> {
  gis ??= new Promise<Gis>((risolvi, rifiuta) => {
    if (window.google?.accounts?.oauth2) return risolvi(window.google)
    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.onload = () => (window.google ? risolvi(window.google) : rifiuta(new Error('Libreria Google non disponibile.')))
    script.onerror = () => rifiuta(new Error('Impossibile raggiungere Google: controlla la connessione.'))
    document.head.appendChild(script)
  })
  gis.catch(() => {
    gis = null
  })
  return gis
}

/** L'utente ha chiuso la finestra di Google: non è un errore da mostrare. */
export class AccessoAnnullato extends Error {
  constructor() {
    super('Accesso annullato.')
    this.name = 'AccessoAnnullato'
  }
}

/**
 * Da chiamare DIRETTAMENTE nel gestore del tocco, con `preparaAccesso` già
 * risolta: apre la finestra di Google, poi apre la sessione Firebase.
 */
export function accedi(libreria: Gis, suggerimento?: string): Promise<Sessione> {
  return new Promise<RispostaToken>((risolvi, rifiuta) => {
    const client = libreria.accounts.oauth2.initTokenClient({
      client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID_WEB,
      scope: AMBITI,
      callback: (r) => (r.error ? rifiuta(new Error(`Google ha rifiutato l'accesso (${r.error}).`)) : risolvi(r)),
      error_callback: (e) =>
        rifiuta(
          e.type === 'popup_closed'
            ? new AccessoAnnullato()
            : e.type === 'popup_failed_to_open'
              ? new Error('Il browser ha bloccato la finestra di Google: consenti i popup per questo sito.')
              : new Error(`Accesso non riuscito (${e.type}).`),
        ),
    })
    client.requestAccessToken({ prompt: '', login_hint: suggerimento })
  }).then(async (r) => {
    // Nella finestra di consenso si può togliere la spunta a Drive
    if (!libreria.accounts.oauth2.hasGrantedAllScopes(r, DRIVE)) {
      throw new Error('Serve il permesso per i file di MyMedicalFlow su Google Drive: accedi di nuovo e lascia la spunta.')
    }
    const t = { token: r.access_token!, scade: Date.now() + (r.expires_in ?? 3600) * 1000 }
    inMemoria = t
    salvaToken(t)
    const { auth, db } = avviaFirebase()
    const { user } = await signInWithCredential(auth, GoogleAuthProvider.credential(null, t.token))
    return { uid: user.uid, email: user.email ?? '', db, token: tokenDrive }
  })
}

/**
 * All'apertura dell'app: la sessione di prima, se il token di Drive è ancora
 * valido e Firebase ricorda l'utente. Altrimenti null: serve il tocco.
 */
export async function sessioneRipresa(): Promise<Sessione | null> {
  if (!tokenValido()) return null
  const { auth, db } = avviaFirebase()
  await auth.authStateReady()
  const user = auth.currentUser
  return user ? { uid: user.uid, email: user.email ?? '', db, token: tokenDrive } : null
}

/**
 * Esce dall'account: revoca il token di Drive, chiude la sessione Firebase e
 * toglie dal telefono la chiave dell'archivio (al prossimo accesso servirà di
 * nuovo il codice di recupero).
 */
export async function esci(): Promise<void> {
  const t = tokenValido()
  inMemoria = null
  salvaToken(null)
  if (t) window.google?.accounts.oauth2.revoke(t.token)
  if (firebase) {
    const uid = firebase.auth.currentUser?.uid
    if (uid) await dimenticaChiave(uid)
    await signOut(firebase.auth)
  }
}

/** L'email dell'ultimo accesso, per proporla di nuovo a Google. */
export async function ultimaEmail(): Promise<string | undefined> {
  const { auth } = avviaFirebase()
  await auth.authStateReady()
  return auth.currentUser?.email ?? undefined
}
