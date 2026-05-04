// Previene finestra console aggiuntiva su Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use base64::{Engine, engine::general_purpose::STANDARD};

/// Salva il file .docx nella cartella specificata (o Download come fallback) e lo apre
/// con l'applicazione predefinita (Word, LibreOffice, ecc.).
/// Restituisce il percorso assoluto del file salvato.
#[tauri::command]
fn save_and_open_docx(file_name: String, base64_content: String, save_dir: Option<String>) -> Result<String, String> {
    // Decodifica base64
    let bytes = STANDARD
        .decode(base64_content.trim())
        .map_err(|e| format!("Errore decodifica base64: {e}"))?;

    // Usa la cartella configurata o fallback su Desktop
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

    let path = dest_dir.join(&file_name);

    // Scrivi file
    std::fs::write(&path, &bytes)
        .map_err(|e| format!("Errore scrittura file: {e}"))?;

    // Apri con l'app predefinita del sistema operativo
    #[cfg(target_os = "windows")]
    std::process::Command::new("cmd")
        .args(["/C", "start", "", path.to_str().unwrap_or("")])
        .spawn()
        .map_err(|e| format!("Errore apertura file: {e}"))?;

    #[cfg(target_os = "macos")]
    std::process::Command::new("open")
        .arg(&path)
        .spawn()
        .map_err(|e| format!("Errore apertura file: {e}"))?;

    #[cfg(target_os = "linux")]
    std::process::Command::new("xdg-open")
        .arg(&path)
        .spawn()
        .map_err(|e| format!("Errore apertura file: {e}"))?;

    Ok(path.to_string_lossy().into_owned())
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![save_and_open_docx])
        .run(tauri::generate_context!())
        .expect("Errore durante l'avvio di MyMedicalFlow");
}
