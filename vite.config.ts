import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
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
})
