# MyMedicalFlow

Gestionale medico desktop offline per professionisti sanitari.

## Stack

- **Frontend**: React 18 + TypeScript + Vite + Tailwind CSS
- **Desktop**: Tauri 2
- **Stato**: Zustand
- **Persistenza**: localStorage (via `storageService`) — TODO fase 2: SQLite via Tauri

## Prerequisiti

- Node.js >= 18
- Rust + Cargo (https://rustup.rs)
- Tauri CLI: `npm install -g @tauri-apps/cli` oppure usare `npx`

## Comandi di sviluppo

```bash
# Avvio app web (browser, sviluppo rapido senza Tauri)
npm run dev

# Avvio app desktop con Tauri (finestra nativa)
npm run tauri:dev

# Build produzione frontend
npm run build

# Build installer desktop per Windows
npm run tauri:build
```

## Struttura progetto

```
src/
  app/          → App.tsx (router principale, stato avvio)
  components/
    layout/     → SplashScreen, Sidebar, AppLayout
    ui/         → Card, Button, Input, Select, Badge
  lib/          → storageService, profiloService, impostazioniService
  pages/        → SetupPage, DashboardPage, ProfiloPage, ImpostazioniPage, ...
  stores/       → profiloStore, impostazioniStore (Zustand)
  types/        → index.ts (tutti i tipi TypeScript)

src-tauri/
  src/          → main.rs, lib.rs
  icons/        → icone app
  tauri.conf.json
  Cargo.toml
```

## Flusso di avvio

1. SplashScreen (min 900ms)
2. Carica profilo e impostazioni da localStorage
3. Se profilo incompleto → SetupPage
4. Se profilo completo → Dashboard

## TODO futuri

- [ ] Migrare persistenza da localStorage a SQLite via Tauri (tauri-plugin-sql)
- [ ] Modulo Pazienti: CRUD completo
- [ ] Modulo Appuntamenti: calendario
- [ ] Modulo Fatture: generazione da template .docx
- [ ] Firma digitale fatture
- [ ] Export PDF
- [ ] Backup/Restore database locale
- [ ] Auto-aggiornamento app (tauri-plugin-updater)
