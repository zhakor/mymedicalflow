import type { Gender } from "./paziente";

// Professioni supportate
export type Professione = string;

// Profilo del professionista sanitario
export interface ProfiloProfessionista {
  professione: Professione;
  nome: string;
  cognome: string;
  partitaIva: string;
  /** Codice fiscale del professionista: il Sistema TS identifica con questo
   *  l'erogatore della prestazione. Opzionale per i profili già esistenti. */
  codiceFiscale?: string;
  /** Numero del dispositivo di emissione (1–999) richiesto dal Sistema TS.
   *  Per un professionista singolo vale 1. */
  dispositivo?: number;
  dataNascita: string; // ISO date string YYYY-MM-DD
  /** Usato per concordare i messaggi rivolti al professionista.
   *  Opzionale: i profili creati prima non lo contengono. */
  sesso?: Gender;
  fotoProfilo?: string; // base64 data URL opzionale
}

/** Saluto concordato al genere; senza indicazione resta la forma doppia. */
export function salutoPerSesso(sesso?: Gender): string {
  if (sesso === "male") return "Benvenuto";
  if (sesso === "female") return "Benvenuta";
  return "Benvenuto/a";
}

// Valute supportate
export type Valuta = "EUR" | "USD" | "GBP";

// Metadati del template fattura .docx
export interface TemplateFattura {
  nomeFile: string;
  dimensione: number; // bytes
  dataCaricamento: string; // ISO datetime string
  mimeType: string;
  contenuto?: string; // base64 del file .docx per la generazione fatture
}

// Impostazioni applicazione
export interface ImpostazioniApp {
  tema: "light" | "dark";
  templateFattura?: TemplateFattura;
  cartellaSalvataggio?: string;
}

// Stato di avvio dell'app
// "copie": configurazione iniziale delle copie di sicurezza, dopo il profilo
export type StatoAvvio = "loading" | "recupero-chiave" | "abbonamento" | "setup" | "copie" | "ready";
