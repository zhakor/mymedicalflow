/**
 * Drive reale (API REST v3) per i contratti del nucleo: `DepositoFile` per gli
 * archivi cifrati e `DepositoModello` per il modello Word (CR §4.1).
 *
 * Solo `fetch`, nessuna libreria Google: funziona uguale nel desktop (Tauri) e
 * nella PWA, e nei test basta sostituire `fetch`. Il token lo fornisce chi ha
 * fatto il login (§7.1): l'adattatore lo chiede a ogni richiesta e, se Google
 * risponde 401, una volta sola ne chiede uno rinnovato.
 *
 * Cartelle e file si ritrovano con marcatori `appProperties`, mai per nome:
 * l'utente può rinominarli o spostarli senza rompere nulla, e con l'ambito
 * `drive.file` l'app vede solo ciò che ha creato lei.
 *
 *   MyMedicalFlow/   { mmf_type: root, mmf_instance }
 *   ├── archivio/    { mmf_key: archivio }  archivio-<rev>-<uuid>.mmfbak { mmf_type: archivio, mmf_rev }
 *   ├── copie/       { mmf_key: copie }
 *   └── template/    { mmf_key: template }  template-fattura.docx { mmf_type: template }
 */

import type { Byte } from './cifratura'
import { ErroreConnessione, type DepositoFile, type DepositoModello, type FileModello } from './contratti'

const API = 'https://www.googleapis.com/drive/v3'
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3'
const CARTELLA = 'application/vnd.google-apps.folder'
const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
/** Google limita chiave + valore di una appProperty a 124 byte. */
const MAX_PROPRIETA = 100

export type ChiaveCartella = 'archivio' | 'copie' | 'template'

export interface Cartelle {
  radice: string
  archivio: string
  copie: string
  template: string
}

export interface RadiceTrovata {
  id: string
  /** Installazione del desktop che l'ha creata (§8: ricollegamento o archivio di un'altra installazione). */
  istanza: string | null
}

export interface OpzioniDrive {
  /** Access token di Google; `rinnova` chiede di non usare quello in memoria. */
  token(rinnova?: boolean): Promise<string>
  /** Per i test. */
  fetch?: typeof fetch
}

/** Login scaduto o revocato: serve un nuovo accesso Google, ritentare non basta. */
export class ErroreAccesso extends Error {
  constructor(messaggio = "L'accesso a Google è scaduto: accedi di nuovo.") {
    super(messaggio)
    this.name = 'ErroreAccesso'
  }
}

interface FileDrive {
  id: string
  name?: string
  appProperties?: Record<string, string>
}

const condizione = (chiave: string, valore: string) => `appProperties has { key='${chiave}' and value='${valore}' }`

export class Drive {
  private readonly fetch: typeof fetch

  constructor(private readonly o: OpzioniDrive) {
    this.fetch = o.fetch ?? ((...a) => globalThis.fetch(...a))
  }

  // ─── Struttura delle cartelle (§8) ──────────────────────────────────────────

  /** Le radici MyMedicalFlow visibili all'app. Più di una: l'utente sceglie (§8, passo 2). */
  async cercaRadici(): Promise<RadiceTrovata[]> {
    const file = await this.cerca(`${condizione('mmf_type', 'root')} and mimeType='${CARTELLA}'`)
    return file.map((f) => ({ id: f.id, istanza: f.appProperties?.mmf_instance ?? null }))
  }

  /** Desktop, configurazione (§8, passo 3): crea ciò che manca. Si può ripetere senza duplicare. */
  async assicuraStruttura(istanza: string, radice?: string): Promise<Cartelle> {
    const id =
      radice ?? (await this.creaFile({ name: 'MyMedicalFlow', mimeType: CARTELLA, appProperties: { mmf_type: 'root', mmf_instance: istanza } }))
    return {
      radice: id,
      archivio: await this.cartella(id, 'archivio', true),
      copie: await this.cartella(id, 'copie', true),
      template: await this.cartella(id, 'template', true),
    }
  }

  /** Telefono: solo ricerca. null se il PC non ha completato la configurazione. */
  async trovaStruttura(radice: string): Promise<Cartelle | null> {
    const [archivio, copie, template] = await Promise.all(
      (['archivio', 'copie', 'template'] as const).map((k) => this.cartella(radice, k, false)),
    )
    return archivio && copie && template ? { radice, archivio, copie, template } : null
  }

  // ─── Contratti del nucleo ───────────────────────────────────────────────────

  /** Archivi cifrati in `archivio/`: ogni salvataggio crea un file NUOVO (copia su scrittura, §4.1). */
  deposito(cartelle: Cartelle): DepositoFile {
    return {
      carica: (revisione, dati) =>
        this.caricaFile(
          {
            name: `archivio-${revisione}-${crypto.randomUUID()}.mmfbak`,
            parents: [cartelle.archivio],
            mimeType: 'application/octet-stream',
            appProperties: { mmf_type: 'archivio', mmf_rev: String(revisione) },
          },
          dati,
        ),
      scarica: (fileId) => this.scaricaFile(fileId),
      cestina: async (fileId) => {
        await this.json(`${API}/files/${fileId}?fields=id`, { method: 'PATCH', body: JSON.stringify({ trashed: true }) })
      },
    }
  }

  /** Il modello Word in chiaro in `template/`: uno solo, sostituito a ogni caricamento. */
  modello(cartelle: Cartelle): DepositoModello {
    const trova = async () =>
      (await this.cerca(`'${cartelle.template}' in parents and ${condizione('mmf_type', 'template')}`))[0] ?? null
    return {
      carica: async ({ nomeFile, dati }: FileModello) => {
        const proprieta = { mmf_type: 'template', mmf_nome: nomeFile.slice(0, MAX_PROPRIETA) }
        const esistente = await trova()
        if (esistente) {
          await this.caricaFile({ appProperties: proprieta }, dati, esistente.id)
        } else {
          await this.caricaFile({ name: 'template-fattura.docx', parents: [cartelle.template], mimeType: DOCX, appProperties: proprieta }, dati)
        }
      },
      scarica: async () => {
        const f = await trova()
        if (!f) return null
        return { nomeFile: f.appProperties?.mmf_nome ?? f.name ?? 'template-fattura.docx', dati: await this.scaricaFile(f.id) }
      },
    }
  }

  // ─── Interni ────────────────────────────────────────────────────────────────

  private async cartella(radice: string, chiave: ChiaveCartella, crea: true): Promise<string>
  private async cartella(radice: string, chiave: ChiaveCartella, crea: false): Promise<string | null>
  private async cartella(radice: string, chiave: ChiaveCartella, crea: boolean): Promise<string | null> {
    const trovata = await this.cerca(`'${radice}' in parents and ${condizione('mmf_key', chiave)} and mimeType='${CARTELLA}'`)
    if (trovata[0]) return trovata[0].id
    if (!crea) return null
    return this.creaFile({ name: chiave, parents: [radice], mimeType: CARTELLA, appProperties: { mmf_type: 'folder', mmf_key: chiave } })
  }

  private async cerca(q: string): Promise<FileDrive[]> {
    const parametri = new URLSearchParams({
      q: `${q} and trashed=false`,
      fields: 'files(id,name,appProperties)',
      pageSize: '100',
      spaces: 'drive',
    })
    const r = await this.json<{ files?: FileDrive[] }>(`${API}/files?${parametri}`)
    return r.files ?? []
  }

  private async creaFile(metadati: object): Promise<string> {
    const r = await this.json<{ id: string }>(`${API}/files?fields=id`, { method: 'POST', body: JSON.stringify(metadati) })
    return r.id
  }

  /** Metadati e contenuto in una sola richiesta (multipart). Con `id` aggiorna un file esistente. */
  private async caricaFile(metadati: object, dati: Byte, id?: string): Promise<string> {
    const confine = `mmf-${crypto.randomUUID()}`
    const testa = new TextEncoder().encode(
      `--${confine}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadati)}\r\n` +
        `--${confine}\r\nContent-Type: application/octet-stream\r\n\r\n`,
    )
    const coda = new TextEncoder().encode(`\r\n--${confine}--`)
    const corpo = new Uint8Array(testa.length + dati.length + coda.length)
    corpo.set(testa, 0)
    corpo.set(dati, testa.length)
    corpo.set(coda, testa.length + dati.length)

    const url = id ? `${UPLOAD}/files/${id}?uploadType=multipart&fields=id` : `${UPLOAD}/files?uploadType=multipart&fields=id`
    const r = await this.json<{ id: string }>(url, {
      method: id ? 'PATCH' : 'POST',
      headers: { 'Content-Type': `multipart/related; boundary=${confine}` },
      body: corpo,
    })
    return r.id
  }

  private async scaricaFile(fileId: string): Promise<Byte> {
    const risposta = await this.richiesta(`${API}/files/${fileId}?alt=media`)
    return new Uint8Array(await risposta.arrayBuffer())
  }

  private async json<T>(url: string, init: RequestInit = {}): Promise<T> {
    const headers = init.body && !(init.headers as Record<string, string> | undefined)?.['Content-Type']
      ? { 'Content-Type': 'application/json; charset=UTF-8', ...(init.headers as Record<string, string> | undefined) }
      : init.headers
    const risposta = await this.richiesta(url, { ...init, headers })
    return (await risposta.json()) as T
  }

  /**
   * Una richiesta autenticata. Rete assente, limiti di frequenza e guasti di
   * Google diventano `ErroreConnessione` (le modifiche restano in coda e si
   * ritenta); un 401 dopo il rinnovo del token diventa `ErroreAccesso`.
   */
  private async richiesta(url: string, init: RequestInit = {}, rinnovato = false): Promise<Response> {
    const token = await this.o.token(rinnovato)
    let risposta: Response
    try {
      risposta = await this.fetch(url, {
        ...init,
        headers: { ...(init.headers as Record<string, string> | undefined), Authorization: `Bearer ${token}` },
      })
    } catch (err) {
      throw new ErroreConnessione(`Drive non raggiungibile: ${err instanceof Error ? err.message : String(err)}`)
    }
    if (risposta.ok) return risposta

    if (risposta.status === 401) {
      if (!rinnovato) return this.richiesta(url, init, true)
      throw new ErroreAccesso()
    }
    const dettaglio = await risposta
      .json()
      .then((j: { error?: { message?: string; errors?: { reason?: string }[] } }) => j.error)
      .catch(() => undefined)
    const motivo = dettaglio?.errors?.[0]?.reason ?? ''
    if (risposta.status === 429 || risposta.status >= 500 || /rateLimitExceeded|userRateLimitExceeded/.test(motivo)) {
      throw new ErroreConnessione(`Drive momentaneamente non disponibile (${risposta.status}).`)
    }
    throw new Error(`Drive: ${dettaglio?.message ?? `errore ${risposta.status}`}`)
  }
}
