import { useEffect, useState } from 'react'
import { useProfiloStore } from '../stores/profiloStore'
import { useImpostazioniStore } from '../stores/impostazioniStore'
import { SplashScreen } from '../components/layout/SplashScreen'
import { AppLayout } from '../components/layout/AppLayout'
import { SetupPage } from '../pages/SetupPage'
import { CopieSetupPage } from '../pages/CopieSetupPage'
import { DashboardPage } from '../pages/DashboardPage'
import { ProfiloPage } from '../pages/ProfiloPage'
import { ImpostazioniPage } from '../pages/ImpostazioniPage'
import { PazientiPage } from '../pages/PazientiPage'
import { AppuntamentiPage } from '../pages/AppuntamentiPage'
import { FatturePage } from '../pages/FatturePage'
import { ErroreAvvio } from '../components/layout/ErroreAvvio'
import { RecuperoChiave } from '../components/layout/RecuperoChiave'
import { AggiornamentoModal } from '../features/updater/AggiornamentoModal'
import { inizializzaStorage } from '../lib/storageService'
import { leggiPreferenze } from '../lib/backupService'
import { chiaveStato } from '../lib/chiaveService'
import { useAggiornamentoStore } from '../stores/aggiornamentoStore'
import { avviaSincronizzazione, leggiLicenza } from '../lib/cloudService'
import { leggiVerifica, motivoBlocco, salvaVerifica, valutaVerifica } from '../lib/abbonamentoService'
import { VerificaAbbonamento } from '../components/layout/VerificaAbbonamento'
import type { StatoAvvio } from '../types'

const isTauri = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
import type { NavRoute } from '../components/layout/Sidebar'

const DURATA_SPLASH_MS = 900

export default function App() {
  const [stato, setStato] = useState<StatoAvvio>('loading')
  const [erroreAvvio, setErroreAvvio] = useState<string | null>(null)
  // Si assume configurato finché non si legge il contrario: un errore di
  // lettura non deve riproporre la configurazione a chi l'ha già fatta.
  const [copieConfigurate, setCopieConfigurate] = useState(true)
  const [activeRoute, setActiveRoute] = useState<NavRoute>('dashboard')
  // Incrementato dopo un recupero riuscito per far ripartire l'avvio da zero.
  const [tentativo, setTentativo] = useState(0)
  // Perché si chiede la verifica dell'abbonamento, se non è quella periodica
  const [motivoAbbonamento, setMotivoAbbonamento] = useState<string | null>(null)

  const { caricaProfilo, isProfiloCompleto } = useProfiloStore()
  const { caricaImpostazioni, applicaTema } = useImpostazioniStore()
  const profilo = useProfiloStore((s) => s.profilo)

  useEffect(() => {
    let annullato = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const inizio = Date.now()

    async function avvia() {
      try {
        // La chiave locale va verificata prima di aprire l'archivio: se DPAPI
        // non riesce a leggerla (altro account o PC) serve il codice di
        // recupero, non un errore generico.
        const statoChiave = await chiaveStato()
        if (annullato) return
        if (statoChiave.tipo === 'richiedeCodiceRecupero') {
          setStato('recupero-chiave')
          return
        }

        await inizializzaStorage()
      } catch (err) {
        if (!annullato) {
          setErroreAvvio(err instanceof Error ? err.message : String(err))
        }
        return
      }
      if (annullato) return

      caricaImpostazioni()
      caricaProfilo()

      // Tema letto dopo il caricamento, non dal valore iniziale dello store
      applicaTema(useImpostazioniStore.getState().impostazioni.tema)

      // Abbonamento (CR §7.2): accesso Google ogni 30 giorni, prima di tutto il resto
      if (isTauri()) {
        const esito = valutaVerifica(leggiVerifica(), Date.now())
        if (esito.tipo !== 'valida') {
          setMotivoAbbonamento(
            esito.tipo === 'scaduta'
              ? `L'abbonamento è scaduto il ${new Date(esito.scadenza).toLocaleDateString('it-IT')}: accedi per controllare il rinnovo.`
              : null,
          )
          setStato('abbonamento')
          return
        }
      }

      const configurate = await leggiPreferenze()
        .then((p) => p.copieConfigurate)
        .catch(() => true)
      if (annullato) return
      setCopieConfigurate(configurate)

      // Splash screen fluido, al netto del tempo già speso ad aprire l'archivio
      const restante = Math.max(0, DURATA_SPLASH_MS - (Date.now() - inizio))
      timer = setTimeout(() => {
        if (annullato) return
        if (!isProfiloCompleto()) setStato('setup')
        else setStato(configurate ? 'ready' : 'copie')
      }, restante)
    }

    void avvia()

    return () => {
      annullato = true
      if (timer !== undefined) clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tentativo])

  // Controllo aggiornamenti: parte solo ad app pronta e non blocca nulla.
  // Se il PC è offline l'errore resta nello store e non viene mostrato.
  const controllaAggiornamenti = useAggiornamentoStore((s) => s.controlla)
  useEffect(() => {
    if (stato !== 'ready') return
    void controllaAggiornamenti()
  }, [stato, controllaAggiornamenti])

  // Sincronizzazione con Drive (CR §5), se configurata: anche lei ad app pronta
  // e senza bloccare nulla. Senza rete le modifiche restano qui e partono dopo.
  useEffect(() => {
    if (stato !== 'ready' || !isTauri()) return
    void avviaSincronizzazione()
  }, [stato])

  // Dentro i 30 giorni, con la rete: la licenza si ricontrolla in silenzio.
  // Se è stata revocata o è scaduta l'app si ferma; senza rete o senza
  // sessione resta valida la verifica salvata.
  useEffect(() => {
    if (stato !== 'ready' || !isTauri()) return
    leggiLicenza()
      .then((licenza) => {
        const blocco = motivoBlocco(licenza, Date.now())
        const salvata = leggiVerifica()
        if (blocco) {
          salvaVerifica(null)
          setMotivoAbbonamento(blocco)
          setStato('abbonamento')
        } else if (salvata && salvata.scadenza !== licenza.scadenza) {
          salvaVerifica({ ...salvata, scadenza: licenza.scadenza })
        }
      })
      .catch(() => {})
  }, [stato])

  // Quando il profilo viene completato dalla SetupPage si prosegue con la
  // configurazione delle copie, se non è ancora stata fatta.
  useEffect(() => {
    if (stato !== 'setup' || !isProfiloCompleto()) return
    const timer = setTimeout(() => setStato(copieConfigurate ? 'ready' : 'copie'), 400)
    return () => clearTimeout(timer)
  }, [profilo, stato, isProfiloCompleto, copieConfigurate])

  // Le uscite condizionali stanno dopo tutti gli hook: anticiparle
  // cambierebbe il numero di hook eseguiti tra un render e l'altro.
  if (erroreAvvio) {
    return <ErroreAvvio messaggio={erroreAvvio} />
  }

  if (stato === 'loading') {
    return <SplashScreen />
  }

  if (stato === 'recupero-chiave') {
    return (
      <RecuperoChiave
        onRecuperato={() => {
          setStato('loading')
          setTentativo((t) => t + 1)
        }}
      />
    )
  }

  if (stato === 'abbonamento') {
    return (
      <VerificaAbbonamento
        motivo={motivoAbbonamento}
        onVerificato={() => {
          setMotivoAbbonamento(null)
          setStato('loading')
          setTentativo((t) => t + 1)
        }}
      />
    )
  }

  if (stato === 'setup') {
    return <SetupPage />
  }

  if (stato === 'copie') {
    return <CopieSetupPage onCompletato={() => setStato('ready')} />
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
    <>
      <AppLayout activeRoute={activeRoute} onNavigate={setActiveRoute}>
        {renderPage()}
      </AppLayout>
      <AggiornamentoModal />
    </>
  )
}
