import { describe, expect, it } from 'vitest'
import { base64InByte, byteInBase64, estraiModello, reinserisciModello } from './modello'
import { CloudInMemoria } from './memoria'
import { ErroreConnessione } from './contratti'

const DOCX = Uint8Array.from([0x50, 0x4b, 0x03, 0x04, 0, 255, 128, 7])
const impostazioni = (template?: object) => JSON.stringify({ tema: 'dark', templateFattura: template })

describe('modello Word fra PC e Drive', () => {
  it('base64 e byte si convertono avanti e indietro, anche con il prefisso data URL', () => {
    const b64 = byteInBase64(DOCX)
    expect(base64InByte(b64)).toEqual(DOCX)
    expect(base64InByte(`data:application/vnd.openxmlformats;base64,${b64}`)).toEqual(DOCX)
  })

  it('converte anche un modello più grande di un blocco', () => {
    const grande = Uint8Array.from({ length: 100_000 }, (_, i) => i % 256)
    expect(base64InByte(byteInBase64(grande))).toEqual(grande)
  })

  it('la configurazione estrae il modello e nell\'archivio lascia solo i metadati', () => {
    const archivio = {
      fatture: '[]',
      impostazioni: impostazioni({ nomeFile: 'Studio.docx', dimensione: 8, dataCaricamento: '2026-11-01', contenuto: byteInBase64(DOCX) }),
    }
    const { archivio: senza, modello } = estraiModello(archivio)

    expect(modello).toEqual({ nomeFile: 'Studio.docx', dati: DOCX })
    expect(JSON.parse(senza.impostazioni)).toEqual({
      tema: 'dark',
      templateFattura: { nomeFile: 'Studio.docx', dimensione: 8, dataCaricamento: '2026-11-01' },
    })
    expect(senza.fatture).toBe('[]')
  })

  it('un archivio arrivato dal cloud riprende il modello completo del PC, e il giro estrai-reinserisci è neutro', () => {
    const modelloPc = { nomeFile: 'Studio.docx', dimensione: 8, dataCaricamento: '2026-11-01', contenuto: byteInBase64(DOCX) }
    const locale = { pazienti: '[]', impostazioni: impostazioni(modelloPc) }
    const { archivio: senza } = estraiModello(locale)
    const arrivato = { ...senza, pazienti: '[{"id":"p1"}]', impostazioni: JSON.stringify({ ...JSON.parse(senza.impostazioni), tema: 'light' }) }

    const unito = reinserisciModello(arrivato, locale)
    expect(JSON.parse(unito.impostazioni)).toEqual({ tema: 'light', templateFattura: modelloPc })
    expect(unito.pazienti).toBe('[{"id":"p1"}]')
    expect(reinserisciModello(senza, locale)).toEqual(locale)
    expect(reinserisciModello(arrivato, { impostazioni: impostazioni() })).toBe(arrivato)
  })

  it('senza modello caricato sul PC l\'archivio resta com\'è', () => {
    const archivio = { impostazioni: impostazioni() }
    expect(estraiModello(archivio)).toEqual({ archivio, modello: null })
    expect(estraiModello({})).toEqual({ archivio: {}, modello: null })
  })

  it('su Drive il modello si carica e si scarica, solo con la rete', async () => {
    const cloud = new CloudInMemoria()
    const connessione = { online: true }
    const { modello } = cloud.client(connessione)

    expect(await modello.scarica()).toBeNull()
    await modello.carica({ nomeFile: 'Studio.docx', dati: DOCX })
    expect(await modello.scarica()).toEqual({ nomeFile: 'Studio.docx', dati: DOCX })

    connessione.online = false
    await expect(modello.scarica()).rejects.toThrow(ErroreConnessione)
  })
})
