//! Composizione della richiesta SOAP e lettura della risposta.
//!
//! Il documento viene costruito con uno scrittore XML, non concatenando
//! stringhe: l'escaping dei caratteri speciali e la chiusura dei tag sono
//! garantiti dalla libreria.
//!
//! L'ordine degli elementi segue la `xs:sequence` dello schema. Non è un
//! dettaglio estetico: il servizio valida formalmente ogni richiesta e la
//! rifiuta con un errore `cvc-particle` se trova un elemento fuori posto.

use quick_xml::events::{BytesEnd, BytesStart, BytesText, Event};
use quick_xml::Writer;

use super::crypto;
use super::errors::ErroreSistemaTs;
use super::models::{DocumentoSpesa, MessaggioEsito, Operazione, RispostaDocumentoSpesa};

const NS_SOAP: &str = "http://schemas.xmlsoap.org/soap/envelope/";
const NS_DOC: &str = "http://documentospesap730.sanita.finanze.it";

fn errore_xml(e: impl std::fmt::Display) -> ErroreSistemaTs {
    log::error!("[sistema_ts] composizione XML: {e}");
    ErroreSistemaTs::Configurazione {
        messaggio: "Impossibile preparare la richiesta per il Sistema TS.".into(),
    }
}

/// Scrive `<doc:nome>testo</doc:nome>`, con escaping a carico della libreria.
fn elemento<W: std::io::Write>(
    w: &mut Writer<W>,
    nome: &str,
    testo: &str,
) -> Result<(), ErroreSistemaTs> {
    let tag = format!("doc:{nome}");
    w.write_event(Event::Start(BytesStart::new(&tag))).map_err(errore_xml)?;
    w.write_event(Event::Text(BytesText::new(testo))).map_err(errore_xml)?;
    w.write_event(Event::End(BytesEnd::new(&tag))).map_err(errore_xml)?;
    Ok(())
}

fn apri<W: std::io::Write>(w: &mut Writer<W>, nome: &str) -> Result<(), ErroreSistemaTs> {
    w.write_event(Event::Start(BytesStart::new(format!("doc:{nome}"))))
        .map_err(errore_xml)
}

fn chiudi<W: std::io::Write>(w: &mut Writer<W>, nome: &str) -> Result<(), ErroreSistemaTs> {
    w.write_event(Event::End(BytesEnd::new(format!("doc:{nome}"))))
        .map_err(errore_xml)
}

/// `idDocumentoFiscale`: pIva, dataEmissione, numDocumentoFiscale.
fn scrivi_id_documento<W: std::io::Write>(
    w: &mut Writer<W>,
    nome_elemento: &str,
    doc: &DocumentoSpesa,
) -> Result<(), ErroreSistemaTs> {
    apri(w, nome_elemento)?;
    elemento(w, "pIva", &doc.id_spesa.p_iva)?;
    elemento(w, "dataEmissione", &doc.id_spesa.data_emissione)?;
    apri(w, "numDocumentoFiscale")?;
    elemento(w, "dispositivo", &doc.id_spesa.dispositivo.to_string())?;
    elemento(w, "numDocumento", &doc.id_spesa.num_documento)?;
    chiudi(w, "numDocumentoFiscale")?;
    chiudi(w, nome_elemento)?;
    Ok(())
}

/// `documentoSpesa` completo, nell'ordine imposto dallo schema.
fn scrivi_documento<W: std::io::Write>(
    w: &mut Writer<W>,
    nome_elemento: &str,
    doc: &DocumentoSpesa,
) -> Result<(), ErroreSistemaTs> {
    apri(w, nome_elemento)?;

    scrivi_id_documento(w, "idSpesa", doc)?;
    elemento(w, "dataPagamento", &doc.data_pagamento)?;

    if doc.flag_pagamento_anticipato {
        // Lo schema ammette il solo valore 1
        elemento(w, "flagPagamentoAnticipato", "1")?;
    }

    if let Some(cf) = &doc.cf_cittadino {
        // Cifrato qui, non prima: così un codice fiscale non può finire in
        // chiaro nell'XML per una dimenticanza a monte.
        elemento(w, "cfCittadino", &crypto::cifra(cf)?)?;
    }

    for voce in &doc.voci_spesa {
        apri(w, "voceSpesa")?;
        elemento(w, "tipoSpesa", &voce.tipo_spesa)?;
        // xs:double: due decimali, come gli importi in fattura
        elemento(w, "importo", &format!("{:.2}", voce.importo))?;
        // xs:choice: al massimo uno dei due
        if let Some(aliquota) = voce.aliquota_iva {
            // RateType impone il pattern [0-9]{1,3}\.[0-9]{2}
            elemento(w, "aliquotaIVA", &format!("{aliquota:.2}"))?;
        } else if let Some(natura) = &voce.natura_iva {
            elemento(w, "naturaIVA", natura)?;
        }
        chiudi(w, "voceSpesa")?;
    }

    if let Some(v) = &doc.pagamento_tracciato {
        elemento(w, "pagamentoTracciato", v)?;
    }
    if let Some(v) = &doc.tipo_documento {
        elemento(w, "tipoDocumento", v)?;
    }
    if let Some(v) = &doc.flag_opposizione {
        elemento(w, "flagOpposizione", v)?;
    }

    chiudi(w, nome_elemento)?;
    Ok(())
}

/// Compone la busta SOAP completa.
///
/// `pincode` e `cf_proprietario` arrivano in chiaro e vengono cifrati qui.
pub fn componi_richiesta(
    operazione: Operazione,
    documento: &DocumentoSpesa,
    pincode: &str,
    cf_proprietario: &str,
) -> Result<String, ErroreSistemaTs> {
    let mut w = Writer::new(Vec::new());

    let mut envelope = BytesStart::new("soapenv:Envelope");
    envelope.push_attribute(("xmlns:soapenv", NS_SOAP));
    envelope.push_attribute(("xmlns:doc", NS_DOC));
    w.write_event(Event::Start(envelope)).map_err(errore_xml)?;

    // Header vuoto: l'autenticazione è HTTP Basic, non WS-Security
    w.write_event(Event::Empty(BytesStart::new("soapenv:Header")))
        .map_err(errore_xml)?;
    w.write_event(Event::Start(BytesStart::new("soapenv:Body")))
        .map_err(errore_xml)?;

    let richiesta = operazione.elemento_richiesta();
    apri(&mut w, richiesta)?;

    // L'ordine che segue è quello della xs:sequence: pincode prima del
    // proprietario, e il documento per ultimo.
    elemento(&mut w, "pincode", &crypto::cifra(pincode)?)?;

    apri(&mut w, "Proprietario")?;
    elemento(&mut w, "cfProprietario", &crypto::cifra(cf_proprietario)?)?;
    chiudi(&mut w, "Proprietario")?;

    match operazione {
        Operazione::Inserimento => {
            scrivi_documento(&mut w, "idInserimentoDocumentoFiscale", documento)?
        }
        Operazione::Variazione => {
            scrivi_documento(&mut w, "idVariazioneDocumentoFiscale", documento)?
        }
        // La cancellazione richiede solo l'identificativo del documento
        Operazione::Cancellazione => {
            scrivi_id_documento(&mut w, "idCancellazioneDocumentoFiscale", documento)?
        }
        // Il rimborso richiede identificativo e documento
        Operazione::Rimborso => {
            scrivi_id_documento(&mut w, "idRimborsoDocumentoFiscale", documento)?;
            scrivi_documento(&mut w, "DocumentoSpesa", documento)?;
        }
    }

    chiudi(&mut w, richiesta)?;
    w.write_event(Event::End(BytesEnd::new("soapenv:Body"))).map_err(errore_xml)?;
    w.write_event(Event::End(BytesEnd::new("soapenv:Envelope"))).map_err(errore_xml)?;

    String::from_utf8(w.into_inner()).map_err(errore_xml)
}

// ─── Lettura della risposta ───────────────────────────────────────────────────

/// Estrae il testo degli elementi con il nome indicato, ignorando i prefissi
/// di namespace: il server può usarne di diversi da una versione all'altra.
fn nome_locale(nome: &[u8]) -> &[u8] {
    match nome.iter().position(|b| *b == b':') {
        Some(i) => &nome[i + 1..],
        None => nome,
    }
}

/// Interpreta la risposta del servizio.
pub fn analizza_risposta(xml: &str) -> Result<RispostaDocumentoSpesa, ErroreSistemaTs> {
    // Un SOAP Fault ha la precedenza: non contiene un esito applicativo
    if let Some((codice, descrizione)) = analizza_fault(xml) {
        return Err(ErroreSistemaTs::soap(Some(codice), &descrizione));
    }

    let mut lettore = quick_xml::Reader::from_str(xml);
    lettore.config_mut().trim_text(true);

    let mut esito_chiamata = String::new();
    let mut protocollo: Option<String> = None;
    let mut messaggi: Vec<MessaggioEsito> = Vec::new();
    let mut corrente: Option<Vec<u8>> = None;
    let (mut codice, mut descrizione, mut tipo) = (String::new(), String::new(), String::new());

    loop {
        match lettore.read_event() {
            Ok(Event::Start(e)) => corrente = Some(nome_locale(e.name().as_ref()).to_vec()),
            Ok(Event::Text(t)) => {
                let testo = t.decode().map_err(errore_xml)?.into_owned();
                match corrente.as_deref() {
                    Some(b"esitoChiamata") => esito_chiamata = testo,
                    Some(b"protocollo") => protocollo = Some(testo),
                    Some(b"codice") => codice = testo,
                    Some(b"descrizione") => descrizione = testo,
                    Some(b"tipo") => tipo = testo,
                    _ => {}
                }
            }
            Ok(Event::End(e)) => {
                if nome_locale(e.name().as_ref()) == b"messaggio" {
                    messaggi.push(MessaggioEsito {
                        codice: std::mem::take(&mut codice),
                        descrizione: std::mem::take(&mut descrizione),
                        tipo: std::mem::take(&mut tipo),
                    });
                }
                corrente = None;
            }
            Ok(Event::Eof) => break,
            Err(e) => return Err(errore_xml(e)),
            _ => {}
        }
    }

    if esito_chiamata.is_empty() && protocollo.is_none() && messaggi.is_empty() {
        return Err(ErroreSistemaTs::Soap {
            messaggio: "Risposta del Sistema TS non riconosciuta.".into(),
            codice: None,
        });
    }

    Ok(RispostaDocumentoSpesa { esito_chiamata, protocollo, messaggi })
}

/// Riconosce un SOAP Fault, restituendo codice e descrizione.
pub fn analizza_fault(xml: &str) -> Option<(String, String)> {
    let mut lettore = quick_xml::Reader::from_str(xml);
    lettore.config_mut().trim_text(true);

    let mut trovato = false;
    let mut corrente: Option<Vec<u8>> = None;
    let (mut codice, mut stringa) = (String::new(), String::new());

    loop {
        match lettore.read_event() {
            Ok(Event::Start(e)) => {
                let nome = nome_locale(e.name().as_ref()).to_vec();
                if nome == b"Fault" {
                    trovato = true;
                }
                corrente = Some(nome);
            }
            Ok(Event::Text(t)) => {
                if let Ok(testo) = t.decode() {
                    match corrente.as_deref() {
                        Some(b"faultcode") => codice = testo.into_owned(),
                        Some(b"faultstring") => stringa = testo.into_owned(),
                        _ => {}
                    }
                }
            }
            Ok(Event::Eof) => break,
            Err(_) => return None,
            _ => {}
        }
    }

    trovato.then(|| (codice, stringa))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sistema_ts::models::{IdDocumentoFiscale, VoceSpesa};

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
                importo: 162.0,
                aliquota_iva: Some(0.0),
                natura_iva: None,
            }],
            pagamento_tracciato: Some("SI".into()),
            tipo_documento: Some("F".into()),
            flag_opposizione: Some("0".into()),
        }
    }

    fn componi(doc: &DocumentoSpesa) -> String {
        componi_richiesta(Operazione::Inserimento, doc, "1234", "RSSMRA80A01H501U").unwrap()
    }

    fn posizione(xml: &str, tag: &str) -> usize {
        xml.find(tag).unwrap_or_else(|| panic!("elemento assente: {tag}"))
    }

    #[test]
    fn la_busta_dichiara_i_namespace_corretti() {
        let xml = componi(&documento());
        assert!(xml.contains(&format!("xmlns:soapenv=\"{NS_SOAP}\"")));
        assert!(xml.contains(&format!("xmlns:doc=\"{NS_DOC}\"")));
        // L'autenticazione è HTTP Basic: l'header SOAP resta vuoto
        assert!(xml.contains("<soapenv:Header/>"), "header non vuoto: {xml}");
    }

    #[test]
    fn rispetta_l_ordine_della_sequenza_dello_schema() {
        // Il servizio valida formalmente: un elemento fuori posto viene
        // rifiutato con un errore cvc-particle.
        let xml = componi(&documento());
        let ordine = [
            "<doc:pincode>",
            "<doc:Proprietario>",
            "<doc:idInserimentoDocumentoFiscale>",
            "<doc:idSpesa>",
            "<doc:pIva>",
            "<doc:dataEmissione>",
            "<doc:numDocumentoFiscale>",
            "<doc:dataPagamento>",
            "<doc:cfCittadino>",
            "<doc:voceSpesa>",
            "<doc:pagamentoTracciato>",
            "<doc:tipoDocumento>",
            "<doc:flagOpposizione>",
        ];
        let posizioni: Vec<usize> = ordine.iter().map(|t| posizione(&xml, t)).collect();
        for coppia in posizioni.windows(2) {
            assert!(coppia[0] < coppia[1], "ordine degli elementi errato:\n{xml}");
        }
    }

    #[test]
    fn i_codici_fiscali_non_compaiono_mai_in_chiaro() {
        let xml = componi(&documento());
        assert!(!xml.contains("RSSMRA80A01H501U"), "codice fiscale in chiaro:\n{xml}");
        assert!(!xml.contains(">1234<"), "pincode in chiaro");
    }

    #[test]
    fn l_aliquota_ha_sempre_due_decimali() {
        // RateType impone il pattern [0-9]{1,3}\.[0-9]{2}: "0" o "0.0" sarebbero rifiutati
        let xml = componi(&documento());
        assert!(xml.contains("<doc:aliquotaIVA>0.00</doc:aliquotaIVA>"), "{xml}");

        let mut d = documento();
        d.voci_spesa[0].aliquota_iva = Some(22.0);
        assert!(componi(&d).contains("<doc:aliquotaIVA>22.00</doc:aliquotaIVA>"));
    }

    #[test]
    fn l_importo_conserva_i_centesimi() {
        let mut d = documento();
        d.voci_spesa[0].importo = 10.5;
        assert!(componi(&d).contains("<doc:importo>10.50</doc:importo>"));
        d.voci_spesa[0].importo = 162.0;
        assert!(componi(&d).contains("<doc:importo>162.00</doc:importo>"));
    }

    #[test]
    fn aliquota_e_natura_non_convivono() {
        let mut d = documento();
        d.voci_spesa[0].aliquota_iva = None;
        d.voci_spesa[0].natura_iva = Some("N4".into());
        let xml = componi(&d);
        assert!(xml.contains("<doc:naturaIVA>N4</doc:naturaIVA>"));
        assert!(!xml.contains("aliquotaIVA"), "xs:choice violato");
    }

    #[test]
    fn i_campi_facoltativi_assenti_non_vengono_scritti() {
        let mut d = documento();
        d.tipo_documento = None;
        d.flag_opposizione = None;
        d.pagamento_tracciato = None;
        d.cf_cittadino = None;
        let xml = componi(&d);
        for tag in ["tipoDocumento", "flagOpposizione", "pagamentoTracciato", "cfCittadino"] {
            assert!(!xml.contains(tag), "elemento vuoto scritto comunque: {tag}");
        }
    }

    #[test]
    fn i_caratteri_speciali_vengono_protetti() {
        let mut d = documento();
        // Un numero documento con & finirebbe per rompere l'XML se concatenato
        d.id_spesa.num_documento = "A&B<C>".into();
        let xml = componi(&d);
        assert!(xml.contains("A&amp;B&lt;C&gt;"), "escaping mancante:\n{xml}");
    }

    #[test]
    fn la_cancellazione_manda_solo_l_identificativo() {
        let xml =
            componi_richiesta(Operazione::Cancellazione, &documento(), "1234", "RSSMRA80A01H501U")
                .unwrap();
        assert!(xml.contains("<doc:idCancellazioneDocumentoFiscale>"));
        // Non servono importi né voci di spesa per cancellare
        assert!(!xml.contains("voceSpesa"), "dati superflui in cancellazione");
        assert!(!xml.contains("dataPagamento"));
    }

    #[test]
    fn il_rimborso_manda_identificativo_e_documento() {
        let xml = componi_richiesta(Operazione::Rimborso, &documento(), "1234", "RSSMRA80A01H501U")
            .unwrap();
        assert!(posizione(&xml, "<doc:idRimborsoDocumentoFiscale>") < posizione(&xml, "<doc:DocumentoSpesa>"));
    }

    // ─── Lettura della risposta ───────────────────────────────────────────────

    #[test]
    fn legge_una_risposta_accettata() {
        let xml = r#"<?xml version="1.0"?>
        <soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
          <soap:Body>
            <ns2:inserimentoDocumentoSpesaResponse xmlns:ns2="http://documentospesap730.sanita.finanze.it">
              <esitoChiamata>OK</esitoChiamata>
              <protocollo>99260526656625148</protocollo>
              <listaMessaggi/>
            </ns2:inserimentoDocumentoSpesaResponse>
          </soap:Body>
        </soap:Envelope>"#;
        let r = analizza_risposta(xml).unwrap();
        assert_eq!(r.protocollo.as_deref(), Some("99260526656625148"));
        assert!(r.accettata());
    }

    #[test]
    fn legge_i_messaggi_di_errore_applicativo() {
        let xml = r#"<Envelope><Body><inserimentoDocumentoSpesaResponse>
              <esitoChiamata>KO</esitoChiamata>
              <listaMessaggi>
                <messaggio><codice>C107</codice><descrizione>CF non in anagrafe</descrizione><tipo>E</tipo></messaggio>
                <messaggio><codice>W01</codice><descrizione>importo alto</descrizione><tipo>W</tipo></messaggio>
              </listaMessaggi>
            </inserimentoDocumentoSpesaResponse></Body></Envelope>"#;
        let r = analizza_risposta(xml).unwrap();
        assert_eq!(r.messaggi.len(), 2);
        assert_eq!(r.primo_errore().unwrap().codice, "C107");
        assert!(!r.accettata());
    }

    #[test]
    fn riconosce_un_soap_fault() {
        let xml = r#"<env:Envelope xmlns:env="http://schemas.xmlsoap.org/soap/envelope/"><env:Body>
            <env:Fault>
              <faultcode>env:Client</faultcode>
              <faultstring>cvc-particle 2.1: next item should be pincode</faultstring>
            </env:Fault></env:Body></env:Envelope>"#;

        let (codice, descrizione) = analizza_fault(xml).unwrap();
        assert_eq!(codice, "env:Client");
        assert!(descrizione.contains("cvc-particle"));

        // Passando dalla lettura normale diventa un errore, non una risposta
        let errore = analizza_risposta(xml).unwrap_err();
        assert!(matches!(errore, ErroreSistemaTs::Soap { .. }));
        // Il dettaglio tecnico non arriva all'utente
        assert!(!errore.messaggio().contains("cvc-particle"));
    }

    #[test]
    fn rifiuta_una_risposta_incomprensibile() {
        assert!(analizza_risposta("<html><body>Errore 502</body></html>").is_err());
        assert!(analizza_risposta("").is_err());
    }
}
