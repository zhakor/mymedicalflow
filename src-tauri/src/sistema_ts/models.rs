//! Rappresentazione del documento di spesa.
//!
//! Questi tipi seguono `DocumentoSpesa730pSchema.xsd` e restano confinati al
//! modulo: il resto dell'app non li conosce. È lo strato che assorbe un
//! eventuale cambio del tracciato ministeriale.

use serde::{Deserialize, Serialize};

/// Operazioni esposte dal WSDL `DocumentoSpesa730p`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Operazione {
    Inserimento,
    Variazione,
    Cancellazione,
    Rimborso,
}

impl Operazione {
    /// Valore dell'header `SOAPAction`, dal WSDL ufficiale.
    pub fn soap_action(&self) -> &'static str {
        match self {
            Operazione::Inserimento => "inserimento.documentospesap730.sanita.finanze.it",
            Operazione::Variazione => "variazione.documentospesap730.sanita.finanze.it",
            Operazione::Cancellazione => "cancellazione.documentospesap730.sanita.finanze.it",
            Operazione::Rimborso => "rimborso.documentospesap730.sanita.finanze.it",
        }
    }

    /// Nome dell'elemento di richiesta nello schema, usato dal compositore XML.
    pub fn elemento_richiesta(&self) -> &'static str {
        match self {
            Operazione::Inserimento => "inserimentoDocumentoSpesaRequest",
            Operazione::Variazione => "variazioneDocumentoSpesaRequest",
            Operazione::Cancellazione => "cancellazioneDocumentoSpesaRequest",
            Operazione::Rimborso => "rimborsoDocumentoSpesaRequest",
        }
    }
}

/// `idDocumentoFiscale`: identifica univocamente il documento nel Sistema TS.
/// Questi quattro valori insieme sono la chiave usata anche per variazioni e
/// cancellazioni, quindi non devono cambiare dopo il primo invio.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct IdDocumentoFiscale {
    /// Undici cifre.
    pub p_iva: String,
    /// `AAAA-MM-GG`, non prima del 2014-01-01.
    pub data_emissione: String,
    /// Da 1 a 999.
    pub dispositivo: u16,
    /// Fino a 20 caratteri fra lettere, cifre e `_ . / \ -`.
    pub num_documento: String,
}

/// Una riga di `voceSpesa`.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct VoceSpesa {
    pub tipo_spesa: String,
    pub importo: f64,
    /// Alternativa a `natura_iva`: l'XSD le dichiara in `xs:choice`.
    pub aliquota_iva: Option<f64>,
    pub natura_iva: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct DocumentoSpesa {
    pub id_spesa: IdDocumentoFiscale,
    pub data_pagamento: String,
    pub flag_pagamento_anticipato: bool,
    /// Codice fiscale dell'assistito **in chiaro**: viene cifrato solo al
    /// momento di comporre l'XML, e non viene mai registrato nei log.
    pub cf_cittadino: Option<String>,
    pub voci_spesa: Vec<VoceSpesa>,
    /// `SI` oppure `NO`.
    pub pagamento_tracciato: Option<String>,
    /// `F` fattura, `D` documento commerciale.
    pub tipo_documento: Option<String>,
    /// `0` non si oppone, `1` si oppone.
    pub flag_opposizione: Option<String>,
}

/// Esito restituito dal servizio.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RispostaDocumentoSpesa {
    pub esito_chiamata: String,
    pub protocollo: Option<String>,
    pub messaggi: Vec<MessaggioEsito>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MessaggioEsito {
    pub codice: String,
    pub descrizione: String,
    /// Tipicamente `E` errore, `W` avviso, `I` informazione. Il valore
    /// originale del Sistema TS: l'XSD lo dichiara come stringa libera, senza
    /// un elenco chiuso di valori ammessi.
    pub tipo: String,
}

/// Classificazione del campo `tipo` di un `MessaggioEsito`.
///
/// L'XSD non vincola `tipo` a un'enumerazione: un valore non riconosciuto
/// diventa `Sconosciuta` invece di essere trattato a caso come errore o avviso.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CategoriaMessaggio {
    Errore,
    Avviso,
    Informazione,
    Sconosciuta,
}

impl MessaggioEsito {
    /// Interpreta `tipo` senza perdere il valore originale, che resta comunque
    /// disponibile sul messaggio.
    pub fn categoria(&self) -> CategoriaMessaggio {
        match self.tipo.to_ascii_uppercase().as_str() {
            "E" => CategoriaMessaggio::Errore,
            "W" => CategoriaMessaggio::Avviso,
            "I" => CategoriaMessaggio::Informazione,
            _ => CategoriaMessaggio::Sconosciuta,
        }
    }
}

impl RispostaDocumentoSpesa {
    /// Il Sistema TS accetta il documento restituendo un protocollo.
    pub fn accettata(&self) -> bool {
        self.protocollo
            .as_deref()
            .is_some_and(|p| !p.trim().is_empty())
            && !self
                .messaggi
                .iter()
                .any(|m| m.categoria() == CategoriaMessaggio::Errore)
    }

    /// Primo messaggio di errore, se presente.
    pub fn primo_errore(&self) -> Option<&MessaggioEsito> {
        self.messaggi
            .iter()
            .find(|m| m.categoria() == CategoriaMessaggio::Errore)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn risposta(
        protocollo: Option<&str>,
        messaggi: Vec<(&str, &str, &str)>,
    ) -> RispostaDocumentoSpesa {
        RispostaDocumentoSpesa {
            esito_chiamata: "OK".into(),
            protocollo: protocollo.map(str::to_string),
            messaggi: messaggi
                .into_iter()
                .map(|(c, d, t)| MessaggioEsito {
                    codice: c.into(),
                    descrizione: d.into(),
                    tipo: t.into(),
                })
                .collect(),
        }
    }

    #[test]
    fn le_soap_action_seguono_il_wsdl() {
        assert_eq!(
            Operazione::Inserimento.soap_action(),
            "inserimento.documentospesap730.sanita.finanze.it"
        );
        assert_eq!(
            Operazione::Rimborso.soap_action(),
            "rimborso.documentospesap730.sanita.finanze.it"
        );
        // Ogni operazione ha la propria, altrimenti il server risponderebbe a caso
        let azioni: Vec<_> = [
            Operazione::Inserimento,
            Operazione::Variazione,
            Operazione::Cancellazione,
            Operazione::Rimborso,
        ]
        .iter()
        .map(|o| o.soap_action())
        .collect();
        let mut uniche = azioni.clone();
        uniche.sort_unstable();
        uniche.dedup();
        assert_eq!(uniche.len(), azioni.len());
    }

    #[test]
    fn gli_elementi_di_richiesta_seguono_lo_schema() {
        assert_eq!(
            Operazione::Inserimento.elemento_richiesta(),
            "inserimentoDocumentoSpesaRequest"
        );
        assert_eq!(
            Operazione::Cancellazione.elemento_richiesta(),
            "cancellazioneDocumentoSpesaRequest"
        );
        assert_eq!(
            Operazione::Rimborso.elemento_richiesta(),
            "rimborsoDocumentoSpesaRequest"
        );
    }

    #[test]
    fn una_risposta_con_protocollo_e_accettata() {
        assert!(risposta(Some("99260526656625148"), vec![]).accettata());
    }

    #[test]
    fn un_messaggio_di_errore_annulla_l_accettazione() {
        let r = risposta(Some("123"), vec![("C01", "codice fiscale errato", "E")]);
        assert!(!r.accettata());
        assert_eq!(r.primo_errore().unwrap().codice, "C01");
    }

    #[test]
    fn gli_avvisi_non_impediscono_l_accettazione() {
        let r = risposta(Some("123"), vec![("W10", "importo insolito", "W")]);
        assert!(r.accettata(), "un avviso non è un rifiuto");
        assert!(r.primo_errore().is_none());
    }

    #[test]
    fn senza_protocollo_non_e_accettata() {
        assert!(!risposta(None, vec![]).accettata());
        assert!(!risposta(Some("  "), vec![]).accettata());
    }

    #[test]
    fn la_categoria_classifica_i_valori_noti_del_sistema_ts() {
        let msg = |tipo: &str| MessaggioEsito {
            codice: "X".into(),
            descrizione: "d".into(),
            tipo: tipo.into(),
        };
        assert_eq!(msg("E").categoria(), CategoriaMessaggio::Errore);
        assert_eq!(
            msg("e").categoria(),
            CategoriaMessaggio::Errore,
            "senza distinguere maiuscole"
        );
        assert_eq!(msg("W").categoria(), CategoriaMessaggio::Avviso);
        assert_eq!(msg("I").categoria(), CategoriaMessaggio::Informazione);
    }

    #[test]
    fn un_tipo_non_documentato_diventa_sconosciuto_senza_perdere_il_valore() {
        let msg = MessaggioEsito {
            codice: "X".into(),
            descrizione: "d".into(),
            tipo: "Z".into(),
        };
        assert_eq!(msg.categoria(), CategoriaMessaggio::Sconosciuta);
        // Il valore originale resta leggibile, non viene sovrascritto
        assert_eq!(msg.tipo, "Z");
    }
}
