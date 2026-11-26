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
    for (destinazione, origine) in [
        ("MMF_GOOGLE_CLIENT_ID", "VITE_GOOGLE_CLIENT_ID_DESKTOP"),
        ("MMF_GOOGLE_CLIENT_SECRET", "GOOGLE_CLIENT_SECRET_DESKTOP"),
    ] {
        println!("cargo:rerun-if-env-changed={origine}");
        if let Some(valore) = env::var(origine).ok().or_else(|| dal_file(origine)).filter(|v| !v.is_empty()) {
            println!("cargo:rustc-env={destinazione}={valore}");
        }
    }
}

fn main() {
    client_google();
    tauri_build::build()
}
