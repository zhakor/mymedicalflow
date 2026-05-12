# MyMedicalFlow - [BETA]

Gestionale medico desktop **offline** per professionisti sanitari.

Tutti i dati vengono salvati localmente sul tuo dispositivo. Nessuna connessione internet richiesta.

![MyMedicalFlow](docs/copertina_app.png)

---

## Download

Scarica l'ultima versione dalla pagina [Releases](https://github.com/zhakor/mymedicalflow/releases):

| File | Tipo | Piattaforma |
|---|---|---|
| `MyMedicalFlow_0.1.0_x64_en-US.msi` | Installer MSI | Windows 64-bit |
| `MyMedicalFlow_0.1.0_x64-setup.exe` | Installer NSIS (.exe) | Windows 64-bit |

> Per costruire l'installer localmente vedi la sezione [Build installer](#build-installer).

---

## Funzionalità

- Profilo professionista con partita IVA e foto
- Impostazioni tema chiaro/scuro
- Template fatture `.docx`
- Funzionamento completamente offline

---

## Requisiti

### Windows

| Strumento | Versione minima | Download |
|---|---|---|
| Node.js | 18 | https://nodejs.org |
| Rust + Cargo | stabile | https://rustup.rs |
| Visual Studio Build Tools | 2019+ | https://visualstudio.microsoft.com/visual-cpp-build-tools/ |

> Durante l'installazione di Visual Studio Build Tools seleziona il workload **"Sviluppo di applicazioni desktop con C++"**.

### macOS

| Strumento | Download |
|---|---|
| Node.js ≥ 18 | https://nodejs.org |
| Rust + Cargo | https://rustup.rs |
| Xcode Command Line Tools | `xcode-select --install` |

---

## Installazione

```bash
git clone https://github.com/zhakor/mymedicalflow.git
cd mymedicalflow
npm install
```

---

## Avvio in sviluppo

```bash
# Solo browser
npm run dev

# App desktop con Tauri
npm run tauri:dev
```

---

## Build installer

```bash
npm run tauri:build
```

L'installer viene generato in `src-tauri/target/release/bundle/`.

---

## Stack tecnico

- [Tauri 2](https://tauri.app) — runtime desktop
- [React 18](https://react.dev) + [TypeScript](https://www.typescriptlang.org) — UI
- [Vite](https://vitejs.dev) — build tool
- [Tailwind CSS](https://tailwindcss.com) — stile
- [Zustand](https://zustand-demo.pmnd.rs) — stato
- [Rust](https://www.rust-lang.org) — backend nativo

---

## Template fatture (.docx)

Il template deve essere un file `.docx` (Word) che usa la sintassi `[nome_placeholder]` per i campi variabili.

### Placeholder disponibili

| Placeholder | Contenuto |
|---|---|
| `[genere]` | `o` (maschio) / `a` (femmina) / `*` (altro) |
| `[nome_cognome]` | Nome e cognome del paziente |
| `[cod_fiscale]` | Codice fiscale del paziente |
| `[indirizzo]` | Indirizzo del paziente |
| `[cap]` | CAP del paziente |
| `[citta]` | Città del paziente |
| `[prov]` | Provincia (sigla) del paziente |
| `[data_odierna]` | Data di generazione in formato italiano (es. `4 maggio 2026`) |
| `[numero_fattura]` | Numero fattura |
| `[desc]` | Descrizione della prestazione |
| `[importo]` | Importo in € (es. `120,00`) |
| `[bollo]` | Importo bollo (es. `2,00`, oppure `0,00` se assente) |
| `[num_bollo]` | Numero seriale del bollo (stringa vuota se assente) |
| `[totale_bollo_fattura]` | Importo + bollo (es. `122,00`) |

### Esempio

Nel documento Word scrivi:

```
Fattura n. [numero_fattura] del [data_odierna]

Paziente: [nome_cognome]
Codice fiscale: [cod_fiscale]
Indirizzo: [indirizzo] - [cap] [citta] ([prov])

Prestazione: [desc]

Importo: € [importo]
Bollo: € [bollo]  (n. [num_bollo])
Totale: € [totale_bollo_fattura]
```

I tag non riconosciuti vengono sostituiti con una stringa vuota senza generare errori.

---

## Licenza

[CUSTOM](LICENSE)
