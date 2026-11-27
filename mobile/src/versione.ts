/**
 * Versione dell'app (commit · ora di avvio del server o della build), iniettata
 * da vite.config.ts. Letta con `typeof`: se il server sta ancora usando una
 * configurazione precedente la costante non esiste, e l'app non deve fermarsi
 * per un'informazione accessoria.
 */
export const VERSIONE: string = typeof __VERSIONE_APP__ !== 'undefined' ? __VERSIONE_APP__ : 'sviluppo'
