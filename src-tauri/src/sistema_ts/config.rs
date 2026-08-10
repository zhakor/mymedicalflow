//! Ambiente di esecuzione del Sistema Tessera Sanitaria.
//!
//! L'ambiente è un enum, mai una stringa sparsa nel codice: confondere test e
//! produzione significherebbe trasmettere all'Agenzia delle Entrate spese
//! sanitarie inventate, oppure non trasmettere quelle vere.
//!
//! Endpoint ufficiali: `endpointServiziAltriProfessionisti.txt`,
//! Development Kit ver. 20240214.

use serde::{Deserialize, Serialize};

/// Endpoint del servizio sincrono per il singolo documento di spesa.
const ENDPOINT_TEST: &str =
    "https://invioSS730pTest.sanita.finanze.it/DocumentoSpesa730pWeb/DocumentoSpesa730pPort";
const ENDPOINT_PRODUZIONE: &str =
    "https://invioSS730p.sanita.finanze.it/DocumentoSpesa730pWeb/DocumentoSpesa730pPort";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Ambiente {
    /// Nessuna richiesta lascia il computer. È il valore predefinito in sviluppo.
    Mock,
    /// Ambiente di collaudo ufficiale del Sistema TS.
    Test,
    /// Ambiente reale: le spese trasmesse finiscono nella dichiarazione.
    Produzione,
}

impl Ambiente {
    /// In sviluppo si parte sempre da `Mock`: un invio accidentale durante una
    /// prova diventerebbe una spesa sanitaria reale a nome di un paziente.
    pub fn predefinito() -> Self {
        if cfg!(debug_assertions) {
            Ambiente::Mock
        } else {
            // Anche in release la produzione resta una scelta esplicita
            Ambiente::Test
        }
    }

    /// Endpoint da contattare. `None` per `Mock`, che non esce in rete.
    pub fn endpoint(&self) -> Option<&'static str> {
        match self {
            Ambiente::Mock => None,
            Ambiente::Test => Some(ENDPOINT_TEST),
            Ambiente::Produzione => Some(ENDPOINT_PRODUZIONE),
        }
    }

    pub fn esce_in_rete(&self) -> bool {
        self.endpoint().is_some()
    }

    /// Etichetta per i log: deve essere sempre evidente su cosa si sta operando.
    pub fn etichetta(&self) -> &'static str {
        match self {
            Ambiente::Mock => "MOCK",
            Ambiente::Test => "TEST",
            Ambiente::Produzione => "PRODUZIONE",
        }
    }

    /// Verifica che l'ambiente sia utilizzabile nel contesto corrente.
    ///
    /// Durante i test automatici la produzione è vietata: nessuna suite deve
    /// poter raggiungere il Sistema TS reale, nemmeno per errore di battitura
    /// in una fixture.
    pub fn verifica_utilizzabile(&self) -> Result<(), String> {
        if cfg!(test) && *self == Ambiente::Produzione {
            return Err(
                "l'ambiente di produzione non è utilizzabile durante i test automatici".into(),
            );
        }
        Ok(())
    }
}

impl std::fmt::Display for Ambiente {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.etichetta())
    }
}

/// Comportamento simulato, usato solo quando l'ambiente è `Mock`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum EsitoMock {
    #[default]
    Successo,
    ErroreValidazione,
    ErroreAutenticazione,
    SoapFault,
    Timeout,
    ErroreServer,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfigSistemaTs {
    pub ambiente: Ambiente,
    /// Esito da simulare quando l'ambiente è `Mock`.
    #[serde(default)]
    pub esito_mock: EsitoMock,
    /// Secondi oltre i quali la richiesta viene abbandonata.
    #[serde(default = "timeout_predefinito")]
    pub timeout_secondi: u64,
}

fn timeout_predefinito() -> u64 {
    // Il servizio sincrono risponde in fretta; oltre questa soglia conviene
    // fermarsi e lasciare decidere all'utente, senza ritentare da soli.
    30
}

impl Default for ConfigSistemaTs {
    fn default() -> Self {
        Self {
            ambiente: Ambiente::predefinito(),
            esito_mock: EsitoMock::default(),
            timeout_secondi: timeout_predefinito(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn in_sviluppo_si_parte_da_mock() {
        // I test girano sempre con debug_assertions attivo
        assert_eq!(Ambiente::predefinito(), Ambiente::Mock);
        assert_eq!(ConfigSistemaTs::default().ambiente, Ambiente::Mock);
    }

    #[test]
    fn mock_non_esce_in_rete() {
        assert_eq!(Ambiente::Mock.endpoint(), None);
        assert!(!Ambiente::Mock.esce_in_rete());
    }

    #[test]
    fn i_test_non_possono_usare_la_produzione() {
        assert!(Ambiente::Produzione.verifica_utilizzabile().is_err());
        assert!(Ambiente::Test.verifica_utilizzabile().is_ok());
        assert!(Ambiente::Mock.verifica_utilizzabile().is_ok());
    }

    #[test]
    fn gli_endpoint_sono_distinti_e_in_https() {
        let test = Ambiente::Test.endpoint().unwrap();
        let prod = Ambiente::Produzione.endpoint().unwrap();

        assert_ne!(test, prod, "test e produzione puntano allo stesso indirizzo");
        for url in [test, prod] {
            assert!(url.starts_with("https://"), "endpoint non cifrato: {url}");
            assert!(url.ends_with("/DocumentoSpesa730pWeb/DocumentoSpesa730pPort"));
        }
        // L'indirizzo di collaudo si distingue per il suffisso "Test"
        assert!(test.contains("invioSS730pTest."));
        assert!(!prod.contains("Test"));
    }

    #[test]
    fn l_etichetta_rende_evidente_l_ambiente() {
        assert_eq!(Ambiente::Mock.to_string(), "MOCK");
        assert_eq!(Ambiente::Test.to_string(), "TEST");
        assert_eq!(Ambiente::Produzione.to_string(), "PRODUZIONE");
    }

    #[test]
    fn la_configurazione_si_serializza_per_il_frontend() {
        let json = serde_json::to_string(&ConfigSistemaTs::default()).unwrap();
        assert!(json.contains("\"ambiente\":\"mock\""), "{json}");
        assert!(json.contains("\"esitoMock\":\"successo\""), "{json}");
    }
}
