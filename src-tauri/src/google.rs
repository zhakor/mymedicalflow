//! Accesso Google del desktop (CR §7.1).
//!
//! Google non permette il login dentro una WebView incorporata: si apre il
//! browser di sistema e la risposta torna su un piccolo server locale
//! (`http://127.0.0.1:<porta casuale>`), con PKCE perché un codice
//! intercettato non serva a nessun altro.
//!
//! Il *refresh token* sta nel portachiavi del sistema operativo e rinnova
//! l'accesso a Drive senza riaprire il browser. Il frontend riceve solo
//! access token di un'ora, mai il refresh token.

use std::io::{BufRead, BufReader, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use keyring::Entry;
use rand::RngCore;
use reqwest::Url;
use sha2::{Digest, Sha256};

const AMBITI: &str = "openid email profile https://www.googleapis.com/auth/drive.file";
const DRIVE: &str = "https://www.googleapis.com/auth/drive.file";
const AUTORIZZAZIONE: &str = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN: &str = "https://oauth2.googleapis.com/token";
const REVOCA: &str = "https://oauth2.googleapis.com/revoke";
const PORTACHIAVI: &str = "MyMedicalFlow — Google";
const VOCE_REFRESH: &str = "refresh_token";
/// Tempo concesso per completare l'accesso nel browser.
const ATTESA_ACCESSO: Duration = Duration::from_secs(5 * 60);
/// Un token che scade tra meno di così si rinnova prima di usarlo.
const MARGINE: Duration = Duration::from_secs(120);

/// Prefissi degli errori, tradotti dal frontend negli errori del nucleo di
/// sincronizzazione: `[accesso]` serve un nuovo login, `[rete]` si ritenta.
const ERR_ACCESSO: &str = "[accesso]";
const ERR_RETE: &str = "[rete]";

struct TokenInMemoria {
    token: String,
    scade: Instant,
}

static TOKEN_CORRENTE: Mutex<Option<TokenInMemoria>> = Mutex::new(None);

fn client_id() -> Result<&'static str, String> {
    option_env!("MMF_GOOGLE_CLIENT_ID")
        .filter(|v| !v.is_empty())
        .ok_or_else(|| "Accesso Google non configurato in questa versione dell'app.".to_string())
}

fn client_secret() -> &'static str {
    option_env!("MMF_GOOGLE_CLIENT_SECRET").unwrap_or("")
}

// ─── Portachiavi ──────────────────────────────────────────────────────────────

fn voce_refresh() -> Result<Entry, String> {
    Entry::new(PORTACHIAVI, VOCE_REFRESH)
        .map_err(|e| format!("Il portachiavi del sistema non è accessibile: {e}"))
}

fn leggi_refresh() -> Option<String> {
    voce_refresh().ok()?.get_password().ok().filter(|v| !v.is_empty())
}

fn cancella_refresh() {
    if let Ok(v) = voce_refresh() {
        let _ = v.delete_credential();
    }
}

// ─── Risposte di Google ───────────────────────────────────────────────────────

#[derive(serde::Deserialize)]
struct RispostaToken {
    access_token: String,
    expires_in: u64,
    refresh_token: Option<String>,
    id_token: Option<String>,
    scope: Option<String>,
}

#[derive(serde::Deserialize)]
struct ErroreGoogle {
    error: String,
    error_description: Option<String>,
}

/// Ciò che riceve il frontend dopo l'accesso: per Drive e per Firebase.
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AccessoGoogle {
    access_token: String,
    id_token: Option<String>,
}

/// Corpo `application/x-www-form-urlencoded` (in reqwest 0.13 `form` è una
/// funzionalità a parte): la codifica è quella della query di un URL.
fn modulo(parametri: &[(&str, &str)]) -> String {
    Url::parse_with_params("http://modulo/", parametri)
        .ok()
        .and_then(|u| u.query().map(str::to_string))
        .unwrap_or_default()
}

fn invia_modulo(url: &str, parametri: &[(&str, &str)]) -> Result<reqwest::blocking::Response, String> {
    http()?
        .post(url)
        .header("Content-Type", "application/x-www-form-urlencoded")
        .body(modulo(parametri))
        .send()
        .map_err(|e| format!("{ERR_RETE} Google non raggiungibile: {e}"))
}

fn http() -> Result<reqwest::blocking::Client, String> {
    reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|e| format!("{ERR_RETE} {e}"))
}

/// Una richiesta all'endpoint dei token. `invalid_grant` vuol dire accesso
/// revocato o scaduto: il refresh token si cancella e serve un nuovo login.
fn chiedi_token(parametri: &[(&str, &str)]) -> Result<RispostaToken, String> {
    let risposta = invia_modulo(TOKEN, parametri)?;
    let stato = risposta.status();
    let testo = risposta.text().map_err(|e| format!("{ERR_RETE} {e}"))?;
    if stato.is_success() {
        return serde_json::from_str(&testo).map_err(|e| format!("Risposta di Google non valida: {e}"));
    }
    let errore: Option<ErroreGoogle> = serde_json::from_str(&testo).ok();
    match errore {
        Some(e) if e.error == "invalid_grant" => {
            cancella_refresh();
            Err(format!("{ERR_ACCESSO} L'accesso a Google è scaduto o è stato revocato: accedi di nuovo."))
        }
        _ if stato.is_server_error() || stato.as_u16() == 429 => {
            Err(format!("{ERR_RETE} Google momentaneamente non disponibile ({stato})."))
        }
        Some(e) => Err(format!(
            "Google ha rifiutato la richiesta: {}",
            e.error_description.unwrap_or(e.error)
        )),
        None => Err(format!("Google ha rifiutato la richiesta ({stato}).")),
    }
}

fn ricorda(r: &RispostaToken) {
    *TOKEN_CORRENTE.lock().unwrap() = Some(TokenInMemoria {
        token: r.access_token.clone(),
        scade: Instant::now() + Duration::from_secs(r.expires_in),
    });
}

// ─── Accesso nel browser ──────────────────────────────────────────────────────

fn casuale_url(byte: usize) -> String {
    let mut b = vec![0u8; byte];
    rand::thread_rng().fill_bytes(&mut b);
    URL_SAFE_NO_PAD.encode(b)
}

const PAGINA_FINE: &str = "<!doctype html><meta charset=utf-8><title>MyMedicalFlow</title>\
<body style=\"font-family:system-ui;text-align:center;padding-top:15vh;color:#0f766e\">\
<h2>Accesso completato</h2><p style=\"color:#555\">Puoi chiudere questa scheda e tornare a MyMedicalFlow.</p>";

const PAGINA_ERRORE: &str = "<!doctype html><meta charset=utf-8><title>MyMedicalFlow</title>\
<body style=\"font-family:system-ui;text-align:center;padding-top:15vh;color:#b91c1c\">\
<h2>Accesso non completato</h2><p style=\"color:#555\">Torna a MyMedicalFlow e riprova.</p>";

fn rispondi(mut flusso: &TcpStream, stato: &str, corpo: &str) {
    let _ = write!(
        flusso,
        "HTTP/1.1 {stato}\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{corpo}",
        corpo.len()
    );
}

/// Attende sul server locale la richiesta con cui Google restituisce il
/// codice. Le altre richieste del browser (per esempio l'icona) si ignorano.
fn attendi_codice(server: &TcpListener, stato_atteso: &str) -> Result<String, String> {
    server.set_nonblocking(true).map_err(|e| e.to_string())?;
    let limite = Instant::now() + ATTESA_ACCESSO;
    while Instant::now() < limite {
        let (flusso, _) = match server.accept() {
            Ok(c) => c,
            Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                std::thread::sleep(Duration::from_millis(150));
                continue;
            }
            Err(e) => return Err(e.to_string()),
        };
        let _ = flusso.set_nonblocking(false);
        let _ = flusso.set_read_timeout(Some(Duration::from_secs(5)));
        let mut riga = String::new();
        if BufReader::new(&flusso).read_line(&mut riga).is_err() {
            continue;
        }
        // "GET /?code=...&state=... HTTP/1.1"
        let percorso = riga.split_whitespace().nth(1).unwrap_or("/");
        let Ok(url) = Url::parse(&format!("http://127.0.0.1{percorso}")) else {
            rispondi(&flusso, "400 Bad Request", PAGINA_ERRORE);
            continue;
        };
        let valore = |nome: &str| url.query_pairs().find(|(k, _)| k == nome).map(|(_, v)| v.into_owned());
        let (codice, errore) = (valore("code"), valore("error"));
        if codice.is_none() && errore.is_none() {
            rispondi(&flusso, "404 Not Found", "");
            continue;
        }
        if valore("state").as_deref() != Some(stato_atteso) {
            rispondi(&flusso, "400 Bad Request", PAGINA_ERRORE);
            return Err("Risposta di Google non riconosciuta: riprova l'accesso.".into());
        }
        if let Some(errore) = errore {
            rispondi(&flusso, "200 OK", PAGINA_ERRORE);
            return Err(if errore == "access_denied" {
                "Accesso annullato.".into()
            } else {
                format!("Google ha rifiutato l'accesso ({errore}).")
            });
        }
        rispondi(&flusso, "200 OK", PAGINA_FINE);
        return Ok(codice.unwrap());
    }
    Err("Tempo scaduto: l'accesso nel browser non è stato completato.".into())
}

fn accedi() -> Result<AccessoGoogle, String> {
    let client_id = client_id()?;
    let server = TcpListener::bind("127.0.0.1:0").map_err(|e| format!("Impossibile avviare l'accesso: {e}"))?;
    let porta = server.local_addr().map_err(|e| e.to_string())?.port();
    let redirect = format!("http://127.0.0.1:{porta}");

    let verificatore = casuale_url(32);
    let sfida = URL_SAFE_NO_PAD.encode(Sha256::digest(verificatore.as_bytes()));
    let stato = casuale_url(16);

    let url = Url::parse_with_params(
        AUTORIZZAZIONE,
        &[
            ("client_id", client_id),
            ("redirect_uri", redirect.as_str()),
            ("response_type", "code"),
            ("scope", AMBITI),
            ("code_challenge", sfida.as_str()),
            ("code_challenge_method", "S256"),
            ("state", stato.as_str()),
            // Senza "consent" Google non ridà il refresh token a chi l'ha già avuto;
            // "select_account" lascia scegliere l'account a ogni accesso
            ("access_type", "offline"),
            ("prompt", "select_account consent"),
        ],
    )
    .map_err(|e| e.to_string())?;
    open::that_detached(url.as_str()).map_err(|e| format!("Impossibile aprire il browser: {e}"))?;

    let codice = attendi_codice(&server, &stato)?;
    let r = chiedi_token(&[
        ("client_id", client_id),
        ("client_secret", client_secret()),
        ("code", codice.as_str()),
        ("code_verifier", verificatore.as_str()),
        ("grant_type", "authorization_code"),
        ("redirect_uri", redirect.as_str()),
    ])?;

    // Nella pagina di consenso si può togliere la spunta a Drive
    if !r.scope.as_deref().unwrap_or("").split(' ').any(|s| s == DRIVE) {
        return Err("Serve il permesso per i file di MyMedicalFlow su Google Drive: accedi di nuovo e lascia la spunta.".into());
    }
    let refresh = r
        .refresh_token
        .as_deref()
        .ok_or("Google non ha concesso l'accesso permanente: riprova.")?;
    voce_refresh()?
        .set_password(refresh)
        .map_err(|e| format!("Impossibile salvare l'accesso nel portachiavi: {e}"))?;
    ricorda(&r);
    log::info!("[google] accesso completato");
    Ok(AccessoGoogle { access_token: r.access_token, id_token: r.id_token })
}

/// Il token per Drive: quello in memoria se ancora valido, altrimenti uno
/// nuovo dal refresh token. `rinnova` scarta quello in memoria (Google l'ha
/// rifiutato con 401).
fn token(rinnova: bool) -> Result<String, String> {
    if !rinnova {
        if let Some(t) = TOKEN_CORRENTE.lock().unwrap().as_ref() {
            if t.scade > Instant::now() + MARGINE {
                return Ok(t.token.clone());
            }
        }
    }
    let refresh =
        leggi_refresh().ok_or_else(|| format!("{ERR_ACCESSO} Accedi con Google per usare la sincronizzazione."))?;
    let r = chiedi_token(&[
        ("client_id", client_id()?),
        ("client_secret", client_secret()),
        ("refresh_token", refresh.as_str()),
        ("grant_type", "refresh_token"),
    ])?;
    ricorda(&r);
    Ok(r.access_token)
}

fn esci() {
    *TOKEN_CORRENTE.lock().unwrap() = None;
    if let Some(refresh) = leggi_refresh() {
        // Revoca anche lato Google; se non riesce, il token resta comunque
        // inutilizzabile da qui perché lo si cancella dal portachiavi
        let _ = invia_modulo(REVOCA, &[("token", refresh.as_str())]);
    }
    cancella_refresh();
    log::info!("[google] uscita dall'account");
}

// ─── Comandi ──────────────────────────────────────────────────────────────────
// Asincroni: l'attesa del browser e le richieste in rete non devono bloccare
// la finestra.

async fn in_sottofondo<T: Send + 'static>(lavoro: impl FnOnce() -> Result<T, String> + Send + 'static) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(lavoro)
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn google_accedi() -> Result<AccessoGoogle, String> {
    in_sottofondo(accedi).await
}

#[tauri::command]
pub async fn google_token(rinnova: bool) -> Result<String, String> {
    in_sottofondo(move || token(rinnova)).await
}

/// Se c'è un accesso salvato nel portachiavi (non dice se è ancora valido).
#[tauri::command]
pub fn google_collegato() -> bool {
    leggi_refresh().is_some()
}

#[tauri::command]
pub async fn google_esci() -> Result<(), String> {
    in_sottofondo(|| {
        esci();
        Ok(())
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Esempio dell'RFC 7636 (appendice B): la sfida S256 del verificatore noto.
    #[test]
    fn sfida_pkce_come_da_rfc() {
        let verificatore = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
        let sfida = URL_SAFE_NO_PAD.encode(Sha256::digest(verificatore.as_bytes()));
        assert_eq!(sfida, "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
    }

    #[test]
    fn modulo_codificato_come_un_form() {
        assert_eq!(modulo(&[("a", "x y"), ("b", "1/2&3=4")]), "a=x+y&b=1%2F2%263%3D4");
    }

    #[test]
    fn verificatore_della_lunghezza_ammessa() {
        // RFC 7636: tra 43 e 128 caratteri
        let v = casuale_url(32);
        assert_eq!(v.len(), 43);
        assert!(v.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_'));
    }
}
