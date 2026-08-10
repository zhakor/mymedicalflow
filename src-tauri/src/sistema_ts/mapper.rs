//! Conversione dal modello dell'app al documento ministeriale.
//!
//! È lo strato anticorruzione: l'interfaccia manda dati applicativi — quelli
//! che l'utente vede in fattura — e qui vengono tradotti nella forma richiesta
//! dall'XSD. Se domani cambia il tracciato, cambia questo file e non il resto.

use serde::Deserialize;

use super::errors::ErroreSistemaTs;
use super::models::{DocumentoSpesa, IdDocumentoFiscale, VoceSpesa};

/// Dati inviati dall'interfaccia: nomi e forma del dominio dell'app,
/// non dell'XSD.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DatiFatturaTs {
    // Erogatore, dal profilo
    pub partita_iva: String,
    pub dispositivo: u16,
    // Documento
    pub numero_fattura: String,
    pub data_emissione: String,
    pub importo: f64,
    // Dati del Sistema TS raccolti in fattura
    pub data_pagamento: String,
    pub pagamento_tracciato: String,
    pub opposizione: bool,
    pub tipo_spesa: String,
    pub aliquota_iva: Option<f64>,
    pub natura_iva: Option<String>,
    #[serde(default)]
    pub pagamento_anticipato: bool,
    /// In chiaro: viene cifrato al momento di comporre l'XML.
    pub codice_fiscale_assistito: Option<String>,
}

/// Numero da trasmettere.
///
/// L'app numera "40/2026", il Sistema TS riceve "40": l'anno è già portato
/// dalla data di emissione. Il documento è identificato da partita IVA, data,
/// dispositivo e numero, quindi il valore deve restare stabile nel tempo.
pub fn numero_documento(numero_fattura: &str) -> String {
    numero_fattura
        .split('/')
        .next()
        .unwrap_or(numero_fattura)
        .trim()
        .to_string()
}

/// Caratteri ammessi da `numDocType`: `[A-Za-z0-9_./\-]{1,20}`.
fn numero_documento_valido(numero: &str) -> bool {
    !numero.is_empty()
        && numero.len() <= 20
        && numero
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '_' | '.' | '/' | '\\' | '-'))
}

/// `DataMinType`: `AAAA-MM-GG` non prima del 2013-01-01.
fn data_valida(data: &str, minimo: &str) -> bool {
    let formato_ok = data.len() == 10
        && data.as_bytes()[4] == b'-'
        && data.as_bytes()[7] == b'-'
        && data.chars().filter(char::is_ascii_digit).count() == 8;
    formato_ok && data >= minimo
}

/// Traduce i dati dell'app in un documento di spesa, verificando i vincoli
/// dello schema prima di costruirlo.
pub fn in_documento_spesa(dati: &DatiFatturaTs) -> Result<DocumentoSpesa, ErroreSistemaTs> {
    let mut mancanti: Vec<String> = Vec::new();

    if dati.partita_iva.len() != 11 || !dati.partita_iva.chars().all(|c| c.is_ascii_digit()) {
        mancanti.push("Partita IVA di 11 cifre".into());
    }
    if dati.dispositivo < 1 || dati.dispositivo > 999 {
        mancanti.push("Dispositivo da 1 a 999".into());
    }

    let numero = numero_documento(&dati.numero_fattura);
    if !numero_documento_valido(&numero) {
        mancanti.push("Numero documento valido, al massimo 20 caratteri".into());
    }

    // L'XSD impone 2014-01-01 per l'emissione e 2013-01-01 per il pagamento
    if !data_valida(&dati.data_emissione, "2014-01-01") {
        mancanti.push("Data di emissione dal 2014 in poi".into());
    }
    if !data_valida(&dati.data_pagamento, "2013-01-01") {
        mancanti.push("Data di pagamento dal 2013 in poi".into());
    }

    if !(dati.importo > 0.0) {
        mancanti.push("Importo maggiore di zero".into());
    }
    if dati.tipo_spesa.trim().is_empty() {
        mancanti.push("Tipo di spesa".into());
    }
    if !matches!(dati.pagamento_tracciato.as_str(), "SI" | "NO") {
        mancanti.push("Pagamento tracciato indicato con SI oppure NO".into());
    }

    // xs:choice: una delle due, mai entrambe
    match (dati.aliquota_iva, dati.natura_iva.as_deref()) {
        (Some(_), Some(n)) if !n.trim().is_empty() => {
            mancanti.push("Aliquota IVA oppure natura IVA, non entrambe".into())
        }
        (None, None) => mancanti.push("Aliquota IVA oppure natura IVA".into()),
        (None, Some(n)) if n.trim().is_empty() => {
            mancanti.push("Aliquota IVA oppure natura IVA".into())
        }
        _ => {}
    }

    // Senza opposizione il codice fiscale è indispensabile: è ciò che lega la
    // spesa alla dichiarazione del cittadino.
    let cf = dati
        .codice_fiscale_assistito
        .as_deref()
        .map(str::trim)
        .filter(|c| !c.is_empty());
    if !dati.opposizione && cf.is_none() {
        mancanti.push("Codice fiscale dell'assistito".into());
    }

    if !mancanti.is_empty() {
        return Err(ErroreSistemaTs::validazione(mancanti));
    }

    Ok(DocumentoSpesa {
        id_spesa: IdDocumentoFiscale {
            p_iva: dati.partita_iva.clone(),
            data_emissione: dati.data_emissione.clone(),
            dispositivo: dati.dispositivo,
            num_documento: numero,
        },
        data_pagamento: dati.data_pagamento.clone(),
        flag_pagamento_anticipato: dati.pagamento_anticipato,
        // In caso di opposizione il codice fiscale non viene trasmesso
        cf_cittadino: if dati.opposizione { None } else { cf.map(str::to_string) },
        voci_spesa: vec![VoceSpesa {
            tipo_spesa: dati.tipo_spesa.trim().to_uppercase(),
            importo: dati.importo,
            aliquota_iva: dati.aliquota_iva,
            natura_iva: dati
                .natura_iva
                .as_deref()
                .map(str::trim)
                .filter(|n| !n.is_empty())
                .map(str::to_uppercase),
        }],
        pagamento_tracciato: Some(dati.pagamento_tracciato.clone()),
        // L'app emette fatture: "D" riguarda i documenti commerciali
        tipo_documento: Some("F".into()),
        flag_opposizione: Some(if dati.opposizione { "1".into() } else { "0".into() }),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Dati fittizi: nessun paziente reale nelle fixture.
    fn dati() -> DatiFatturaTs {
        DatiFatturaTs {
            partita_iva: "01234567897".into(),
            dispositivo: 1,
            numero_fattura: "40/2026".into(),
            data_emissione: "2026-03-31".into(),
            importo: 162.00,
            data_pagamento: "2026-03-31".into(),
            pagamento_tracciato: "SI".into(),
            opposizione: false,
            tipo_spesa: "SP".into(),
            aliquota_iva: Some(0.0),
            natura_iva: None,
            pagamento_anticipato: false,
            codice_fiscale_assistito: Some("RSSMRA80A01H501U".into()),
        }
    }

    #[test]
    fn trasmette_il_numero_senza_l_anno() {
        assert_eq!(numero_documento("40/2026"), "40");
        assert_eq!(numero_documento("7/2026"), "7");
        // Senza barra resta invariato
        assert_eq!(numero_documento("A40"), "A40");
        assert_eq!(numero_documento(" 12 /2026"), "12");
    }

    #[test]
    fn converte_una_fattura_completa() {
        let d = in_documento_spesa(&dati()).unwrap();
        assert_eq!(d.id_spesa.num_documento, "40");
        assert_eq!(d.id_spesa.p_iva, "01234567897");
        assert_eq!(d.id_spesa.dispositivo, 1);
        assert_eq!(d.tipo_documento.as_deref(), Some("F"));
        assert_eq!(d.flag_opposizione.as_deref(), Some("0"));
        assert_eq!(d.voci_spesa.len(), 1);
        assert_eq!(d.voci_spesa[0].tipo_spesa, "SP");
        assert_eq!(d.voci_spesa[0].importo, 162.00);
        assert_eq!(d.voci_spesa[0].aliquota_iva, Some(0.0));
        assert_eq!(d.cf_cittadino.as_deref(), Some("RSSMRA80A01H501U"));
    }

    #[test]
    fn con_opposizione_il_codice_fiscale_non_viene_trasmesso() {
        let mut d = dati();
        d.opposizione = true;
        let doc = in_documento_spesa(&d).unwrap();
        assert_eq!(doc.flag_opposizione.as_deref(), Some("1"));
        assert!(doc.cf_cittadino.is_none(), "il CF non deve uscire in caso di opposizione");
    }

    #[test]
    fn senza_opposizione_il_codice_fiscale_e_obbligatorio() {
        let mut d = dati();
        d.codice_fiscale_assistito = None;
        let e = in_documento_spesa(&d).unwrap_err();
        assert!(matches!(e, ErroreSistemaTs::Validazione { .. }));
    }

    #[test]
    fn rifiuta_aliquota_e_natura_insieme() {
        let mut d = dati();
        d.natura_iva = Some("N4".into());
        assert!(in_documento_spesa(&d).is_err(), "xs:choice violato");

        // Solo natura va bene
        d.aliquota_iva = None;
        let doc = in_documento_spesa(&d).unwrap();
        assert_eq!(doc.voci_spesa[0].natura_iva.as_deref(), Some("N4"));
        assert!(doc.voci_spesa[0].aliquota_iva.is_none());
    }

    #[test]
    fn rifiuta_iva_del_tutto_assente() {
        let mut d = dati();
        d.aliquota_iva = None;
        d.natura_iva = None;
        assert!(in_documento_spesa(&d).is_err());
    }

    #[test]
    fn applica_i_vincoli_dello_schema() {
        let casi: Vec<(&str, Box<dyn Fn(&mut DatiFatturaTs)>)> = vec![
            ("partita IVA corta", Box::new(|d: &mut DatiFatturaTs| d.partita_iva = "123".into())),
            ("partita IVA con lettere", Box::new(|d: &mut DatiFatturaTs| d.partita_iva = "0123456789A".into())),
            ("dispositivo zero", Box::new(|d: &mut DatiFatturaTs| d.dispositivo = 0)),
            ("dispositivo oltre 999", Box::new(|d: &mut DatiFatturaTs| d.dispositivo = 1000)),
            ("emissione prima del 2014", Box::new(|d: &mut DatiFatturaTs| d.data_emissione = "2013-12-31".into())),
            ("pagamento prima del 2013", Box::new(|d: &mut DatiFatturaTs| d.data_pagamento = "2012-12-31".into())),
            ("data in formato italiano", Box::new(|d: &mut DatiFatturaTs| d.data_emissione = "31/03/2026".into())),
            ("importo nullo", Box::new(|d: &mut DatiFatturaTs| d.importo = 0.0)),
            ("importo negativo", Box::new(|d: &mut DatiFatturaTs| d.importo = -10.0)),
            ("tracciato incoerente", Box::new(|d: &mut DatiFatturaTs| d.pagamento_tracciato = "Si".into())),
            ("numero vuoto", Box::new(|d: &mut DatiFatturaTs| d.numero_fattura = "/2026".into())),
        ];

        for (nome, modifica) in casi {
            let mut d = dati();
            modifica(&mut d);
            assert!(in_documento_spesa(&d).is_err(), "accettato caso non valido: {nome}");
        }
    }

    #[test]
    fn normalizza_i_codici_in_maiuscolo() {
        let mut d = dati();
        d.tipo_spesa = " sp ".into();
        d.aliquota_iva = None;
        d.natura_iva = Some(" n4 ".into());
        let doc = in_documento_spesa(&d).unwrap();
        assert_eq!(doc.voci_spesa[0].tipo_spesa, "SP");
        assert_eq!(doc.voci_spesa[0].natura_iva.as_deref(), Some("N4"));
    }

    #[test]
    fn conserva_i_decimali_dell_importo() {
        let mut d = dati();
        d.importo = 10.56;
        let doc = in_documento_spesa(&d).unwrap();
        assert_eq!(doc.voci_spesa[0].importo, 10.56);
    }
}
