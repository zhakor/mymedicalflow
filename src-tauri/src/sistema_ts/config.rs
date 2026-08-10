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
/// Test e produzione vengono da `endpointServiziAltriProfessionisti.txt`.
const ENDPOINT_LOCALE: &str =
    "http://127.0.0.1:8089/DocumentoSpesa730pWeb/DocumentoSpesa730pPort";
const ENDPOINT_TEST: &str =
    "https://invioSS730pTest.sanita.finanze.it/DocumentoSpesa730pWeb/DocumentoSpesa730pPort";
const ENDPOINT_PRODUZIONE: &str =
    "https://invioSS730p.sanita.finanze.it/DocumentoSpesa730pWeb/DocumentoSpesa730pPort";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Ambiente {
    /// Nessuna richiesta lascia il computer: risposte simulate in memoria.
    Mock,
    /// Server finto in esecuzione sulla macchina di sviluppo, ad esempio
    /// SoapUI. Esce in rete, ma non oltre il computer.
    Locale,
    /// Ambiente di collaudo ufficiale del Sistema TS.
    Test,
    /// Ambiente reale: le spese trasmesse finiscono nella dichiarazione.
    Produzione,
}

impl Ambiente {
    /// In sviluppo non si punta mai al ministero: un invio partito per sbaglio
    /// durante una prova diventerebbe una spesa sanitaria reale a nome di un
    /// paziente. `Locale` permette comunque di provare il protocollo per intero.
    pub fn predefinito() -> Self {
        if cfg!(debug_assertions) {
            Ambiente::Locale
        } else {
            // Anche in release la produzione resta una scelta esplicita
            Ambiente::Test
        }
    }

    /// Endpoint da contattare. `None` per `Mock`, che non esce in rete.
    pub fn endpoint(&self) -> Option<&'static str> {
        match self {
            Ambiente::Mock => None,
            Ambiente::Locale => Some(ENDPOINT_LOCALE),
            Ambiente::Test => Some(ENDPOINT_TEST),
            Ambiente::Produzione => Some(ENDPOINT_PRODUZIONE),
        }
    }

    /// Vero se la richiesta esce dal computer. `Locale` no: resta su 127.0.0.1.
    pub fn raggiunge_il_ministero(&self) -> bool {
        matches!(self, Ambiente::Test | Ambiente::Produzione)
    }

    pub fn esce_in_rete(&self) -> bool {
        self.endpoint().is_some()
    }

    /// Etichetta per i log: deve essere sempre evidente su cosa si sta operando.
    pub fn etichetta(&self) -> &'static str {
        match self {
            Ambiente::Mock => "MOCK",
            Ambiente::Locale => "LOCALE",
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
    fn in_sviluppo_non_si_punta_mai_al_ministero() {
        let predefinito = Ambiente::predefinito();
        assert_eq!(predefinito, Ambiente::Locale);
        assert!(
            !predefinito.raggiunge_il_ministero(),
            "il default di sviluppo non deve contattare il Sistema TS"
        );
        assert_eq!(ConfigSistemaTs::default().ambiente, Ambiente::Locale);
    }

    #[test]
    fn solo_test_e_produzione_raggiungono_il_ministero() {
        assert!(!Ambiente::Mock.raggiunge_il_ministero());
        assert!(!Ambiente::Locale.raggiunge_il_ministero());
        assert!(Ambiente::Test.raggiunge_il_ministero());
        assert!(Ambiente::Produzione.raggiunge_il_ministero());
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
    fn gli_endpoint_sono_quelli_ufficiali_e_distinti() {
        let locale = Ambiente::Locale.endpoint().unwrap();
        let test = Ambiente::Test.endpoint().unwrap();
        let prod = Ambiente::Produzione.endpoint().unwrap();

        assert_ne!(test, prod, "test e produzione puntano allo stesso indirizzo");
        // Il server di sviluppo resta sulla macchina
        assert!(locale.starts_with("http://127.0.0.1:"), "endpoint locale inatteso: {locale}");

        // Quelli ministeriali sono cifrati e si distinguono per il suffisso Test
        for url in [test, prod] {
            assert!(url.starts_with("https://"), "endpoint non cifrato: {url}");
            assert!(url.ends_with("/DocumentoSpesa730pWeb/DocumentoSpesa730pPort"));
        }
        assert!(test.contains("invioSS730pTest."), "endpoint di collaudo errato: {test}");
        assert!(!prod.contains("Test"), "la produzione punta al collaudo: {prod}");
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
        assert!(json.contains("\"ambiente\":\"locale\""), "{json}");
        assert!(json.contains("\"esitoMock\":\"successo\""), "{json}");
    }
}
