//! Simulazione locale del Sistema TS.
//!
//! Serve a sviluppare e provare tutta l'interfaccia senza credenziali e senza
//! che nulla lasci il computer. È la modalità predefinita in sviluppo, così
//! una prova non può trasformarsi in una spesa sanitaria reale.

use super::config::EsitoMock;
use super::errors::ErroreSistemaTs;
use super::models::{DocumentoSpesa, MessaggioEsito, Operazione, RispostaDocumentoSpesa};

/// Protocollo simulato, riconoscibile a colpo d'occhio: comincia per `TEST-`,
/// mentre quelli veri sono diciotto cifre.
fn protocollo_simulato(documento: &DocumentoSpesa) -> String {
    format!(
        "TEST-{}-{:03}-{}",
        documento.id_spesa.data_emissione.replace('-', ""),
        documento.id_spesa.dispositivo,
        documento.id_spesa.num_documento,
    )
}

/// Restituisce l'esito richiesto senza contattare alcun server.
pub fn esegui(
    operazione: Operazione,
    documento: &DocumentoSpesa,
    esito: EsitoMock,
) -> Result<RispostaDocumentoSpesa, ErroreSistemaTs> {
    // Nel log non finiscono né codice fiscale né importi
    log::info!(
        "[sistema_ts] MOCK {:?} documento={} esito={:?}",
        operazione,
        documento.id_spesa.num_documento,
        esito
    );

    match esito {
        EsitoMock::Successo => Ok(RispostaDocumentoSpesa {
            esito_chiamata: "OK".into(),
            protocollo: Some(protocollo_simulato(documento)),
            messaggi: vec![],
        }),

        EsitoMock::ErroreValidazione => Ok(RispostaDocumentoSpesa {
            esito_chiamata: "KO".into(),
            protocollo: None,
            messaggi: vec![MessaggioEsito {
                codice: "C107".into(),
                descrizione: "Codice fiscale del cittadino non presente in anagrafe".into(),
                tipo: "E".into(),
            }],
        }),

        EsitoMock::ErroreAutenticazione => Err(ErroreSistemaTs::autenticazione()),
        EsitoMock::SoapFault => Err(ErroreSistemaTs::soap(
            Some("soapenv:Server".into()),
            "simulazione di SOAP Fault",
        )),
        EsitoMock::Timeout => Err(ErroreSistemaTs::timeout()),
        EsitoMock::ErroreServer => Err(ErroreSistemaTs::server(500)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sistema_ts::models::{IdDocumentoFiscale, VoceSpesa};

    /// Documento di prova con dati palesemente fittizi.
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
    fn il_successo_restituisce_un_protocollo_riconoscibile() {
        let r = esegui(Operazione::Inserimento, &documento(), EsitoMock::Successo).unwrap();
        assert!(r.accettata());
        let protocollo = r.protocollo.unwrap();
        assert!(
            protocollo.starts_with("TEST-"),
            "un protocollo simulato deve distinguersi da uno reale: {protocollo}"
        );
        assert!(protocollo.contains("20260331"));
    }

    #[test]
    fn l_errore_di_validazione_arriva_come_risposta_non_come_eccezione() {
        // Il Sistema TS risponde 200 con un messaggio di errore applicativo:
        // va trattato come rifiuto, non come guasto della comunicazione.
        let r = esegui(Operazione::Inserimento, &documento(), EsitoMock::ErroreValidazione).unwrap();
        assert!(!r.accettata());
        assert_eq!(r.primo_errore().unwrap().codice, "C107");
        assert!(r.protocollo.is_none());
    }

    #[test]
    fn gli_esiti_di_guasto_diventano_errori() {
        for esito in [
            EsitoMock::ErroreAutenticazione,
            EsitoMock::SoapFault,
            EsitoMock::Timeout,
            EsitoMock::ErroreServer,
        ] {
            let r = esegui(Operazione::Inserimento, &documento(), esito);
            assert!(r.is_err(), "atteso errore per {esito:?}");
        }
    }

    #[test]
    fn timeout_ed_errore_server_lasciano_l_esito_incerto() {
        for esito in [EsitoMock::Timeout, EsitoMock::ErroreServer] {
            let e = esegui(Operazione::Inserimento, &documento(), esito).unwrap_err();
            assert!(e.esito_incerto(), "{esito:?} deve risultare incerto");
            assert!(!e.ritentabile(), "{esito:?} non va ritentato da solo");
        }
    }

    #[test]
    fn protocolli_diversi_per_documenti_diversi() {
        let a = esegui(Operazione::Inserimento, &documento(), EsitoMock::Successo).unwrap();
        let mut d = documento();
        d.id_spesa.num_documento = "41".into();
        let b = esegui(Operazione::Inserimento, &d, EsitoMock::Successo).unwrap();
        assert_ne!(a.protocollo, b.protocollo);
    }

    #[test]
    fn tutte_le_operazioni_sono_simulabili() {
        for op in [
            Operazione::Inserimento,
            Operazione::Variazione,
            Operazione::Cancellazione,
            Operazione::Rimborso,
        ] {
            assert!(esegui(op, &documento(), EsitoMock::Successo).is_ok());
        }
    }
}
