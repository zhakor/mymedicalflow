//! Comandi esposti all'interfaccia.
//!
//! Il frontend lavora con dati applicativi: non conosce XML, SOAP, endpoint,
//! credenziali né cifratura.

use serde::Serialize;

use super::config::{Ambiente, ConfigSistemaTs, EsitoMock};
use super::errors::ErroreSistemaTs;
use super::mapper::{self, DatiFatturaTs};
use super::models::Operazione;

/// Esito restituito all'interfaccia dopo un tentativo di trasmissione.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EsitoTrasmissione {
    pub accettata: bool,
    pub protocollo: Option<String>,
    pub ambiente: String,
    /// Codice e descrizione del primo messaggio di errore, se il documento
    /// è stato rifiutato dal Sistema TS.
    pub codice: Option<String>,
    pub descrizione: Option<String>,
}

fn config_corrente() -> ConfigSistemaTs {
    // La configurazione persistente arriverà con le credenziali; per ora vale
    // il valore predefinito, che in sviluppo è la simulazione locale.
    ConfigSistemaTs::default()
}

/// Ambiente attualmente in uso, mostrato nelle Impostazioni.
#[tauri::command]
pub fn sistema_ts_configurazione() -> ConfigSistemaTs {
    config_corrente()
}

/// Esegue un'operazione sul Sistema TS a partire dai dati della fattura.
///
/// La validazione avviene qui prima di qualunque uscita in rete: una richiesta
/// già incompleta non deve raggiungere il server.
#[tauri::command]
pub fn sistema_ts_trasmetti(
    operazione: Operazione,
    dati: DatiFatturaTs,
    esito_mock: Option<EsitoMock>,
) -> Result<EsitoTrasmissione, ErroreSistemaTs> {
    let mut config = config_corrente();
    // L'esito simulato si può forzare solo quando non si esce in rete
    if let (Ambiente::Mock, Some(esito)) = (config.ambiente, esito_mock) {
        config.esito_mock = esito;
    }

    let documento = mapper::in_documento_spesa(&dati)?;

    // Nel log non finiscono codice fiscale, importi o nomi
    log::info!(
        "[sistema_ts] {:?} documento={} ambiente={}",
        operazione,
        documento.id_spesa.num_documento,
        config.ambiente
    );

    let risposta = super::esegui_operazione(&config, operazione, &documento)?;

    if risposta.accettata() {
        log::info!(
            "[sistema_ts] accettata protocollo={}",
            risposta.protocollo.clone().unwrap_or_else(|| "-".into())
        );
        return Ok(EsitoTrasmissione {
            accettata: true,
            protocollo: risposta.protocollo,
            ambiente: config.ambiente.etichetta().to_string(),
            codice: None,
            descrizione: None,
        });
    }

    // Rifiuto applicativo: il server ha risposto, ma non ha accettato
    let (codice, descrizione) = risposta
        .primo_errore()
        .map(|e| (Some(e.codice.clone()), Some(e.descrizione.clone())))
        .unwrap_or((None, None));

    log::warn!(
        "[sistema_ts] rifiutata codice={}",
        codice.as_deref().unwrap_or("-")
    );
    Ok(EsitoTrasmissione {
        accettata: false,
        protocollo: risposta.protocollo,
        ambiente: config.ambiente.etichetta().to_string(),
        codice,
        descrizione,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn dati() -> DatiFatturaTs {
        serde_json::from_value(serde_json::json!({
            "partitaIva": "01234567897",
            "dispositivo": 1,
            "numeroFattura": "40/2026",
            "dataEmissione": "2026-03-31",
            "importo": 162.00,
            "dataPagamento": "2026-03-31",
            "pagamentoTracciato": "SI",
            "opposizione": false,
            "tipoSpesa": "SP",
            "aliquotaIva": 0.0,
            "codiceFiscaleAssistito": "RSSMRA80A01H501U"
        }))
        .unwrap()
    }

    #[test]
    fn una_trasmissione_simulata_va_a_buon_fine() {
        let esito = sistema_ts_trasmetti(Operazione::Inserimento, dati(), None).unwrap();
        assert!(esito.accettata);
        assert_eq!(esito.ambiente, "MOCK");
        assert!(esito.protocollo.unwrap().starts_with("TEST-"));
    }

    #[test]
    fn il_rifiuto_applicativo_non_e_un_errore_di_comunicazione() {
        let esito =
            sistema_ts_trasmetti(Operazione::Inserimento, dati(), Some(EsitoMock::ErroreValidazione))
                .unwrap();
        assert!(!esito.accettata);
        assert_eq!(esito.codice.as_deref(), Some("C107"));
        assert!(esito.descrizione.is_some());
    }

    #[test]
    fn i_dati_incompleti_si_fermano_prima_della_rete() {
        let mut d = dati();
        d.partita_iva = "123".into();
        let errore = sistema_ts_trasmetti(Operazione::Inserimento, d, None).unwrap_err();
        match errore {
            ErroreSistemaTs::Validazione { mancanti, .. } => {
                assert!(!mancanti.is_empty(), "va detto cosa manca");
            }
            altro => panic!("atteso errore di validazione, ottenuto {altro:?}"),
        }
    }

    #[test]
    fn il_frontend_riceve_dati_applicativi_non_xml() {
        let json = serde_json::to_string(
            &sistema_ts_trasmetti(Operazione::Inserimento, dati(), None).unwrap(),
        )
        .unwrap();
        assert!(json.contains("\"accettata\":true"), "{json}");
        assert!(json.contains("\"ambiente\":\"MOCK\""), "{json}");
        for termine in ["soap", "xmlns", "Envelope", "pincode"] {
            assert!(!json.to_lowercase().contains(termine), "dettaglio tecnico esposto: {json}");
        }
    }

    #[test]
    fn tutti_gli_esiti_simulati_sono_raggiungibili() {
        use EsitoMock::*;
        for esito in [Successo, ErroreValidazione, ErroreAutenticazione, SoapFault, Timeout, ErroreServer] {
            let r = sistema_ts_trasmetti(Operazione::Inserimento, dati(), Some(esito));
            match esito {
                Successo | ErroreValidazione => assert!(r.is_ok(), "{esito:?}"),
                _ => assert!(r.is_err(), "{esito:?} deve produrre un errore"),
            }
        }
    }
}
