/**
 * Emissione di una fattura dal telefono, con le regole del modulo desktop
 * (`FatturaModal`): stessi campi, stessa validazione, bollo automatico.
 *
 * Differenza voluta: il numero NON si sceglie. Lo assegna `emettiFattura` al
 * momento dell'emissione, sui dati appena scaricati dal cloud, così PC e
 * telefono possono fatturare insieme (CR §6.1). Il documento Word, se voluto,
 * si genera dopo, col numero definitivo, dal modello che il PC ha caricato su
 * Drive alla configurazione (CR §8).
 */

import { useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, FileText, Hash, Paperclip, Trash2 } from 'lucide-react'
import { Button } from '@desktop/components/ui/Button'
import { Input } from '@desktop/components/ui/Input'
import { fatturaService } from '@desktop/lib/fatturaService'
import { pazienteService } from '@desktop/lib/pazienteService'
import { buildTemplateData, generateDocument } from '@desktop/lib/documentService'
import { oggi } from '@desktop/lib/agendaService'
import { FatturazioneOffline } from '@desktop/sync/fatturazione'
import { RiepilogoPresenze } from '@desktop/features/fatture/RiepilogoPresenze'
import { validateInvoice, hasInvoiceErrors, type InvoiceFormErrors } from '@desktop/features/fatture/fatturaValidation'
import {
  STAMP_DUTY_AMOUNT,
  STAMP_DUTY_THRESHOLD,
  type GeneratedInvoiceFile,
  type Invoice,
  type InvoiceInput,
  type InvoiceStatus,
  type InvoiceType,
} from '@desktop/types/fattura'
import { useDati } from '../dati/hooks'
import { emettiFattura, modelloFattura } from '../dati/sincronizzazione'
import { Pagina } from '../componenti/Pagina'
import { Gruppo, Interruttore, Segmenti } from '../componenti/Campi'
import { SelettorePaziente } from '../componenti/SelettorePaziente'
import { Comparsa } from '../componenti/Movimento'
import { apriFattura, euro } from '../componenti/VoceFattura'
import { avvisa, chiudi } from '../navigazione'
import { dataBreve } from './formato'

const MIME_DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

interface Modulo {
  patientId: string
  patientFirstName: string
  patientLastName: string
  patientFiscalCode: string
  azienda: string
  description: string
  amount: string
  stampDutyNumber: string
  status: InvoiceStatus
  issueDate: string
  /** Solo elettronica: PDF allegato facoltativo. */
  allegato: GeneratedInvoiceFile | null
}

type Errori = InvoiceFormErrors & { patientId?: string }

/** Il modello Word su Drive, scaricato all'apertura del modulo. */
type StatoModello = 'caricamento' | 'pronto' | 'assente' | 'errore'

function moduloIniziale(pazienteId?: string): Modulo {
  const p = pazienteId ? pazienteService.getById(pazienteId) : null
  return {
    patientId: p?.id ?? '',
    patientFirstName: p?.firstName ?? '',
    patientLastName: p?.lastName ?? '',
    patientFiscalCode: p?.fiscalCode ?? '',
    azienda: '',
    description: '',
    amount: '',
    stampDutyNumber: '',
    status: 'in_attesa',
    issueDate: oggi(),
    allegato: null,
  }
}

const messaggio = (err: unknown) => (err instanceof Error ? err.message : String(err))

export function ModuloFattura({ pazienteId }: { pazienteId?: string }) {
  // Il prossimo numero si aggiorna se intanto il PC fattura
  useDati()
  const [tipo, setTipo] = useState<InvoiceType>('cartacea')
  const [form, setForm] = useState<Modulo>(() => moduloIniziale(pazienteId))
  const [errori, setErrori] = useState<Errori>({})
  const [emettendo, setEmettendo] = useState(false)
  const [emessa, setEmessa] = useState<Invoice | null>(null)
  const [modello, setModello] = useState<StatoModello>('caricamento')
  const [conDocumento, setConDocumento] = useState(true)

  function scaricaModello() {
    setModello('caricamento')
    modelloFattura().then(
      (m) => setModello(m ? 'pronto' : 'assente'),
      () => setModello('errore'),
    )
  }
  useEffect(scaricaModello, [])

  const elettronica = tipo === 'elettronica'
  const importo = parseFloat(form.amount.replace(',', '.')) || 0
  const bollo = !elettronica && importo > STAMP_DUTY_THRESHOLD ? STAMP_DUTY_AMOUNT : 0

  function imposta<K extends keyof Modulo>(campo: K, valore: Modulo[K]) {
    setForm((prec) => ({ ...prec, [campo]: valore }))
    if ((errori as Record<string, unknown>)[campo]) setErrori((prec) => ({ ...prec, [campo]: undefined }))
  }

  /** Come `buildInput` del desktop: ogni tipo porta solo i suoi campi. */
  function comeInput(numero: string): InvoiceInput {
    return {
      invoiceType: tipo,
      invoiceNumber: numero,
      patientId: elettronica ? undefined : form.patientId || undefined,
      patientFiscalCode: elettronica ? '' : form.patientFiscalCode.trim().toUpperCase(),
      patientFirstName: elettronica ? '' : form.patientFirstName.trim(),
      patientLastName: elettronica ? '' : form.patientLastName.trim(),
      azienda: elettronica ? form.azienda.trim() : undefined,
      description: elettronica ? '' : form.description.trim(),
      amount: importo,
      stampDuty: bollo,
      stampDutyNumber: bollo > 0 ? form.stampDutyNumber.trim() || undefined : undefined,
      status: form.status,
      issueDate: form.issueDate,
      generatedFile: elettronica ? (form.allegato ?? undefined) : undefined,
    }
  }

  function allega(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const lettore = new FileReader()
    lettore.onload = () => {
      const base64 = String(lettore.result).split(',')[1] ?? ''
      imposta('allegato', { fileName: file.name, fileBase64: base64, generatedAt: new Date().toISOString(), mimeType: file.type || 'application/pdf' })
    }
    lettore.readAsDataURL(file)
  }

  /** Documento Word col numero definitivo, allegato alla fattura. Senza modello resta senza documento, come sul PC. */
  async function allegaDocumento(fattura: Invoice): Promise<Invoice> {
    try {
      const modelloWord = await modelloFattura()
      if (!modelloWord) return fattura
      const paziente =
        (fattura.patientId ? pazienteService.getById(fattura.patientId) : null) ??
        pazienteService.getByFiscalCode(fattura.patientFiscalCode)
      const file: GeneratedInvoiceFile = {
        fileName: `Fattura_${fattura.invoiceNumber.replace(/\//g, '-')}_${fattura.patientLastName}.docx`,
        fileBase64: generateDocument(modelloWord, buildTemplateData(fattura, paziente)),
        generatedAt: new Date().toISOString(),
        mimeType: MIME_DOCX,
      }
      return fatturaService.saveGeneratedFile(fattura.id, file) ?? fattura
    } catch (err) {
      avvisa(`Fattura emessa, ma il documento non è stato generato: ${messaggio(err)}`, 'errore')
      return fattura
    }
  }

  async function emetti() {
    // Il numero si assegna all'emissione: qui se ne valida solo il resto
    const errs: Errori = validateInvoice(comeInput(fatturaService.getNextInvoiceNumber()))
    delete errs.invoiceNumber
    // Il paziente si sceglie dall'elenco: nome e cognome arrivano insieme
    if (errs.patientFirstName || errs.patientLastName) errs.patientId = 'Scegli un paziente.'
    delete errs.patientFirstName
    delete errs.patientLastName
    if (hasInvoiceErrors(errs)) {
      setErrori(errs)
      avvisa('Controlla i campi evidenziati.', 'errore')
      return
    }

    setEmettendo(true)
    try {
      let id = ''
      await emettiFattura(async () => {
        id = fatturaService.create(comeInput(fatturaService.getNextInvoiceNumber())).id
      })
      // Pubblicata: il numero ora è definitivo, anche se il PC ha appena usato lo stesso
      const fattura = fatturaService.getById(id)
      if (!fattura) throw new Error('La fattura non è stata trovata dopo il salvataggio.')
      setEmessa(fattura.invoiceType === 'cartacea' && conDocumento ? await allegaDocumento(fattura) : fattura)
    } catch (err) {
      avvisa(
        err instanceof FatturazioneOffline
          ? 'Serve la connessione per emettere la fattura: il numero si assegna sul cloud.'
          : messaggio(err),
        'errore',
      )
    } finally {
      setEmettendo(false)
    }
  }

  if (emessa) return <FatturaEmessa fattura={emessa} />

  const prossimo = fatturaService.getNextInvoiceNumber()

  return (
    <Pagina
      titolo="Nuova fattura"
      ritorno="chiudi"
      piede={
        <>
          <Button variant="secondary" className="flex-1 tocco px-3 whitespace-nowrap" onClick={chiudi} disabled={emettendo}>
            Annulla
          </Button>
          <Button className="flex-1 tocco px-3 whitespace-nowrap" onClick={emetti} loading={emettendo} disabled={emettendo}>
            Emetti fattura
          </Button>
        </>
      }
    >
      <div className="px-4 py-5 space-y-7">
        <Gruppo titolo="Fattura">
          <Segmenti
            etichetta="Tipo"
            valore={tipo}
            opzioni={[
              { valore: 'cartacea', etichetta: 'Cartacea' },
              { valore: 'elettronica', etichetta: 'Elettronica' },
            ]}
            onCambia={(t) => {
              setTipo(t)
              setErrori({})
            }}
          />
          <div className="flex items-start gap-2.5 rounded-xl border border-teal-100 dark:border-teal-800 bg-teal-50 dark:bg-teal-900/20 px-3 py-2.5">
            <Hash size={16} className="mt-0.5 shrink-0 text-teal-600 dark:text-teal-400" />
            <p className="text-sm text-teal-800 dark:text-teal-300">
              Numero assegnato all'emissione: ora il prossimo libero è <span className="font-semibold">{prossimo}</span>. Se intanto
              fattura anche il PC, prende il successivo.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Data emissione" type="date" required value={form.issueDate} onChange={(e) => imposta('issueDate', e.target.value)} error={errori.issueDate} />
            <Segmenti
              etichetta="Stato"
              valore={form.status}
              opzioni={[
                { valore: 'in_attesa', etichetta: 'In attesa' },
                { valore: 'pagata', etichetta: 'Pagata' },
              ]}
              onCambia={(s) => imposta('status', s)}
            />
          </div>
        </Gruppo>

        {elettronica ? (
          <Gruppo titolo="Fattura elettronica">
            <Input label="Azienda" required placeholder="Es. Azienda S.r.l." value={form.azienda} onChange={(e) => imposta('azienda', e.target.value)} error={errori.azienda} />
            <Input
              label="Importo (€)"
              required
              inputMode="decimal"
              placeholder="Es. 60,00"
              value={form.amount}
              onChange={(e) => imposta('amount', e.target.value)}
              error={errori.amount}
            />
            <div className="flex flex-col gap-1.5">
              <span className="label">
                Allegato PDF <span className="font-normal text-gray-400">(facoltativo)</span>
              </span>
              {form.allegato ? (
                <div className="flex min-h-[44px] items-center gap-2 rounded-xl border border-teal-200 dark:border-teal-700 bg-teal-50 dark:bg-teal-900/20 pl-3">
                  <Paperclip size={16} className="shrink-0 text-teal-600" />
                  <span className="flex-1 truncate text-sm text-teal-700 dark:text-teal-400">{form.allegato.fileName}</span>
                  <button type="button" onClick={() => imposta('allegato', null)} className="tocco flex items-center justify-center text-gray-400" aria-label="Rimuovi allegato">
                    <Trash2 size={17} />
                  </button>
                </div>
              ) : (
                <label className="flex min-h-[44px] cursor-pointer items-center gap-2 rounded-xl border border-dashed border-gray-300 dark:border-gray-600 px-3">
                  <Paperclip size={16} className="text-gray-400" />
                  <span className="text-sm text-gray-500 dark:text-gray-400">Scegli un PDF</span>
                  <input type="file" accept="application/pdf" className="sr-only" onChange={allega} />
                </label>
              )}
            </div>
          </Gruppo>
        ) : (
          <>
            <Gruppo titolo="Paziente">
              <SelettorePaziente
                nome={`${form.patientLastName} ${form.patientFirstName}`.trim()}
                collegato={!!form.patientId}
                errore={errori.patientId}
                onScelto={(p) => {
                  setForm((prec) => ({
                    ...prec,
                    patientId: p.id,
                    patientFirstName: p.firstName,
                    patientLastName: p.lastName,
                    patientFiscalCode: p.fiscalCode ?? '',
                  }))
                  setErrori((prec) => ({ ...prec, patientId: undefined, patientFiscalCode: undefined }))
                }}
              />
              <Input
                label="Codice fiscale"
                required
                autoCapitalize="characters"
                placeholder="Es. RSSMRA80A01H501U"
                value={form.patientFiscalCode}
                onChange={(e) => imposta('patientFiscalCode', e.target.value.toUpperCase())}
                error={errori.patientFiscalCode}
                className="uppercase"
              />
            </Gruppo>

            <Gruppo titolo="Prestazione">
              <Input
                label="Descrizione"
                required
                placeholder="Es. Sedute di logopedia di novembre"
                value={form.description}
                onChange={(e) => imposta('description', e.target.value)}
                error={errori.description}
              />
              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="Importo (€)"
                  required
                  inputMode="decimal"
                  placeholder="Es. 60,00"
                  value={form.amount}
                  onChange={(e) => imposta('amount', e.target.value)}
                  error={errori.amount}
                />
                <div className="flex flex-col gap-1">
                  <span className="label">Bollo</span>
                  <div className="input-field flex items-center text-gray-500 dark:text-gray-400">{bollo > 0 ? euro(bollo) : '—'}</div>
                </div>
              </div>
              <p className="-mt-2 text-xs text-gray-500 dark:text-gray-400">
                {bollo > 0 ? `Bollo automatico: importo oltre € ${STAMP_DUTY_THRESHOLD}.` : `Bollo non dovuto fino a € ${STAMP_DUTY_THRESHOLD}.`}
              </p>
              {bollo > 0 && (
                <Input
                  label="Numero bollo"
                  required
                  inputMode="numeric"
                  placeholder="Es. 12345678901234"
                  value={form.stampDutyNumber}
                  onChange={(e) => imposta('stampDutyNumber', e.target.value)}
                  error={errori.stampDutyNumber}
                />
              )}
              <RiepilogoPresenze
                patientId={form.patientId}
                issueDate={form.issueDate}
                importoCorrente={importo}
                onUsaImporto={(valore) => imposta('amount', valore.toFixed(2).replace('.', ','))}
              />
            </Gruppo>

            <Gruppo titolo="Documento">
              {modello === 'pronto' || modello === 'caricamento' ? (
                <>
                  <Interruttore attivo={conDocumento} onCambia={setConDocumento} icona={<FileText size={20} />}>
                    Genera e allega il documento Word
                  </Interruttore>
                  <p className="-mt-2 text-xs text-gray-500 dark:text-gray-400">
                    {modello === 'caricamento'
                      ? 'Scarico il modello caricato dal PC…'
                      : conDocumento
                        ? "Dal modello caricato dal PC, con il numero definitivo: lo apri subito dopo l'emissione."
                        : 'La fattura si registra senza documento.'}
                  </p>
                </>
              ) : (
                <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-3 py-2.5">
                  <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-500" />
                  <div className="text-sm text-amber-700 dark:text-amber-400">
                    {modello === 'assente' ? (
                      <p>Il PC non ha caricato un modello Word: la fattura si emette senza documento. Il modello si sceglie nelle Impostazioni del PC.</p>
                    ) : (
                      <>
                        <p>Modello Word non scaricato da Drive: la fattura si emette senza documento.</p>
                        <button type="button" onClick={scaricaModello} className="mt-1 min-h-[36px] font-medium text-amber-800 dark:text-amber-300">
                          Riprova
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )}
            </Gruppo>
          </>
        )}
      </div>
    </Pagina>
  )
}

/** Conferma dopo l'emissione. Il documento si apre da un tocco: Safari blocca i download partiti da soli. */
function FatturaEmessa({ fattura: f }: { fattura: Invoice }) {
  const intestatario = f.invoiceType === 'elettronica' ? f.azienda : `${f.patientLastName} ${f.patientFirstName}`
  return (
    <Pagina
      titolo="Fattura emessa"
      ritorno="chiudi"
      piede={
        <>
          {f.generatedFile && (
            <Button variant="secondary" className="flex-1 tocco px-3 whitespace-nowrap" onClick={() => apriFattura(f)}>
              {f.invoiceType === 'elettronica' ? 'Apri allegato' : 'Apri la fattura'}
            </Button>
          )}
          <Button className="flex-1 tocco px-3 whitespace-nowrap" onClick={chiudi}>
            Fine
          </Button>
        </>
      }
    >
      <div className="px-4 py-8">
        <Comparsa i={0}>
          <div className="card flex flex-col items-center p-6 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-teal-50 text-teal-600 dark:bg-teal-900/30 dark:text-teal-400">
              <CheckCircle2 size={30} />
            </span>
            <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">Fattura</p>
            <p className="text-3xl font-semibold tracking-tight text-gray-900 dark:text-white">n. {f.invoiceNumber}</p>
            <p className="mt-3 font-medium text-gray-800 dark:text-gray-200">{intestatario}</p>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {dataBreve(f.issueDate)} · {euro(f.amount + (f.stampDuty ?? 0))}
              {f.stampDuty > 0 ? ' con bollo' : ''}
            </p>
            <p className="mt-4 text-xs text-gray-500 dark:text-gray-400">
              {f.generatedFile
                ? 'Registrata e già disponibile anche sul PC.'
                : 'Registrata e già disponibile anche sul PC, senza documento.'}
            </p>
          </div>
        </Comparsa>
      </div>
    </Pagina>
  )
}
