/**
 * Le schermate del primo accesso con Google (CR §9), prima dei dati:
 * accesso, licenza mancante, archivio non ancora configurato dal PC.
 */

import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { KeyRound, LogOut, Monitor, ScanFace, ShieldX } from 'lucide-react'
import { logoBianco, logoBlu } from '@desktop/assets/logos'
import { Centrato } from './Avvisi'
import { AccessoAnnullato, accedi, esci, preparaAccesso, ultimaEmail } from '../dati/google'
import { apriConCodice, avviaModalitaGoogle, chiudiPropostaBlocco, impostaBlocco, sbloccaApp, useSincronizzazione } from '../dati/sincronizzazione'

type Libreria = Awaited<ReturnType<typeof preparaAccesso>>

function Logo() {
  return (
    <>
      <img src={logoBlu} alt="MyMedicalFlow" className="w-32 h-32 object-contain dark:hidden" />
      <img src={logoBianco} alt="MyMedicalFlow" className="w-32 h-32 object-contain hidden dark:block" />
    </>
  )
}

/** Il logo di Google come da linee guida del pulsante «Accedi con Google». */
function LogoGoogle() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  )
}

export function Accesso() {
  const erroreAvvio = useSincronizzazione((s) => s.errore)
  const [libreria, setLibreria] = useState<Libreria | null>(null)
  const [suggerimento, setSuggerimento] = useState<string>()
  const [inCorso, setInCorso] = useState(false)
  const [errore, setErrore] = useState<string | null>(erroreAvvio)

  // La libreria di Google si carica prima: al tocco la finestra deve aprirsi subito
  useEffect(() => {
    preparaAccesso().then(setLibreria, (e: Error) => setErrore(e.message))
    ultimaEmail().then(setSuggerimento, () => {})
  }, [])

  const tocca = () => {
    if (!libreria) return
    setErrore(null)
    setInCorso(true)
    accedi(libreria, suggerimento)
      .then((sessione) => avviaModalitaGoogle(sessione))
      .catch((e: Error) => {
        if (!(e instanceof AccessoAnnullato)) setErrore(e.message)
      })
      .finally(() => setInCorso(false))
  }

  return (
    <Centrato>
      <Logo />
      <h1 className="mt-2 text-xl font-semibold text-gray-900 dark:text-white">Accedi a MyMedicalFlow</h1>
      <p className="mt-2 text-sm text-gray-500">
        Usa lo stesso account Google collegato al PC dello studio. I dati restano cifrati sul tuo Google Drive.
      </p>
      <button
        onClick={tocca}
        disabled={!libreria || inCorso}
        className="tocco mt-6 flex w-full max-w-xs items-center justify-center gap-3 rounded-xl border border-gray-300 bg-white px-5 py-3 font-medium text-gray-800 shadow-sm active:bg-gray-50 disabled:opacity-60 dark:border-white/15 dark:bg-white/[0.08] dark:text-gray-100"
      >
        <LogoGoogle />
        {inCorso ? 'Accesso in corso…' : 'Accedi con Google'}
      </button>
      {errore && (
        <p role="alert" className="mt-4 max-w-xs text-sm text-red-600 dark:text-red-400">
          {errore}
        </p>
      )}
    </Centrato>
  )
}

function Bloccato({ icona, titolo, children }: { icona: ReactNode; titolo: string; children: ReactNode }) {
  const email = useSincronizzazione((s) => s.email)
  const [uscendo, setUscendo] = useState(false)
  const cambiaAccount = () => {
    setUscendo(true)
    esci()
      .catch(() => {})
      .finally(() => useSincronizzazione.setState({ app: 'accesso', email: null, errore: null }))
  }
  return (
    <Centrato>
      <span className="h-16 w-16 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-600 flex items-center justify-center mb-4">
        {icona}
      </span>
      <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{titolo}</h2>
      <div className="mt-2 space-y-2 text-sm text-gray-500">{children}</div>
      {email && <p className="mt-4 text-xs text-gray-400">Account: {email}</p>}
      <button onClick={cambiaAccount} disabled={uscendo} className="btn-secondary tocco mt-5 flex items-center gap-2 py-3">
        <LogOut size={16} /> Usa un altro account
      </button>
    </Centrato>
  )
}

export function LicenzaNonAttiva() {
  return (
    <Bloccato icona={<ShieldX size={30} />} titolo="Licenza non attiva">
      <p>Questo account Google non ha una licenza attiva di MyMedicalFlow, oppure è scaduta.</p>
      <p>Contatta chi ti ha fornito l'app, oppure accedi con l'account dello studio.</p>
    </Bloccato>
  )
}

export function SenzaArchivio() {
  return (
    <Bloccato icona={<Monitor size={30} />} titolo="Configura prima dal PC">
      <p>Su questo Google Drive non c'è ancora l'archivio di MyMedicalFlow.</p>
      <p>
        Sul PC dello studio apri <strong>Impostazioni → App mobile e sincronizzazione</strong> e completa la configurazione,
        poi riapri l'app.
      </p>
    </Bloccato>
  )
}

/**
 * Primo accesso su questo telefono: il codice di recupero dello studio apre
 * l'archivio. Si chiede una volta sola: poi la chiave resta sul telefono.
 */
export function CodiceRecupero() {
  const [codice, setCodice] = useState('')
  const [inCorso, setInCorso] = useState(false)
  const [errore, setErrore] = useState<string | null>(null)

  const apri = (e: FormEvent) => {
    e.preventDefault()
    setErrore(null)
    setInCorso(true)
    apriConCodice(codice)
      .catch((err: Error) => setErrore(err.message))
      .finally(() => setInCorso(false))
  }

  return (
    <Bloccato icona={<KeyRound size={30} />} titolo="Codice di recupero">
      <p>
        L'archivio dello studio è su Drive. Per aprirlo inserisci il codice di recupero: lo trovi sul PC in{' '}
        <strong>Impostazioni → Copie di sicurezza</strong>.
      </p>
      <form onSubmit={apri} className="pt-2 text-left">
        <input
          value={codice}
          onChange={(e) => setCodice(e.target.value)}
          placeholder="XXXX-XXXX-XXXX-…"
          autoCapitalize="characters"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
          aria-label="Codice di recupero"
          className="input-field font-mono text-sm tracking-wide"
        />
        {errore && (
          <p role="alert" className="mt-2 text-sm text-red-600 dark:text-red-400">
            {errore}
          </p>
        )}
        <button
          type="submit"
          disabled={inCorso || codice.trim().length < 10}
          className="tocco mt-3 w-full rounded-xl bg-teal-600 px-5 py-3 font-medium text-white active:bg-teal-700 disabled:opacity-50"
        >
          {inCorso ? "Apertura dell'archivio…" : "Apri l'archivio"}
        </button>
        <p className="mt-2 text-xs text-gray-400">Si chiede una volta sola: poi il telefono lo ricorda in modo protetto.</p>
      </form>
    </Bloccato>
  )
}

const messaggioBlocco = (err: unknown) =>
  err instanceof DOMException && err.name === 'NotAllowedError'
    ? 'Riconoscimento annullato o non riuscito: riprova.'
    : err instanceof Error
      ? err.message
      : String(err)

/** Blocco con Face ID attivo: i dati si mostrano solo dopo il riconoscimento. */
export function AppBloccata() {
  const [inCorso, setInCorso] = useState(false)
  const [errore, setErrore] = useState<string | null>(null)
  const tocca = () => {
    setErrore(null)
    setInCorso(true)
    sbloccaApp()
      .catch((err) => setErrore(messaggioBlocco(err)))
      .finally(() => setInCorso(false))
  }
  return (
    <Bloccato icona={<ScanFace size={30} />} titolo="MyMedicalFlow è bloccata">
      <p>Per vedere i dati dei pazienti conferma che sei tu, con Face ID o il codice del telefono.</p>
      <button
        onClick={tocca}
        disabled={inCorso}
        className="tocco mt-3 w-full rounded-xl bg-teal-600 px-5 py-3 font-medium text-white active:bg-teal-700 disabled:opacity-50"
      >
        {inCorso ? 'Riconoscimento…' : 'Sblocca'}
      </button>
      {errore && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {errore}
        </p>
      )}
    </Bloccato>
  )
}

/** Dopo il primo accesso: proteggere il telefono con Face ID. */
export function ProponiBlocco() {
  const [inCorso, setInCorso] = useState(false)
  const [errore, setErrore] = useState<string | null>(null)
  const attiva = () => {
    setErrore(null)
    setInCorso(true)
    impostaBlocco(true)
      .then(chiudiPropostaBlocco)
      .catch((err) => setErrore(messaggioBlocco(err)))
      .finally(() => setInCorso(false))
  }
  return (
    <Centrato>
      <span className="h-16 w-16 rounded-full bg-teal-100 dark:bg-teal-900/30 text-teal-600 flex items-center justify-center mb-4">
        <ScanFace size={30} />
      </span>
      <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Proteggi l'app con Face ID</h2>
      <p className="mt-2 text-sm text-gray-500">
        Se qualcuno prende in mano il telefono sbloccato non vedrà i dati dei pazienti: l'app chiederà Face ID (o il codice del
        telefono) all'apertura e dopo 5 minuti in secondo piano.
      </p>
      <button
        onClick={attiva}
        disabled={inCorso}
        className="tocco mt-6 w-full max-w-xs rounded-xl bg-teal-600 px-5 py-3 font-medium text-white active:bg-teal-700 disabled:opacity-50"
      >
        {inCorso ? 'Attivazione…' : 'Attiva'}
      </button>
      <button onClick={chiudiPropostaBlocco} disabled={inCorso} className="btn-secondary tocco mt-3 w-full max-w-xs py-3">
        Non ora
      </button>
      {errore && (
        <p role="alert" className="mt-4 max-w-xs text-sm text-red-600 dark:text-red-400">
          {errore}
        </p>
      )}
      <p className="mt-4 max-w-xs text-xs text-gray-400">Si può attivare o togliere quando vuoi da Impostazioni.</p>
    </Centrato>
  )
}

