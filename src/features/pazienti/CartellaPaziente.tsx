import { useState, useMemo } from 'react'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import type { Patient } from '../../types/paziente'
import { GENDER_LABELS } from '../../types/paziente'
import {
  ArrowLeft,
  User,
  Calendar,
  Phone,
  CreditCard,
  Users,
  FileText,
  Clock,
  MapPin,
  Eye,
} from 'lucide-react'
import { useImpostazioniStore } from '../../stores/impostazioniStore'
import { fatturaService } from '../../lib/fatturaService'
import { appuntamentoService } from '../../lib/appuntamentoService'
import { downloadDocx } from '../../lib/documentService'
import { INVOICE_STATUS_LABELS, INVOICE_TYPE_LABELS } from '../../types/fattura'
import { APPOINTMENT_TYPE_LABELS } from '../../types/appuntamento'
import type { Invoice } from '../../types/fattura'

interface CartellaPazienteProps {
  patient: Patient
  onBack: () => void
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-8 h-8 bg-teal-50 dark:bg-teal-900/30 rounded-lg flex items-center justify-center text-teal-600 dark:text-teal-400 flex-shrink-0 mt-0.5">
        {icon}
      </div>
      <div>
        <p className="text-xs text-gray-400 font-medium">{label}</p>
        <p className="text-sm text-gray-900 dark:text-white font-medium mt-0.5">{value}</p>
      </div>
    </div>
  )
}

function formatDate(iso: string): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('it-IT', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })
}

function calcAge(birthDate: string): string {
  if (!birthDate) return '—'
  const today = new Date()
  const birth = new Date(birthDate)
  let age = today.getFullYear() - birth.getFullYear()
  const m = today.getMonth() - birth.getMonth()
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--
  return `${age} anni`
}

export function CartellaPaziente({ patient, onBack }: CartellaPazienteProps) {
  const nomeCompleto = `${patient.firstName} ${patient.lastName}`
  const { impostazioni } = useImpostazioniStore()

  const fatture = useMemo(
    () => fatturaService.getByPatient(patient.id, patient.fiscalCode),
    [patient.id, patient.fiscalCode],
  )
  const appuntamenti = useMemo(
    () => appuntamentoService.getByPatientId(patient.id),
    [patient.id],
  )

  const [viewError, setViewError] = useState<string | null>(null)

  async function handleViewFattura(inv: Invoice) {
    if (!inv.generatedFile) return
    try {
      await downloadDocx(inv.generatedFile.fileBase64, inv.generatedFile.fileName, impostazioni.cartellaSalvataggio)
      setViewError(null)
    } catch (e) {
      setViewError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft size={16} />
          Torna alla lista
        </Button>
        <div>
          <p className="text-gray-500 dark:text-gray-400 text-sm font-medium uppercase tracking-wide">
            Cartella clinica
          </p>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mt-0.5">
            {nomeCompleto}
          </h2>
        </div>
      </div>

      {/* Dati anagrafici */}
      <Card>
        <div className="flex items-start justify-between mb-5">
          <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <User size={17} className="text-teal-600" />
            Dati anagrafici
          </h3>
          {patient.developmentalAge && <Badge variant="info">Età evolutiva</Badge>}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-5">
          <InfoRow
            icon={<User size={15} />}
            label="Nome completo"
            value={nomeCompleto}
          />
          <InfoRow
            icon={<CreditCard size={15} />}
            label="Codice fiscale"
            value={patient.fiscalCode || '—'}
          />
          <InfoRow
            icon={<Calendar size={15} />}
            label="Data di nascita"
            value={patient.birthDate ? `${formatDate(patient.birthDate)} (${calcAge(patient.birthDate)})` : '—'}
          />
          <InfoRow
            icon={<User size={15} />}
            label="Sesso"
            value={patient.gender ? GENDER_LABELS[patient.gender] : '—'}
          />
          <InfoRow
            icon={<Phone size={15} />}
            label="Cellulare"
            value={patient.phoneNumber || '—'}
          />
          <InfoRow
            icon={<Clock size={15} />}
            label="Registrato il"
            value={formatDate(patient.createdAt)}
          />
        </div>
      </Card>

      {/* Residenza */}
      {(patient.address || patient.city || patient.postalCode || patient.province) && (
        <Card>
          <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2 mb-5">
            <MapPin size={17} className="text-teal-600" />
            Residenza
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-5">
            {patient.address && (
              <InfoRow icon={<MapPin size={15} />} label="Indirizzo" value={patient.address} />
            )}
            {patient.city && (
              <InfoRow icon={<MapPin size={15} />} label="Città" value={patient.city} />
            )}
            {patient.postalCode && (
              <InfoRow icon={<MapPin size={15} />} label="CAP" value={patient.postalCode} />
            )}
            {patient.province && (
              <InfoRow icon={<MapPin size={15} />} label="Provincia" value={patient.province} />
            )}
          </div>
        </Card>
      )}

      {/* Dati tutore */}
      {patient.developmentalAge && patient.guardian && (
        <Card>
          <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2 mb-5">
            <Users size={17} className="text-teal-600" />
            Dati tutore
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-5">
            <InfoRow
              icon={<User size={15} />}
              label="Nome completo"
              value={`${patient.guardian.firstName} ${patient.guardian.lastName}`}
            />
            {patient.guardian.fiscalCode && (
              <InfoRow
                icon={<CreditCard size={15} />}
                label="Codice fiscale"
                value={patient.guardian.fiscalCode}
              />
            )}
            {patient.guardian.gender && (
              <InfoRow
                icon={<User size={15} />}
                label="Sesso"
                value={GENDER_LABELS[patient.guardian.gender]}
              />
            )}
            {patient.guardian.birthDate && (
              <InfoRow
                icon={<Calendar size={15} />}
                label="Data di nascita"
                value={`${formatDate(patient.guardian.birthDate)} (${calcAge(patient.guardian.birthDate)})`}
              />
            )}
            <InfoRow
              icon={<Phone size={15} />}
              label="Cellulare"
              value={patient.guardian.phoneNumber || '—'}
            />
          </div>
        </Card>
      )}

      {/* Residenza tutore */}
      {patient.developmentalAge && patient.guardian &&
        (patient.guardian.address || patient.guardian.city || patient.guardian.postalCode || patient.guardian.province) && (
        <Card>
          <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2 mb-5">
            <MapPin size={17} className="text-teal-600" />
            Residenza tutore
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-5">
            {patient.guardian.address && (
              <InfoRow icon={<MapPin size={15} />} label="Indirizzo" value={patient.guardian.address} />
            )}
            {patient.guardian.city && (
              <InfoRow icon={<MapPin size={15} />} label="Città" value={patient.guardian.city} />
            )}
            {patient.guardian.postalCode && (
              <InfoRow icon={<MapPin size={15} />} label="CAP" value={patient.guardian.postalCode} />
            )}
            {patient.guardian.province && (
              <InfoRow icon={<MapPin size={15} />} label="Provincia" value={patient.guardian.province} />
            )}
          </div>
        </Card>
      )}

      {/* Note */}
      {patient.notes && (
        <Card>
          <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2 mb-3">
            <FileText size={17} className="text-teal-600" />
            Note
          </h3>
          <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">
            {patient.notes}
          </p>
        </Card>
      )}

      {/* Appuntamenti associati */}
      <Card>
        <div className="flex items-start justify-between mb-4">
          <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <Calendar size={17} className="text-teal-600" />
            Appuntamenti associati
          </h3>
          <Badge variant={appuntamenti.length > 0 ? 'info' : 'muted'}>
            {appuntamenti.length} appuntament{appuntamenti.length === 1 ? 'o' : 'i'}
          </Badge>
        </div>

        {appuntamenti.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Nessun appuntamento associato a questo paziente.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-800">
                  {['Data', 'Ora', 'Tipo', 'Descrizione'].map((col) => (
                    <th key={col} className="px-2 py-2 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide whitespace-nowrap">
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-800/60">
                {appuntamenti.map((a) => (
                  <tr key={a.id} className="hover:bg-gray-50/60 dark:hover:bg-gray-800/40 transition-colors">
                    <td className="px-2 py-2 text-gray-700 dark:text-gray-300 whitespace-nowrap">
                      {new Date(a.appointmentDate + 'T00:00:00').toLocaleDateString('it-IT')}
                    </td>
                    <td className="px-2 py-2 text-gray-700 dark:text-gray-300 whitespace-nowrap">
                      {a.appointmentTime}
                    </td>
                    <td className="px-2 py-2 whitespace-nowrap">
                      <Badge variant={a.appointmentType === 'valutazione' ? 'info' : 'success'}>
                        {APPOINTMENT_TYPE_LABELS[a.appointmentType]}
                      </Badge>
                    </td>
                    <td className="px-2 py-2 text-gray-600 dark:text-gray-400 max-w-[200px] truncate">
                      {a.description || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Fatture associate */}
      <Card>
        <div className="flex items-start justify-between mb-4">
          <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <FileText size={17} className="text-teal-600" />
            Fatture associate
          </h3>
          <Badge variant={fatture.length > 0 ? 'success' : 'muted'}>
            {fatture.length} fattur{fatture.length === 1 ? 'a' : 'e'}
          </Badge>
        </div>

        {viewError && (
          <p className="text-xs text-red-500 mb-3">{viewError}</p>
        )}

        {fatture.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Nessuna fattura emessa per questo paziente.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-800">
                  {['Numero', 'Data', 'Descrizione', 'Importo', 'Bollo', 'Stato', 'Tipo', ''].map((col) => (
                    <th key={col} className="px-2 py-2 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide whitespace-nowrap">
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-800/60">
                {fatture.map((inv) => (
                  <tr key={inv.id} className="hover:bg-gray-50/60 dark:hover:bg-gray-800/40 transition-colors">
                    <td className="px-2 py-2 font-medium text-gray-900 dark:text-white whitespace-nowrap">
                      {inv.invoiceNumber}
                    </td>
                    <td className="px-2 py-2 text-gray-600 dark:text-gray-400 whitespace-nowrap">
                      {formatDate(inv.issueDate)}
                    </td>
                    <td className="px-2 py-2 text-gray-700 dark:text-gray-300 max-w-[200px] truncate">
                      {inv.description}
                    </td>
                    <td className="px-2 py-2 text-gray-700 dark:text-gray-300 whitespace-nowrap font-medium">
                      € {inv.amount.toFixed(2).replace('.', ',')}
                    </td>
                    <td className="px-2 py-2 text-gray-600 dark:text-gray-400 whitespace-nowrap">
                      {inv.stampDuty > 0 ? `€ ${inv.stampDuty.toFixed(2).replace('.', ',')}` : '—'}
                    </td>
                    <td className="px-2 py-2 whitespace-nowrap">
                      <Badge variant={inv.status === 'pagata' ? 'success' : 'warning'}>
                        {INVOICE_STATUS_LABELS[inv.status]}
                      </Badge>
                    </td>
                    <td className="px-2 py-2 whitespace-nowrap">
                      <Badge variant={inv.invoiceType === 'elettronica' ? 'info' : 'muted'}>
                        {INVOICE_TYPE_LABELS[inv.invoiceType]}
                      </Badge>
                    </td>
                    <td className="px-2 py-2">
                      {inv.generatedFile && (
                        <button
                          onClick={() => handleViewFattura(inv)}
                          title="Apri fattura generata"
                          className="w-7 h-7 rounded-lg flex items-center justify-center text-teal-600 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-900/20 transition-colors"
                        >
                          <Eye size={15} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
