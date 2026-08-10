//! Credenziali del Sistema Tessera Sanitaria.
//!
//! Parola chiave e pincode stanno nel **portachiavi del sistema operativo**
//! (Credential Manager su Windows, Portachiavi su macOS, Secret Service su
//! Linux), non nell'archivio dell'app. Due motivi:
//!
//! 1. Il portachiavi è legato all'account del sistema, quindi protegge meglio
//!    di un file che sta accanto alla propria chiave di cifratura.
//! 2. Le copie di sicurezza sono portabili e condivisibili: le credenziali non
//!    devono viaggiare con loro. Tenendole fuori dall'archivio, questo è
//!    garantito dalla struttura e non da una regola da ricordare.
//!
//! I valori non vengono mai restituiti all'interfaccia né scritti nei log:
//! il frontend sa soltanto se sono configurati.

use keyring::Entry;

use super::errors::ErroreSistemaTs;

const SERVIZIO: &str = "MyMedicalFlow — Sistema TS";
const VOCE_PAROLA_CHIAVE: &str = "parola_chiave";
const VOCE_PINCODE: &str = "pincode";

fn voce(nome: &str) -> Result<Entry, ErroreSistemaTs> {
    Entry::new(SERVIZIO, nome).map_err(|e| {
        log::error!("[sistema_ts] portachiavi non disponibile: {e}");
        ErroreSistemaTs::configurazione(
            "Il portachiavi del sistema non è accessibile: impossibile conservare le credenziali.",
        )
    })
}

fn scrivi(nome: &str, valore: &str) -> Result<(), ErroreSistemaTs> {
    voce(nome)?.set_password(valore).map_err(|e| {
        // Il messaggio non riporta il valore, che è un segreto
        log::error!("[sistema_ts] salvataggio credenziale non riuscito: {e}");
        ErroreSistemaTs::configurazione("Impossibile salvare le credenziali nel portachiavi.")
    })
}

fn leggi(nome: &str) -> Option<String> {
    voce(nome).ok()?.get_password().ok().filter(|v| !v.trim().is_empty())
}

/// Salva parola chiave e pincode. Entrambi obbligatori.
pub fn salva(parola_chiave: &str, pincode: &str) -> Result<(), ErroreSistemaTs> {
    let mut mancanti = Vec::new();
    if parola_chiave.trim().is_empty() {
        mancanti.push("Parola chiave".to_string());
    }
    if pincode.trim().is_empty() {
        mancanti.push("Pincode".to_string());
    }
    if !mancanti.is_empty() {
        return Err(ErroreSistemaTs::validazione(mancanti));
    }

    scrivi(VOCE_PAROLA_CHIAVE, parola_chiave.trim())?;
    scrivi(VOCE_PINCODE, pincode.trim())?;
    log::info!("[sistema_ts] credenziali aggiornate nel portachiavi");
    Ok(())
}

/// Rimuove le credenziali dal portachiavi.
pub fn elimina() -> Result<(), ErroreSistemaTs> {
    for nome in [VOCE_PAROLA_CHIAVE, VOCE_PINCODE] {
        // L'assenza non è un errore: rimuovere ciò che non c'è va bene
        if let Ok(v) = voce(nome) {
            let _ = v.delete_credential();
        }
    }
    log::info!("[sistema_ts] credenziali rimosse dal portachiavi");
    Ok(())
}

/// Cosa sa il frontend delle credenziali: se ci sono, non quali sono.
#[derive(Debug, Clone, Copy, serde::Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct StatoCredenziali {
    pub parola_chiave_presente: bool,
    pub pincode_presente: bool,
    /// Vero solo quando entrambe sono presenti: senza una delle due la
    /// trasmissione non parte.
    pub complete: bool,
}

pub fn stato() -> StatoCredenziali {
    let parola_chiave_presente = leggi(VOCE_PAROLA_CHIAVE).is_some();
    let pincode_presente = leggi(VOCE_PINCODE).is_some();
    StatoCredenziali {
        parola_chiave_presente,
        pincode_presente,
        complete: parola_chiave_presente && pincode_presente,
    }
}

/// Costruisce le credenziali per l'invio.
///
/// `utente` e `cf_proprietario` sono il codice fiscale del professionista, che
/// vive nel profilo e non è un segreto: solo parola chiave e pincode vengono
/// dal portachiavi.
pub fn per_invio(codice_fiscale: &str) -> Result<super::client::Credenziali, ErroreSistemaTs> {
    let parola_chiave = leggi(VOCE_PAROLA_CHIAVE).ok_or_else(|| {
        ErroreSistemaTs::configurazione(
            "Manca la Parola chiave del Sistema TS. Inseriscila nel Profilo, sezione Sistema Tessera Sanitaria.",
        )
    })?;
    let pincode = leggi(VOCE_PINCODE).ok_or_else(|| {
        ErroreSistemaTs::configurazione(
            "Manca il Pincode del Sistema TS. Inseriscilo nel Profilo, sezione Sistema Tessera Sanitaria.",
        )
    })?;

    if codice_fiscale.trim().is_empty() {
        return Err(ErroreSistemaTs::configurazione(
            "Manca il codice fiscale del professionista: compila il Profilo.",
        ));
    }

    Ok(super::client::Credenziali {
        utente: codice_fiscale.trim().to_uppercase(),
        password: parola_chiave,
        pincode,
        cf_proprietario: codice_fiscale.trim().to_uppercase(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lo_stato_non_rivela_i_valori() {
        // Serializzando lo stato non devono comparire campi che contengano
        // la parola chiave o il pincode.
        let json = serde_json::to_string(&StatoCredenziali {
            parola_chiave_presente: true,
            pincode_presente: true,
            complete: true,
        })
        .unwrap();
        assert_eq!(
            json,
            r#"{"parolaChiavePresente":true,"pincodePresente":true,"complete":true}"#
        );
    }

    #[test]
    fn salvare_credenziali_vuote_e_un_errore_di_validazione() {
        match salva("   ", "1234") {
            Err(ErroreSistemaTs::Validazione { mancanti, .. }) => {
                assert!(mancanti.iter().any(|m| m.contains("Parola chiave")));
            }
            altro => panic!("atteso errore di validazione, ottenuto {altro:?}"),
        }
        match salva("segreta", "") {
            Err(ErroreSistemaTs::Validazione { mancanti, .. }) => {
                assert!(mancanti.iter().any(|m| m.contains("Pincode")));
            }
            altro => panic!("atteso errore di validazione, ottenuto {altro:?}"),
        }
    }

    #[test]
    fn senza_codice_fiscale_l_invio_non_parte() {
        // Anche con le credenziali presenti manca l'identificativo dell'erogatore
        let esito = per_invio("   ");
        assert!(esito.is_err());
    }

    /// Scrive davvero nel portachiavi del sistema: escluso dalla suite normale
    /// per non lasciare voci sulla macchina di chi esegue i test.
    #[test]
    #[ignore = "usa il portachiavi di sistema: eseguire con --ignored"]
    fn andata_e_ritorno_nel_portachiavi() {
        salva("parola-di-prova", "0000000000").unwrap();

        let dopo_salvataggio = stato();
        assert!(
            dopo_salvataggio.complete,
            "credenziali non risultano complete dopo il salvataggio"
        );

        let credenziali = per_invio("RSSMRA80A01H501U").unwrap();
        assert_eq!(credenziali.password, "parola-di-prova");
        assert_eq!(credenziali.pincode, "0000000000");
        assert_eq!(credenziali.utente, "RSSMRA80A01H501U");

        elimina().unwrap();
        assert!(!stato().complete, "credenziali ancora presenti dopo la rimozione");
    }
}
