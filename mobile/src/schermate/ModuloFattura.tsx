/**
 * Emissione e modifica di una fattura dal telefono, con le regole del modulo
 * desktop (`FatturaModal`): stessi campi, stessa validazione, bollo automatico,
 * tipo e data bloccati dopo la trasmissione al Sistema TS.
 *
 * Differenza voluta: il numero NON si sceglie. Lo assegna `emettiFattura` al
 * momento dell'emissione, sui dati appena scaricati dal cloud, così PC e
 * telefono possono fatturare insieme (CR §6.1). Il documento Word, se voluto,
 * si genera dopo, col numero definitivo, dal modello che il PC ha caricato su
 * Drive alla configurazione (CR §8).
 *
 * In modifica il numero resta quello assegnato: cambiarlo a mano romperebbe la
 * numerazione condivisa. Il documento si rigenera solo se richiesto, perché
 * prende anche la data di oggi.
 */

import { useEffect, useState } from 'react'
import { AnimatePresence } from 'motion/react'
import { AlertTriangle, CheckCircle2, FileText, Hash, Lock, Paperclip, Trash2 } from 'lucide-react'
import { Button } from '@desktop/components/ui/Button'
import { Input } from '@desktop/components/ui/Input'
import { fatturaService } from '@desktop/lib/fatturaService'
import { pazienteService } from '@desktop/lib/pazienteService'
import { buildTemplateData, generateDocument } from '@desktop/lib/documentService'
import { sistemaTsService } from '@desktop/lib/sistemaTsService'
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
import { Conferma } from '../componenti/Conferma'
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

/** I campi della fattura nel modulo, come `invoiceToForm` del desktop. */
function moduloDaFattura(f: Invoice): Modulo {
  return {
    patientId: f.patientId ?? '',
    patientFirstName: f.patientFirstName,
    patientLastName: f.patientLastName,
    patientFiscalCode: f.patientFiscalCode,
    azienda: f.azienda ?? '',
    description: f.description,
    amount: String(f.amount).replace('.', ','),
    stampDutyNumber: f.stampDutyNumber ?? '',
    status: f.status,
    issueDate: f.issueDate,
    allegato: f.invoiceType === 'elettronica' ? (f.generatedFile ?? null) : null,
  }
}

/** I campi che finiscono nel documento Word: se cambiano, il documento va rigenerato. */
const CAMPI_DEL_DOCUMENTO = [
  'patientFirstName',
  'patientLastName',
  'patientFiscalCode',
  'description',
  'amount',
  'stampDuty',
  'stampDutyNumber',
] as const satisfies readonly (keyof InvoiceInput)[]

const messaggio = (err: unknown) => (err instanceof Error ? err.message : String(err))

export function ModuloFattura({ id, pazienteId }: { id?: string; pazienteId?: string }) {
  // Il prossimo numero si aggiorna se intanto il PC fattura
  useDati()
  // La fattura com'era all'apertura: base del modulo e del confronto
  const [originale] = useState(() => (id ? fatturaService.getById(id) : null))
  const modifica = !!originale
  const [tipo, setTipo] = useState<InvoiceType>(originale?.invoiceType ?? 'cartacea')
  const [form, setForm] = useState<Modulo>(() => (originale ? moduloDaFattura(originale) : moduloIniziale(pazienteId)))
  const [errori, setErrori] = useState<Errori>({})
  const [emettendo, setEmettendo] = useState(false)
  const [emessa, setEmessa] = useState<Invoice | null>(null)
  const [modello, setModello] = useState<StatoModello>('caricamento')
  // In modifica il documento si rigenera solo se lo si chiede: prende la data di oggi
  const [conDocumento, setConDocumento] = useState(!modifica)
  const [eliminando, setEliminando] = useState(false)

  /**
   * Il Sistema TS identifica il documento con tipo, numero e data: dopo la
   * trasmissione restano bloccati, come sul desktop.
   */
  const identitaBloccata =
    !!originale && ['inviata', 'variata'].includes(sistemaTsService.statoPerFattura(originale))

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

  /**
   * In modifica: i campi da salvare. Per una cartacea il documento esistente
   * resta finché non si rigenera; cambiando tipo, quello del tipo precedente cade.
   */
  function datiDaSalvare(numero: string): Partial<InvoiceInput> {
    const input = comeInput(numero)
    if (elettronica || tipo !== originale?.invoiceType) return input
    const { generatedFile: _documentoAttuale, ...senzaDocumento } = input
    return senzaDocumento
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
      avvisa(`Fattura ${modifica ? 'salvata' : 'emessa'}, ma il documento non è stato generato: ${messaggio(err)}`, 'errore')
      return fattura
    }
  }

  /** Valida come il desktop, tranne il numero (non si sceglie qui). Restituisce true se il modulo è corretto. */
  function valida(numero: string): boolean {
    const errs: Errori = validateInvoice(comeInput(numero), originale?.id)
    delete errs.invoiceNumber
    // Il paziente si sceglie dall'elenco: nome e cognome arrivano insieme
    if (errs.patientFirstName || errs.patientLastName) errs.patientId = 'Scegli un paziente.'
    delete errs.patientFirstName
    delete errs.patientLastName
    if (!hasInvoiceErrors(errs)) return true
    setErrori(errs)
    avvisa('Controlla i campi evidenziati.', 'errore')
    return false
  }

  /** Modifica: un salvataggio normale, il numero non cambia. Pubblica il motore in sottofondo. */
  async function salvaModifiche() {
    // Il numero attuale: può essere cambiato sul PC mentre il modulo era aperto
    const attuale = fatturaService.getById(originale!.id)
    if (!attuale) {
      avvisa('Questa fattura è stata eliminata da un altro dispositivo.', 'errore')
      chiudi()
      return
    }
    if (!valida(attuale.invoiceNumber)) return

    setEmettendo(true)
    try {
      const salvata = fatturaService.update(attuale.id, datiDaSalvare(attuale.invoiceNumber))
      if (!salvata) throw new Error('La fattura non è stata trovata durante il salvataggio.')
      const conNuovoDocumento = salvata.invoiceType === 'cartacea' && conDocumento
      if (conNuovoDocumento) await allegaDocumento(salvata)
      avvisa(conNuovoDocumento ? 'Fattura e documento aggiornati.' : 'Fattura aggiornata.')
      chiudi()
    } catch (err) {
      avvisa(messaggio(err), 'errore')
    } finally {
      setEmettendo(false)
    }
  }

  async function emetti() {
    // Il numero si assegna all'emissione: qui se ne valida solo il resto
    if (!valida(fatturaService.getNextInvoiceNumber())) return

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

  function notaDocumento(): string {
    if (modello === 'caricamento') return 'Scarico il modello caricato dal PC…'
    if (!modifica) {
      return conDocumento
        ? "Dal modello caricato dal PC, con il numero definitivo: lo apri subito dopo l'emissione."
        : 'La fattura si registra senza documento.'
    }
    if (conDocumento) {
      return documentoAttuale
        ? 'Al posto di quello attuale, con i dati aggiornati e la data di oggi.'
        : 'Dal modello caricato dal PC, con i dati aggiornati.'
    }
    return documentoAttuale ? 'Resta il documento attuale.' : 'La fattura resta senza documento.'
  }

  /** Come sul desktop: la fattura sparisce dall'archivio, e la sincronizzazione la toglie anche dal PC. */
  function elimina() {
    fatturaService.delete(originale!.id)
    setEliminando(false)
    avvisa('Fattura eliminata.')
    chiudi()
  }

  if (id && !originale) {
    return (
      <Pagina titolo="Fattura">
        <p className="px-6 py-14 text-center text-sm text-gray-500 dark:text-gray-400">
          Questa fattura non esiste più: è stata eliminata da un altro dispositivo.
        </p>
      </Pagina>
    )
  }

  const prossimo = fatturaService.getNextInvoiceNumber()
  // In modifica il numero attuale, anche se è stato rinumerato mentre il modulo era aperto
  const numeroAttuale = originale ? (fatturaService.getById(originale.id)?.invoiceNumber ?? originale.invoiceNumber) : null
  const documentoAttuale = originale?.invoiceType === 'cartacea' && tipo === 'cartacea' ? originale.generatedFile : undefined
  // Elettronica: l'azienda, o il paziente se manca
  const intestatario = originale
    ? ((originale.invoiceType === 'elettronica' && originale.azienda?.trim()) ||
        `${originale.patientFirstName} ${originale.patientLastName}`.trim())
    : ''
  const datiDocumentoCambiati =
    !!originale && CAMPI_DEL_DOCUMENTO.some((c) => (comeInput(originale.invoiceNumber)[c] ?? '') !== (originale[c] ?? ''))

  return (
    <Pagina
      titolo={modifica ? 'Modifica fattura' : 'Nuova fattura'}
      piede={
        <>
          {modifica ? (
            <Button
              variant="secondary"
              className="flex-1 tocco px-3 whitespace-nowrap text-red-600 dark:text-red-400"
              onClick={() => setEliminando(true)}
              disabled={emettendo}
            >
              Elimina
            </Button>
          ) : (
            <Button variant="secondary" className="flex-1 tocco px-3 whitespace-nowrap" onClick={chiudi} disabled={emettendo}>
              Annulla
            </Button>
          )}
          <Button
            className="flex-1 tocco px-3 whitespace-nowrap"
            onClick={modifica ? salvaModifiche : emetti}
            loading={emettendo}
            disabled={emettendo}
          >
            {modifica ? 'Salva modifiche' : 'Emetti fattura'}
          </Button>
        </>
      }
    >
      <div className="px-4 py-5 space-y-7">
        <Gruppo titolo="Fattura">
          {identitaBloccata && (
            <div className="flex items-start gap-2.5 rounded-xl border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/[0.04] px-3 py-2.5">
              <Lock size={16} className="mt-0.5 shrink-0 text-gray-400" />
              <p className="text-sm text-gray-600 dark:text-gray-300">
                Già trasmessa al Sistema TS: tipo, numero e data non sono più modificabili, perché sono ciò con cui il ministero
                identifica il documento.
              </p>
            </div>
          )}
          {identitaBloccata ? (
            <div className="flex flex-col gap-1">
              <span className="label">Tipo</span>
              <div className="input-field flex items-center text-gray-500 dark:text-gray-400">
                {tipo === 'cartacea' ? 'Cartacea' : 'Elettronica'}
              </div>
            </div>
          ) : (
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
          )}
          <div className="flex items-start gap-2.5 rounded-xl border border-teal-100 dark:border-teal-800 bg-teal-50 dark:bg-teal-900/20 px-3 py-2.5">
            <Hash size={16} className="mt-0.5 shrink-0 text-teal-600 dark:text-teal-400" />
            {numeroAttuale ? (
              <p className="text-sm text-teal-800 dark:text-teal-300">
                Fattura <span className="font-semibold">n. {numeroAttuale}</span>. Il numero resta quello assegnato all'emissione.
              </p>
            ) : (
              <p className="text-sm text-teal-800 dark:text-teal-300">
                Numero assegnato all'emissione: ora il prossimo libero è <span className="font-semibold">{prossimo}</span>. Se
                intanto fattura anche il PC, prende il successivo.
              </p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Data emissione"
              type="date"
              required
              value={form.issueDate}
              disabled={identitaBloccata}
              onChange={(e) => imposta('issueDate', e.target.value)}
              error={errori.issueDate}
            />
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
                    {documentoAttuale ? 'Rigenera il documento Word' : 'Genera e allega il documento Word'}
                  </Interruttore>
                  {!conDocumento && documentoAttuale && datiDocumentoCambiati ? (
                    <p className="-mt-2 text-xs font-medium text-amber-700 dark:text-amber-400">
                      Hai cambiato dati che compaiono nel documento: attiva l'interruttore per aggiornarlo.
                    </p>
                  ) : (
                    <p className="-mt-2 text-xs text-gray-500 dark:text-gray-400">{notaDocumento()}</p>
                  )}
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

      <AnimatePresence>
        {eliminando && originale && (
          <Conferma titolo="Elimina fattura" etichetta="Elimina" onConferma={elimina} onAnnulla={() => setEliminando(false)}>
            Sei sicuro di voler eliminare la fattura{' '}
            <span className="font-medium text-gray-900 dark:text-white">n° {numeroAttuale}</span>
            {intestatario && (
              <>
                {' '}intestata a <span className="font-medium text-gray-900 dark:text-white">{intestatario}</span>
              </>
            )}
            ?<span className="block text-red-500 text-xs mt-1">Questa azione non può essere annullata.</span>
          </Conferma>
        )}
      </AnimatePresence>
    </Pagina>
  )
}

/** Conferma dopo l'emissione. Il documento si apre da un tocco: Safari blocca i download partiti da soli. */
function FatturaEmessa({ fattura: f }: { fattura: Invoice }) {
  const intestatario = f.invoiceType === 'elettronica' ? f.azienda : `${f.patientLastName} ${f.patientFirstName}`
  return (
    <Pagina
      titolo="Fattura emessa"
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
