import { useState, useEffect, useRef } from 'react'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Select } from '../../components/ui/Select'
import { X, AlertTriangle, FileDown, CheckCircle, Paperclip, Trash2 } from 'lucide-react'
import { clsx } from 'clsx'
import type { Invoice, InvoiceInput, InvoiceType, InvoiceStatus, GeneratedInvoiceFile } from '../../types/fattura'
import {
  INVOICE_TYPE_OPTIONS,
  INVOICE_STATUS_OPTIONS,
  STAMP_DUTY_THRESHOLD,
  STAMP_DUTY_AMOUNT,
} from '../../types/fattura'
import { validateInvoice, hasInvoiceErrors, type InvoiceFormErrors } from './fatturaValidation'
import { fatturaService } from '../../lib/fatturaService'
import { pazienteService } from '../../lib/pazienteService'
import { useImpostazioniStore } from '../../stores/impostazioniStore'
import { PazienteOmonimoModal } from './PazienteOmonimoModal'
import type { Patient } from '../../types/paziente'

// ─── Template ─────────────────────────────────────────────────────────────────
let generateDocument: typeof import('../../lib/documentService').generateDocument | null = null
let buildTemplateData: typeof import('../../lib/documentService').buildTemplateData | null = null
let downloadDocx: typeof import('../../lib/documentService').downloadDocx | null = null

async function loadDocumentService() {
  if (!generateDocument) {
    const mod = await import('../../lib/documentService')
    generateDocument = mod.generateDocument
    buildTemplateData = mod.buildTemplateData
    downloadDocx = mod.downloadDocx
  }
}

// ─── Form state ───────────────────────────────────────────────────────────────

type FormState = {
  invoiceType: InvoiceType | ''
  invoiceNumber: string
  patientFirstName: string
  patientLastName: string
  patientFiscalCode: string
  patientId: string
  azienda: string
  description: string
  amount: string
  stampDutyNumber: string
  status: InvoiceStatus | ''
  issueDate: string
}

const EMPTY_FORM: FormState = {
  invoiceType: '',
  invoiceNumber: '',
  patientFirstName: '',
  patientLastName: '',
  patientFiscalCode: '',
  patientId: '',
  azienda: '',
  description: '',
  amount: '',
  stampDutyNumber: '',
  status: '',
  issueDate: '',
}

function invoiceToForm(inv: Invoice): FormState {
  return {
    invoiceType: inv.invoiceType,
    invoiceNumber: inv.invoiceNumber,
    patientFirstName: inv.patientFirstName,
    patientLastName: inv.patientLastName,
    patientFiscalCode: inv.patientFiscalCode,
    patientId: inv.patientId ?? '',
    azienda: inv.azienda ?? '',
    description: inv.description,
    amount: String(inv.amount),
    stampDutyNumber: inv.stampDutyNumber ?? '',
    status: inv.status,
    issueDate: inv.issueDate,
  }
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface FatturaModalProps {
  invoice?: Invoice | null
  templateBase64?: string        // base64 del template .docx dalle Impostazioni
  onClose: () => void
  onSaved: (message: string) => void
}

// ─── Componente ───────────────────────────────────────────────────────────────

export function FatturaModal({ invoice, templateBase64, onClose, onSaved }: FatturaModalProps) {
  const isEdit = !!invoice
  const { impostazioni } = useImpostazioniStore()

  const [form, setForm] = useState<FormState>(
    invoice ? invoiceToForm(invoice) : {
      ...EMPTY_FORM,
      invoiceNumber: fatturaService.getNextInvoiceNumber(),
      issueDate: new Date().toISOString().slice(0, 10),
    },
  )
  const [errors, setErrors] = useState<InvoiceFormErrors>({})
  const [saving, setSaving] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [generateError, setGenerateError] = useState<string | null>(null)
  // File generato in attesa di salvataggio (non ancora persistito)
  const [pendingGeneratedFile, setPendingGeneratedFile] = useState<GeneratedInvoiceFile | null>(
    invoice?.generatedFile ?? null,
  )

  // Ricerca paziente omonimi
  const [omonimoCandidates, setOmonimoCandidates] = useState<Patient[]>([])
  const [showOmonimoModal, setShowOmonimoModal] = useState(false)
  const userTypedName = useRef(false)

  // Bollo calcolato automaticamente
  const amountNum = parseFloat(form.amount.replace(',', '.')) || 0
  const stampDuty = amountNum > STAMP_DUTY_THRESHOLD ? STAMP_DUTY_AMOUNT : 0
  const hasStampDuty = stampDuty > 0

  // Chiudi con Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !showOmonimoModal) onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, showOmonimoModal])

  // Ricerca automatica paziente per nome+cognome
  useEffect(() => {
    if (!userTypedName.current) return
    const firstName = form.patientFirstName.trim()
    const lastName = form.patientLastName.trim()
    if (!firstName || !lastName) return

    const results = pazienteService.getPatients({
      page: 1,
      pageSize: 50,
      filters: {
        firstName: firstName || undefined,
        lastName: lastName || undefined,
      },
    }).data

    if (results.length === 1) {
      const p = results[0]
      setForm((prev) => ({
        ...prev,
        patientFiscalCode: p.fiscalCode ?? '',
        patientId: p.id,
      }))
      setErrors((prev) => ({ ...prev, patientFiscalCode: undefined }))
    } else if (results.length > 1) {
      setOmonimoCandidates(results)
      setShowOmonimoModal(true)
    }
  }, [form.patientFirstName, form.patientLastName])

  function set(field: keyof FormState, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
    if ((errors as Record<string, unknown>)[field]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }))
    }
  }

  function setName(field: 'patientFirstName' | 'patientLastName', value: string) {
    userTypedName.current = true
    // Reset collegamento paziente se l'utente modifica il nome
    setForm((prev) => ({ ...prev, [field]: value, patientId: '', patientFiscalCode: '' }))
    if ((errors as Record<string, unknown>)[field]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }))
    }
  }

  function handlePatientSelected(p: Patient) {
    setForm((prev) => ({
      ...prev,
      patientFirstName: p.firstName,
      patientLastName: p.lastName,
      patientFiscalCode: p.fiscalCode ?? '',
      patientId: p.id,
    }))
    setErrors((prev) => ({
      ...prev,
      patientFirstName: undefined,
      patientLastName: undefined,
      patientFiscalCode: undefined,
    }))
    setShowOmonimoModal(false)
  }

  function buildInput(): InvoiceInput {
    const isElettronica = form.invoiceType === 'elettronica'
    return {
      invoiceType: form.invoiceType as InvoiceType,
      invoiceNumber: form.invoiceNumber.trim(),
      patientId: isElettronica ? undefined : (form.patientId || undefined),
      patientFiscalCode: isElettronica ? '' : form.patientFiscalCode.trim().toUpperCase(),
      patientFirstName: isElettronica ? '' : form.patientFirstName.trim(),
      patientLastName: isElettronica ? '' : form.patientLastName.trim(),
      azienda: isElettronica ? form.azienda.trim() : undefined,
      description: isElettronica ? '' : form.description.trim(),
      amount: parseFloat(form.amount.replace(',', '.')) || 0,
      stampDuty: isElettronica ? 0 : stampDuty,
      stampDutyNumber: isElettronica ? undefined : (hasStampDuty ? form.stampDutyNumber.trim() || undefined : undefined),
      status: isElettronica ? 'in_attesa' : (form.status as InvoiceStatus),
      issueDate: form.issueDate,
      generatedFile: pendingGeneratedFile ?? undefined,
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const input = buildInput()
    const errs = validateInvoice(input, isEdit ? invoice!.id : undefined)
    if (hasInvoiceErrors(errs)) {
      setErrors(errs)
      return
    }
    setSaving(true)
    try {
      if (isEdit) {
        fatturaService.update(invoice!.id, input)
        onSaved('Fattura aggiornata con successo.')
      } else {
        fatturaService.create(input)
        onSaved('Fattura aggiunta con successo.')
      }
    } finally {
      setSaving(false)
    }
  }

  async function handleGenerate() {
    if (!templateBase64) return
    setGenerating(true)
    setGenerateError(null)
    try {
      await loadDocumentService()
      if (!generateDocument || !buildTemplateData) return

      const input = buildInput()
      const errs = validateInvoice(input, isEdit ? invoice!.id : undefined)
      if (hasInvoiceErrors(errs)) {
        setErrors(errs)
        setGenerateError('Correggi gli errori nel form prima di generare la fattura.')
        return
      }

      const patient =
        (form.patientId ? pazienteService.getById(form.patientId) : null) ??
        (form.patientFiscalCode ? pazienteService.getByFiscalCode(form.patientFiscalCode) : null)

      // Genera con i dati attuali del form (non ancora salvato)
      const invoiceForTemplate = {
        ...input,
        id: invoice?.id ?? `tmp_${Date.now()}`,
        createdAt: invoice?.createdAt ?? new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }

      const data = buildTemplateData(invoiceForTemplate, patient)
      const base64Doc = generateDocument(templateBase64, data)

      const fileName = `Fattura_${input.invoiceNumber.replace('/', '-')}_${input.patientLastName}.docx`

      // Salva il file nello stato locale — verrà persistito al click su "Salva"
      setPendingGeneratedFile({
        fileName,
        fileBase64: base64Doc,
        generatedAt: new Date().toISOString(),
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      })

      // Salva immediatamente su disco: cartella configurata o fallback Desktop
      if (downloadDocx) {
        await downloadDocx(base64Doc, fileName, impostazioni.cartellaSalvataggio)
      }
    } catch (err: unknown) {
      let msg: string
      if (typeof err === 'string') msg = err
      else if (err instanceof Error) msg = err.message
      else msg = JSON.stringify(err) ?? 'Errore sconosciuto.'
      console.error('[FatturaModal] handleGenerate error:', err)
      setGenerateError(`Errore: ${msg}`)
    } finally {
      setGenerating(false)
    }
  }

  const isElettronica = form.invoiceType === 'elettronica'

  function handlePdfUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string
      const base64 = dataUrl.split(',')[1] ?? ''
      setPendingGeneratedFile({
        fileName: file.name,
        fileBase64: base64,
        generatedAt: new Date().toISOString(),
        mimeType: file.type || 'application/pdf',
      })
    }
    reader.readAsDataURL(file)
    // Reset input so same file can be re-selected
    e.target.value = ''
  }

  const canGenerate = !!templateBase64 && !isElettronica

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose()
        }}
      >
        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto border border-gray-100 dark:border-gray-800">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100 dark:border-gray-800 sticky top-0 bg-white dark:bg-gray-900 z-10">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              {isEdit ? 'Modifica fattura' : 'Aggiungi fattura'}
            </h2>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center justify-center text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X size={18} />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-5">

            {/* Tipo fattura — sempre visibile */}
            <div className="grid grid-cols-2 gap-4">
              <Select
                label="Tipo fattura"
                required
                options={INVOICE_TYPE_OPTIONS}
                value={form.invoiceType}
                onChange={(e) => {
                  set('invoiceType', e.target.value)
                  // Reset errori specifici al cambio tipo
                  setErrors({})
                  setPendingGeneratedFile(null)
                }}
                error={errors.invoiceType}
              />
              <Input
                label="Numero fattura"
                required
                placeholder="Es. 1/2026"
                value={form.invoiceNumber}
                onChange={(e) => set('invoiceNumber', e.target.value)}
                error={errors.invoiceNumber}
              />
            </div>

            {/* ── FATTURA ELETTRONICA ───────────────────────────────────────── */}
            {form.invoiceType === 'elettronica' && (
              <div className="space-y-4">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                  Dati fattura elettronica
                </p>
                <Input
                  label="Azienda"
                  required
                  placeholder="Es. Azienda S.r.l."
                  value={form.azienda}
                  onChange={(e) => set('azienda', e.target.value)}
                  error={errors.azienda}
                />
                <div className="grid grid-cols-2 gap-4">
                  <Input
                    label="Data emissione"
                    type="date"
                    required
                    value={form.issueDate}
                    onChange={(e) => set('issueDate', e.target.value)}
                    error={errors.issueDate}
                  />
                  <Input
                    label="Importo (€)"
                    required
                    placeholder="Es. 60,00"
                    inputMode="decimal"
                    value={form.amount}
                    onChange={(e) => set('amount', e.target.value)}
                    error={errors.amount}
                  />
                </div>

                {/* Allegato PDF opzionale */}
                <div className="flex flex-col gap-1.5">
                  <label className="label">Allegato PDF <span className="text-gray-400 font-normal">(opzionale)</span></label>
                  {pendingGeneratedFile ? (
                    <div className="flex items-center gap-2 px-3 py-2 bg-teal-50 dark:bg-teal-900/20 border border-teal-200 dark:border-teal-700 rounded-xl">
                      <Paperclip size={14} className="text-teal-600 flex-shrink-0" />
                      <span className="text-xs text-teal-700 dark:text-teal-400 flex-1 truncate">{pendingGeneratedFile.fileName}</span>
                      <button
                        type="button"
                        onClick={() => setPendingGeneratedFile(null)}
                        className="text-gray-400 hover:text-red-500 transition-colors"
                        title="Rimuovi allegato"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ) : (
                    <label className="flex items-center gap-2 px-3 py-2 border border-dashed border-gray-300 dark:border-gray-600 rounded-xl cursor-pointer hover:border-teal-400 hover:bg-teal-50/50 dark:hover:bg-teal-900/10 transition-colors">
                      <Paperclip size={14} className="text-gray-400" />
                      <span className="text-xs text-gray-500 dark:text-gray-400">Clicca per allegare un file PDF</span>
                      <input
                        type="file"
                        accept="application/pdf"
                        className="sr-only"
                        onChange={handlePdfUpload}
                      />
                    </label>
                  )}
                </div>
              </div>
            )}

            {/* ── FATTURA CARTACEA ──────────────────────────────────────────── */}
            {form.invoiceType === 'cartacea' && (
              <>
                {/* Dati generali */}
                <div className="grid grid-cols-2 gap-4">
                  <Input
                    label="Data emissione"
                    type="date"
                    required
                    value={form.issueDate}
                    onChange={(e) => set('issueDate', e.target.value)}
                    error={errors.issueDate}
                  />
                  <Select
                    label="Stato"
                    required
                    options={INVOICE_STATUS_OPTIONS}
                    value={form.status}
                    onChange={(e) => set('status', e.target.value)}
                    error={errors.status}
                  />
                </div>

                {/* Paziente */}
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
                    Paziente
                  </p>
                  <div className="grid grid-cols-2 gap-4">
                    <Input
                      label="Nome"
                      required
                      value={form.patientFirstName}
                      onChange={(e) => setName('patientFirstName', e.target.value)}
                      error={errors.patientFirstName}
                      hint="Ricerca automatica tra i pazienti registrati"
                    />
                    <Input
                      label="Cognome"
                      required
                      value={form.patientLastName}
                      onChange={(e) => setName('patientLastName', e.target.value)}
                      error={errors.patientLastName}
                    />
                    <div className="col-span-2">
                      <Input
                        label="Codice fiscale"
                        required
                        placeholder="Es. RSSMRA80A01H501U"
                        value={form.patientFiscalCode}
                        onChange={(e) => set('patientFiscalCode', e.target.value.toUpperCase())}
                        error={errors.patientFiscalCode}
                        className="uppercase"
                      />
                      {form.patientId && (
                        <p className="text-xs text-teal-600 dark:text-teal-400 mt-1 flex items-center gap-1">
                          ✓ Paziente collegato al registro
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Prestazione */}
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
                    Prestazione
                  </p>
                  <div className="grid grid-cols-1 gap-4">
                    <Input
                      label="Descrizione"
                      required
                      placeholder="Es. Seduta di logopedia del 29/04/2026"
                      value={form.description}
                      onChange={(e) => set('description', e.target.value)}
                      error={errors.description}
                    />
                    <div className="grid grid-cols-2 gap-4">
                      <Input
                        label="Importo (€)"
                        required
                        placeholder="Es. 60,00"
                        inputMode="decimal"
                        value={form.amount}
                        onChange={(e) => set('amount', e.target.value)}
                        error={errors.amount}
                      />
                      <div className="flex flex-col gap-1">
                        <label className="label">Bollo</label>
                        <div className={clsx(
                          'input-field flex items-center justify-between cursor-default select-none',
                          'bg-gray-50 dark:bg-gray-800/50 text-gray-500 dark:text-gray-400',
                        )}>
                          <span>{hasStampDuty ? `€ ${STAMP_DUTY_AMOUNT.toFixed(2)}` : '—'}</span>
                          {hasStampDuty && (
                            <span className="text-xs bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 px-2 py-0.5 rounded-lg">
                              Automatico
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-400">
                          {hasStampDuty
                            ? `Obbligatorio se importo > € ${STAMP_DUTY_THRESHOLD}`
                            : `Non dovuto (importo ≤ € ${STAMP_DUTY_THRESHOLD})`}
                        </p>
                      </div>
                    </div>
                    {hasStampDuty && (
                      <Input
                        label="Numero bollo"
                        required
                        placeholder="Es. 12345678901234"
                        value={form.stampDutyNumber}
                        onChange={(e) => set('stampDutyNumber', e.target.value)}
                        error={errors.stampDutyNumber}
                      />
                    )}
                  </div>
                </div>
              </>
            )}

            {/* Avviso template mancante — solo per cartacea */}
            {!isElettronica && !canGenerate && (
              <div className="flex items-start gap-3 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl">
                <AlertTriangle size={16} className="text-amber-500 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  Non è possibile generare la fattura senza un template Word configurato nelle Impostazioni.
                </p>
              </div>
            )}

            {/* File generato/allegato pronto — solo cartacea */}
            {!isElettronica && pendingGeneratedFile && !generateError && (
              <div className="flex items-start gap-3 p-3 bg-teal-50 dark:bg-teal-900/20 border border-teal-200 dark:border-teal-800 rounded-xl">
                <CheckCircle size={16} className="text-teal-500 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-teal-700 dark:text-teal-400">
                  File <strong>{pendingGeneratedFile.fileName}</strong> salvato in{' '}
                  <strong>{impostazioni.cartellaSalvataggio ?? 'Desktop'}</strong> e allegato alla fattura.
                </p>
              </div>
            )}

            {/* Errore generazione */}
            {generateError && (
              <div className="flex items-start gap-3 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl">
                <AlertTriangle size={16} className="text-red-500 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-red-700 dark:text-red-400">{generateError}</p>
              </div>
            )}

            {/* Footer */}
            <div className="flex items-center justify-between pt-2 border-t border-gray-100 dark:border-gray-800">
              {/* Genera fattura — solo per cartacea */}
              {!isElettronica ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={handleGenerate}
                  disabled={!canGenerate || generating}
                  loading={generating}
                  title={!canGenerate ? 'Configura un template Word nelle Impostazioni' : undefined}
                >
                  {pendingGeneratedFile
                    ? <CheckCircle size={15} className="text-teal-600" />
                    : <FileDown size={15} />}
                  {pendingGeneratedFile ? 'Rigenera' : 'Genera fattura'}
                </Button>
              ) : (
                <div />
              )}

              <div className="flex gap-3">
                <Button type="button" variant="secondary" onClick={onClose}>
                  Annulla
                </Button>
                <Button type="submit" loading={saving} disabled={saving}>
                  {isEdit ? 'Salva modifiche' : 'Salva fattura'}
                </Button>
              </div>
            </div>
          </form>
        </div>
      </div>

      {/* Modale omonimi */}
      {showOmonimoModal && (
        <PazienteOmonimoModal
          candidates={omonimoCandidates}
          onSelect={handlePatientSelected}
          onClose={() => setShowOmonimoModal(false)}
        />
      )}
    </>
  )
}
