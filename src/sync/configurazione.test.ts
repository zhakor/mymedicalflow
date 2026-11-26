import { describe, expect, it } from 'vitest'
import { ArchivioDiAltraInstallazione, configuraDalDesktop, type StrutturaDrive } from './configurazione'
import { decifraArchivio, importaChiave } from './cifratura'
import { CloudInMemoria } from './memoria'
import { byteInBase64 } from './modello'
import type { Cartelle, RadiceTrovata } from './drive'

const DOCX = Uint8Array.from([0x50, 0x4b, 0x03, 0x04, 9, 8, 7])
const chiave = (n = 0) => importaChiave(Uint8Array.from({ length: 32 }, (_, i) => i + n))

const ARCHIVIO = {
  pazienti: '[{"id":"p1","updatedAt":"1"}]',
  impostazioni: JSON.stringify({
    tema: 'dark',
    templateFattura: { nomeFile: 'Studio.docx', dimensione: 7, contenuto: byteInBase64(DOCX) },
  }),
}

/** Drive in memoria: radici con il loro marcatore, archivi e modello nel cloud simulato. */
function driveInMemoria(cloud = new CloudInMemoria()) {
  const radici: RadiceTrovata[] = []
  const client = cloud.client()
  const drive: StrutturaDrive = {
    cercaRadici: async () => [...radici],
    assicuraStruttura: async (istanza, radice) => {
      const id = radice ?? `radice-${radici.length + 1}`
      if (!radice) radici.push({ id, istanza })
      return { radice: id, archivio: `${id}/archivio`, copie: `${id}/copie`, template: `${id}/template` } satisfies Cartelle
    },
    deposito: () => client.deposito,
    modello: () => client.modello,
  }
  return { cloud, drive, radici, registro: client.registro }
}

describe('configurazione dal desktop (§8)', () => {
  it("prima volta: modello su Drive, archivio come revisione 1 senza il modello dentro, locale intatto", async () => {
    const { cloud, drive, radici, registro } = driveInMemoria()
    const locale = { ...ARCHIVIO }
    const passi: string[] = []

    const esito = await configuraDalDesktop({ drive, registro, chiave: await chiave(), istanza: 'pc-1', archivio: locale, passo: (p) => passi.push(p) })

    expect(esito).toEqual({ tipo: 'nuova', radice: 'radice-1', revisione: 1 })
    expect(radici).toEqual([{ id: 'radice-1', istanza: 'pc-1' }])
    expect(cloud.modello).toEqual({ nomeFile: 'Studio.docx', dati: DOCX })
    const remoto = await decifraArchivio(cloud.file.get(cloud.puntatore!.fileId)!, await chiave())
    expect(JSON.parse(remoto.impostazioni).templateFattura).toEqual({ nomeFile: 'Studio.docx', dimensione: 7 })
    expect(remoto.pazienti).toBe(ARCHIVIO.pazienti)
    expect(locale).toEqual(ARCHIVIO)
    expect(passi).toContain("Verifica dell'archivio su Drive")
  })

  it('ripeterla dallo stesso PC ricollega, senza nuove revisioni né cartelle', async () => {
    const { cloud, drive, radici, registro } = driveInMemoria()
    const o = { drive, registro, chiave: await chiave(), istanza: 'pc-1', archivio: ARCHIVIO }
    await configuraDalDesktop(o)

    expect(await configuraDalDesktop(o)).toEqual({ tipo: 'ricollegamento', radice: 'radice-1', revisione: 1 })
    expect(radici).toHaveLength(1)
    expect(cloud.file.size).toBe(1)
  })

  it("interrotta dopo le cartelle: la ripresa pubblica l'archivio nella stessa radice", async () => {
    const { cloud, drive, radici, registro } = driveInMemoria()
    await drive.assicuraStruttura('pc-1')

    const esito = await configuraDalDesktop({ drive, registro, chiave: await chiave(), istanza: 'pc-1', archivio: ARCHIVIO })
    expect(esito).toMatchObject({ tipo: 'nuova', radice: 'radice-1' })
    expect(radici).toHaveLength(1)
    expect(cloud.puntatore?.revisione).toBe(1)
  })

  it("l'archivio di un'altra installazione non si tocca", async () => {
    const { cloud, drive, registro } = driveInMemoria()
    await configuraDalDesktop({ drive, registro, chiave: await chiave(), istanza: 'pc-studio', archivio: ARCHIVIO })
    const prima = { ...cloud.puntatore }

    await expect(
      configuraDalDesktop({ drive, registro, chiave: await chiave(), istanza: 'pc-casa', archivio: { pazienti: '[]' } }),
    ).rejects.toThrow(ArchivioDiAltraInstallazione)
    expect(cloud.puntatore).toEqual(prima)
    expect(cloud.file.size).toBe(1)
  })

  it('un puntatore senza radice su Drive (cartella cancellata) blocca invece di sovrascrivere', async () => {
    const { drive, registro } = driveInMemoria()
    await configuraDalDesktop({ drive, registro, chiave: await chiave(), istanza: 'pc-1', archivio: ARCHIVIO })
    const senzaRadici: StrutturaDrive = { ...drive, cercaRadici: async () => [] }

    await expect(
      configuraDalDesktop({ drive: senzaRadici, registro, chiave: await chiave(), istanza: 'pc-2', archivio: ARCHIVIO }),
    ).rejects.toThrow(ArchivioDiAltraInstallazione)
  })

  it('ricollegandosi con un codice di recupero diverso la verifica lo segnala', async () => {
    const { drive, registro } = driveInMemoria()
    await configuraDalDesktop({ drive, registro, chiave: await chiave(), istanza: 'pc-1', archivio: ARCHIVIO })

    await expect(
      configuraDalDesktop({ drive, registro, chiave: await chiave(1), istanza: 'pc-1', archivio: ARCHIVIO }),
    ).rejects.toThrow(/codice di recupero/)
  })
})
