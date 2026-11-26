//! Archivio locale e copie di sicurezza.
//!
//! Tutto ciò che viene scritto su disco — archivio e backup — è cifrato con la
//! chiave di installazione (vedi `crypto`). Non c'è alcun formato in chiaro e
//! nessun ramo dipendente dal sistema operativo: un backup prodotto qui è
//! apribile ovunque giri l'app, purché si disponga del codice di recupero.
//!
//! Unica eccezione temporanea: la lettura degli archivi nel vecchio formato
//! `MMF1` protetto da DPAPI, necessaria a convertire i dati esistenti al primo
//! avvio. Va rimossa quando nessuna installazione userà più quel formato.
//!
//! La copia locale della chiave (`chiave.dat`), invece, è protetta da DPAPI
//! quando disponibile: vedi la sezione "Chiave di installazione" più sotto.

use crate::crypto::{self, CHIAVE_LEN};
use std::path::{Path, PathBuf};

const FILE_ARCHIVIO: &str = "archivio.dat";
const FILE_CHIAVE: &str = "chiave.dat";
const FILE_PREFERENZE: &str = "preferenze.json";
const CARTELLA_BACKUP: &str = "backup";

const PREFISSO_BACKUP: &str = "mymedicalflow-";
const ESTENSIONE_BACKUP: &str = "mmfbak";

/// Copie conservate per ciascuna destinazione.
const MAX_BACKUP: usize = 10;

// ─── Percorsi ─────────────────────────────────────────────────────────────────

fn cartella_dati(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    use tauri::Manager;
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("cartella dati non disponibile: {e}"))?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("creazione cartella dati: {e}"))?;
    Ok(dir)
}

fn percorso_archivio(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(cartella_dati(app)?.join(FILE_ARCHIVIO))
}

fn cartella_backup_locale(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = cartella_dati(app)?.join(CARTELLA_BACKUP);
    std::fs::create_dir_all(&dir).map_err(|e| format!("creazione cartella backup: {e}"))?;
    Ok(dir)
}

/// Scrittura atomica: file temporaneo e poi rinomina, così un'interruzione
/// non lascia mai un file troncato al posto di uno valido.
fn scrivi_atomico(percorso: &Path, contenuto: &[u8]) -> Result<(), String> {
    let tmp = percorso.with_extension("tmp");
    std::fs::write(&tmp, contenuto)
        .map_err(|e| format!("scrittura di {}: {e}", percorso.display()))?;
    std::fs::rename(&tmp, percorso)
        .map_err(|e| format!("salvataggio di {}: {e}", percorso.display()))
}

// ─── DPAPI: protezione della copia locale della chiave ────────────────────────
//
// Lega il blob a chiave.dat all'account Windows corrente. Usato solo per la
// chiave in questo file: archivio e backup restano indipendenti dal PC, così
// da poter essere aperti ovunque con il codice di recupero.
mod dpapi {
    #[cfg(windows)]
    pub fn protect(dati: &[u8]) -> Result<Vec<u8>, String> {
        use windows::core::PCWSTR;
        use windows::Win32::Foundation::{LocalFree, HLOCAL};
        use windows::Win32::Security::Cryptography::{
            CryptProtectData, CRYPTPROTECT_UI_FORBIDDEN, CRYPT_INTEGER_BLOB,
        };

        let input = CRYPT_INTEGER_BLOB {
            cbData: dati.len() as u32,
            pbData: dati.as_ptr() as *mut u8,
        };
        let mut output = CRYPT_INTEGER_BLOB::default();

        unsafe {
            CryptProtectData(
                &input,
                PCWSTR::null(),
                None,
                None,
                None,
                CRYPTPROTECT_UI_FORBIDDEN,
                &mut output,
            )
            .map_err(|e| format!("protezione DPAPI non riuscita: {e}"))?;
            if output.pbData.is_null() {
                return Ok(Vec::new());
            }
            let copia = std::slice::from_raw_parts(output.pbData, output.cbData as usize).to_vec();
            let _ = LocalFree(Some(HLOCAL(output.pbData as *mut _)));
            Ok(copia)
        }
    }

    #[cfg(windows)]
    pub fn unprotect(blob: &[u8]) -> Result<Vec<u8>, String> {
        use windows::Win32::Foundation::{LocalFree, HLOCAL};
        use windows::Win32::Security::Cryptography::{
            CryptUnprotectData, CRYPTPROTECT_UI_FORBIDDEN, CRYPT_INTEGER_BLOB,
        };

        let input = CRYPT_INTEGER_BLOB {
            cbData: blob.len() as u32,
            pbData: blob.as_ptr() as *mut u8,
        };
        let mut output = CRYPT_INTEGER_BLOB::default();

        unsafe {
            CryptUnprotectData(
                &input,
                None,
                None,
                None,
                None,
                CRYPTPROTECT_UI_FORBIDDEN,
                &mut output,
            )
            .map_err(|e| format!("lettura della chiave locale non riuscita: {e}"))?;
            if output.pbData.is_null() {
                return Ok(Vec::new());
            }
            let copia = std::slice::from_raw_parts(output.pbData, output.cbData as usize).to_vec();
            let _ = LocalFree(Some(HLOCAL(output.pbData as *mut _)));
            Ok(copia)
        }
    }

    #[cfg(not(windows))]
    pub fn protect(_dati: &[u8]) -> Result<Vec<u8>, String> {
        Err("DPAPI non disponibile su questo sistema".into())
    }

    #[cfg(not(windows))]
    pub fn unprotect(_blob: &[u8]) -> Result<Vec<u8>, String> {
        Err("DPAPI non disponibile su questo sistema".into())
    }
}

// ─── Chiave di installazione ──────────────────────────────────────────────────
//
// La chiave AES a 256 bit non cambia mai per un'installazione: cambia solo il
// modo in cui la copia locale viene custodita su disco.
//
// - Formato legacy (testo): stesso alfabeto del codice di recupero mostrato
//   all'utente, in chiaro. Prodotto dalle versioni precedenti.
// - Formato MMFK (binario): intestazione + blob opaco prodotto da
//   CryptProtectData, leggibile solo dall'account Windows che l'ha creato.
//
// La migrazione da legacy a MMFK è automatica, silenziosa e "fail-safe": il
// file legacy non viene mai sostituito finché il nuovo blob non è stato
// verificato per intero (scrittura, rilettura, decifratura, confronto byte a
// byte con la chiave originale). Un fallimento in qualunque punto lascia il
// file legacy intatto: la migrazione verrà ritentata al prossimo avvio.

const MMFK_MAGIC: &[u8; 4] = b"MMFK";
const MMFK_VERSIONE: u8 = 2;
const MMFK_HEADER_LEN: usize = 5;

fn e_formato_mmfk(raw: &[u8]) -> bool {
    raw.len() >= MMFK_HEADER_LEN && &raw[..4] == MMFK_MAGIC
}

fn impacchetta_mmfk(blob: &[u8]) -> Vec<u8> {
    let mut out = Vec::with_capacity(MMFK_HEADER_LEN + blob.len());
    out.extend_from_slice(MMFK_MAGIC);
    out.push(MMFK_VERSIONE);
    out.extend_from_slice(blob);
    out
}

/// Scrive una chiave nuova nel formato più sicuro disponibile: MMFK (DPAPI) su
/// Windows, testo legacy altrove. Non genera mai un file in chiaro temporaneo:
/// il buffer scritto è già il formato finale.
fn scrivi_chiave_nuova(percorso: &Path, chiave: &[u8; CHIAVE_LEN]) -> Result<(), String> {
    match dpapi::protect(chiave) {
        Ok(blob) => scrivi_atomico(percorso, &impacchetta_mmfk(&blob)),
        Err(_) => scrivi_atomico(percorso, crypto::chiave_in_codice(chiave).as_bytes()),
    }
}

/// Tenta la migrazione del formato legacy a MMFK. Fallisce in silenzio: solo
/// un log non sensibile, mai la chiave o il codice di recupero.
fn migra_a_mmfk(percorso: &Path, chiave: &[u8; CHIAVE_LEN]) {
    let risultato: Result<(), String> = (|| {
        let blob = dpapi::protect(chiave)?;
        let pacchetto = impacchetta_mmfk(&blob);

        let tmp = percorso.with_extension("mmfk-tmp");
        std::fs::write(&tmp, &pacchetto).map_err(|e| e.to_string())?;
        let riletto = std::fs::read(&tmp).map_err(|e| e.to_string())?;
        let verificata = dpapi::unprotect(&riletto[MMFK_HEADER_LEN..])?;
        if verificata.as_slice() != chiave.as_slice() {
            let _ = std::fs::remove_file(&tmp);
            return Err("verifica dopo la scrittura non corrispondente".into());
        }

        std::fs::rename(&tmp, percorso).map_err(|e| e.to_string())?;
        Ok(())
    })();

    match risultato {
        Ok(()) => println!("[MyMedicalFlow] chiave: migrazione a DPAPI completata"),
        Err(e) => eprintln!(
            "[MyMedicalFlow] chiave: migrazione a DPAPI non riuscita, si continua con il formato legacy ({e})"
        ),
    }
}

/// Restituisce la chiave, generandola al primo avvio.
///
/// Non rigenera mai una chiave nuova se il file esiste ma non è leggibile:
/// significherebbe rendere per sempre indecifrabile un archivio già esistente.
pub fn chiave(app: &tauri::AppHandle) -> Result<[u8; CHIAVE_LEN], String> {
    let percorso = cartella_dati(app)?.join(FILE_CHIAVE);

    if !percorso.exists() {
        let nuova = crypto::genera_chiave();
        scrivi_chiave_nuova(&percorso, &nuova)?;
        return Ok(nuova);
    }

    let raw = std::fs::read(&percorso).map_err(|e| format!("lettura della chiave: {e}"))?;

    if e_formato_mmfk(&raw) {
        let chiaro = dpapi::unprotect(&raw[MMFK_HEADER_LEN..])
            .map_err(|e| format!("chiave locale non leggibile su questo account: {e}"))?;
        return <[u8; CHIAVE_LEN]>::try_from(chiaro.as_slice())
            .map_err(|_| "chiave locale danneggiata".to_string());
    }

    let testo = String::from_utf8(raw).map_err(|_| "chiave.dat danneggiato".to_string())?;
    let chiave_legacy = crypto::codice_in_chiave(testo.trim())?;

    // Su Windows si tenta la migrazione a DPAPI; altrove il formato legacy
    // resta l'unico disponibile e il tentativo produrrebbe solo log inutili.
    if cfg!(windows) {
        migra_a_mmfk(&percorso, &chiave_legacy);
    }

    Ok(chiave_legacy)
}

pub fn codice_recupero(app: &tauri::AppHandle) -> Result<String, String> {
    Ok(crypto::chiave_in_codice(&chiave(app)?))
}

// ─── Stato della chiave e recupero via codice ─────────────────────────────────

/// Esito della verifica di leggibilità della chiave locale, senza generarne
/// una nuova né alterare alcun file.
#[derive(serde::Serialize)]
#[serde(tag = "tipo", rename_all = "camelCase")]
pub enum StatoChiave {
    Ok,
    RichiedeCodiceRecupero,
}

/// Va interrogato dal frontend prima di aprire l'archivio, per distinguere un
/// fallimento DPAPI (cartella copiata su un altro account o PC, risolvibile
/// col codice di recupero) da tutti gli altri stati, già gestiti da `chiave`.
pub fn chiave_stato(app: &tauri::AppHandle) -> Result<StatoChiave, String> {
    let percorso = cartella_dati(app)?.join(FILE_CHIAVE);
    let Ok(raw) = std::fs::read(&percorso) else {
        return Ok(StatoChiave::Ok);
    };
    if e_formato_mmfk(&raw) && dpapi::unprotect(&raw[MMFK_HEADER_LEN..]).is_err() {
        return Ok(StatoChiave::RichiedeCodiceRecupero);
    }
    Ok(StatoChiave::Ok)
}

/// Ripristina l'accesso locale con il codice di recupero, quando la copia
/// protetta da DPAPI non è più leggibile. Se esiste già un archivio il codice
/// deve decifrarlo correttamente: altrimenti non tocca `chiave.dat` e
/// restituisce un errore, così un codice sbagliato non può mai sostituire una
/// chiave valida ma temporaneamente illeggibile.
pub fn chiave_recupera_da_codice(app: &tauri::AppHandle, codice: &str) -> Result<(), String> {
    let chiave = crypto::codice_in_chiave(codice.trim())?;

    let percorso_arch = percorso_archivio(app)?;
    if percorso_arch.exists() {
        let raw = std::fs::read(&percorso_arch).map_err(|e| format!("lettura archivio: {e}"))?;
        if !raw.is_empty() {
            crypto::decifra(&raw, &chiave).map_err(|_| "codice di recupero errato".to_string())?;
        }
    }

    let percorso_chiave = cartella_dati(app)?.join(FILE_CHIAVE);
    scrivi_chiave_nuova(&percorso_chiave, &chiave)
}

// ─── Preferenze gestite dal backend ───────────────────────────────────────────

#[derive(serde::Serialize, serde::Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Preferenze {
    /// Cartella scelta dall'utente per le copie di sicurezza.
    /// Non finisce nel backup: su un altro computer il percorso sarebbe diverso.
    pub cartella_backup: Option<String>,
    /// Istante dell'ultima copia riuscita, per mostrarlo in Dashboard.
    pub ultimo_backup: Option<u64>,
    /// Vero dopo che l'utente ha visto la configurazione iniziale delle copie.
    /// `default` perché i file scritti prima non contengono questo campo.
    #[serde(default)]
    pub copie_configurate: bool,
}

fn percorso_preferenze(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(cartella_dati(app)?.join(FILE_PREFERENZE))
}

pub fn preferenze(app: &tauri::AppHandle) -> Preferenze {
    percorso_preferenze(app)
        .ok()
        .and_then(|p| std::fs::read_to_string(p).ok())
        .and_then(|t| serde_json::from_str(&t).ok())
        .unwrap_or_default()
}

pub fn salva_preferenze(app: &tauri::AppHandle, p: &Preferenze) -> Result<(), String> {
    let testo = serde_json::to_string_pretty(p).map_err(|e| format!("preferenze: {e}"))?;
    scrivi_atomico(&percorso_preferenze(app)?, testo.as_bytes())
}

// ─── Archivio ─────────────────────────────────────────────────────────────────

/// Legge l'archivio. `None` alla prima esecuzione.
/// Converte in modo trasparente gli archivi nel vecchio formato DPAPI.
pub fn load(app: &tauri::AppHandle) -> Result<Option<String>, String> {
    let percorso = percorso_archivio(app)?;
    if !percorso.exists() {
        return Ok(None);
    }

    let raw = std::fs::read(&percorso).map_err(|e| format!("lettura archivio: {e}"))?;

    if let Some(convertito) = legacy::converti_se_vecchio_formato(&raw)? {
        // Riscrittura immediata nel nuovo formato: la conversione avviene una
        // sola volta e i dati non restano nel formato legato al PC.
        save(app, &convertito)?;
        return Ok(Some(convertito));
    }

    let chiaro = crypto::decifra(&raw, &chiave(app)?)?;
    String::from_utf8(chiaro)
        .map(Some)
        .map_err(|e| format!("archivio non leggibile: {e}"))
}

pub fn save(app: &tauri::AppHandle, data: &str) -> Result<(), String> {
    let cifrato = crypto::cifra(data.as_bytes(), &chiave(app)?)?;
    scrivi_atomico(&percorso_archivio(app)?, &cifrato)
}

// ─── Base della sincronizzazione ──────────────────────────────────────────────

/// Ultima versione dell'archivio allineata con il cloud (CR §5.1), con la sua
/// revisione: serve alla fusione a tre vie dopo un periodo offline o ad app
/// chiusa. Cifrata con la stessa chiave dell'archivio, accanto a lui.
const FILE_BASE_SYNC: &str = "sync-base.dat";

pub fn base_sync_load(app: &tauri::AppHandle) -> Result<Option<String>, String> {
    let percorso = cartella_dati(app)?.join(FILE_BASE_SYNC);
    if !percorso.exists() {
        return Ok(None);
    }
    let raw = std::fs::read(&percorso).map_err(|e| format!("lettura base sincronizzazione: {e}"))?;
    let chiaro = crypto::decifra(&raw, &chiave(app)?)?;
    String::from_utf8(chiaro)
        .map(Some)
        .map_err(|e| format!("base sincronizzazione non leggibile: {e}"))
}

/// `None` la cancella (sincronizzazione disattivata).
pub fn base_sync_save(app: &tauri::AppHandle, data: Option<&str>) -> Result<(), String> {
    let percorso = cartella_dati(app)?.join(FILE_BASE_SYNC);
    match data {
        Some(d) => scrivi_atomico(&percorso, &crypto::cifra(d.as_bytes(), &chiave(app)?)?),
        None if percorso.exists() => std::fs::remove_file(&percorso).map_err(|e| e.to_string()),
        None => Ok(()),
    }
}

// ─── Copie di sicurezza ───────────────────────────────────────────────────────

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupInfo {
    pub percorso: String,
    pub nome: String,
    /// Millisecondi epoch, ricavati dal nome del file.
    pub creato_il: u64,
    pub dimensione: u64,
    /// Falso se la copia si trova nella cartella dati dell'app.
    pub esterno: bool,
}

fn epoch_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// Nome leggibile anche sfogliando la cartella da fuori: `mymedicalflow-20260809-185943.mmfbak`
fn nome_backup(istante: u64) -> String {
    let (a, m, g, h, min, s) = crypto_data(istante);
    format!("{PREFISSO_BACKUP}{a:04}{m:02}{g:02}-{h:02}{min:02}{s:02}.{ESTENSIONE_BACKUP}")
}

fn istante_da_nome(nome: &str) -> Option<u64> {
    let resto = nome.strip_prefix(PREFISSO_BACKUP)?;
    let base = resto.strip_suffix(&format!(".{ESTENSIONE_BACKUP}"))?;
    let (data, ora) = base.split_once('-')?;
    if data.len() != 8 || ora.len() != 6 || !base.chars().all(|c| c.is_ascii_digit() || c == '-') {
        return None;
    }
    let n = |s: &str| s.parse::<i64>().ok();
    let (a, m, g) = (n(&data[0..4])?, n(&data[4..6])?, n(&data[6..8])?);
    let (h, mi, se) = (n(&ora[0..2])?, n(&ora[2..4])?, n(&ora[4..6])?);
    let giorni = giorni_da_civile(a, m as u32, g as u32);
    Some(((giorni * 86_400 + h * 3600 + mi * 60 + se) * 1000) as u64)
}

/// Giorni dall'epoca (algoritmo days-from-civil di H. Hinnant).
fn giorni_da_civile(anno: i64, mese: u32, giorno: u32) -> i64 {
    let a = if mese <= 2 { anno - 1 } else { anno };
    let era = if a >= 0 { a } else { a - 399 } / 400;
    let yoe = (a - era * 400) as u64;
    let mp = if mese > 2 { mese - 3 } else { mese + 9 } as u64;
    let doy = (153 * mp + 2) / 5 + giorno as u64 - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146_097 + doe as i64 - 719_468
}

fn crypto_data(epoch_ms: u64) -> (i64, u32, u32, u32, u32, u32) {
    let secondi = (epoch_ms / 1000) as i64;
    let giorni = secondi.div_euclid(86_400);
    let resto = secondi.rem_euclid(86_400);
    let z = giorni + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = (z - era * 146_097) as u64;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let anno = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let giorno = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let mese = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    let anno = if mese <= 2 { anno + 1 } else { anno };
    (
        anno,
        mese,
        giorno,
        (resto / 3600) as u32,
        ((resto % 3600) / 60) as u32,
        (resto % 60) as u32,
    )
}

fn elenca_in(dir: &Path, esterno: bool) -> Vec<BackupInfo> {
    let Ok(voci) = std::fs::read_dir(dir) else {
        return Vec::new();
    };
    let mut elenco = Vec::new();
    for voce in voci.flatten() {
        let nome = voce.file_name().to_string_lossy().into_owned();
        let Some(creato_il) = istante_da_nome(&nome) else {
            continue;
        };
        elenco.push(BackupInfo {
            percorso: voce.path().to_string_lossy().into_owned(),
            nome,
            creato_il,
            dimensione: voce.metadata().map(|m| m.len()).unwrap_or(0),
            esterno,
        });
    }
    elenco
}

/// Tutte le copie note, dalla più recente. Include la cartella scelta
/// dall'utente, se raggiungibile.
pub fn elenca_backup(app: &tauri::AppHandle) -> Result<Vec<BackupInfo>, String> {
    let mut elenco = elenca_in(&cartella_backup_locale(app)?, false);

    if let Some(cartella) = preferenze(app).cartella_backup {
        let esterna = PathBuf::from(cartella);
        if esterna.is_dir() {
            elenco.extend(elenca_in(&esterna, true));
        }
    }

    elenco.sort_by(|a, b| b.creato_il.cmp(&a.creato_il));
    Ok(elenco)
}

fn ruota(dir: &Path) {
    let mut elenco = elenca_in(dir, false);
    elenco.sort_by(|a, b| b.creato_il.cmp(&a.creato_il));
    for vecchio in elenco.iter().skip(MAX_BACKUP) {
        let _ = std::fs::remove_file(&vecchio.percorso);
    }
}

/// Esito del salvataggio: le destinazioni possono fallire in modo indipendente
/// (chiavetta scollegata, cartella di rete non raggiungibile).
#[derive(serde::Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct EsitoBackup {
    pub riuscite: Vec<String>,
    pub fallite: Vec<String>,
    pub creato_il: Option<u64>,
}

/// Scrive una copia in tutte le destinazioni configurate.
///
/// L'archivio è già cifrato con la chiave di installazione, quindi la copia è
/// un trasferimento byte a byte: nessun dato in chiaro transita, e non serve
/// decifrare per fare il backup.
pub fn crea_backup(app: &tauri::AppHandle) -> Result<EsitoBackup, String> {
    let archivio = percorso_archivio(app)?;
    if !archivio.exists() {
        return Ok(EsitoBackup::default());
    }
    let contenuto = std::fs::read(&archivio).map_err(|e| format!("lettura archivio: {e}"))?;
    if contenuto.is_empty() {
        return Ok(EsitoBackup::default());
    }

    let istante = epoch_ms();
    let nome = nome_backup(istante);
    let mut esito = EsitoBackup {
        creato_il: Some(istante),
        ..Default::default()
    };

    let mut destinazioni: Vec<PathBuf> = vec![cartella_backup_locale(app)?];
    if let Some(cartella) = preferenze(app).cartella_backup {
        destinazioni.push(PathBuf::from(cartella));
    }

    for dir in destinazioni {
        let esisteva = dir.is_dir() || std::fs::create_dir_all(&dir).is_ok();
        let riuscita = esisteva && scrivi_atomico(&dir.join(&nome), &contenuto).is_ok();
        if riuscita {
            ruota(&dir);
            esito.riuscite.push(dir.to_string_lossy().into_owned());
        } else {
            esito.fallite.push(dir.to_string_lossy().into_owned());
        }
    }

    if !esito.riuscite.is_empty() {
        let mut p = preferenze(app);
        p.ultimo_backup = Some(istante);
        let _ = salva_preferenze(app, &p);
    }

    Ok(esito)
}

/// Apre una copia restituendone il contenuto in chiaro.
/// Con `codice` assente si usa la chiave di questa installazione.
pub fn apri_backup(
    app: &tauri::AppHandle,
    percorso: &str,
    codice: Option<&str>,
) -> Result<String, String> {
    let raw = std::fs::read(percorso).map_err(|e| format!("lettura della copia: {e}"))?;

    let chiave_da_usare = match codice.map(str::trim).filter(|c| !c.is_empty()) {
        Some(codice) => crypto::codice_in_chiave(codice)?,
        None => chiave(app)?,
    };

    let chiaro = crypto::decifra(&raw, &chiave_da_usare)?;
    String::from_utf8(chiaro).map_err(|e| format!("copia non leggibile: {e}"))
}

// ─── Vecchio formato, in sola lettura ─────────────────────────────────────────

mod legacy {
    const MAGIC: &[u8; 4] = b"MMF1";
    const FLAG_PLAIN: u8 = 0;
    const FLAG_DPAPI: u8 = 1;
    const HEADER_LEN: usize = 5;

    /// Riconosce e converte gli archivi creati prima della chiave di
    /// installazione. Restituisce `None` se il file è già nel nuovo formato.
    pub fn converti_se_vecchio_formato(raw: &[u8]) -> Result<Option<String>, String> {
        if raw.len() < HEADER_LEN || &raw[..4] != MAGIC {
            return Ok(None);
        }
        let payload = &raw[HEADER_LEN..];
        let chiaro = match raw[4] {
            FLAG_PLAIN => payload.to_vec(),
            FLAG_DPAPI => dpapi_unprotect(payload)?,
            altro => return Err(format!("formato archivio non riconosciuto ({altro})")),
        };
        String::from_utf8(chiaro)
            .map(Some)
            .map_err(|e| format!("archivio non leggibile: {e}"))
    }

    #[cfg(windows)]
    fn dpapi_unprotect(cifrato: &[u8]) -> Result<Vec<u8>, String> {
        use windows::Win32::Foundation::{LocalFree, HLOCAL};
        use windows::Win32::Security::Cryptography::{CryptUnprotectData, CRYPT_INTEGER_BLOB};

        let input = CRYPT_INTEGER_BLOB {
            cbData: cifrato.len() as u32,
            pbData: cifrato.as_ptr() as *mut u8,
        };
        let mut output = CRYPT_INTEGER_BLOB::default();

        unsafe {
            CryptUnprotectData(&input, None, None, None, None, 0, &mut output).map_err(|e| {
                format!("archivio creato su un altro account Windows e non convertibile: {e}")
            })?;
            if output.pbData.is_null() {
                return Ok(Vec::new());
            }
            let copia = std::slice::from_raw_parts(output.pbData, output.cbData as usize).to_vec();
            let _ = LocalFree(Some(HLOCAL(output.pbData as *mut _)));
            Ok(copia)
        }
    }

    #[cfg(not(windows))]
    fn dpapi_unprotect(_cifrato: &[u8]) -> Result<Vec<u8>, String> {
        Err("archivio nel vecchio formato Windows, non apribile su questo sistema".into())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn il_nome_del_backup_conserva_l_istante() {
        for ms in [
            0_u64,
            1_754_000_000_000,
            1_786_219_300_000,
            1_709_208_000_000,
        ] {
            let atteso = ms - (ms % 1000);
            let nome = nome_backup(ms);
            assert!(nome.starts_with(PREFISSO_BACKUP));
            assert!(nome.ends_with(".mmfbak"));
            assert_eq!(istante_da_nome(&nome), Some(atteso), "nome: {nome}");
        }
    }

    #[test]
    fn il_nome_e_leggibile_da_un_umano() {
        // 2026-08-10T18:59:43Z — il nome usa UTC, non l'ora locale: resta
        // ordinabile e non cambia significato copiando il file in un altro
        // fuso. L'interfaccia mostra comunque l'ora locale.
        assert_eq!(
            nome_backup(1_786_388_383_000),
            "mymedicalflow-20260810-185943.mmfbak"
        );
    }

    #[test]
    fn ignora_i_file_estranei_alla_cartella() {
        for nome in [
            "appunti.txt",
            "mymedicalflow.mmfbak",
            "mymedicalflow-2026.mmfbak",
            "mymedicalflow-20260809-1859.mmfbak",
            "mymedicalflow-20260809-185943.txt",
            "archivio-1786219300489.dat",
        ] {
            assert_eq!(istante_da_nome(nome), None, "accettato: {nome}");
        }
    }

    #[test]
    fn le_date_civili_sono_reversibili() {
        for ms in [
            0_u64,
            1_709_208_000_000,
            1_786_219_300_000,
            4_102_444_800_000,
        ] {
            let (a, m, g, h, mi, s) = crypto_data(ms);
            let giorni = giorni_da_civile(a, m, g);
            let ricostruito =
                ((giorni * 86_400 + h as i64 * 3600 + mi as i64 * 60 + s as i64) * 1000) as u64;
            assert_eq!(
                ricostruito,
                ms - (ms % 1000),
                "andata e ritorno fallito per {ms}"
            );
        }
    }

    #[test]
    fn riconosce_il_vecchio_formato_e_lascia_passare_il_nuovo() {
        // Nuovo formato: nessuna conversione
        let chiave = crypto::genera_chiave();
        let nuovo = crypto::cifra(b"{}", &chiave).unwrap();
        assert!(legacy::converti_se_vecchio_formato(&nuovo)
            .unwrap()
            .is_none());

        // Vecchio formato in chiaro: convertito
        let mut vecchio = b"MMF1".to_vec();
        vecchio.push(0);
        vecchio.extend_from_slice(br#"{"pazienti":"[]"}"#);
        assert_eq!(
            legacy::converti_se_vecchio_formato(&vecchio)
                .unwrap()
                .as_deref(),
            Some(r#"{"pazienti":"[]"}"#)
        );
    }

    #[test]
    fn distingue_il_formato_mmfk_dal_testo_legacy() {
        let chiave = crypto::genera_chiave();
        let legacy_testo = crypto::chiave_in_codice(&chiave);
        assert!(!e_formato_mmfk(legacy_testo.as_bytes()));

        let pacchetto = impacchetta_mmfk(b"blob-di-prova");
        assert!(e_formato_mmfk(&pacchetto));
        assert!(!e_formato_mmfk(b"MMF1x"));
        assert!(!e_formato_mmfk(b"MM"));
    }

    #[cfg(windows)]
    fn percorso_temp_di_prova(nome: &str) -> PathBuf {
        let s = crypto::genera_chiave();
        std::env::temp_dir().join(format!(
            "mmf_test_{nome}_{:02x}{:02x}{:02x}{:02x}.tmp",
            s[0], s[1], s[2], s[3]
        ))
    }

    #[cfg(windows)]
    #[test]
    fn dpapi_protect_e_unprotect_sono_reversibili() {
        let chiave = crypto::genera_chiave();
        let blob = dpapi::protect(&chiave).unwrap();
        assert_ne!(
            blob,
            chiave.to_vec(),
            "il blob non deve contenere la chiave in chiaro"
        );
        let tornata = dpapi::unprotect(&blob).unwrap();
        assert_eq!(tornata, chiave.to_vec());
    }

    #[cfg(windows)]
    #[test]
    fn un_blob_dpapi_corrotto_viene_rifiutato_senza_generare_nulla() {
        let chiave = crypto::genera_chiave();
        let mut blob = dpapi::protect(&chiave).unwrap();
        let ultimo = blob.len() - 1;
        blob[ultimo] ^= 0xFF;
        assert!(dpapi::unprotect(&blob).is_err());
    }

    #[cfg(windows)]
    #[test]
    fn la_migrazione_conserva_chiave_e_codice_di_recupero() {
        let chiave = crypto::genera_chiave();
        let codice_originale = crypto::chiave_in_codice(&chiave);
        let percorso = percorso_temp_di_prova("migrazione");
        std::fs::write(&percorso, codice_originale.as_bytes()).unwrap();

        migra_a_mmfk(&percorso, &chiave);

        let raw = std::fs::read(&percorso).unwrap();
        assert!(e_formato_mmfk(&raw), "il file non è stato migrato a MMFK");
        let migrata = dpapi::unprotect(&raw[MMFK_HEADER_LEN..]).unwrap();
        assert_eq!(migrata, chiave.to_vec());
        assert_eq!(crypto::chiave_in_codice(&chiave), codice_originale);

        let _ = std::fs::remove_file(&percorso);
    }

    #[cfg(windows)]
    #[test]
    fn archivio_e_backup_restano_decifrabili_dopo_la_migrazione() {
        let chiave = crypto::genera_chiave();
        let dati: &[u8] = br#"{"pazienti":[{"lastName":"Verdi"}]}"#;
        let cifrato = crypto::cifra(dati, &chiave).unwrap();

        let percorso = percorso_temp_di_prova("archivio");
        std::fs::write(&percorso, crypto::chiave_in_codice(&chiave).as_bytes()).unwrap();
        migra_a_mmfk(&percorso, &chiave);

        let raw = std::fs::read(&percorso).unwrap();
        let chiave_dopo = dpapi::unprotect(&raw[MMFK_HEADER_LEN..]).unwrap();
        let arr = <[u8; CHIAVE_LEN]>::try_from(chiave_dopo.as_slice()).unwrap();
        assert_eq!(crypto::decifra(&cifrato, &arr).unwrap(), dati);

        let _ = std::fs::remove_file(&percorso);
    }

    #[cfg(windows)]
    #[test]
    fn una_migrazione_impossibile_non_crea_nulla_di_parziale() {
        let chiave = crypto::genera_chiave();
        // Cartella inesistente: la scrittura del temporaneo fallisce e la
        // migrazione si ferma prima di toccare qualunque file.
        let percorso = std::env::temp_dir()
            .join("mmf_cartella_inesistente_xyz")
            .join("chiave.dat");

        migra_a_mmfk(&percorso, &chiave);

        assert!(!percorso.exists());
    }
}
