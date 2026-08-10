//! Errori del Sistema Tessera Sanitaria.
//!
//! All'interfaccia arriva un messaggio comprensibile; il dettaglio tecnico
//! resta nei log. Non compaiono mai codice fiscale, credenziali o XML.

use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase", tag = "genere")]
pub enum ErroreSistemaTs {
    /// Dati incompleti o incoerenti: la richiesta non è nemmeno partita.
    Validazione { messaggio: String, mancanti: Vec<String> },
    /// Credenziali rifiutate dal Sistema TS.
    Autenticazione { messaggio: String },
    /// Problema di rete: nessuna certezza su cosa sia arrivato al server.
    Rete { messaggio: String, esito_incerto: bool },
    /// Il servizio ha risposto con un SOAP Fault.
    Soap { messaggio: String, codice: Option<String> },
    /// Il documento è stato rifiutato con un codice applicativo.
    Rifiutato { messaggio: String, codice: String, descrizione: String },
    /// Cifratura o certificato non utilizzabili. Verrà prodotto quando il
    /// codice fiscale comincerà a essere cifrato con `SanitelCF.cer`.
    #[allow(dead_code)]
    Crittografia { messaggio: String },
    /// Configurazione assente o incoerente (ambiente, credenziali, certificato).
    Configurazione { messaggio: String },
}

impl ErroreSistemaTs {
    /// Testo mostrato all'utente. Mai una stack trace, mai un errore di libreria.
    pub fn messaggio(&self) -> &str {
        match self {
            ErroreSistemaTs::Validazione { messaggio, .. }
            | ErroreSistemaTs::Autenticazione { messaggio }
            | ErroreSistemaTs::Rete { messaggio, .. }
            | ErroreSistemaTs::Soap { messaggio, .. }
            | ErroreSistemaTs::Rifiutato { messaggio, .. }
            | ErroreSistemaTs::Crittografia { messaggio }
            | ErroreSistemaTs::Configurazione { messaggio } => messaggio,
        }
    }

    /// Vero quando non si può sapere se il Sistema TS abbia ricevuto la
    /// richiesta. In questo caso **non** si ritenta automaticamente: un secondo
    /// inserimento creerebbe un documento duplicato.
    pub fn esito_incerto(&self) -> bool {
        matches!(self, ErroreSistemaTs::Rete { esito_incerto: true, .. })
    }

    /// Vero se ha senso proporre "Riprova" all'utente.
    pub fn ritentabile(&self) -> bool {
        match self {
            // Un timeout va risolto guardando prima com'è andata: riprovare
            // alla cieca è il modo più semplice per duplicare una spesa.
            ErroreSistemaTs::Rete { esito_incerto, .. } => !esito_incerto,
            ErroreSistemaTs::Soap { .. } => true,
            ErroreSistemaTs::Validazione { .. }
            | ErroreSistemaTs::Autenticazione { .. }
            | ErroreSistemaTs::Rifiutato { .. }
            | ErroreSistemaTs::Crittografia { .. }
            | ErroreSistemaTs::Configurazione { .. } => false,
        }
    }

    // ─── Costruttori con messaggi già tradotti ───────────────────────────────

    pub fn validazione(mancanti: Vec<String>) -> Self {
        ErroreSistemaTs::Validazione {
            messaggio: "Mancano dei dati obbligatori per la trasmissione.".into(),
            mancanti,
        }
    }

    pub fn autenticazione() -> Self {
        ErroreSistemaTs::Autenticazione {
            messaggio: "Credenziali del Sistema TS non riconosciute. Verificale nelle Impostazioni."
                .into(),
        }
    }

    pub fn rete_non_raggiungibile() -> Self {
        ErroreSistemaTs::Rete {
            messaggio: "Impossibile raggiungere il Sistema TS. Controlla la connessione Internet e riprova."
                .into(),
            esito_incerto: false,
        }
    }

    pub fn timeout() -> Self {
        ErroreSistemaTs::Rete {
            messaggio: "Il Sistema TS non ha risposto in tempo. Prima di ritentare verifica sul portale se il documento risulta già registrato."
                .into(),
            esito_incerto: true,
        }
    }

    pub fn server(codice: u16) -> Self {
        ErroreSistemaTs::Rete {
            messaggio: format!(
                "Il Sistema TS ha risposto con un errore temporaneo ({codice}). Riprova più tardi."
            ),
            // Un 5xx arriva dal server, che ha quindi ricevuto la richiesta:
            // non si può escludere che l'abbia elaborata.
            esito_incerto: true,
        }
    }

    pub fn soap(codice: Option<String>, dettaglio: &str) -> Self {
        log::debug!("[sistema_ts] SOAP Fault: {dettaglio}");
        ErroreSistemaTs::Soap {
            messaggio: "Il Sistema TS ha rifiutato la richiesta. Se il problema persiste segnala il codice al supporto."
                .into(),
            codice,
        }
    }

    pub fn rifiutato(codice: String, descrizione: String) -> Self {
        ErroreSistemaTs::Rifiutato {
            messaggio: format!("Documento non accettato: {descrizione}"),
            codice,
            descrizione,
        }
    }

    pub fn configurazione(messaggio: impl Into<String>) -> Self {
        ErroreSistemaTs::Configurazione { messaggio: messaggio.into() }
    }
}

impl std::fmt::Display for ErroreSistemaTs {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.messaggio())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn il_timeout_non_e_ritentabile_automaticamente() {
        let e = ErroreSistemaTs::timeout();
        assert!(e.esito_incerto(), "un timeout lascia l'esito incerto");
        assert!(!e.ritentabile(), "ritentare dopo un timeout duplicherebbe la spesa");
    }

    #[test]
    fn un_errore_del_server_lascia_l_esito_incerto() {
        let e = ErroreSistemaTs::server(500);
        assert!(e.esito_incerto());
        assert!(!e.ritentabile());
    }

    #[test]
    fn la_rete_irraggiungibile_e_ritentabile() {
        // Qui la richiesta non è partita: ritentare non crea duplicati
        let e = ErroreSistemaTs::rete_non_raggiungibile();
        assert!(!e.esito_incerto());
        assert!(e.ritentabile());
    }

    #[test]
    fn gli_errori_definitivi_non_propongono_di_riprovare() {
        assert!(!ErroreSistemaTs::autenticazione().ritentabile());
        assert!(!ErroreSistemaTs::validazione(vec![]).ritentabile());
        assert!(!ErroreSistemaTs::rifiutato("C01".into(), "x".into()).ritentabile());
    }

    #[test]
    fn i_messaggi_non_contengono_gergo_tecnico() {
        let messaggi = [
            ErroreSistemaTs::rete_non_raggiungibile(),
            ErroreSistemaTs::timeout(),
            ErroreSistemaTs::autenticazione(),
            ErroreSistemaTs::server(503),
            ErroreSistemaTs::soap(None, "dettaglio interno"),
        ];
        for e in messaggi {
            let m = e.messaggio().to_lowercase();
            for termine in ["reqwest", "panic", "unwrap", "soap fault", "xml", "null"] {
                assert!(!m.contains(termine), "messaggio tecnico all'utente: {m}");
            }
            assert!(m.len() > 20, "messaggio troppo scarno: {m}");
        }
    }

    #[test]
    fn l_errore_arriva_al_frontend_serializzato() {
        let json = serde_json::to_string(&ErroreSistemaTs::rifiutato(
            "C123".into(),
            "codice fiscale non valido".into(),
        ))
        .unwrap();
        assert!(json.contains("\"genere\":\"rifiutato\""), "{json}");
        assert!(json.contains("\"codice\":\"C123\""), "{json}");
    }
}
