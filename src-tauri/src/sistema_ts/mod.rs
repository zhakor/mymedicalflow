//! Integrazione con il Sistema Tessera Sanitaria.
//!
//! Tutto ciò che riguarda SOAP, credenziali e cifratura resta qui: il resto
//! dell'app lavora con comandi applicativi e non conosce il tracciato
//! ministeriale.
//!
//! Fonti: `DocumentoSpesa730p.wsdl`, `DocumentoSpesa730pSchema.xsd` e
//! `endpointServiziAltriProfessionisti.txt` del Development Kit ver. 20240214,
//! copiati in `src-tauri/resources/sistema_ts/`.

pub mod commands;
pub mod config;
pub mod crypto;
pub mod errors;
pub mod mapper;
pub mod mock;
pub mod models;

pub use config::{Ambiente, ConfigSistemaTs};
pub use errors::ErroreSistemaTs;
pub use models::{DocumentoSpesa, Operazione, RispostaDocumentoSpesa};

/// Esegue un'operazione sul Sistema TS.
///
/// In `Mock` non parte alcuna richiesta di rete. Gli altri ambienti non sono
/// ancora collegati: la trasmissione reale richiede credenziali e cifratura del
/// codice fiscale, che arrivano nel passo successivo.
pub fn esegui_operazione(
    config: &ConfigSistemaTs,
    operazione: Operazione,
    documento: &DocumentoSpesa,
) -> Result<RispostaDocumentoSpesa, ErroreSistemaTs> {
    config
        .ambiente
        .verifica_utilizzabile()
        .map_err(ErroreSistemaTs::configurazione)?;

    log::info!(
        "[sistema_ts] AMBIENTE: {} — operazione {:?}",
        config.ambiente,
        operazione
    );

    match config.ambiente {
        Ambiente::Mock => mock::esegui(operazione, documento, config.esito_mock),
        Ambiente::Test | Ambiente::Produzione => Err(ErroreSistemaTs::configurazione(
            "La trasmissione al Sistema TS non è ancora attiva: al momento è disponibile solo la simulazione locale.",
        )),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use models::{IdDocumentoFiscale, VoceSpesa};

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
                importo: 162.00,
                aliquota_iva: Some(0.0),
                natura_iva: None,
            }],
            pagamento_tracciato: Some("SI".into()),
            tipo_documento: Some("F".into()),
            flag_opposizione: Some("0".into()),
        }
    }

    #[test]
    fn in_mock_la_trasmissione_funziona_senza_rete() {
        let config = ConfigSistemaTs::default();
        assert_eq!(config.ambiente, Ambiente::Mock);
        assert!(!config.ambiente.esce_in_rete());

        let r = esegui_operazione(&config, Operazione::Inserimento, &documento()).unwrap();
        assert!(r.accettata());
    }

    #[test]
    fn la_produzione_e_rifiutata_durante_i_test() {
        // Rete di sicurezza: nessuna suite deve poter raggiungere il Sistema TS
        // reale, nemmeno per una configurazione sbagliata in una fixture.
        let config = ConfigSistemaTs {
            ambiente: Ambiente::Produzione,
            ..Default::default()
        };
        let errore = esegui_operazione(&config, Operazione::Inserimento, &documento()).unwrap_err();
        assert!(
            matches!(errore, ErroreSistemaTs::Configurazione { .. }),
            "atteso rifiuto di configurazione, ottenuto {errore:?}"
        );
    }
}
