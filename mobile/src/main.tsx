import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { ConfineErrori } from './componenti/ErroreApp'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* Qualunque errore di disegno mostra la pagina d'errore, mai lo schermo bianco */}
    <ConfineErrori>
      <App />
    </ConfineErrori>
  </StrictMode>,
)
