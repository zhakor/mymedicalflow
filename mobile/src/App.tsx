import { useEffect, useState } from 'react'
import { CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react'
import { clsx } from 'clsx'
import { AnimatePresence, MotionConfig, motion } from 'motion/react'
import { impostazioniService } from '@desktop/lib/impostazioniService'
import { useDati, useOnline } from './dati/hooks'
import { avviaModalitaSimulata, useSincronizzazione } from './dati/sincronizzazione'
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
import { Avvio, Errore, Offline } from './schermate/Avvisi'
import { Sfondo, UI, USCITA } from './componenti/Movimento'

/** Il tema è un'impostazione dell'archivio: segue anche le modifiche fatte sul PC. */
function useTema(): void {
  const versione = useDati()
  useEffect(() => {
    document.documentElement.classList.toggle('dark', impostazioniService.get().tema === 'dark')
  }, [versione])
}

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
  }
}

export function App() {
  const online = useOnline()
  const { app, errore } = useSincronizzazione()
  const { pila, scheda, vaiA, uscitaAnimata } = useNavigazione()
  useTema()

  useEffect(() => {
    if (online) void avviaModalitaSimulata()
  }, [online])

  // Riaperta l'app, si torna alla cartella dov'eri appena i dati ci sono
  useEffect(() => {
    if (app === 'pronta') ripristinaPosizione()
  }, [app])

  return (
    <MotionConfig reducedMotion="user">
      <Sfondo />
      {!online ? <Offline /> : app === 'avvio' ? <Avvio /> : app === 'errore' ? <Errore messaggio={errore} /> : <Principale scheda={scheda} setScheda={vaiA} pila={pila} uscitaAnimata={uscitaAnimata} />}
    </MotionConfig>
  )
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
