import { describe, expect, it } from 'vitest'
import { Drive } from './drive'
import { ErroreAccesso, ErroreConnessione } from './contratti'
import { importaChiave, type Archivio } from './cifratura'
import { CloudInMemoria } from './memoria'
import { MotoreSincronizzazione } from './motore'

interface FileFinto {
  id: string
  name: string
  parents: string[]
  mimeType: string
  appProperties: Record<string, string>
  trashed: boolean
  contenuto: Uint8Array
}

/**
 * Drive finto dietro `fetch`: capisce le query usate dall'adattatore, gli
 * upload multipart e il cestino. `guasto` simula una risposta d'errore.
 */
function driveFinto() {
  const file = new Map<string, FileFinto>()
  const stato = { contatore: 0, richieste: 0, token: [] as string[], guasto: null as null | { status: number; reason?: string; volte: number } }

  const json = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } })
  const binario = (byte: Uint8Array) => Array.from(byte, (b) => String.fromCharCode(b)).join('')
  const daBinario = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0))

  function filtra(q: string): FileFinto[] {
    return [...file.values()].filter((f) => {
      for (const [, padre] of q.matchAll(/'([^']+)' in parents/g)) if (!f.parents.includes(padre)) return false
      for (const [, k, v] of q.matchAll(/appProperties has \{ key='([^']+)' and value='([^']+)' \}/g)) if (f.appProperties[k] !== v) return false
      for (const [, m] of q.matchAll(/mimeType='([^']+)'/g)) if (f.mimeType !== m) return false
      if (q.includes('trashed=false') && f.trashed) return false
      return true
    })
  }

  function multipart(contentType: string, corpo: Uint8Array): { metadati: Partial<FileFinto>; dati: Uint8Array } {
    const confine = contentType.split('boundary=')[1]
    const parti = binario(corpo).split(`--${confine}`).slice(1, 3)
    const [metaTesto, datiTesto] = parti.map((p) => p.slice(p.indexOf('\r\n\r\n') + 4).replace(/\r\n$/, ''))
    return { metadati: JSON.parse(metaTesto), dati: daBinario(datiTesto) }
  }

  const fetchFinto: typeof fetch = async (entrata, init = {}) => {
    stato.richieste++
    const url = new URL(String(entrata))
    const metodo = init.method ?? 'GET'
    const intestazioni = (init.headers ?? {}) as Record<string, string>
    stato.token.push(intestazioni.Authorization)
    if (stato.guasto && stato.guasto.volte > 0) {
      stato.guasto.volte--
      return json({ error: { message: 'guasto', errors: [{ reason: stato.guasto.reason ?? 'backendError' }] } }, stato.guasto.status)
    }
    if (intestazioni.Authorization === 'Bearer scaduto') return json({ error: { message: 'Invalid Credentials' } }, 401)

    const percorso = url.pathname
    const id = percorso.match(/\/files\/([^/]+)$/)?.[1]

    if (metodo === 'GET' && percorso.endsWith('/drive/v3/files')) {
      const trovati = filtra(url.searchParams.get('q') ?? '')
      return json({ files: trovati.map(({ id, name, appProperties }) => ({ id, name, appProperties })) })
    }
    if (metodo === 'GET' && id && url.searchParams.get('alt') === 'media') {
      const f = file.get(id)
      return f ? new Response(f.contenuto.slice()) : json({ error: { message: 'File not found' } }, 404)
    }
    if (metodo === 'POST' && percorso === '/drive/v3/files') {
      const meta = JSON.parse(String(init.body)) as Partial<FileFinto>
      const nuovo: FileFinto = { id: `f${++stato.contatore}`, name: '', parents: [], mimeType: '', appProperties: {}, trashed: false, contenuto: new Uint8Array(), ...meta }
      file.set(nuovo.id, nuovo)
      return json({ id: nuovo.id })
    }
    if (percorso.startsWith('/upload/drive/v3/files')) {
      const { metadati, dati } = multipart(intestazioni['Content-Type'], init.body as Uint8Array)
      if (metodo === 'POST') {
        const nuovo: FileFinto = { id: `f${++stato.contatore}`, name: '', parents: [], mimeType: '', appProperties: {}, trashed: false, ...metadati, contenuto: dati }
        file.set(nuovo.id, nuovo)
        return json({ id: nuovo.id })
      }
      const f = file.get(id!)!
      Object.assign(f, metadati, { appProperties: { ...f.appProperties, ...metadati.appProperties }, contenuto: dati })
      return json({ id: f.id })
    }
    if (metodo === 'PATCH' && id) {
      Object.assign(file.get(id)!, JSON.parse(String(init.body)))
      return json({ id })
    }
    return json({ error: { message: `non previsto: ${metodo} ${percorso}` } }, 400)
  }

  return { file, stato, fetch: fetchFinto }
}

function nuovoDrive(finto = driveFinto(), token: (rinnova?: boolean) => Promise<string> = async () => 'buono') {
  return { finto, drive: new Drive({ token, fetch: finto.fetch }) }
}

const BYTE = Uint8Array.from({ length: 256 }, (_, i) => i)

describe('Drive: struttura delle cartelle (§8)', () => {
  it('la configurazione crea radice e cartelle, e ripeterla non duplica nulla', async () => {
    const { finto, drive } = nuovoDrive()
    const cartelle = await drive.assicuraStruttura('installazione-1')
    expect(await drive.cercaRadici()).toEqual([{ id: cartelle.radice, istanza: 'installazione-1' }])

    const ripetuta = await drive.assicuraStruttura('installazione-1', cartelle.radice)
    expect(ripetuta).toEqual(cartelle)
    expect(finto.file.size).toBe(4)
  })

  it('il telefono trova la struttura solo se il PC l\'ha completata', async () => {
    const { finto, drive } = nuovoDrive()
    const cartelle = await drive.assicuraStruttura('installazione-1')
    expect(await drive.trovaStruttura(cartelle.radice)).toEqual(cartelle)

    finto.file.get(cartelle.template)!.trashed = true
    expect(await drive.trovaStruttura(cartelle.radice)).toBeNull()
  })
})

describe('Drive: archivi e modello', () => {
  it('ogni archivio è un file nuovo con la sua revisione, scaricato byte per byte', async () => {
    const { finto, drive } = nuovoDrive()
    const deposito = drive.deposito(await drive.assicuraStruttura('i'))
    const primo = await deposito.carica(1, BYTE)
    const secondo = await deposito.carica(2, BYTE.slice(0, 10))

    expect(primo).not.toBe(secondo)
    expect(await deposito.scarica(primo)).toEqual(BYTE)
    expect(finto.file.get(secondo)).toMatchObject({ appProperties: { mmf_type: 'archivio', mmf_rev: '2' } })
    expect(finto.file.get(secondo)!.name).toMatch(/^archivio-2-.+\.mmfbak$/)

    await deposito.cestina(primo)
    expect(finto.file.get(primo)!.trashed).toBe(true)
  })

  it('il modello Word è uno solo: il secondo caricamento sostituisce il primo', async () => {
    const { finto, drive } = nuovoDrive()
    const modello = drive.modello(await drive.assicuraStruttura('i'))
    expect(await modello.scarica()).toBeNull()

    await modello.carica({ nomeFile: 'Vecchio.docx', dati: BYTE.slice(0, 4) })
    await modello.carica({ nomeFile: 'Studio Rossi.docx', dati: BYTE })
    expect(await modello.scarica()).toEqual({ nomeFile: 'Studio Rossi.docx', dati: BYTE })
    expect([...finto.file.values()].filter((f) => f.appProperties.mmf_type === 'template')).toHaveLength(1)
  })

  it('il motore di sincronizzazione funziona sopra Drive reale', async () => {
    const chiave = await importaChiave(Uint8Array.from({ length: 32 }, (_, i) => i))
    const { drive } = nuovoDrive()
    const deposito = drive.deposito(await drive.assicuraStruttura('i'))
    const { registro } = new CloudInMemoria().client()

    const dispositivo = (iniziale: Archivio) => {
      let locale = { ...iniziale }
      const motore = new MotoreSincronizzazione({
        deposito,
        registro,
        chiave,
        dispositivo: 'x',
        leggiLocale: () => ({ ...locale }),
        scriviLocale: (a) => {
          locale = { ...a }
        },
        risolviConflitti: async () => new Map(),
      })
      return { motore, leggi: () => locale, scrivi: (a: Archivio) => (locale = a) }
    }

    const pc = dispositivo({ pazienti: '[{"id":"p1","updatedAt":"1"}]' })
    await pc.motore.inizializzaRemoto()
    const telefono = dispositivo({})
    await telefono.motore.collega()
    expect(telefono.leggi()).toEqual(pc.leggi())

    telefono.scrivi({ pazienti: '[{"id":"p1","updatedAt":"1"},{"id":"p2","updatedAt":"2"}]' })
    await telefono.motore.sincronizza()
    await pc.motore.sincronizza({ fresco: true })
    expect(JSON.parse(pc.leggi().pazienti)).toHaveLength(2)
  })
})

describe('Drive: errori', () => {
  it('rete assente, limiti di frequenza e guasti di Google si ritentano più tardi', async () => {
    const caduta: typeof fetch = async () => {
      throw new TypeError('Failed to fetch')
    }
    await expect(new Drive({ token: async () => 't', fetch: caduta }).cercaRadici()).rejects.toThrow(ErroreConnessione)

    for (const guasto of [{ status: 503 }, { status: 429 }, { status: 403, reason: 'userRateLimitExceeded' }]) {
      const { finto, drive } = nuovoDrive()
      finto.stato.guasto = { ...guasto, volte: 1 }
      await expect(drive.cercaRadici()).rejects.toThrow(ErroreConnessione)
    }
  })

  it('un file che non esiste è un errore vero, non di connessione', async () => {
    const { drive } = nuovoDrive()
    const deposito = drive.deposito(await drive.assicuraStruttura('i'))
    const errore = await deposito.scarica('inesistente').catch((e) => e)
    expect(errore).toBeInstanceOf(Error)
    expect(errore).not.toBeInstanceOf(ErroreConnessione)
  })

  it('con il token scaduto ne chiede uno nuovo una volta, poi segnala che serve un nuovo accesso', async () => {
    const richiesti: boolean[] = []
    const rinnovabile = async (rinnova?: boolean) => {
      richiesti.push(!!rinnova)
      return rinnova ? 'buono' : 'scaduto'
    }
    const { drive } = nuovoDrive(driveFinto(), rinnovabile)
    expect(await drive.cercaRadici()).toEqual([])
    expect(richiesti).toEqual([false, true])

    const { drive: revocato } = nuovoDrive(driveFinto(), async () => 'scaduto')
    await expect(revocato.cercaRadici()).rejects.toThrow(ErroreAccesso)
  })
})
