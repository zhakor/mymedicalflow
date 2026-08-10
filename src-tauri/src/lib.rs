// Previene finestra console aggiuntiva su Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use base64::{engine::general_purpose::STANDARD, Engine};
use tauri::Manager;

mod crypto;
mod secure_store;
mod sistema_ts;

/// Normalizza un nome file proveniente dal frontend.
///
/// Il nome è composto da testo libero inserito dall'utente (cognome paziente,
/// numero fattura). Senza questa normalizzazione potrebbe contenere separatori
/// di percorso — e quindi far scrivere il file fuori dalla cartella scelta —
/// oppure caratteri che una shell interpreterebbe come metacaratteri.
/// I caratteri legittimi dei cognomi italiani (accenti, apostrofi, spazi,
/// trattini) vengono preservati.
fn sanitize_file_name(raw: &str) -> String {
    let cleaned: String = raw
        .chars()
        .map(|c| {
            if c.is_control() || matches!(c, '/' | '\\' | ':' | '<' | '>' | '"' | '|' | '?' | '*') {
                '_'
            } else {
                c
            }
        })
        .collect();

    // Punti e spazi iniziali/finali: neutralizzano ".." ed evitano nomi che
    // Windows tronca silenziosamente.
    let cleaned = cleaned.trim().trim_matches('.').trim();

    if cleaned.is_empty() {
        "documento.docx".to_string()
    } else {
        cleaned.to_string()
    }
}

/// Salva il file .docx nella cartella specificata (o Desktop come fallback) e lo apre
/// con l'applicazione predefinita (Word, LibreOffice, ecc.).
#[tauri::command]
fn save_and_open_docx(
    file_name: String,
    base64_content: String,
    save_dir: Option<String>,
) -> Result<String, String> {
    let bytes = STANDARD
        .decode(base64_content.trim())
        .map_err(|e| format!("Errore decodifica base64: {e}"))?;

    let dest_dir = if let Some(dir) = save_dir.filter(|s| !s.trim().is_empty()) {
        let p = std::path::PathBuf::from(dir);
        std::fs::create_dir_all(&p).map_err(|e| format!("Errore creazione cartella: {e}"))?;
        p
    } else {
        let home = if cfg!(windows) {
            std::env::var("USERPROFILE").unwrap_or_else(|_| ".".into())
        } else {
            std::env::var("HOME").unwrap_or_else(|_| ".".into())
        };
        let desktop = std::path::PathBuf::from(&home).join("Desktop");
        let _ = std::fs::create_dir_all(&desktop);
        desktop
    };

    let path = dest_dir.join(sanitize_file_name(&file_name));

    std::fs::write(&path, &bytes).map_err(|e| format!("Errore scrittura file: {e}"))?;

    // `that_detached` passa il percorso come parametro (ShellExecuteW su Windows,
    // `open`/`xdg-open` altrove) e non lo fa mai interpretare da una shell.
    open::that_detached(&path).map_err(|e| format!("Errore apertura file: {e}"))?;

    Ok(path.to_string_lossy().into_owned())
}

/// Scrive un file di testo UTF-8 nel percorso indicato dall'utente tramite il
/// dialogo nativo. Usato per salvare il codice di recupero.
#[tauri::command]
fn save_text_file(path: String, content: String) -> Result<String, String> {
    let path = std::path::PathBuf::from(path);

    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("Errore creazione cartella: {e}"))?;
    }

    std::fs::write(&path, content.as_bytes()).map_err(|e| format!("Errore scrittura file: {e}"))?;

    Ok(path.to_string_lossy().into_owned())
}

// ─── Archivio ─────────────────────────────────────────────────────────────────

#[tauri::command]
fn secure_store_load(app: tauri::AppHandle) -> Result<Option<String>, String> {
    secure_store::load(&app)
}

#[tauri::command]
fn secure_store_save(app: tauri::AppHandle, data: String) -> Result<(), String> {
    secure_store::save(&app, &data)
}

// ─── Codice di recupero ───────────────────────────────────────────────────────

#[tauri::command]
fn codice_recupero(app: tauri::AppHandle) -> Result<String, String> {
    secure_store::codice_recupero(&app)
}

/// Stato di leggibilità della chiave locale, interrogato prima di aprire
/// l'archivio: distingue un blocco DPAPI (altro account/PC, risolvibile col
/// codice di recupero) da tutti gli altri stati, già gestiti da `secure_store`.
#[tauri::command]
fn chiave_stato(app: tauri::AppHandle) -> Result<secure_store::StatoChiave, String> {
    secure_store::chiave_stato(&app)
}

#[tauri::command]
fn chiave_recupera_da_codice(app: tauri::AppHandle, codice: String) -> Result<(), String> {
    secure_store::chiave_recupera_da_codice(&app, &codice)
}

// ─── Copie di sicurezza ───────────────────────────────────────────────────────

#[tauri::command]
fn backup_elenca(app: tauri::AppHandle) -> Result<Vec<secure_store::BackupInfo>, String> {
    secure_store::elenca_backup(&app)
}

#[tauri::command]
fn backup_crea(app: tauri::AppHandle) -> Result<secure_store::EsitoBackup, String> {
    secure_store::crea_backup(&app)
}

#[tauri::command]
fn backup_apri(
    app: tauri::AppHandle,
    percorso: String,
    codice: Option<String>,
) -> Result<String, String> {
    secure_store::apri_backup(&app, &percorso, codice.as_deref())
}

#[tauri::command]
fn preferenze_leggi(app: tauri::AppHandle) -> secure_store::Preferenze {
    secure_store::preferenze(&app)
}

#[tauri::command]
fn imposta_cartella_backup(app: tauri::AppHandle, cartella: Option<String>) -> Result<(), String> {
    let mut p = secure_store::preferenze(&app);
    p.cartella_backup = cartella.filter(|c| !c.trim().is_empty());
    secure_store::salva_preferenze(&app, &p)
}

/// Registra che la configurazione iniziale delle copie è stata completata,
/// così non viene riproposta a ogni avvio.
#[tauri::command]
fn segna_copie_configurate(app: tauri::AppHandle) -> Result<(), String> {
    let mut p = secure_store::preferenze(&app);
    p.copie_configurate = true;
    secure_store::salva_preferenze(&app, &p)
}

/// Cartelle proposte come destinazione: sono quelle che, tipicamente, portano
/// i file fuori dal computer. Il rilevamento è volutamente basato su nomi noti
/// e variabili d'ambiente, senza API specifiche di un sistema operativo.
#[tauri::command]
fn destinazioni_suggerite() -> Vec<String> {
    let mut trovate: Vec<String> = Vec::new();
    let mut aggiungi = |p: std::path::PathBuf| {
        let s = p.to_string_lossy().into_owned();
        if p.is_dir() && !trovate.contains(&s) {
            trovate.push(s);
        }
    };

    for chiave in ["OneDrive", "OneDriveCommercial", "OneDriveConsumer"] {
        if let Ok(v) = std::env::var(chiave) {
            aggiungi(std::path::PathBuf::from(v));
        }
    }

    let home = std::env::var(if cfg!(windows) { "USERPROFILE" } else { "HOME" });
    if let Ok(home) = home {
        for nome in [
            "OneDrive",
            "Dropbox",
            "Google Drive",
            "iCloudDrive",
            "Nextcloud",
        ] {
            aggiungi(std::path::PathBuf::from(&home).join(nome));
        }
    }

    trovate
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        // Aggiornamenti firmati distribuiti tramite GitHub Releases.
        // `process` serve solo a riavviare l'app a installazione conclusa.
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![
            save_and_open_docx,
            save_text_file,
            secure_store_load,
            secure_store_save,
            codice_recupero,
            chiave_stato,
            chiave_recupera_da_codice,
            backup_elenca,
            backup_crea,
            backup_apri,
            preferenze_leggi,
            imposta_cartella_backup,
            segna_copie_configurate,
            destinazioni_suggerite,
            sistema_ts::commands::sistema_ts_configurazione,
            sistema_ts::commands::sistema_ts_trasmetti
        ])
        // Copia di sicurezza silenziosa alla chiusura della finestra.
        // Viene eseguita qui, e non nel frontend, per due motivi: avviene anche
        // se il webview non risponde, e non richiede di intercettare e rinviare
        // la chiusura (che, in caso di errore, lascerebbe la finestra bloccata).
        .on_window_event(|window, event| {
            if matches!(event, tauri::WindowEvent::CloseRequested { .. }) {
                match secure_store::crea_backup(window.app_handle()) {
                    Ok(esito) if !esito.fallite.is_empty() => {
                        eprintln!(
                            "[MyMedicalFlow] copia non riuscita su: {}",
                            esito.fallite.join(", ")
                        );
                    }
                    // La chiusura non viene mai impedita da un errore di backup
                    Err(e) => eprintln!("[MyMedicalFlow] copia di sicurezza non riuscita: {e}"),
                    _ => {}
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("Errore durante l'avvio di MyMedicalFlow");
}

#[cfg(test)]
mod tests {
    use super::sanitize_file_name;
    use std::path::{Component, PathBuf};

    /// Il nome normalizzato deve restare un singolo componente di percorso:
    /// niente risalite di directory, niente percorsi assoluti.
    fn is_single_component(name: &str) -> bool {
        let p = PathBuf::from(name);
        let mut comps = p.components();
        matches!(comps.next(), Some(Component::Normal(_))) && comps.next().is_none()
    }

    #[test]
    fn preserva_i_nomi_legittimi() {
        for nome in [
            "Fattura_1-2026_Rossi.docx",
            "Fattura_2-2026_D'Angelo.docx",
            "Fattura_3-2026_De Luca.docx",
            "Fattura_4-2026_Böhm-Sarà.docx",
        ] {
            assert_eq!(sanitize_file_name(nome), nome, "nome legittimo alterato");
        }
    }

    #[test]
    fn neutralizza_i_metacaratteri_di_shell() {
        let payload = r#"Fattura_1-2026_Rossi" & calc & rem .docx"#;
        let pulito = sanitize_file_name(payload);
        assert!(!pulito.contains('"'), "virgoletta residua: {pulito}");
        assert!(is_single_component(&pulito));
    }

    #[test]
    fn neutralizza_la_risalita_di_directory() {
        for payload in [
            r"..\..\..\Windows\Temp\x.docx",
            "../../../etc/passwd",
            r"C:\Windows\System32\evil.dll",
            "..",
        ] {
            let pulito = sanitize_file_name(payload);
            assert!(
                is_single_component(&pulito),
                "percorso non neutralizzato: {payload} -> {pulito}"
            );
            assert!(
                !pulito.contains('/') && !pulito.contains('\\') && !pulito.contains(':'),
                "separatore residuo: {pulito}"
            );
        }
    }

    #[test]
    fn rimuove_i_caratteri_di_controllo() {
        let pulito = sanitize_file_name("Fattura\n1\t2\0.docx");
        assert!(
            !pulito.chars().any(char::is_control),
            "controllo residuo: {pulito:?}"
        );
    }

    #[test]
    fn ricade_su_un_nome_valido_quando_resta_vuoto() {
        for payload in ["", "   ", "...", "///"] {
            let pulito = sanitize_file_name(payload);
            assert!(!pulito.trim().is_empty());
            assert!(is_single_component(&pulito));
        }
    }
}
