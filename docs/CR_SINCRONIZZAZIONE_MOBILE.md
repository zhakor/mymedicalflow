# CR — Archivio condiviso su Google Drive e app mobile (PWA)

Stato: **bozza** (25/11/2026). Decisioni in §11: al momento nessuna è aperta.

Base di partenza: `ARCHITETTURA_DRIVE_STORAGE.md` di Dojo Manager. Questa CR riprende login senza server, marcatori, `ensureByMarker` e prove sul campo, ma **non** il modello "un JSON in chiaro per record": i dati restano nell'archivio cifrato che l'app usa già.

---

## 1. Obiettivi

1. Il desktop continua a funzionare offline. La sincronizzazione con Drive è **facoltativa** e serve solo a chi usa anche il mobile.
2. Un'app mobile **PWA** (iOS e Android) con le stesse funzioni del desktop **tranne il Sistema TS**. Funziona solo online: senza rete l'accesso è bloccato.
3. Un **unico archivio cifrato** su Drive, letto e scritto da entrambe le app. Una modifica su un dispositivo compare sull'altro in tempo reale.
4. Prima di ogni scrittura si controlla che l'archivio di partenza sia ancora quello aggiornato. Se lo stesso dato è stato modificato altrove, si avvisa l'utente e gli si chiede se sovrascrivere.
5. **Accesso su licenza**: login Google obbligatorio su desktop e mobile, consentito solo alle email autorizzate dal titolare.
6. Le copie `.mmfbak` restano il formato di backup e di recupero. Il desktop le carica anche su Drive e il mobile può ripristinarle, ma non ne crea.

## 2. Vincoli emersi dall'analisi

| Fatto | Fonte | Conseguenza |
|---|---|---|
| L'archivio è una mappa `chiave → JSON` cifrata con AES-256-GCM: `MMF2` + versione + nonce di 12 byte + testo cifrato con tag, senza AAD | `crypto.rs`, `secure_store.rs` | Il file che il desktop salva è **identico byte per byte** a una copia `.mmfbak`. La WebCrypto del browser sa leggerlo e scriverlo con la stessa chiave |
| La chiave è il codice di recupero (52 caratteri base32) | `crypto.rs` | Il mobile si collega all'archivio quando l'utente inserisce il codice una volta |
| I servizi sono sincroni e riscrivono l'intero array a ogni modifica | `pazienteService.ts` e simili | La sincronizzazione si aggancia sotto `storageService`, senza toccare i servizi |
| Chiavi dell'archivio: `pazienti`, `appuntamenti`, `fatture`, `servizi`, `trasmissioniTs` (array con `id` e `updatedAt`), `profilo`, `impostazioni` (oggetti singoli) | `src/lib/*Service.ts` | Unità di confronto per i conflitti: il singolo record |
| La cancellazione elimina il record, non lo marca | servizi | Le cancellazioni si riconoscono confrontando con lo stato base (§5.3), senza modificare i servizi |
| Il numero fattura `N/AAAA` è calcolato in locale | `fatturaService.ts:128` | La numerazione è un'operazione delicata: va confermata dal cloud (§6) |
| Il template `.docx` è salvato in base64 dentro `impostazioni` | `documentService.ts`, `types/index.ts` | Va spostato su Drive in chiaro, nell'archivio restano solo i metadati |
| Credenziali del Sistema TS nel portachiavi del sistema operativo | `credenziali.rs` | Non entrano nell'archivio: nessuna modifica |
| La CSP di Tauri permette solo `connect-src 'self' ipc:` | `tauri.conf.json` | Vanno aggiunti i domini di Google e Firebase |

## 3. Notifiche in tempo reale: perché Firebase

**Drive ha un'API di notifica**: `changes.watch` e `files.watch`, cioè canali push. Però:
- Drive invia la notifica a un **indirizzo HTTPS con certificato valido**, quindi serve un server sempre raggiungibile. Né il desktop né una PWA possono riceverla direttamente.
- I canali scadono (al massimo 1 giorno per i file, 1 settimana per `changes`), non si rinnovano da soli e la notifica non contiene i dettagli: dopo bisogna comunque interrogare `changes.list`.
- L'alternativa, la Workspace Events API, consegna gli eventi su Cloud Pub/Sub, che richiede un progetto con fatturazione e un consumatore lato server.

**Soluzione scelta: Firestore (piano gratuito Spark) come registro della versione corrente.**
- Firestore contiene **solo un puntatore** (`revisione`, `fileId` su Drive, dispositivo, data). Nessun dato sanitario esce da Drive.
- I client restano in ascolto del documento con `onSnapshot`: la notifica arriva entro un secondo, senza server e senza Cloud Functions (che sul piano gratuito non ci sono).
- Le **transazioni** di Firestore sono atomiche: offrono la scrittura condizionale che Drive v3 non ha (vedi §6.4 del documento Dojo).
- Stessa autenticazione Google: Firebase Auth riceve le credenziali ottenute dal nostro login (`signInWithCredential`).

Quote gratuite verificate: 50.000 letture e 20.000 scritture di documenti al giorno. Consumi misurati e regole per restare nel piano gratuito: §12.

## 4. Modello dati

### 4.1 Drive (account Google del professionista)

```text
Il mio Drive/
└── MyMedicalFlow/                         { mmf_type: root, mmf_instance: <uuid> }
    ├── archivio/                          { mmf_type: folder, mmf_key: archivio }
    │   └── archivio-<rev>-<uuid>.mmfbak   { mmf_type: archivio, mmf_rev, mmf_instance }
    ├── copie/                             copie .mmfbak caricate dal desktop (rotazione 10)
    └── template/
        └── template-fattura.docx          IN CHIARO, come richiesto
```

- **Copia su scrittura**: ogni salvataggio crea un **nuovo** file di archivio e solo dopo sposta il puntatore su Firestore. Un archivio pubblicato non viene mai sovrascritto, per cui chi legge non trova mai un file scritto a metà. Gli ultimi N file (proposta: 20) restano come cronologia, i più vecchi vanno nel cestino.
- Ogni file di archivio è una `.mmfbak` valida: si può scaricare e ripristinare con la procedura che esiste già.

### 4.2 Firestore

```text
archivi/{uid}          { puntatore: { revisione, fileId, dispositivo, aggiornatoIl } }
licenze/{email}        { attiva, scadenza?, note? }
```

Regole di sicurezza:
- `archivi/{uid}`: lettura e scrittura consentite solo se `request.auth.uid == uid` **e** la licenza dell'email è attiva. Il controllo della licenza avviene quindi anche sul server di Google, non solo nel client.
- `licenze/{email}`: lettura consentita solo per la propria email, nessuna scrittura dai client. Il titolare gestisce le licenze dalla console di Firebase.

## 5. Sincronizzazione

### 5.1 Stati locali

Ogni dispositivo conserva tre cose:
- `base`: l'ultimo archivio scaricato o pubblicato, con la sua `revisione`;
- `locale`: l'archivio attuale (la `cache` di `storageService`);
- `remota`: la revisione indicata dal puntatore Firestore, aggiornata in tempo reale.

Sul desktop la `base` è salvata cifrata accanto ad `archivio.dat`, così sopravvive a riavvii e periodi offline. Sul mobile resta in memoria, perché il mobile è sempre online.

### 5.2 Ciclo di scrittura

```text
dopo ogni modifica locale (raggruppate in ~300 ms):
  1. se remota > base: scarica la remota e fondila (§5.3); in caso di conflitto chiedi all'utente
  2. cifra `locale` e caricalo come NUOVO file archivio-<base+1>-<uuid>.mmfbak
  3. transazione Firestore: se revisione == base → revisione = base+1, fileId = nuovo
  4a. riuscita  → base = locale, revisione = base+1; elimina i file di archivio oltre gli N più recenti
  4b. fallita (nel frattempo ha scritto un altro dispositivo) → manda nel cestino il file orfano e torna al punto 1
```

Alla ricezione di un nuovo puntatore: se non ci sono modifiche locali in sospeso si scarica e si sostituisce l'archivio. Altrimenti si fa la fusione.

### 5.3 Fusione a tre vie per record

Per ogni chiave array si confrontano i record per `id`, rispetto alla `base`:

| Locale | Remoto | Esito |
|---|---|---|
| uguale alla base | modificato, aggiunto o eliminato | si prende il remoto |
| modificato, aggiunto o eliminato | uguale alla base | si prende il locale |
| modificato | modificato in modo identico | nessun conflitto |
| modificato o eliminato | modificato o eliminato in modo diverso | **conflitto** |

`profilo` e `impostazioni` sono trattati come un solo record ciascuno.

**Conflitto**: un avviso del tipo «Il paziente Rossi Mario è stato modificato sull'altro dispositivo alle 10:32», con due scelte, *Sovrascrivi con la mia modifica* oppure *Tieni quella dell'altro dispositivo*. Si sovrascrive **solo quel record**, mai l'intero archivio.

`✶` Con questo schema non servono `revision` per record né cancellazioni logiche: le informazioni vengono dalla `base`.

### 5.4 Desktop offline

Le modifiche si accumulano nell'archivio `locale` (la "coda" è la differenza fra `locale` e `base`). Al ritorno della rete il ciclo §5.2 parte da solo, con fusione ed eventuali conflitti. Offline il PC non numera le fatture: le salva come bozze (§6.2).

### 5.5 Mobile

Il mobile funziona solo online. Se la rete o Firestore non sono raggiungibili compare una schermata di blocco «Connessione necessaria» e i dati non vengono mostrati.

## 6. Operazioni delicate

Sono le operazioni in cui un dato non aggiornato produce un errore che non si corregge dopo:
- **creazione di una fattura** (numero progressivo);
- eliminazione di fatture e pazienti;
- ripristino di una copia.

Procedura generale: prima dell'operazione si **sincronizza in modo bloccante** rileggendo il documento Firestore (`allineaPerOperazioneDelicata`). Dopo il salvataggio si attende la pubblicazione e **solo allora** si genera il `.docx`.

### 6.1 Fatturazione da più dispositivi (D2, rivista il 26/11/2026)

La numerazione è una sola serie `NUM/ANNO`, ma **nessun dispositivo blocca l'altro**: online desktop e telefono fatturano quando vogliono, anche insieme. Il turno di fatturazione (un dispositivo alla volta) è stato tolto. Codice: `src/sync/fatturazione.ts`.

| Situazione | Desktop | Telefono |
|---|---|---|
| Entrambi online, anche aperti insieme | fattura | fattura |
| PC offline | salva una **bozza** (§6.2) | fattura |
| PC chiuso | — | fattura |
| Telefono offline | fattura | bloccato come tutta l'app (§5.5) |

Come restano unici i numeri (ogni regola è coperta da un test):
- Prima di calcolare il numero si **scarica l'ultima versione** dal cloud (`allineaPerOperazioneDelicata`): il PC che fattura subito dopo il telefono vede già la sua fattura.
- Subito dopo il salvataggio la fattura si **pubblica**, con la transazione condizionata alla revisione (§5.2).
- **Priorità in caso di numero doppio**: se due dispositivi calcolano lo stesso numero nello stesso istante, lo tiene la fattura **pubblicata per prima**. L'altra prende il primo numero libero (`rinumeraFattureDuplicate`) **prima di essere mostrata**: `usa` termina solo a pubblicazione avvenuta, quindi un numero già mostrato non cambia mai e il `.docx` si genera col numero definitivo.
- Offline non si numera: niente numeri doppi da fatture emesse senza vedere quelle dell'altro dispositivo.
- Unico caso residuo: la rete cade proprio fra il salvataggio e la pubblicazione. La fattura resta in coda; se nel frattempo l'altro dispositivo ha usato quel numero, al ritorno della rete passa al primo numero libero e il motore lo segnala (`rinumerate` in `onEsito`) perché il documento va rifatto.
- Il numero si calcola al momento del **salvataggio**, non all'apertura del modulo: va adeguato `FatturaModal` (Fase 2).

Perché le bozze e non «numero subito anche offline»: con due dispositivi che numerano senza vedersi, nessuna regola di priorità mantiene il registro in ordine. Chi perde il numero finisce in coda, con una data che non torna rispetto ai numeri vicini, e il documento magari già consegnato va rifatto.

### 6.2 Bozze "da numerare" (D5)

Il PC offline non può sapere se intanto il telefono ha fatturato, quindi **non numera**: la fattura si compila e si salva come bozza. Codice: `src/sync/bozze.ts` e opzione `bozze` di `Fatturazione`.

- Il tentativo di emettere offline solleva `FatturazioneOffline` con il messaggio: «Per numerare la fattura serve la connessione: collega il PC a internet, anche tramite l'hotspot del telefono. Intanto puoi salvarla come bozza: verrà numerata appena torna la connessione.»
- **Il pulsante «Salva come bozza» esiste solo offline.** Online la fattura si emette normalmente e la bozza non compare.
- Alla prima notifica Firestore dopo la riconnessione il PC scarica l'archivio dal cloud e numera le bozze in ordine di creazione, dopo l'ultima fattura emessa (anche dal telefono). Poi pubblica e genera i `.docx`.
- Se una fattura del telefono ha una data più recente della bozza, la bozza prende la data di numerazione, così numeri e date restano in ordine. L'utente viene avvisato (`dataSpostata`).
- Se il telefono fattura proprio mentre il PC numera le bozze, vale la priorità del §6.1: numeri unici e consecutivi in ogni caso (test dedicato).

Da fare in Fase 2: campo `bozza?: boolean` nel tipo `Invoice`; pulsante nel modulo fattura; elenco con l'etichetta «Bozza – in attesa di numerazione»; sul telefono le bozze del PC sono in sola lettura; avviso con i numeri assegnati alla riconnessione.

## 7. Accesso e licenze

### 7.1 Login Google

| | Desktop (Tauri) | Mobile (PWA) |
|---|---|---|
| Flusso | Browser di sistema + redirect su loopback `127.0.0.1` + PKCE. Google blocca il login nelle WebView incorporate | Reindirizzamento implicito, come in Dojo |
| Client OAuth | "App desktop" | "Applicazione web" |
| Token | Refresh token nel portachiavi del sistema operativo | Access token di 1 ora + rinnovo silenzioso |
| Firebase | `signInWithCredential` con l'id token di Google | Stesso |

In stato **Test** Google emette refresh token che **scadono dopo 7 giorni**: sul desktop il login va ripetuto una volta a settimana (si apre il browser, un clic). È il prezzo della gratuità con l'ambito `drive`.

Ambito: `drive`, come Dojo. Con le licenze su Firestore basterebbe `drive.file`, più sicuro (l'app vede solo i propri file e non tutto il Drive): da confermare con la prova P2 (§11 D1).

### 7.2 Licenze

Le barriere, in ordine:
1. **Utenti di test** di Google Cloud (massimo 100): chi non è in elenco non riesce nemmeno ad accedere. È gratuito e applicato da Google.
2. **Elenco licenze** gestito dal titolare: permette di revocare un accesso o impostare una scadenza senza toccare la console di Google Cloud.
3. Le regole Firestore negano la sincronizzazione a chi non ha una licenza attiva.

Il desktop senza rete verifica la licenza dall'ultima risposta salvata, valida per 14 giorni (§11 D3).

Limite onesto: un controllo nel client si può aggirare modificando l'eseguibile. Le barriere 1 e 3 però stanno sui server di Google, quindi un `.exe` copiato non dà accesso a Drive né alla sincronizzazione senza un'email autorizzata.

## 8. Configurazione iniziale dal desktop

Una nuova voce in Impostazioni, «App mobile e sincronizzazione»:

1. **Login Google** (già fatto per la licenza).
2. **Ricerca** di una radice esistente per marcatore:
   - nessuna radice → configurazione nuova;
   - radice con lo stesso `instanceId` dell'installazione → ricollegamento;
   - radice di un'altra installazione → l'utente sceglie: *usa l'archivio su Drive* (chiede il codice di recupero e sostituisce quello locale dopo una conferma) oppure *annulla*.
3. **Creazione** di cartelle e file con `ensureByMarker` (operazione ripetibile).
4. **Caricamento iniziale**:
   - l'archivio locale come revisione 1;
   - il template `.docx` estratto da `impostazioni`, in chiaro in `template/`;
   - le copie locali più recenti in `copie/`;
   - il puntatore su Firestore.
5. **Verifica**: si riscarica l'archivio, lo si decifra e lo si confronta. Solo dopo la configurazione è segnata come completata.
6. **Istruzioni per il mobile**: indirizzo della PWA (anche come QR) e promemoria del codice di recupero.

Disattivazione: si interrompe la sincronizzazione e i dati locali restano. Drive non viene toccato, salvo una richiesta esplicita.

## 9. App mobile

- Cartella `mobile/` nello stesso repository: Vite + React + Tailwind.
- **Riuso diretto** dal desktop, senza ristrutturarlo: `src/types`, i servizi puri di `src/lib`, le validazioni, `src/assets/logos.ts`, i colori della configurazione Tailwind. Gli import passano da un alias verso `../src`.
- **Componenti propri per il telefono**, con la stessa identità (colori, etichette, icone lucide, loghi):
  - barra di navigazione in basso invece della sidebar;
  - schede al posto delle tabelle;
  - agenda in vista giornaliera o settimanale;
  - finestre modali a schermo intero (bottom sheet).
- **Funzioni**: profilo, pazienti e cartella, agenda e appuntamenti con giorno fisso, presenze, fatture con generazione del `.docx` (condivisione o download dal telefono), servizi, impostazioni, ripristino di una copia da `copie/`. **Escluso**: Sistema TS.
- Primo accesso: login → licenza → ricerca della radice (se manca: «configura prima dal desktop») → codice di recupero → verifica di decifratura → chiave salvata in IndexedDB come `CryptoKey` non esportabile.
- Hosting statico con le intestazioni e la CSP della §10 del documento Dojo, più i domini di Firebase.

## 10. Fasi

| Fase | Contenuto | Serve Google/Firebase reale? | Criterio di chiusura |
|---|---|---|---|
| **1. Nucleo** | Cifratura WebCrypto compatibile con `MMF2`; fusione a tre vie; ciclo §5.2 con Drive e Firestore simulati in memoria; Vitest | No | Test verdi su: archivio Rust decifrato in TS e viceversa, conflitti, cancellazioni, transazione persa, file orfano, rinumerazione fattura |
| **2. Desktop** | Login loopback + portachiavi; gate licenza; motore di sincronizzazione sotto `storageService`; finestra conflitti; procedura §8; template su Drive; caricamento copie; CSP | Sì per le prove | Con il Drive simulato: due "dispositivi" convergono |
| **3. Mobile** | `mobile/` PWA, layout e componenti mobili, blocco offline, ripristino da `copie/` | Sì per le prove | Flusso completo in modalità simulata |
| **4. Configurazione** | Progetto Google Cloud (Drive API, consenso in Test, client desktop e web), progetto Firebase (Auth Google, Firestore, regole), hosting | Sì | Login riuscito sulle due app |
| **5. Prove sul campo** | P1 login e rinnovo su Windows, iPhone, Android · P2 modifica dal desktop visibile sul telefono in meno di 2 s · P3 conflitto sullo stesso paziente · P4 desktop offline con modifiche e poi riconnessione · P5 due fatture create insieme · P6 licenza revocata · P7 ripristino di una copia dal telefono | Sì | Esito scritto con data e dispositivo |

La Fase 1 può partire subito, senza i dati di Google e Firebase.

### Stato della Fase 1 (25/11/2026): completata

Il codice è in `src/sync/` e i test si lanciano con `npm test` (32 test, Vitest):

| File | Contenuto |
|---|---|
| `cifratura.ts` | Codice di recupero ↔ chiave e formato `MMF2` con WebCrypto. Verificato in entrambe le direzioni: TypeScript legge un file cifrato da Rust e `crypto.rs::legge_un_archivio_cifrato_dalla_webcrypto` legge un file cifrato da TypeScript |
| `fusione.ts` | Fusione a tre vie per record e rinumerazione delle fatture con numero doppio |
| `contratti.ts` | Interfacce `DepositoFile` (Drive) e `Registro` (Firestore) |
| `motore.ts` | Ciclo §5.2, con collegamento, prima pubblicazione, ascolto delle notifiche e operazioni delicate |
| `memoria.ts` | Drive e Firestore in memoria, con rete spegnibile e risposta della transazione persa |

Aggiunto il 25/11/2026: `turno.ts` (§6.1), `bozze.ts` (§6.2), un unico ascolto condiviso da motore e turno, e la misura dei consumi Firestore nel simulatore (49 test).

Cambiato il 26/11/2026: il turno è sostituito da `fatturazione.ts`. Desktop e telefono fatturano insieme senza bloccarsi, il PC offline salva bozze, e sul numero doppio vince la fattura pubblicata per prima (46 test).

Per la Fase 2 restano:
- l'eliminazione dei file di archivio più vecchi delle ultime N revisioni, compito dell'adattatore Drive;
- il raggruppamento dei salvataggi ravvicinati (~300 ms) prima di avviare un ciclo;
- la persistenza della `base` sul desktop.

## 11. Decisioni

Prese il 25/11/2026:
- **D1 — Elenco licenze su Firestore** `licenze/{email}`. Ogni utente legge solo la propria voce, il titolare la gestisce dalla console di Firebase. Questo rende possibile l'ambito `drive.file`, da confermare con la prova P2.
- **D3 — Licenza sul desktop offline valida 14 giorni** dall'ultima verifica riuscita.
- **D4 — Login Google obbligatorio per tutti** al primo avvio dopo l'aggiornamento, anche per chi non usa il mobile. Prima del rilascio le licenze delle utenti attuali vanno create su Firestore.

- **D2 — Fatturazione da più dispositivi** (§6.1), rivista il 26/11/2026: una sola serie `NUM/ANNO` (requisito); desktop e telefono online fatturano insieme senza bloccarsi; sul numero doppio vince la fattura pubblicata per prima, l'altra viene rinumerata prima di essere mostrata. Il PC offline salva bozze. Sostituisce il turno di fatturazione del 25/11.

- **D5 — PC offline:** la fatturazione attende la connessione, il messaggio suggerisce l'hotspot del telefono e nel frattempo si può salvare una bozza «da numerare», disponibile solo offline (§6.2). Dal 26/11/2026 vale per ogni PC offline, non solo per quello avviato offline.

## 12. Consumi Firestore, velocità e privacy

### Consumi misurati (simulatore che conta come Firestore, test in `fatturazione.test.ts`)

| Operazione | Scritture | Letture |
|---|---|---|
| Sincronizzazione senza modifiche (ritorno in primo piano, controllo) | 0 | 0 |
| Un salvataggio dal desktop con il telefono collegato | 1 | 3 (transazione + 1 notifica per dispositivo) |
| Una fattura (da qualunque dispositivo, con l'altro collegato) | 1 | 4 (lettura fresca, transazione, 1 notifica per dispositivo) |
| Avvio dell'app | 0 | 1 (stato iniziale dell'ascolto) + 1 licenza |

Stima prudente con **100 professionisti**, 100 salvataggi e 5 fatture dal telefono al giorno a testa: circa 10.500 scritture (limite 20.000) e 32.000 letture (limite 50.000). L'uso reale previsto (pochi utenti, qualche decina di salvataggi) ne è una piccola frazione.

Regole adottate per restare nel piano gratuito:
- **Un solo documento per utente** (il puntatore) e **un solo ascolto** per dispositivo. Nessuna query, nessun ascolto di collezioni.
- **Nessun battito periodico** né segnale di presenza: la fatturazione non ha bisogno di sapere se l'altro dispositivo è acceso.
- Con l'ascolto attivo il motore **non rilegge** il documento a ogni salvataggio. Usa il puntatore ricevuto: se è vecchio la transazione fallisce, e solo allora lo rilegge.
- I dati non passano mai da Firestore: l'archivio va su Drive, che ha quote proprie molto più ampie.
- Da fare in Fase 2: raggruppare i salvataggi ravvicinati (~300 ms) e leggere la licenza una sola volta per sessione (sul desktop vale 14 giorni).

### Velocità
- Notifica all'altro dispositivo in meno di 1 s (ascolto Firestore). Poi si scarica l'archivio da Drive: un file da qualche centinaio di KB.
- Un salvataggio non attende Firestore per comparire a schermo: la scrittura locale è immediata e la pubblicazione avviene in sottofondo. Fanno eccezione le fatture, che attendono la pubblicazione prima di generare il documento.

### Privacy
- Su Firestore ci sono **solo**: numero di revisione, ID del file su Drive, identificativi dei dispositivi (UUID casuali, mai nomi di computer), orari degli aggiornamenti e licenza (email, attiva, scadenza). **Nessun dato di pazienti o fatture**, nemmeno i numeri delle fatture.
- Il percorso del documento è l'UID Firebase, non l'email.
- SDK Firebase con cache **in memoria**, senza persistenza su disco del browser. Niente Analytics né altri moduli che raccolgono dati.
- Regole di sicurezza: ogni utente legge e scrive solo il proprio documento, e solo con la licenza attiva. Tutto il resto è negato.
