//! Cifratura dei campi richiesta dal Sistema TS.
//!
//! Pincode, codice fiscale del professionista e codice fiscale dell'assistito
//! viaggiano cifrati con la chiave pubblica del certificato `SanitelCF.cer`,
//! poi codificati in base64.
//!
//! L'algoritmo è **RSA con padding PKCS#1 v1.5**, non una scelta nostra:
//! il certificato ministeriale ha una chiave da 1024 bit e i valori d'esempio
//! del kit sono lunghi 172 caratteri base64, cioè esattamente 128 byte.
//!
//! Le indicazioni tecniche parlano di `cfProprietario` "in chiaro nella
//! request": quella frase riguarda il servizio asincrono. Nelle richieste reali
//! del servizio sincrono, incluse quelle del progetto SoapUI ufficiale, tutti e
//! tre i campi sono cifrati.

use base64::{engine::general_purpose::STANDARD, Engine};
use rsa::pkcs8::DecodePublicKey;
use rsa::{Pkcs1v15Encrypt, RsaPublicKey};
use x509_cert::der::{Decode, DecodePem, Encode};
use x509_cert::Certificate;

use super::errors::ErroreSistemaTs;

/// Certificato incluso nel binario: senza, la trasmissione non è possibile e
/// non avrebbe senso avviare l'app sperando di trovarlo sul disco dell'utente.
const CERTIFICATO_SANITEL: &[u8] =
    include_bytes!("../../resources/sistema_ts/SanitelCF.cer");

/// Estrae la chiave pubblica dal certificato ministeriale.
pub fn chiave_pubblica() -> Result<RsaPublicKey, ErroreSistemaTs> {
    let certificato = Certificate::from_pem(CERTIFICATO_SANITEL)
        .or_else(|_| Certificate::from_der(CERTIFICATO_SANITEL))
        .map_err(|e| {
            ErroreSistemaTs::Crittografia {
                messaggio: format!("Certificato del Sistema TS non leggibile: {e}"),
            }
        })?;

    let spki = certificato
        .tbs_certificate()
        .subject_public_key_info()
        .to_der()
        .map_err(|e| ErroreSistemaTs::Crittografia {
            messaggio: format!("Chiave pubblica non estraibile dal certificato: {e}"),
        })?;

    RsaPublicKey::from_public_key_der(&spki).map_err(|e| ErroreSistemaTs::Crittografia {
        messaggio: format!("Chiave pubblica del Sistema TS non utilizzabile: {e}"),
    })
}

/// Cifra un valore e lo restituisce in base64, pronto per l'XML.
pub fn cifra(valore: &str) -> Result<String, ErroreSistemaTs> {
    let chiave = chiave_pubblica()?;
    let mut rng = rand::thread_rng();

    let cifrato = chiave
        .encrypt(&mut rng, Pkcs1v15Encrypt, valore.as_bytes())
        .map_err(|_| ErroreSistemaTs::Crittografia {
            // Il messaggio non riporta il valore: sarebbe un codice fiscale
            messaggio: "Cifratura del dato non riuscita.".into(),
        })?;

    Ok(STANDARD.encode(cifrato))
}

/// Verifica che il certificato sia ancora valido.
///
/// Scaduto il certificato le trasmissioni si fermano, ed è meglio accorgersene
/// da un messaggio chiaro che da un rifiuto incomprensibile del server.
pub fn certificato_scaduto(adesso: std::time::SystemTime) -> Result<bool, ErroreSistemaTs> {
    let certificato = Certificate::from_pem(CERTIFICATO_SANITEL)
        .or_else(|_| Certificate::from_der(CERTIFICATO_SANITEL))
        .map_err(|e| ErroreSistemaTs::Crittografia {
            messaggio: format!("Certificato del Sistema TS non leggibile: {e}"),
        })?;

    let scadenza = certificato
        .tbs_certificate()
        .validity()
        .not_after
        .to_system_time();
    Ok(adesso > scadenza)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{Duration, UNIX_EPOCH};

    #[test]
    fn il_certificato_ministeriale_e_leggibile() {
        let chiave = chiave_pubblica().expect("certificato non leggibile");
        // Il certificato del Sistema TS usa una chiave da 1024 bit
        assert_eq!(rsa::traits::PublicKeyParts::size(&chiave), 128);
    }

    #[test]
    fn la_cifratura_produce_la_lunghezza_attesa_dal_kit() {
        // I valori d'esempio forniti dal ministero sono lunghi 172 caratteri
        // base64: è la verifica che l'algoritmo scelto sia quello giusto.
        let cifrato = cifra("RSSMRA80A01H501U").unwrap();
        assert_eq!(cifrato.len(), 172, "lunghezza diversa da quella del kit");
        assert_eq!(STANDARD.decode(&cifrato).unwrap().len(), 128);
    }

    #[test]
    fn cifrature_ripetute_sono_diverse() {
        // PKCS#1 v1.5 usa padding casuale: due cifrature dello stesso valore
        // non devono coincidere, altrimenti sarebbero confrontabili.
        let a = cifra("RSSMRA80A01H501U").unwrap();
        let b = cifra("RSSMRA80A01H501U").unwrap();
        assert_ne!(a, b, "padding non casuale");
    }

    #[test]
    fn il_valore_in_chiaro_non_compare_nel_risultato() {
        let cifrato = cifra("RSSMRA80A01H501U").unwrap();
        assert!(!cifrato.contains("RSSMRA"), "dato in chiaro nel testo cifrato");
    }

    #[test]
    fn cifra_anche_valori_corti_e_lunghi() {
        // Il pincode è più corto di un codice fiscale; RSA-1024 con PKCS#1
        // regge fino a 117 byte di contenuto.
        for valore in ["1234", "RSSMRA80A01H501U", &"A".repeat(100)] {
            let c = cifra(valore).unwrap();
            assert_eq!(c.len(), 172, "lunghezza inattesa per '{}'", &valore[..4.min(valore.len())]);
        }
    }

    #[test]
    fn rifiuta_valori_troppo_lunghi_invece_di_troncarli() {
        // Oltre il limite di RSA-1024 la cifratura deve fallire, non produrre
        // un dato parziale che il Sistema TS accetterebbe come valido.
        let esito = cifra(&"A".repeat(200));
        assert!(esito.is_err(), "valore oltre il limite accettato");
    }

    #[test]
    fn il_certificato_e_valido_oggi_ma_scade_nel_2027() {
        // 1 gennaio 2026: dentro il periodo di validità
        let inizio_2026 = UNIX_EPOCH + Duration::from_secs(1_767_225_600);
        assert!(!certificato_scaduto(inizio_2026).unwrap());

        // 1 marzo 2027: oltre la scadenza del 23 gennaio 2027
        let marzo_2027 = UNIX_EPOCH + Duration::from_secs(1_803_859_200);
        assert!(
            certificato_scaduto(marzo_2027).unwrap(),
            "la scadenza del certificato non viene rilevata"
        );

        // Il giorno dopo la scadenza deve già risultare scaduto
        let giorno_dopo = UNIX_EPOCH + Duration::from_secs(1_800_748_800);
        assert!(certificato_scaduto(giorno_dopo).unwrap());
    }
}
