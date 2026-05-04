import { useState, useEffect } from 'react'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { Badge } from '../components/ui/Badge'
import { useImpostazioniStore } from '../stores/impostazioniStore'
import type { ImpostazioniApp, TemplateFattura } from '../types'
import { pickDirectory } from '../lib/documentService'
import { Sun, Moon, Check, Upload, Trash2, Folder, X } from 'lucide-react'

export function ImpostazioniPage() {
  const { impostazioni, salvaImpostazioni, applicaTema } = useImpostazioniStore()
  const [form, setForm] = useState<ImpostazioniApp>(impostazioni)
  const [feedback, setFeedback] = useState(false)

  // Sincronizza il form se le impostazioni vengono aggiornate esternamente
  useEffect(() => {
    setForm(impostazioni)
  }, [impostazioni])

  function handleTema(tema: 'light' | 'dark') {
    const aggiornate = { ...form, tema }
    setForm(aggiornate)
    salvaImpostazioni(aggiornate)
    applicaTema(tema)
  }

  function handleTemplateFattura(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string
      // Rimuove il prefisso "data:...;base64," per salvare solo il contenuto
      const base64 = dataUrl.split(',')[1] ?? ''
      const template: TemplateFattura = {
        nomeFile: file.name,
        dimensione: file.size,
        dataCaricamento: new Date().toISOString(),
        mimeType: file.type || 'application/octet-stream',
        contenuto: base64,
      }
      const aggiornate = { ...form, templateFattura: template }
      setForm(aggiornate)
      salvaImpostazioni(aggiornate)
      showFeedback()
    }
    reader.readAsDataURL(file)
  }

  function handleRimuoviTemplate() {
    const aggiornate = { ...form, templateFattura: undefined }
    setForm(aggiornate)
    salvaImpostazioni(aggiornate)
  }

  async function handleSfogliaCartella() {
    const dir = await pickDirectory()
    if (dir !== null) {
      const aggiornate = { ...form, cartellaSalvataggio: dir }
      setForm(aggiornate)
      salvaImpostazioni(aggiornate)
      showFeedback()
    }
  }

  function handleRimuoviCartella() {
    const aggiornate = { ...form, cartellaSalvataggio: undefined }
    setForm(aggiornate)
    salvaImpostazioni(aggiornate)
  }

  function handleSalva() {
    salvaImpostazioni(form)
    applicaTema(form.tema)
    showFeedback()
  }

  function showFeedback() {
    setFeedback(true)
    setTimeout(() => setFeedback(false), 3000)
  }

  function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-gray-500 dark:text-gray-400 text-sm font-medium uppercase tracking-wide">
          Impostazioni
        </p>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
          Impostazioni app
        </h2>
      </div>

      {/* Feedback salvataggio */}
      {feedback && (
        <div className="bg-teal-50 dark:bg-teal-900/20 border border-teal-200 dark:border-teal-800 rounded-xl px-4 py-3 flex items-center gap-2 text-teal-700 dark:text-teal-400 text-sm">
          <Check size={16} />
          Impostazioni salvate.
        </div>
      )}

      {/* Tema */}
      <Card>
        <h3 className="font-semibold text-gray-900 dark:text-white mb-4">Aspetto</h3>
        <div className="flex gap-3">
          <button
            onClick={() => handleTema('light')}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 transition-all duration-200 ${
              form.tema === 'light'
                ? 'border-teal-500 bg-teal-50 dark:bg-teal-900/20 text-teal-700 dark:text-teal-400'
                : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600'
            }`}
          >
            <Sun size={18} />
            <span className="font-medium text-sm">Chiaro</span>
            {form.tema === 'light' && <Check size={14} />}
          </button>

          <button
            onClick={() => handleTema('dark')}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 transition-all duration-200 ${
              form.tema === 'dark'
                ? 'border-teal-500 bg-teal-50 dark:bg-teal-900/20 text-teal-700 dark:text-teal-400'
                : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600'
            }`}
          >
            <Moon size={18} />
            <span className="font-medium text-sm">Scuro</span>
            {form.tema === 'dark' && <Check size={14} />}
          </button>
        </div>
      </Card>

      {/* Template fattura */}
      <Card>
        <h3 className="font-semibold text-gray-900 dark:text-white mb-1">
          Template fattura Word
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          Carica il modello .docx da usare per la generazione delle fatture.
          {/* TODO fase 2: implementare generazione fatture dal template */}
        </p>

        {form.templateFattura ? (
          <div className="flex items-center gap-4 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-700">
            <div className="flex-1 min-w-0">
              <p className="font-medium text-gray-900 dark:text-white text-sm truncate">
                {form.templateFattura.nomeFile}
              </p>
              <div className="flex items-center gap-3 mt-1">
                <span className="text-xs text-gray-400">
                  {formatFileSize(form.templateFattura.dimensione)}
                </span>
                <span className="text-xs text-gray-400">
                  Caricato il{' '}
                  {new Date(form.templateFattura.dataCaricamento).toLocaleDateString('it-IT')}
                </span>
                <Badge variant="muted">{form.templateFattura.mimeType}</Badge>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRimuoviTemplate}
              className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 flex-shrink-0"
            >
              <Trash2 size={16} />
            </Button>
          </div>
        ) : (
          <label className="flex flex-col items-center justify-center gap-3 p-8 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl cursor-pointer hover:border-teal-400 dark:hover:border-teal-600 hover:bg-teal-50/50 dark:hover:bg-teal-900/10 transition-all duration-200">
            <Upload size={24} className="text-gray-400" />
            <div className="text-center">
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                Clicca per caricare un template .docx
              </p>
              <p className="text-xs text-gray-400 mt-1">Solo file Word (.docx)</p>
            </div>
            <input
              type="file"
              accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              className="hidden"
              onChange={handleTemplateFattura}
            />
          </label>
        )}
      </Card>

      {/* Cartella di salvataggio fatture */}
      <Card>
        <h3 className="font-semibold text-gray-900 dark:text-white mb-1">
          Cartella di salvataggio fatture
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          Scegli dove salvare i file Word generati. Se non impostata, verrà usata la cartella Download.
        </p>

        {form.cartellaSalvataggio ? (
          <div className="flex items-center gap-4 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-700">
            <Folder size={20} className="text-teal-500 flex-shrink-0" />
            <p className="flex-1 min-w-0 text-sm font-medium text-gray-900 dark:text-white truncate">
              {form.cartellaSalvataggio}
            </p>
            <div className="flex items-center gap-2 flex-shrink-0">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleSfogliaCartella}
                className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
              >
                Cambia
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleRimuoviCartella}
                className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
              >
                <X size={16} />
              </Button>
            </div>
          </div>
        ) : (
          <button
            onClick={handleSfogliaCartella}
            className="w-full flex flex-col items-center justify-center gap-3 p-8 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl cursor-pointer hover:border-teal-400 dark:hover:border-teal-600 hover:bg-teal-50/50 dark:hover:bg-teal-900/10 transition-all duration-200"
          >
            <Folder size={24} className="text-gray-400" />
            <div className="text-center">
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                Clicca per scegliere la cartella
              </p>
              <p className="text-xs text-gray-400 mt-1">Predefinita: cartella Download</p>
            </div>
          </button>
        )}
      </Card>

      {/* Salva */}
      <div className="flex justify-end">
        <Button onClick={handleSalva}>
          <Check size={16} />
          Salva impostazioni
        </Button>
      </div>
    </div>
  )
}
