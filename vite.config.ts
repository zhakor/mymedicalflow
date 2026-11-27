import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

/**
 * Senza la configurazione Firebase l'app installata non potrebbe verificare
 * l'abbonamento e non si aprirebbe a nessuno: la build di produzione si ferma
 * invece di produrre un installer che chiude fuori tutti. Valori da
 * `.env.local` (in locale) o dalle variabili d'ambiente (pipeline di rilascio).
 */
const CONFIGURAZIONE_OBBLIGATORIA = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_APP_ID',
]

// https://vitejs.dev/config/
export default defineConfig(({ command, mode }) => {
  if (command === 'build') {
    const env = loadEnv(mode, __dirname, 'VITE_')
    const mancanti = CONFIGURAZIONE_OBBLIGATORIA.filter((k) => !env[k])
    if (mancanti.length > 0) {
      throw new Error(`Build interrotta: manca la configurazione Google/Firebase (${mancanti.join(', ')}). Vedi .env.local o i secrets della pipeline.`)
    }
  }
  return {
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // Permette l'import dei loghi da src-tauri/icons nei componenti React
      '@icons': path.resolve(__dirname, './src-tauri/icons'),
    },
  },
  // Tauri expects a fixed port, disable open
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      ignored: ['**/src-tauri/**'],
    },
  },
  // Evita che Vite oscuri gli errori in sviluppo Tauri
  clearScreen: false,
  // Tauri usa le variabili d'ambiente per la build
  envPrefix: ['VITE_', 'TAURI_'],
  build: {
    // Tauri supporta solo ES modules
    target: process.env.TAURI_PLATFORM === 'windows' ? 'chrome105' : 'safari13',
    minify: !process.env.TAURI_DEBUG ? 'esbuild' : false,
    sourcemap: !!process.env.TAURI_DEBUG,
  },
}
})
