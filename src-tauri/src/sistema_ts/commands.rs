//! Comandi esposti all'interfaccia.
//!
//! Il frontend lavora con dati applicativi: non conosce XML, SOAP, endpoint,
//! credenziali né cifratura.

use serde::Serialize;

use super::config::{Ambiente, ConfigSistemaTs, EsitoMock};
use super::errors::ErroreSistemaTs;
use super::mapper::{self, DatiFatturaTs};
use super::models::{CategoriaMessaggio, Operazione, RispostaDocumentoSpesa};

/// Un messaggio del Sistema TS così come arriva all'interfaccia.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MessaggioTrasmissione {
    pub codice: String,
    pub descrizione: String,
    /// Valore originale restituito dal Sistema TS (es. `E`, `W`, `I`).
    pub tipo: String,
    pub categoria: CategoriaMessaggio,
}

/// Esito restituito all'interfaccia dopo un tentativo di trasmissione.
///
/// `accettata` e `messaggi` sono due dimensioni indipendenti: un'operazione
/// accettata può comunque portare avvisi, e un rifiuto può contenere più di
/// un messaggio applicativo. Nessuno dei due va dedotto dall'altro.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EsitoTrasmissione {
    pub accettata: bool,
    pub protocollo: Option<String>,
    pub ambiente: String,
    /// Tutti i messaggi restituiti dal Sistema TS, nell'ordine originale.
    pub messaggi: Vec<MessaggioTrasmissione>,
}

/// Converte la risposta del Sistema TS nell'esito applicativo.
///
/// Funzione pura, senza rete né log: mappa ogni messaggio indipendentemente
/// dall'esito complessivo, così un successo con avvisi o un rifiuto con più
/// errori non perdono nulla lungo la strada.
fn in_esito_trasmissione(risposta: RispostaDocumentoSpesa, ambiente: &str) -> EsitoTrasmissione {
    let accettata = risposta.accettata();
    let messaggi = risposta
        .messaggi
        .into_iter()
        .map(|m| {
            let categoria = m.categoria();
            MessaggioTrasmissione {
                codice: m.codice,
                descrizione: m.descrizione,
                tipo: m.tipo,
                categoria,
            }
        })
        .collect();

    EsitoTrasmissione {
        accettata,
        protocollo: risposta.protocollo,
        ambiente: ambiente.to_string(),
        messaggi,
    }
}

fn config_corrente() -> ConfigSistemaTs {
    // In runtime l'app usa l'ambiente configurato (Test/Produzione). Nelle
    // suite automatiche invece si preferisce la simulazione locale per
    // mantenere i test deterministici e senza dipendenze di rete.
    if cfg!(test) {
        ConfigSistemaTs {
            ambiente: Ambiente::Mock,
            ..Default::default()
        }
    } else {
        ConfigSistemaTs::default()
    }
}

/// Ambiente attualmente in uso, mostrato nelle Impostazioni.
#[tauri::command]
pub fn sistema_ts_configurazione() -> ConfigSistemaTs {
    config_corrente()
}

// ─── Credenziali ──────────────────────────────────────────────────────────────

/// Dice al frontend **se** le credenziali ci sono, mai quali sono.
#[tauri::command]
pub fn sistema_ts_credenziali_stato() -> super::credenziali::StatoCredenziali {
    super::credenziali::stato()
}

/// Salva parola chiave e pincode nel portachiavi del sistema.
///
/// I valori arrivano dal profilo e non tornano mai indietro: da qui in poi li
/// legge soltanto il backend, al momento dell'invio.
#[tauri::command]
pub fn sistema_ts_credenziali_salva(
    parola_chiave: String,
    pincode: String,
) -> Result<super::credenziali::StatoCredenziali, ErroreSistemaTs> {
    super::credenziali::salva(&parola_chiave, &pincode)?;
    Ok(super::credenziali::stato())
}

#[tauri::command]
pub fn sistema_ts_credenziali_elimina() -> Result<super::credenziali::StatoCredenziali, ErroreSistemaTs>
{
    super::credenziali::elimina()?;
    Ok(super::credenziali::stato())
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

    let risposta = super::esegui_operazione(
        &config,
        operazione,
        &documento,
        &dati.codice_fiscale_professionista,
    )?;
    let esito = in_esito_trasmissione(risposta, config.ambiente.etichetta());

    if esito.accettata {
        log::info!(
            "[sistema_ts] accettata protocollo={} avvisi={}",
            esito.protocollo.as_deref().unwrap_or("-"),
            esito.messaggi.len()
        );
    } else {
        log::warn!(
            "[sistema_ts] rifiutata messaggi={} primo_codice={}",
            esito.messaggi.len(),
            esito
                .messaggi
                .first()
                .map(|m| m.codice.as_str())
                .unwrap_or("-")
        );
    }

    Ok(esito)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sistema_ts::models::MessaggioEsito;

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

    fn messaggio(codice: &str, descrizione: &str, tipo: &str) -> MessaggioEsito {
        MessaggioEsito {
            codice: codice.into(),
            descrizione: descrizione.into(),
            tipo: tipo.into(),
        }
    }

    fn risposta(protocollo: Option<&str>, messaggi: Vec<MessaggioEsito>) -> RispostaDocumentoSpesa {
        RispostaDocumentoSpesa {
            esito_chiamata: if protocollo.is_some() { "OK" } else { "KO" }.into(),
            protocollo: protocollo.map(str::to_string),
            messaggi,
        }
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
        let esito = sistema_ts_trasmetti(
            Operazione::Inserimento,
            dati(),
            Some(EsitoMock::ErroreValidazione),
        )
        .unwrap();
        assert!(!esito.accettata);
        assert_eq!(esito.messaggi.len(), 1);
        assert_eq!(esito.messaggi[0].codice, "C107");
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
            assert!(
                !json.to_lowercase().contains(termine),
                "dettaglio tecnico esposto: {json}"
            );
        }
    }

    #[test]
    fn tutti_gli_esiti_simulati_sono_raggiungibili() {
        use EsitoMock::*;
        for esito in [
            Successo,
            ErroreValidazione,
            ErroreAutenticazione,
            SoapFault,
            Timeout,
            ErroreServer,
        ] {
            let r = sistema_ts_trasmetti(Operazione::Inserimento, dati(), Some(esito));
            match esito {
                Successo | ErroreValidazione => assert!(r.is_ok(), "{esito:?}"),
                _ => assert!(r.is_err(), "{esito:?} deve produrre un errore"),
            }
        }
    }

    // ─── Mapping risposta → esito applicativo ────────────────────────────────
    //
    // Questi test passano direttamente per `in_esito_trasmissione`: non hanno
    // bisogno di rete né di mock, verificano solo che nessun messaggio vada
    // perso indipendentemente da quanti siano o da come finisce l'operazione.

    #[test]
    fn nessun_messaggio_risposta_vuota() {
        let esito = in_esito_trasmissione(risposta(Some("99260526656625148"), vec![]), "TEST");
        assert!(esito.accettata);
        assert_eq!(esito.messaggi.len(), 0);
    }

    #[test]
    fn un_errore_singolo() {
        let r = risposta(
            None,
            vec![messaggio(
                "QA101",
                "Codice fiscale assistito non valido",
                "E",
            )],
        );
        let esito = in_esito_trasmissione(r, "TEST");
        assert!(!esito.accettata);
        assert_eq!(esito.messaggi.len(), 1);
    }

    /// Regression: il bug segnalato riduceva la risposta al solo primo
    /// messaggio, perdendo QA102.
    #[test]
    fn conserva_tutti_i_messaggi_sts() {
        let r = risposta(
            None,
            vec![
                messaggio("QA101", "Codice fiscale assistito non valido", "E"),
                messaggio("QA102", "Importo non coerente con il documento", "E"),
            ],
        );
        let esito = in_esito_trasmissione(r, "TEST");
        assert!(!esito.accettata);
        assert_eq!(esito.messaggi.len(), 2);
        assert_eq!(esito.messaggi[0].codice, "QA101");
        assert_eq!(esito.messaggi[1].codice, "QA102");
    }

    /// Regression: un avviso su una risposta accettata veniva scartato del
    /// tutto invece di essere mostrato insieme al protocollo.
    #[test]
    fn successo_con_warning_non_perde_la_segnalazione() {
        let r = risposta(
            Some("QA-20260810-000002"),
            vec![messaggio(
                "QA200",
                "Documento acquisito con segnalazioni",
                "W",
            )],
        );
        let esito = in_esito_trasmissione(r, "TEST");
        assert!(esito.accettata);
        assert_eq!(esito.protocollo.as_deref(), Some("QA-20260810-000002"));
        assert_eq!(esito.messaggi.len(), 1);
        assert_eq!(esito.messaggi[0].categoria, CategoriaMessaggio::Avviso);
    }

    #[test]
    fn piu_avvisi_vengono_preservati() {
        let r = risposta(
            Some("QA-1"),
            vec![
                messaggio("QA200", "prima segnalazione", "W"),
                messaggio("QA201", "seconda segnalazione", "W"),
            ],
        );
        let esito = in_esito_trasmissione(r, "TEST");
        assert!(esito.accettata);
        assert_eq!(esito.messaggi.len(), 2);
    }

    #[test]
    fn messaggi_misti_non_vengono_persi() {
        let r = risposta(
            None,
            vec![
                messaggio("QA000", "informazione", "I"),
                messaggio("QA200", "segnalazione", "W"),
                messaggio("QA101", "errore bloccante", "E"),
            ],
        );
        let esito = in_esito_trasmissione(r, "TEST");
        // Un errore in mezzo ad altri messaggi blocca comunque l'accettazione
        assert!(!esito.accettata);
        assert_eq!(esito.messaggi.len(), 3);
        assert_eq!(
            esito.messaggi[0].categoria,
            CategoriaMessaggio::Informazione
        );
        assert_eq!(esito.messaggi[1].categoria, CategoriaMessaggio::Avviso);
        assert_eq!(esito.messaggi[2].categoria, CategoriaMessaggio::Errore);
    }
}
