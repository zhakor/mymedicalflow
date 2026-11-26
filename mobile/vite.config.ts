/**
 * App mobile (PWA) di MyMedicalFlow.
 *
 * Usa le dipendenze della radice del repository: tipi, servizi e componenti
 * del desktop vengono importati da `../src` e devono condividere la stessa
 * copia di React.
 *
 * Modalità:
 *   fake        Drive e Firestore simulati in memoria, nessun login (sviluppo)
 *   fake-https  come fake, in HTTPS sulla rete locale per provarla sul telefono:
 *               la WebCrypto funziona solo in un contesto sicuro
 *   google      Drive e Firestore veri, dopo l'accesso con Google. La
 *               configurazione è in `.env.local` nella radice del repository;
 *               Google accetta l'accesso solo da http://localhost:5180 o da un
 *               dominio https registrato, mai da un indirizzo IP
 */

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'
import tailwindcss from 'tailwindcss'
import autoprefixer from 'autoprefixer'
import path from 'path'
import { execSync } from 'child_process'

/** Commit corrente: insieme all'ora di avvio dice quale versione ha davanti il telefono. */
function commitCorrente(): string {
  try {
    return execSync('git rev-parse --short HEAD', { cwd: __dirname }).toString().trim()
  } catch {
    return 'sconosciuto'
  }
}

export default defineConfig(({ mode }) => {
  const https = mode.endsWith('https')
  const avvio = new Date().toLocaleString('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

  return {
    root: __dirname,
    // Le variabili (Firebase, client OAuth) sono condivise col desktop
    envDir: path.resolve(__dirname, '..'),
    define: {
      __VERSIONE_APP__: JSON.stringify(`${commitCorrente()} · ${avvio}`),
    },
    // Cache delle dipendenze separata da quella del desktop: condivisa, i due
    // server di sviluppo si sovrascrivono a vicenda e React finisce in due copie.
    cacheDir: path.resolve(__dirname, '../node_modules/.vite-mobile'),
    plugins: [react(), ...(https ? [basicSsl()] : [])],
    // Preparate all'avvio del server: se Vite le scoprisse al primo caricamento
    // del telefono, ricompilerebbe a pagina aperta lasciandola a metà.
    optimizeDeps: {
      include: ['react', 'react-dom', 'react-dom/client', 'motion/react', 'zustand', 'lucide-react', 'clsx', 'pizzip', 'docxtemplater', 'firebase/app', 'firebase/auth', 'firebase/firestore'],
      esbuildOptions: { target: 'safari15' },
    },
    // JavaScript comprensibile anche dai Safari meno recenti (iOS 15+)
    esbuild: { target: 'safari15' },
    resolve: {
      alias: [
        // I servizi del desktop salvano tramite `./storageService`: sul telefono
        // lo stesso import porta all'archivio in memoria sincronizzato col cloud.
        { find: /^\.\/storageService$/, replacement: path.resolve(__dirname, 'src/dati/archivio.ts') },
        { find: '@desktop', replacement: path.resolve(__dirname, '../src') },
        { find: '@icons', replacement: path.resolve(__dirname, '../src-tauri/icons') },
      ],
    },
    css: {
      postcss: {
        plugins: [tailwindcss({ config: path.resolve(__dirname, 'tailwind.config.js') }), autoprefixer()],
      },
    },
    server: {
      port: 5180,
      strictPort: true,
      host: https ? true : 'localhost',
      // Sul telefono l'aggiornamento automatico non serve, e il suo WebSocket con
      // un certificato di prova viene spesso rifiutato da Safari.
      hmr: https ? false : undefined,
      fs: { allow: [path.resolve(__dirname, '..')] },
    },
    build: {
      target: ['safari15', 'chrome100'],
      outDir: path.resolve(__dirname, 'dist'),
      emptyOutDir: true,
    },
  }
})
