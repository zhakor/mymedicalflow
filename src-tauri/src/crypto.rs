//! Chiave di installazione e cifratura di archivio e backup.
//!
//! L'app genera al primo avvio una chiave casuale a 256 bit e la conserva sul
//! computer, così archivio e backup vengono cifrati e decifrati senza chiedere
//! nulla all'utente.
//!
//! La stessa chiave è mostrata all'utente come **codice di recupero**: è il
//! solo modo di rileggere i backup su un altro computer, quindi va conservata
//! fuori dal PC. Se il computer si guasta e il codice non è stato salvato, i
//! backup non sono recuperabili — non esiste una via di servizio, ed è una
//! conseguenza voluta: se esistesse, l'avrebbe anche chi ruba il file.
//!
//! Volutamente non si usa DPAPI: legherebbe i file all'account Windows di
//! origine, mentre i backup devono restare apribili su qualsiasi computer che
//! disponga del codice.

use aes_gcm::aead::rand_core::RngCore;
use aes_gcm::aead::{Aead, OsRng};
use aes_gcm::{Aes256Gcm, Key, KeyInit, Nonce};

pub const CHIAVE_LEN: usize = 32;
const NONCE_LEN: usize = 12;

/// Intestazione dei file prodotti dall'app: firma + versione di formato.
pub const MAGIC: &[u8; 4] = b"MMF2";
pub const VERSIONE: u8 = 1;
pub const HEADER_LEN: usize = 5;

// ─── Codice di recupero ───────────────────────────────────────────────────────

/// Alfabeto base32 senza caratteri confondibili (niente I, L, O, U).
const ALFABETO: &[u8; 32] = b"ABCDEFGHJKMNPQRSTVWXYZ0123456789";

/// Converte la chiave nel codice mostrato all'utente, in gruppi di 4 caratteri.
pub fn chiave_in_codice(chiave: &[u8; CHIAVE_LEN]) -> String {
    let mut bit = 0u32;
    let mut disponibili = 0u32;
    let mut caratteri = Vec::with_capacity(52);

    for byte in chiave {
        bit = (bit << 8) | u32::from(*byte);
        disponibili += 8;
        while disponibili >= 5 {
            disponibili -= 5;
            caratteri.push(ALFABETO[((bit >> disponibili) & 0x1F) as usize]);
        }
    }
    if disponibili > 0 {
        caratteri.push(ALFABETO[((bit << (5 - disponibili)) & 0x1F) as usize]);
    }

    caratteri
        .chunks(4)
        .map(|c| String::from_utf8_lossy(c).into_owned())
        .collect::<Vec<_>>()
        .join("-")
}

/// Interpreta un codice inserito dall'utente.
/// Tollera spazi, trattini e minuscole: viene trascritto a mano o incollato.
pub fn codice_in_chiave(codice: &str) -> Result<[u8; CHIAVE_LEN], String> {
    let mut bit = 0u32;
    let mut disponibili = 0u32;
    let mut byte = Vec::with_capacity(CHIAVE_LEN);

    for c in codice.chars() {
        if c == '-' || c.is_whitespace() {
            continue;
        }
        let c = c.to_ascii_uppercase() as u8;
        let valore = ALFABETO
            .iter()
            .position(|a| *a == c)
            .ok_or_else(|| format!("il codice contiene un carattere non valido: '{}'", c as char))?;

        bit = (bit << 5) | valore as u32;
        disponibili += 5;
        if disponibili >= 8 {
            disponibili -= 8;
            byte.push(((bit >> disponibili) & 0xFF) as u8);
        }
    }

    if byte.len() != CHIAVE_LEN {
        return Err(format!(
            "il codice di recupero non è completo ({} caratteri utili invece di 52)",
            codice.chars().filter(|c| *c != '-' && !c.is_whitespace()).count()
        ));
    }

    let mut chiave = [0u8; CHIAVE_LEN];
    chiave.copy_from_slice(&byte);
    Ok(chiave)
}

// ─── Generazione ──────────────────────────────────────────────────────────────

pub fn genera_chiave() -> [u8; CHIAVE_LEN] {
    let mut chiave = [0u8; CHIAVE_LEN];
    OsRng.fill_bytes(&mut chiave);
    chiave
}

// ─── Cifratura ────────────────────────────────────────────────────────────────

/// Cifra restituendo `MAGIC | versione | nonce | testo cifrato`.
pub fn cifra(chiaro: &[u8], chiave: &[u8; CHIAVE_LEN]) -> Result<Vec<u8>, String> {
    let mut nonce = [0u8; NONCE_LEN];
    OsRng.fill_bytes(&mut nonce);

    let cifrario = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(chiave));
    let testo = cifrario
        .encrypt(Nonce::from_slice(&nonce), chiaro)
        .map_err(|_| "cifratura non riuscita".to_string())?;

    let mut out = Vec::with_capacity(HEADER_LEN + NONCE_LEN + testo.len());
    out.extend_from_slice(MAGIC);
    out.push(VERSIONE);
    out.extend_from_slice(&nonce);
    out.extend_from_slice(&testo);
    Ok(out)
}

pub fn decifra(raw: &[u8], chiave: &[u8; CHIAVE_LEN]) -> Result<Vec<u8>, String> {
    if raw.len() < HEADER_LEN || &raw[..4] != MAGIC {
        return Err("file non riconosciuto: non è un backup di MyMedicalFlow".into());
    }
    if raw[4] != VERSIONE {
        return Err(format!(
            "file creato con una versione più recente dell'app (formato {})",
            raw[4]
        ));
    }
    if raw.len() <= HEADER_LEN + NONCE_LEN {
        return Err("file danneggiato o incompleto".into());
    }

    let (nonce, testo) = raw[HEADER_LEN..].split_at(NONCE_LEN);
    let cifrario = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(chiave));
    // GCM autentica il contenuto: codice errato e file manomesso danno lo
    // stesso esito, senza rivelare quale dei due sia.
    cifrario
        .decrypt(Nonce::from_slice(nonce), testo)
        .map_err(|_| "codice di recupero errato oppure file danneggiato".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn il_codice_torna_alla_chiave_di_partenza() {
        for _ in 0..50 {
            let chiave = genera_chiave();
            let codice = chiave_in_codice(&chiave);
            assert_eq!(codice_in_chiave(&codice).unwrap(), chiave);
        }
    }

    #[test]
    fn il_codice_e_leggibile_e_privo_di_caratteri_ambigui() {
        let codice = chiave_in_codice(&[0xAB; CHIAVE_LEN]);
        assert_eq!(codice.matches('-').count(), 12, "raggruppamento inatteso");
        assert_eq!(codice.replace('-', "").len(), 52);
        for vietato in ['I', 'L', 'O', 'U'] {
            assert!(!codice.contains(vietato), "carattere ambiguo: {vietato}");
        }
    }

    #[test]
    fn accetta_il_codice_trascritto_male() {
        let chiave = genera_chiave();
        let codice = chiave_in_codice(&chiave);
        // Minuscole, spazi al posto dei trattini, spazi in eccesso
        let maltrattato = format!("  {}  ", codice.to_lowercase().replace('-', " "));
        assert_eq!(codice_in_chiave(&maltrattato).unwrap(), chiave);
    }

    #[test]
    fn rifiuta_codici_incompleti_o_con_caratteri_estranei() {
        let codice = chiave_in_codice(&genera_chiave());
        assert!(codice_in_chiave("").is_err());
        assert!(codice_in_chiave(&codice[..20]).is_err(), "codice troncato accettato");
        // Il primo carattere viene sostituito a prescindere da quale sia:
        // cercare una lettera specifica renderebbe il test casuale, visto che
        // il codice è generato da una chiave casuale.
        let alterato = format!("!{}", &codice[1..]);
        assert!(codice_in_chiave(&alterato).is_err(), "carattere estraneo accettato");
    }

    #[test]
    fn il_contenuto_cifrato_non_mostra_i_dati() {
        let chiave = genera_chiave();
        let segreto = br#"{"pazienti":[{"lastName":"Bianchi"}]}"#;
        let cifrato = cifra(segreto, &chiave).unwrap();

        assert_eq!(&cifrato[..4], MAGIC);
        assert!(
            !cifrato.windows(7).any(|w| w == b"Bianchi"),
            "dati in chiaro nel file cifrato"
        );
        assert_eq!(decifra(&cifrato, &chiave).unwrap(), segreto);
    }

    #[test]
    fn una_chiave_diversa_non_apre_il_file() {
        let cifrato = cifra(b"dati riservati", &genera_chiave()).unwrap();
        assert!(decifra(&cifrato, &genera_chiave()).is_err());
    }

    #[test]
    fn rileva_la_manomissione_del_file() {
        let chiave = genera_chiave();
        let mut cifrato = cifra(b"dati riservati", &chiave).unwrap();
        let ultimo = cifrato.len() - 1;
        cifrato[ultimo] ^= 0xFF;
        assert!(decifra(&cifrato, &chiave).is_err(), "manomissione non rilevata");
    }

    #[test]
    fn due_cifrature_dello_stesso_dato_producono_file_diversi() {
        let chiave = genera_chiave();
        let a = cifra(b"stesso contenuto", &chiave).unwrap();
        let b = cifra(b"stesso contenuto", &chiave).unwrap();
        assert_ne!(a, b, "nonce riutilizzato");
        assert_eq!(decifra(&a, &chiave).unwrap(), decifra(&b, &chiave).unwrap());
    }

    /// Archivio cifrato dalla WebCrypto dell'app mobile (`src/sync/cifratura.ts`):
    /// il desktop deve saperlo leggere. Il test gemello in TypeScript legge un
    /// file prodotto da `cifra` qui sopra.
    #[test]
    fn legge_un_archivio_cifrato_dalla_webcrypto() {
        let chiave: [u8; CHIAVE_LEN] = core::array::from_fn(|i| i as u8);
        assert_eq!(
            chiave_in_codice(&chiave),
            "AAAT-EA2E-AYDA-RCAK-BJFT-2DJR-B6JB-CETX-CTMV-PF22-DEQB-0HA7-D2ST"
        );

        let esadecimale = "4d4d463201ad2b72b0b396d9e531de446df998570a0661981d968cb103decf7d7bf999e4df4f28d84ec252f742be5e19df21d0d144dc075da6d25b7f7d1884234dc08755fbb5a92880c9ea73ff185baa1b7a8a";
        let raw: Vec<u8> = (0..esadecimale.len())
            .step_by(2)
            .map(|i| u8::from_str_radix(&esadecimale[i..i + 2], 16).unwrap())
            .collect();

        let chiaro = decifra(&raw, &chiave).unwrap();
        assert_eq!(
            String::from_utf8(chiaro).unwrap(),
            r#"{"pazienti":"[]","profilo":"{\"nome\":\"Prova\"}"}"#
        );
    }
}
