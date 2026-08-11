//! Client HTTP verso il servizio sincrono del Sistema TS.
//!
//! L'autenticazione è **HTTP Basic preventiva**: le credenziali partono con la
//! prima richiesta, senza attendere una sfida `401`. È quanto prescrivono le
//! indicazioni tecniche ministeriali; l'header SOAP resta vuoto.
//!
//! La verifica del certificato TLS non viene mai disattivata: qui viaggiano
//! codici fiscali e importi di prestazioni sanitarie.

use std::time::Duration;

use super::config::{Ambiente, ConfigSistemaTs};
use super::errors::ErroreSistemaTs;
use super::models::{DocumentoSpesa, Operazione, RispostaDocumentoSpesa};
use super::xml;

/// Credenziali del professionista presso il Sistema TS.
///
/// Non vengono mai registrate nei log né restituite all'interfaccia.
#[derive(Clone)]
pub struct Credenziali {
    /// Codice identificativo: codice fiscale oppure nickname.
    pub utente: String,
    pub password: String,
    /// Viaggia cifrato dentro la richiesta, oltre all'autenticazione HTTP.
    pub pincode: String,
    pub cf_proprietario: String,
}

impl std::fmt::Debug for Credenziali {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        // Un Debug che stampasse i campi finirebbe prima o poi in un log
        f.write_str("Credenziali { <omesse> }")
    }
}

/// Traduce l'errore di trasporto distinguendo i casi in cui l'esito resta
/// incerto: dopo un timeout la richiesta potrebbe essere già stata elaborata.
fn errore_trasporto(e: &reqwest::Error) -> ErroreSistemaTs {
    log::error!("[sistema_ts] errore di trasporto: {e}");
    if e.is_timeout() {
        ErroreSistemaTs::timeout()
    } else if e.is_connect() || e.is_request() {
        ErroreSistemaTs::rete_non_raggiungibile()
    } else {
        ErroreSistemaTs::rete_non_raggiungibile()
    }
}

/// Certificato della CA che firma il server di **collaudo**.
///
/// L'ambiente di test usa `CN=Sogei Certification Authority Test`, una CA
/// privata assente dagli elenchi pubblici, e il server non invia l'intermedio:
/// senza questa radice l'handshake fallisce con "untrusted root".
///
/// Scaricato dalla directory ufficiale della CA, indicata dal certificato del
/// server stesso: `ldap://cads.finanze.it/CN=Sogei Certification Authority
/// Test,O=Sogei,C=IT`, attributo `cACertificate`.
///
/// La **produzione** non ne ha bisogno: il suo certificato è emesso da Sectigo,
/// una CA pubblica già presente negli elenchi standard.
const CA_COLLAUDO: &[u8] = include_bytes!("../../resources/sistema_ts/SogeiCaTest.cer");

/// Invia la richiesta all'indirizzo indicato e interpreta la risposta.
///
/// `radice_collaudo` aggiunge la CA di Sogei alle radici fidate. È
/// un'**aggiunta**, non una deroga: la verifica del certificato resta attiva e
/// gli altri host continuano a essere validati con gli elenchi pubblici.
fn invia_a(
    url: &str,
    operazione: Operazione,
    documento: &DocumentoSpesa,
    credenziali: &Credenziali,
    timeout_secondi: u64,
    radice_collaudo: bool,
) -> Result<RispostaDocumentoSpesa, ErroreSistemaTs> {
    let corpo = xml::componi_richiesta(
        operazione,
        documento,
        &credenziali.pincode,
        &credenziali.cf_proprietario,
    )?;

    let mut costruttore = reqwest::blocking::Client::builder()
        // Nessuna deroga sulla verifica del certificato del server
        .timeout(Duration::from_secs(timeout_secondi));

    if radice_collaudo {
        let ca = reqwest::Certificate::from_pem(CA_COLLAUDO).map_err(|e| {
            log::error!("[sistema_ts] CA di collaudo non leggibile: {e}");
            ErroreSistemaTs::configurazione(
                "Il certificato della CA di collaudo non è utilizzabile.",
            )
        })?;
        costruttore = costruttore.add_root_certificate(ca);
    }

    let cliente = costruttore.build().map_err(|e| errore_trasporto(&e))?;

    let risposta = cliente
        .post(url)
        .header("Content-Type", "text/xml; charset=utf-8")
        .header("SOAPAction", operazione.soap_action())
        // `basic_auth` scrive l'header subito: è l'autenticazione preventiva
        // richiesta dal Sistema TS, che non invia una sfida 401.
        .basic_auth(&credenziali.utente, Some(&credenziali.password))
        .body(corpo)
        .send()
        .map_err(|e| errore_trasporto(&e))?;

    let stato = risposta.status();
    let testo = risposta.text().map_err(|e| errore_trasporto(&e))?;

    if stato == reqwest::StatusCode::UNAUTHORIZED || stato == reqwest::StatusCode::FORBIDDEN {
        return Err(ErroreSistemaTs::autenticazione());
    }
    if stato.is_server_error() {
        // Il server ha ricevuto la richiesta: non si puo' escludere che
        // l'abbia elaborata prima di fallire.
        return Err(ErroreSistemaTs::server(stato.as_u16()));
    }
    // Un 500 con SOAP Fault è già stato intercettato sopra; per gli altri
    // codici non riusciti si prova comunque a leggere il corpo, che spesso
    // contiene un fault esplicativo.
    if !stato.is_success() && xml::analizza_fault(&testo).is_none() {
        log::error!("[sistema_ts] risposta HTTP {stato}");
        return Err(ErroreSistemaTs::server(stato.as_u16()));
    }

    xml::analizza_risposta(&testo)
}

/// Invia usando l'ambiente configurato.
pub fn invia(
    config: &ConfigSistemaTs,
    operazione: Operazione,
    documento: &DocumentoSpesa,
    credenziali: &Credenziali,
) -> Result<RispostaDocumentoSpesa, ErroreSistemaTs> {
    config
        .ambiente
        .verifica_utilizzabile()
        .map_err(ErroreSistemaTs::configurazione)?;

    let url = config.ambiente.endpoint().ok_or_else(|| {
        ErroreSistemaTs::configurazione("L'ambiente selezionato non prevede l'invio in rete.")
    })?;

    // Il log rende sempre evidente su quale ambiente si sta operando,
    // senza mai riportare credenziali o dati del paziente.
    log::info!(
        "[sistema_ts] AMBIENTE: {} — invio {:?} documento={}",
        config.ambiente,
        operazione,
        documento.id_spesa.num_documento
    );

    // La CA privata serve solo al collaudo: gli altri ambienti usano gli
    // elenchi pubblici, e il locale non fa nemmeno TLS.
    let radice_collaudo = config.ambiente == Ambiente::Test;
    invia_a(
        url,
        operazione,
        documento,
        credenziali,
        config.timeout_secondi,
        radice_collaudo,
    )
}

/// Vero se l'ambiente contatta davvero il Sistema TS.
pub fn esce_in_rete(config: &ConfigSistemaTs) -> bool {
    config.ambiente != Ambiente::Mock
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sistema_ts::models::{IdDocumentoFiscale, VoceSpesa};
    use std::io::{Read, Write};
    use std::net::TcpListener;
    use std::sync::mpsc;

    fn documento() -> DocumentoSpesa {
        DocumentoSpesa {
            id_spesa: IdDocumentoFiscale {
                p_iva: "01234567897".into(),
                data_emissione: "2026-03-31".into(),
                dispositivo: 1,
                num_documento: "40".into(),
            },
            data_pagamento: "2026-03-31".into(),
            flag_pagamento_anticipato: false,
            cf_cittadino: Some("RSSMRA80A01H501U".into()),
            voci_spesa: vec![VoceSpesa {
                tipo_spesa: "SP".into(),
                importo: 162.0,
                aliquota_iva: Some(0.0),
                natura_iva: None,
            }],
            pagamento_tracciato: Some("SI".into()),
            tipo_documento: Some("F".into()),
            flag_opposizione: Some("0".into()),
        }
    }

    fn credenziali() -> Credenziali {
        Credenziali {
            utente: "UTENTETEST".into(),
            password: "prova".into(),
            pincode: "1234".into(),
            cf_proprietario: "RSSMRA80A01H501U".into(),
        }
    }

    /// Server finto in ascolto su una porta libera: nessun test tocca la rete.
    /// Restituisce l'indirizzo e un canale con la richiesta ricevuta.
    fn server_finto(risposta_http: &'static str) -> (String, mpsc::Receiver<String>) {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let porta = listener.local_addr().unwrap().port();
        let (tx, rx) = mpsc::channel();

        std::thread::spawn(move || {
            if let Ok((mut flusso, _)) = listener.accept() {
                let mut buffer = [0u8; 8192];
                let letti = flusso.read(&mut buffer).unwrap_or(0);
                let _ = tx.send(String::from_utf8_lossy(&buffer[..letti]).into_owned());
                let _ = flusso.write_all(risposta_http.as_bytes());
                let _ = flusso.flush();
            }
        });

        (format!("http://127.0.0.1:{porta}/DocumentoSpesa730pPort"), rx)
    }

    fn risposta_soap(corpo: &str) -> String {
        format!(
            "HTTP/1.1 200 OK\r\nContent-Type: text/xml; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{corpo}",
            corpo.len()
        )
    }

    const RISPOSTA_OK: &str = concat!(
        "HTTP/1.1 200 OK\r\nContent-Type: text/xml\r\nConnection: close\r\n\r\n",
        "<Envelope><Body><inserimentoDocumentoSpesaResponse>",
        "<esitoChiamata>OK</esitoChiamata><protocollo>99260526656625148</protocollo>",
        "<listaMessaggi/></inserimentoDocumentoSpesaResponse></Body></Envelope>"
    );

    #[test]
    fn invia_con_autenticazione_preventiva_e_soapaction() {
        let (url, richieste) = server_finto(RISPOSTA_OK);
        let esito = invia_a(&url, Operazione::Inserimento, &documento(), &credenziali(), 10, false).unwrap();
        assert!(esito.accettata());
        assert_eq!(esito.protocollo.as_deref(), Some("99260526656625148"));

        // I nomi degli header sono insensibili al maiuscolo e reqwest li scrive
        // in minuscolo: il confronto va fatto normalizzando.
        let richiesta = richieste.recv_timeout(Duration::from_secs(5)).unwrap();
        let intestazioni = richiesta.to_lowercase();

        // L'autenticazione parte subito, senza attendere una sfida 401
        assert!(
            intestazioni.contains("authorization: basic "),
            "autenticazione non preventiva:\n{richiesta}"
        );
        // VVRFTlRFVEVTVDpwcm92YQ== è base64 di "UTENTETEST:prova"
        assert!(
            richiesta.contains("Basic VVRFTlRFVEVTVDpwcm92YQ=="),
            "credenziali diverse dall'atteso"
        );
        assert!(intestazioni
            .contains("soapaction: inserimento.documentospesap730.sanita.finanze.it"));
        assert!(intestazioni.contains("content-type: text/xml"));
    }

    #[test]
    fn la_richiesta_non_contiene_dati_in_chiaro() {
        let (url, richieste) = server_finto(RISPOSTA_OK);
        let _ = invia_a(&url, Operazione::Inserimento, &documento(), &credenziali(), 10, false);

        let richiesta = richieste.recv_timeout(Duration::from_secs(5)).unwrap();
        assert!(!richiesta.contains("RSSMRA80A01H501U"), "codice fiscale in chiaro");
        assert!(!richiesta.contains("<doc:pincode>1234<"), "pincode in chiaro");
    }

    #[test]
    fn un_errore_applicativo_arriva_come_risposta() {
        let corpo = "<Envelope><Body><inserimentoDocumentoSpesaResponse>\
            <esitoChiamata>KO</esitoChiamata><listaMessaggi><messaggio>\
            <codice>C107</codice><descrizione>CF non in anagrafe</descrizione><tipo>E</tipo>\
            </messaggio></listaMessaggi></inserimentoDocumentoSpesaResponse></Body></Envelope>";
        let risposta: &'static str = Box::leak(risposta_soap(corpo).into_boxed_str());
        let (url, _) = server_finto(risposta);

        let esito = invia_a(&url, Operazione::Inserimento, &documento(), &credenziali(), 10, false).unwrap();
        assert!(!esito.accettata());
        assert_eq!(esito.primo_errore().unwrap().codice, "C107");
    }

    #[test]
    fn il_soap_fault_diventa_un_errore() {
        let corpo = "<env:Envelope xmlns:env=\"http://schemas.xmlsoap.org/soap/envelope/\"><env:Body>\
            <env:Fault><faultcode>env:Client</faultcode>\
            <faultstring>cvc-particle 2.1: next item should be pincode</faultstring>\
            </env:Fault></env:Body></env:Envelope>";
        let risposta: &'static str = Box::leak(
            format!("HTTP/1.1 500 Internal Server Error\r\nContent-Type: text/xml\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{corpo}", corpo.len())
                .into_boxed_str(),
        );
        let (url, _) = server_finto(risposta);

        let errore = invia_a(&url, Operazione::Inserimento, &documento(), &credenziali(), 10, false)
            .unwrap_err();
        // Un 500 e' comunque una risposta del server: l'esito resta incerto
        assert!(errore.esito_incerto(), "un 500 deve lasciare l'esito incerto");
    }

    #[test]
    fn le_credenziali_rifiutate_producono_un_errore_di_autenticazione() {
        for stato in ["401 Unauthorized", "403 Forbidden"] {
            let risposta: &'static str = Box::leak(
                format!("HTTP/1.1 {stato}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n")
                    .into_boxed_str(),
            );
            let (url, _) = server_finto(risposta);
            let errore =
                invia_a(&url, Operazione::Inserimento, &documento(), &credenziali(), 10, false).unwrap_err();
            assert!(
                matches!(errore, ErroreSistemaTs::Autenticazione { .. }),
                "atteso errore di autenticazione per {stato}"
            );
            assert!(!errore.ritentabile(), "riprovare con le stesse credenziali e' inutile");
        }
    }

    #[test]
    fn un_errore_del_server_lascia_l_esito_incerto() {
        let risposta: &'static str =
            "HTTP/1.1 503 Service Unavailable\r\nContent-Length: 0\r\nConnection: close\r\n\r\n";
        let (url, _) = server_finto(risposta);
        let errore =
            invia_a(&url, Operazione::Inserimento, &documento(), &credenziali(), 10, false).unwrap_err();
        assert!(errore.esito_incerto());
        assert!(!errore.ritentabile(), "non si ritenta alla cieca dopo un 5xx");
    }

    #[test]
    fn una_risposta_malformata_non_viene_interpretata_a_meta() {
        let risposta: &'static str = Box::leak(
            risposta_soap("<html><body>Gateway timeout</body></html>").into_boxed_str(),
        );
        let (url, _) = server_finto(risposta);
        assert!(invia_a(&url, Operazione::Inserimento, &documento(), &credenziali(), 10, false).is_err());
    }

    #[test]
    fn il_timeout_scatta_e_lascia_l_esito_incerto() {
        // Server che accetta la connessione e non risponde mai
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let porta = listener.local_addr().unwrap().port();
        std::thread::spawn(move || {
            if let Ok((flusso, _)) = listener.accept() {
                std::thread::sleep(Duration::from_secs(5));
                drop(flusso);
            }
        });

        let url = format!("http://127.0.0.1:{porta}/");
        let errore =
            invia_a(&url, Operazione::Inserimento, &documento(), &credenziali(), 1, false).unwrap_err();
        assert!(errore.esito_incerto(), "il timeout deve lasciare l'esito incerto");
        assert!(!errore.ritentabile());
    }

    #[test]
    fn le_credenziali_non_finiscono_nel_debug() {
        let testo = format!("{:?}", credenziali());
        for segreto in ["prova", "1234", "RSSMRA80A01H501U", "UTENTETEST"] {
            assert!(!testo.contains(segreto), "credenziale esposta nel Debug: {testo}");
        }
    }

    #[test]
    fn la_produzione_resta_irraggiungibile_dai_test() {
        let config = ConfigSistemaTs {
            ambiente: Ambiente::Produzione,
            ..Default::default()
        };
        let errore =
            invia(&config, Operazione::Inserimento, &documento(), &credenziali()).unwrap_err();
        assert!(matches!(errore, ErroreSistemaTs::Configurazione { .. }));
    }

    /// Legge una credenziale dall'ambiente, spiegando cosa manca se assente.
    fn da_ambiente(nome: &str) -> String {
        std::env::var(nome).unwrap_or_else(|_| {
            panic!(
                "manca la variabile {nome}.\n\
                 Le credenziali di collaudo stanno in resources/sistema_ts/\
                 SoggettoAltriProfessionisti/UtenzeTestAltriProfessionisti.txt\n\
                 Impostare: STS_UTENTE, STS_PASSWORD, STS_PINCODE, STS_CF_PROPRIETARIO, STS_PIVA"
            )
        })
    }

    /// Invio reale all'ambiente di collaudo ministeriale.
    ///
    /// Escluso dalla suite: si esegue solo a mano, con
    /// `cargo test --lib invio_reale_al_collaudo -- --ignored --nocapture`.
    /// Nessuna esecuzione automatica puo' quindi contattare il Sistema TS.
    ///
    /// Il documento viaggia con `flagOpposizione = 1`, quindi **senza codice
    /// fiscale dell'assistito**: la prova non inserisce nel collaudo i dati di
    /// una persona reale, e non serve cifrare alcun dato del paziente.
    #[test]
    #[ignore = "contatta il collaudo ministeriale: eseguire a mano con --ignored"]
    fn invio_reale_al_collaudo() {
        let credenziali = Credenziali {
            utente: da_ambiente("STS_UTENTE"),
            password: da_ambiente("STS_PASSWORD"),
            pincode: da_ambiente("STS_PINCODE"),
            cf_proprietario: da_ambiente("STS_CF_PROPRIETARIO"),
        };

        // Numero diverso a ogni esecuzione: due invii con lo stesso
        // identificativo verrebbero respinti come duplicato.
        let progressivo = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs()
            % 100_000;

        let mut documento = documento();
        documento.id_spesa.p_iva = da_ambiente("STS_PIVA");
        documento.id_spesa.num_documento = format!("T{progressivo}");

        // Con `STS_CF_ASSISTITO` si prova la variante con codice fiscale e
        // opposizione a 0; senza, si trasmette in opposizione e nessun dato
        // del cittadino lascia il computer.
        match std::env::var("STS_CF_ASSISTITO").ok().filter(|c| !c.trim().is_empty()) {
            Some(cf) => {
                documento.cf_cittadino = Some(cf);
                documento.flag_opposizione = Some("0".into());
            }
            None => {
                documento.cf_cittadino = None;
                documento.flag_opposizione = Some("1".into());
            }
        }

        let url = Ambiente::Test.endpoint().expect("endpoint di collaudo assente");
        println!("\n=== INVIO AL COLLAUDO ===");
        println!("ambiente : {}", Ambiente::Test);
        println!("endpoint : {url}");
        println!("documento: {}", documento.id_spesa.num_documento);
        println!(
            "opposizione: {} — codice fiscale {}\n",
            documento.flag_opposizione.as_deref().unwrap_or("-"),
            if documento.cf_cittadino.is_some() { "trasmesso (fittizio)" } else { "non trasmesso" }
        );

        match invia_a(url, Operazione::Inserimento, &documento, &credenziali, 60, true) {
            Ok(risposta) => {
                println!("esitoChiamata: {}", risposta.esito_chiamata);
                println!("protocollo   : {:?}", risposta.protocollo);
                for m in &risposta.messaggi {
                    println!("messaggio    : [{}] {} — {}", m.tipo, m.codice, m.descrizione);
                }
                assert!(
                    risposta.accettata(),
                    "documento non accettato: {:?}",
                    risposta.primo_errore()
                );
            }
            Err(e) => panic!("invio non riuscito: {e:?}"),
        }
    }

    #[test]
    fn in_mock_non_si_esce_in_rete() {
        let config = ConfigSistemaTs {
            ambiente: Ambiente::Mock,
            ..Default::default()
        };
        assert!(!esce_in_rete(&config));
        // Senza endpoint l'invio diretto non è possibile
        assert!(invia(&config, Operazione::Inserimento, &documento(), &credenziali()).is_err());
    }
}
