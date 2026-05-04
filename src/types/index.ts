// Professioni supportate
export type Professione = string;

// Profilo del professionista sanitario
export interface ProfiloProfessionista {
  professione: Professione;
  nome: string;
  cognome: string;
  partitaIva: string;
  dataNascita: string; // ISO date string YYYY-MM-DD
  fotoProfilo?: string; // base64 data URL opzionale
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
export type StatoAvvio = "loading" | "setup" | "ready";
