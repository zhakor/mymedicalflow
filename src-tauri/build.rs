use std::{env, fs};

/// Client OAuth "App desktop" di Google (accesso del PC, src/google.rs).
/// Si leggono dalle variabili d'ambiente (pipeline di rilascio) o dal file
/// `.env.local` nella radice del repository, escluso da git.
fn client_google() {
    println!("cargo:rerun-if-changed=../.env.local");
    let file = fs::read_to_string("../.env.local").unwrap_or_default();
    let dal_file = |nome: &str| {
        file.lines()
            .filter_map(|r| r.trim().split_once('='))
            .find(|(k, _)| k.trim() == nome)
            .map(|(_, v)| v.trim().to_string())
    };
    // In release (l'installer) senza client Google l'accesso è impossibile e
    // l'app, che verifica l'abbonamento all'avvio, non si aprirebbe a nessuno:
    // meglio fermare la build. In debug (test, sviluppo) si prosegue.
    let release = env::var("PROFILE").as_deref() == Ok("release");
    for (destinazione, origine) in [
        ("MMF_GOOGLE_CLIENT_ID", "VITE_GOOGLE_CLIENT_ID_DESKTOP"),
        ("MMF_GOOGLE_CLIENT_SECRET", "GOOGLE_CLIENT_SECRET_DESKTOP"),
    ] {
        println!("cargo:rerun-if-env-changed={origine}");
        match env::var(origine).ok().or_else(|| dal_file(origine)).filter(|v| !v.is_empty()) {
            Some(valore) => println!("cargo:rustc-env={destinazione}={valore}"),
            None if release => panic!(
                "Build interrotta: manca {origine} (client Google del desktop). Vedi .env.local o i secrets della pipeline."
            ),
            None => {}
        }
    }
}

fn main() {
    client_google();
    tauri_build::build()
}
