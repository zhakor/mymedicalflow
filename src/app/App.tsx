import { useEffect, useState } from 'react'
import { useProfiloStore } from '../stores/profiloStore'
import { useImpostazioniStore } from '../stores/impostazioniStore'
import { SplashScreen } from '../components/layout/SplashScreen'
import { AppLayout } from '../components/layout/AppLayout'
import { SetupPage } from '../pages/SetupPage'
import { DashboardPage } from '../pages/DashboardPage'
import { ProfiloPage } from '../pages/ProfiloPage'
import { ImpostazioniPage } from '../pages/ImpostazioniPage'
import { PazientiPage } from '../pages/PazientiPage'
import { AppuntamentiPage } from '../pages/AppuntamentiPage'
import { FatturePage } from '../pages/FatturePage'
import type { StatoAvvio } from '../types'
import type { NavRoute } from '../components/layout/Sidebar'

export default function App() {
  const [stato, setStato] = useState<StatoAvvio>('loading')
  const [activeRoute, setActiveRoute] = useState<NavRoute>('dashboard')

  const { caricaProfilo, isProfiloCompleto } = useProfiloStore()
  const { caricaImpostazioni, impostazioni, applicaTema } = useImpostazioniStore()

  useEffect(() => {
    // Carica dati da localStorage
    caricaImpostazioni()
    caricaProfilo()

    // Applica il tema salvato immediatamente
    const saved = impostazioni
    applicaTema(saved.tema)

    // Breve splash screen fluido (minimo 800ms per UX)
    const timer = setTimeout(() => {
      if (isProfiloCompleto()) {
        setStato('ready')
      } else {
        setStato('setup')
      }
    }, 900)

    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Quando il profilo viene completato dalla SetupPage, passa a ready
  const profilo = useProfiloStore((s) => s.profilo)
  useEffect(() => {
    if (stato === 'setup' && isProfiloCompleto()) {
      // Breve transizione dopo il salvataggio
      setTimeout(() => setStato('ready'), 400)
    }
  }, [profilo, stato, isProfiloCompleto])

  if (stato === 'loading') {
    return <SplashScreen />
  }

  if (stato === 'setup') {
    return <SetupPage />
  }

  function renderPage() {
    switch (activeRoute) {
      case 'dashboard':
        return <DashboardPage />
      case 'pazienti':
        return <PazientiPage />
      case 'appuntamenti':
        return <AppuntamentiPage />
      case 'fatture':
        return <FatturePage />
      case 'impostazioni':
        return <ImpostazioniPage />
      case 'profilo':
        return <ProfiloPage />
      default:
        return <DashboardPage />
    }
  }

  return (
    <AppLayout activeRoute={activeRoute} onNavigate={setActiveRoute}>
      {renderPage()}
    </AppLayout>
  )
}
