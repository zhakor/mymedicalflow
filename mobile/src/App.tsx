import { useEffect, useState } from 'react'
import { CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react'
import { clsx } from 'clsx'
import { AnimatePresence, MotionConfig, motion } from 'motion/react'
import { impostazioniService } from '@desktop/lib/impostazioniService'
import { useDati, useOnline } from './dati/hooks'
import { leggiArchivio } from './dati/archivio'
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

/** Colore di fondo dell'app (--fondo-app in index.css): testata, barra di stato e documento. */
const COLORE_TESTATA = { chiaro: '#eef4f4', scuro: '#050a0b' }

/** Il tema è un'impostazione dell'archivio: segue anche le modifiche fatte sul PC. */
function useTema(): void {
  const versione = useDati()
  useEffect(() => {
    // Finché l'archivio non è arrivato vale il tema applicato da index.html:
    // il predefinito delle impostazioni farebbe lampeggiare il tema sbagliato.
    if (leggiArchivio().impostazioni === undefined) return
    const scuro = impostazioniService.get().tema === 'dark'
    const cambiato = document.documentElement.classList.contains('dark') !== scuro
    document.documentElement.classList.toggle('dark', scuro)
    let ricordato = false
    try {
      localStorage.setItem('mmf.mobile.tema', scuro ? 'dark' : 'light')
      ricordato = localStorage.getItem('mmf.mobile.tema') === (scuro ? 'dark' : 'light')
    } catch {
      // Senza spazio si riparte dal chiaro: nient'altro cambia
    }
    // Safari (iOS 26) colora la zona dell'isola solo all'apertura della pagina:
    // cambiato il tema, si ricarica perché la riprenda. Solo col tema ricordato
    // (al riavvio coincide e non si ricarica più) e a modifica arrivata sul cloud.
    if (cambiato && ricordato) ricaricaASalvataggioFinito()
    // La zona dell'isola resta in continuità con la testata, in chiaro e in scuro.
    // Un tag nuovo al posto del vecchio: Safari non sempre segue la sola modifica.
    const colore = scuro ? COLORE_TESTATA.scuro : COLORE_TESTATA.chiaro
    const vecchio = document.querySelector('meta[name="theme-color"]')
    if (vecchio?.getAttribute('content') === colore) return
    const nuovo = document.createElement('meta')
    nuovo.name = 'theme-color'
    nuovo.content = colore
    if (vecchio) vecchio.replaceWith(nuovo)
    else document.head.appendChild(nuovo)
  }, [versione])
}

/** Durata della dissolvenza del velo (#velo in index.html). */
const DISSOLVENZA_VELO = 280

/**
 * Ricarica quando la sincronizzazione è ferma e allineata: un salvataggio in
 * corso (parte 300 ms dopo la modifica) andrebbe perso. Con errore od offline
 * non ricarica: il tema vale già, resta solo la zona dell'isola fino alla
 * prossima apertura.
 *
 * Tutto avviene sotto il velo nel colore del nuovo tema: la schermata ci sfuma
 * dentro, si ricarica, e ne riemerge a dati pronti (vedi App).
 */
function ricaricaASalvataggioFinito(): void {
  const inizio = Date.now()
  document.documentElement.classList.add('velo')
  // Un giro dopo, quando la modifica ha già segnato "in corso"
  setTimeout(() => {
    const valuta = (sync: string): boolean => {
      if (sync === 'in-corso') return false
      if (sync === 'allineato') {
        try {
          // Il velo resta anche sulla pagina ricaricata, dal primo disegno
          sessionStorage.setItem('mmf.velo', '1')
        } catch {
          // Senza: si ricarica comunque, solo senza velo all'avvio
        }
        // Solo a velo del tutto coprente
        setTimeout(() => location.reload(), Math.max(0, DISSOLVENZA_VELO - (Date.now() - inizio)))
      } else {
        document.documentElement.classList.remove('velo')
      }
      return true
    }
    if (valuta(useSincronizzazione.getState().sync)) return
    const smetti = useSincronizzazione.subscribe((s) => {
      if (valuta(s.sync)) smetti()
    })
  }, 0)
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

  // Dopo un cambio di tema la pagina riparte sotto il velo (index.html): si
  // toglie a schermata pronta, quando le animazioni d'ingresso sono finite.
  // Errori e assenza di rete si mostrano subito.
  useEffect(() => {
    if (online && app === 'avvio') return
    const t = setTimeout(() => document.documentElement.classList.remove('velo'), online && app === 'pronta' ? 450 : 0)
    return () => clearTimeout(t)
  }, [online, app])

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
