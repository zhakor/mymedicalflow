import { useEffect, useState } from 'react'
import { CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react'
import { clsx } from 'clsx'
import { AnimatePresence, MotionConfig, motion } from 'motion/react'
import { useOnline } from './dati/hooks'
import { avviaModalitaGoogle, avviaModalitaSimulata, useSincronizzazione, type FaseApp } from './dati/sincronizzazione'
import { ripristinaPosizione, useAvvisi, useNavigazione, type Vista } from './navigazione'
import { Layout, type Scheda } from './componenti/Layout'
import { Home } from './schermate/Home'
import { Agenda } from './schermate/Agenda'
import { Pazienti } from './schermate/Pazienti'
import { Fatture } from './schermate/Fatture'
import { Altro } from './schermate/Altro'
import { Cartella } from './schermate/Cartella'
import { ModuloPaziente } from './schermate/ModuloPaziente'
import { ModuloAppuntamento } from './schermate/ModuloAppuntamento'
import { ModuloFattura } from './schermate/ModuloFattura'
import { Avvio, Errore, Offline } from './schermate/Avvisi'
import { Accesso, CodiceRecupero, LicenzaNonAttiva, SenzaArchivio } from './schermate/Accesso'
import { Sfondo, UI, USCITA } from './componenti/Movimento'

/** `--mode google`: Drive e Firestore veri dopo l'accesso; altrimenti simulati in memoria. */
const GOOGLE = import.meta.env.MODE.startsWith('google')

/**
 * Dopo il ricaricamento per il cambio di tema (`tema.ts`), se i dati non sono
 * ancora pronti, il velo lascia vedere la schermata d'avvio (logo e
 * «Apertura dell'archivio…»): con Drive vero l'apertura richiede alcuni
 * secondi, che sotto un velo vuoto sembrano un'app bloccata. Con i dati già
 * pronti prima, la schermata d'avvio non si vede.
 */
const VELO_IN_AVVIO = 900

/** Esito delle azioni e arrivi dall'altro dispositivo, sopra la barra in basso. */
function Avviso() {
  const avviso = useAvvisi((s) => s.avviso)
  const [visibile, setVisibile] = useState(false)
  useEffect(() => {
    if (!avviso) return
    setVisibile(true)
    const t = setTimeout(() => setVisibile(false), avviso.tipo === 'errore' ? 4000 : 2800)
    return () => clearTimeout(t)
  }, [avviso])
  const Icona = avviso?.tipo === 'errore' ? AlertCircle : avviso?.tipo === 'info' ? RefreshCw : CheckCircle2
  return (
    <AnimatePresence>
      {avviso && visibile && (
        <motion.div
          key={avviso.id}
          role="status"
          initial={{ opacity: 0, y: 16, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1, transition: UI }}
          exit={{ opacity: 0, y: 8, transition: USCITA }}
          className={clsx(
            'fixed left-4 right-4 z-[60] flex items-start gap-2.5 rounded-[20px] px-4 py-3 text-sm backdrop-blur-2xl shadow-[0_16px_40px_-12px_rgb(0_0_0/0.35)] bottom-[calc(var(--barra)+0.75rem)]',
            avviso.tipo === 'errore'
              ? 'bg-red-600/90 text-white'
              : 'bg-gray-900/80 text-white ring-1 ring-white/10 dark:bg-white/85 dark:text-gray-900',
          )}
        >
          <Icona size={18} className="shrink-0 mt-px" />
          <span>{avviso.testo}</span>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function SchermataSovrapposta({ vista }: { vista: Vista }) {
  switch (vista.tipo) {
    case 'cartella':
      return <Cartella id={vista.id} />
    case 'paziente':
      return <ModuloPaziente id={vista.id} />
    case 'appuntamento':
      return <ModuloAppuntamento id={vista.id} data={vista.data} ora={vista.ora} pazienteId={vista.pazienteId} />
    case 'fattura':
      return <ModuloFattura id={vista.id} pazienteId={vista.pazienteId} />
  }
}

export function App() {
  const online = useOnline()
  const { app, errore } = useSincronizzazione()
  const { pila, scheda, vaiA, uscitaAnimata } = useNavigazione()

  useEffect(() => {
    if (online) void (GOOGLE ? avviaModalitaGoogle() : avviaModalitaSimulata())
  }, [online])

  // Riaperta l'app, si torna alla cartella dov'eri appena i dati ci sono
  useEffect(() => {
    if (app === 'pronta') ripristinaPosizione()
  }, [app])

  // Dopo un cambio di tema la pagina riparte sotto il velo (index.html): si
  // toglie a schermata pronta, quando le animazioni d'ingresso sono finite;
  // se l'apertura dell'archivio dura, prima, sulla schermata d'avvio.
  // Errori, accesso e assenza di rete si mostrano subito.
  useEffect(() => {
    const attesa = !online ? 0 : app === 'pronta' ? 450 : app === 'avvio' ? VELO_IN_AVVIO : 0
    const t = setTimeout(() => document.documentElement.classList.remove('velo'), attesa)
    return () => clearTimeout(t)
  }, [online, app])

  return (
    <MotionConfig reducedMotion="user">
      <Sfondo />
      {!online ? (
        <Offline />
      ) : app === 'pronta' ? (
        <Principale scheda={scheda} setScheda={vaiA} pila={pila} uscitaAnimata={uscitaAnimata} />
      ) : (
        <PrimaDeiDati fase={app} errore={errore} />
      )}
    </MotionConfig>
  )
}

function PrimaDeiDati({ fase, errore }: { fase: Exclude<FaseApp, 'pronta'>; errore: string | null }) {
  switch (fase) {
    case 'avvio':
      return <Avvio />
    case 'accesso':
      return <Accesso />
    case 'licenza':
      return <LicenzaNonAttiva />
    case 'senza-archivio':
      return <SenzaArchivio />
    case 'codice':
      return <CodiceRecupero />
    case 'errore':
      return <Errore messaggio={errore} />
  }
}

function Principale({ scheda, setScheda, pila, uscitaAnimata }: { scheda: Scheda; setScheda: (s: Scheda) => void; pila: Vista[]; uscitaAnimata: boolean }) {
  return (
    <>
      <Layout scheda={scheda} onScheda={setScheda}>
        {scheda === 'home' && <Home onScheda={setScheda} />}
        {scheda === 'agenda' && <Agenda />}
        {scheda === 'pazienti' && <Pazienti />}
        {scheda === 'fatture' && <Fatture />}
        {scheda === 'altro' && <Altro />}
      </Layout>
      {/* Ogni schermata aperta sta sopra la precedente: la pila si chiude con "indietro".
          `custom` dice a chi esce se animare: dopo il gesto di Safari sparisce subito. */}
      <AnimatePresence custom={uscitaAnimata}>
        {pila.map((v, i) => (
          <div key={i} className="relative" style={{ zIndex: 30 + i }}>
            <SchermataSovrapposta vista={v} />
          </div>
        ))}
      </AnimatePresence>
      <Avviso />
    </>
  )
}
