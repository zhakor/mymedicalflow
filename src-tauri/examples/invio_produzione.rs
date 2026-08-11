//! Invio di verifica al Sistema TS **reale**.
//!
//! Non è un test: i test non possono raggiungere la produzione, e la barriera
//! in `config::verifica_utilizzabile` resta al suo posto. Questo è uno
//! strumento operativo, da lanciare a mano quando si vuole accertare che il
//! giro completo funzioni contro il ministero.
//!
//! Il documento trasmesso è **reale a tutti gli effetti**: risulta nella
//! posizione del professionista e va cancellato dal portale Sistema TS quando
//! la verifica è finita.
//!
//! Tre precauzioni sono cablate qui dentro e non si possono disattivare:
//!
//! 1. `flagOpposizione = 1`, quindi **nessun codice fiscale di assistito**
//!    lascia il computer e nessuna dichiarazione precompilata viene toccata.
//!    Cancellare un documento è facile; togliere una spesa dal 730 di una
//!    persona lo è molto meno.
//! 2. Numero documento con prefisso `T`, che non può collidere con la
//!    numerazione reale delle fatture.
//! 3. Importo simbolico.
//!
//! Uso:
//!
//! ```text
//! $env:STS_CONFERMA        = "INVIO-IN-PRODUZIONE"
//! $env:STS_CF_PROPRIETARIO = "<codice fiscale del professionista>"
//! $env:STS_PIVA            = "<partita IVA>"
//! cargo run --example invio_produzione
//! ```
//!
//! Parola chiave e pincode arrivano dal portachiavi, come in esercizio.

use mymedicalflow_lib::sistema_ts::config::{Ambiente, ConfigSistemaTs};
use mymedicalflow_lib::sistema_ts::models::{
    DocumentoSpesa, IdDocumentoFiscale, Operazione, VoceSpesa,
};
use mymedicalflow_lib::sistema_ts::esegui_operazione;

/// Frase esatta richiesta per procedere: un invio del genere non deve poter
/// partire da un comando digitato per sbaglio.
const CONFERMA_ATTESA: &str = "INVIO-IN-PRODUZIONE";

const IMPORTO: f64 = 1.00;
const TIPO_SPESA: &str = "SP";

fn da_ambiente(nome: &str) -> String {
    std::env::var(nome)
        .ok()
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty())
        .unwrap_or_else(|| panic!("variabile d'ambiente {nome} mancante"))
}

/// Data odierna in formato ISO, ricavata dall'orologio di sistema.
fn oggi() -> String {
    let secondi = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .expect("orologio di sistema precedente al 1970")
        .as_secs() as i64;

    // Conversione dai giorni dall'epoca alla data civile: algoritmo di Howard
    // Hinnant, valido per tutto il calendario gregoriano proplettico.
    let giorni = secondi.div_euclid(86_400);
    let z = giorni + 719_468;
    let era = z.div_euclid(146_097);
    let giorno_dell_era = z - era * 146_097;
    let anno_dell_era =
        (giorno_dell_era - giorno_dell_era / 1_460 + giorno_dell_era / 36_524
            - giorno_dell_era / 146_096)
            / 365;
    let anno = anno_dell_era + era * 400;
    let giorno_dell_anno =
        giorno_dell_era - (365 * anno_dell_era + anno_dell_era / 4 - anno_dell_era / 100);
    let mp = (5 * giorno_dell_anno + 2) / 153;
    let giorno = giorno_dell_anno - (153 * mp + 2) / 5 + 1;
    let mese = if mp < 10 { mp + 3 } else { mp - 9 };
    let anno = if mese <= 2 { anno + 1 } else { anno };

    format!("{anno:04}-{mese:02}-{giorno:02}")
}

fn main() {
    if std::env::var("STS_CONFERMA").as_deref() != Ok(CONFERMA_ATTESA) {
        eprintln!(
            "Rifiutato: per trasmettere in produzione serve STS_CONFERMA={CONFERMA_ATTESA}"
        );
        std::process::exit(2);
    }

    let codice_fiscale = da_ambiente("STS_CF_PROPRIETARIO");
    let data = oggi();

    // Diverso a ogni esecuzione: due invii con lo stesso identificativo
    // verrebbero respinti come duplicato.
    let progressivo = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs()
        % 100_000;

    let documento = DocumentoSpesa {
        id_spesa: IdDocumentoFiscale {
            p_iva: da_ambiente("STS_PIVA"),
            data_emissione: data.clone(),
            dispositivo: 1,
            num_documento: format!("T{progressivo}"),
        },
        data_pagamento: data.clone(),
        flag_pagamento_anticipato: false,
        // Opposizione: nessun dato dell'assistito viene trasmesso
        cf_cittadino: None,
        voci_spesa: vec![VoceSpesa {
            tipo_spesa: TIPO_SPESA.into(),
            importo: IMPORTO,
            aliquota_iva: Some(0.0),
            natura_iva: None,
        }],
        pagamento_tracciato: Some("SI".into()),
        tipo_documento: Some("F".into()),
        flag_opposizione: Some("1".into()),
    };

    let config = ConfigSistemaTs {
        ambiente: Ambiente::Produzione,
        ..Default::default()
    };

    println!("\n=== INVIO AL SISTEMA TS ===");
    println!("ambiente : {}", config.ambiente);
    println!("endpoint : {}", config.ambiente.endpoint().unwrap_or("-"));
    println!("documento: {}", documento.id_spesa.num_documento);
    println!("data     : {data}");
    println!("importo  : {IMPORTO:.2} €");
    println!("assistito: nessuno (opposizione)\n");

    match esegui_operazione(&config, Operazione::Inserimento, &documento, &codice_fiscale) {
        Ok(risposta) => {
            println!("esitoChiamata: {}", risposta.esito_chiamata);
            println!("protocollo   : {:?}", risposta.protocollo);
            for m in &risposta.messaggi {
                println!("messaggio    : [{}] {} — {}", m.tipo, m.codice, m.descrizione);
            }
            if risposta.protocollo.is_some() {
                println!(
                    "\nDocumento {} registrato: cancellalo dal portale Sistema TS.",
                    documento.id_spesa.num_documento
                );
            }
        }
        Err(e) => {
            println!("invio non riuscito: {e:?}");
            std::process::exit(1);
        }
    }
}
