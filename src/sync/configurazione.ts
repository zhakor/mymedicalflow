/**
 * Configurazione dal desktop (CR §8): porta l'archivio locale su Drive e lo
 * rende la revisione 1, perché il telefono possa collegarsi.
 *
 *   1. licenza: la lettura del puntatore passa dalle regole di Firestore
 *   2. ricerca della radice per marcatore (nuova, ricollegamento, altra installazione).
 *      La radice di un'altra installazione si adotta se il suo archivio si apre
 *      con il codice di recupero di questo PC: è lo stesso studio (PC
 *      reinstallato, PC nuovo, build di sviluppo e di produzione).
 *   3. cartelle, con un'operazione che si può ripetere
 *   4. modello Word in chiaro in `template/`, archivio come revisione 1
 *   5. verifica: si riscarica l'archivio pubblicato e lo si decifra
 *
 * Le dipendenze arrivano da fuori (Drive, Firestore, chiave): così la
 * procedura si prova in memoria.
 */

import { decifraArchivio, type Archivio, type Byte } from './cifratura'
import type { DepositoFile, DepositoModello, Registro } from './contratti'
import type { Cartelle, RadiceTrovata } from './drive'
import { estraiModello } from './modello'
import { MotoreSincronizzazione } from './motore'

/** Le operazioni di `Drive` usate dalla configurazione. */
export interface StrutturaDrive {
  cercaRadici(): Promise<RadiceTrovata[]>
  /** Un file per id, senza creare né toccare cartelle. */
  scaricaFile(fileId: string): Promise<Byte>
  assicuraStruttura(istanza: string, radice?: string): Promise<Cartelle>
  deposito(cartelle: Cartelle): DepositoFile
  modello(cartelle: Cartelle): DepositoModello
}

export interface OpzioniConfigurazione {
  drive: StrutturaDrive
  registro: Registro
  chiave: CryptoKey
  /** Id di questa installazione del desktop: marca la radice che crea. */
  istanza: string
  /** L'archivio locale com'è adesso. NON viene modificato. */
  archivio: Archivio
  /** Avanzamento, per l'interfaccia. */
  passo?: (descrizione: string) => void
}

export interface EsitoConfigurazione {
  /** `adozione`: radice creata da un'altra installazione, ma con il nostro codice di recupero. */
  tipo: 'nuova' | 'ricollegamento' | 'adozione'
  radice: string
  /** Id dell'installazione da ricordare: quella della radice, se adottata. */
  istanza: string
  revisione: number
  /** L'archivio pubblicato su Drive, decifrato (senza il modello Word). */
  remoto: Archivio
}

/** Su Drive c'è un archivio che il codice di recupero di questo PC non apre: non si sovrascrive. */
export class ArchivioDiAltraInstallazione extends Error {
  constructor() {
    super(
      "Su questo Google Drive c'è già un archivio di MyMedicalFlow cifrato con un altro codice di recupero. " +
        'Per non sovrascriverlo la configurazione si è fermata.',
    )
    this.name = 'ArchivioDiAltraInstallazione'
  }
}

const uguali = (a: Archivio, b: Archivio) =>
  Object.keys(a).length === Object.keys(b).length && Object.keys(a).every((k) => a[k] === b[k])

export async function configuraDalDesktop(o: OpzioniConfigurazione): Promise<EsitoConfigurazione> {
  const passo = o.passo ?? (() => {})

  passo('Verifica della licenza')
  const { puntatore } = await o.registro.leggi()

  passo('Ricerca dell\'archivio su Drive')
  const radici = await o.drive.cercaRadici()
  const mia = radici.find((r) => r.istanza === o.istanza)
  let istanza = o.istanza
  let radice = mia?.id
  if (!mia && (puntatore || radici.length > 0)) {
    // Radice di un'altra installazione: si adotta solo se il suo archivio si
    // apre con la nostra chiave. Senza archivio pubblicato o senza radice
    // (cartella cancellata) non c'è modo di saperlo: ci si ferma.
    const altra = radici[0]
    if (!puntatore || !altra || !(await apribile(o, puntatore.fileId))) throw new ArchivioDiAltraInstallazione()
    istanza = altra.istanza ?? o.istanza
    radice = altra.id
  }

  passo('Preparazione delle cartelle')
  const cartelle = await o.drive.assicuraStruttura(istanza, radice)
  const deposito = o.drive.deposito(cartelle)

  // Il modello Word va su Drive in chiaro; nell'archivio restano i metadati
  const { archivio, modello } = estraiModello(o.archivio)
  if (modello) {
    passo('Caricamento del modello delle fatture')
    await o.drive.modello(cartelle).carica(modello)
  }

  if (!puntatore) {
    passo('Caricamento dell\'archivio')
    const motore = new MotoreSincronizzazione({
      deposito,
      registro: o.registro,
      chiave: o.chiave,
      dispositivo: istanza,
      leggiLocale: () => ({ ...archivio }),
      // L'archivio locale resta com'è, con il modello Word dentro
      scriviLocale: () => {},
      risolviConflitti: async () => new Map(),
    })
    await motore.inizializzaRemoto()
  }

  passo('Verifica dell\'archivio su Drive')
  const pubblicato = (await o.registro.leggi()).puntatore
  if (!pubblicato) throw new Error("L'archivio non risulta pubblicato: riprova la configurazione.")
  let remoto: Archivio
  try {
    remoto = await decifraArchivio(await deposito.scarica(pubblicato.fileId), o.chiave)
  } catch {
    throw new Error("L'archivio su Drive non si apre con il codice di recupero di questo PC.")
  }
  if (!puntatore && !uguali(remoto, archivio)) {
    throw new Error("L'archivio riscaricato da Drive non coincide con quello caricato: riprova la configurazione.")
  }

  const tipo = !puntatore ? 'nuova' : mia ? 'ricollegamento' : 'adozione'
  return { tipo, radice: cartelle.radice, istanza, revisione: pubblicato.revisione, remoto }
}

/** Prima di scrivere qualsiasi cosa nella radice di un altro: il suo archivio si apre con la nostra chiave? */
async function apribile(o: OpzioniConfigurazione, fileId: string): Promise<boolean> {
  // Un errore di rete non è un codice diverso: si propaga
  const cifrato = await o.drive.scaricaFile(fileId)
  try {
    await decifraArchivio(cifrato, o.chiave)
    return true
  } catch {
    return false
  }
}
