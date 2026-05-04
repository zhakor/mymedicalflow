/**
 * Schermata di caricamento iniziale.
 * Mostrata brevemente mentre l'app inizializza lo stato.
 */
import { iconaWhite } from '../../assets/logos'

export function SplashScreen() {
  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-teal-50 to-gray-100 dark:from-gray-950 dark:to-gray-900">
      <div className="flex flex-col items-center gap-6">
        {/* Logo */}
        <div className="w-20 h-20 bg-teal-600 rounded-2xl flex items-center justify-center shadow-lg">
          <img src={iconaWhite} alt="MyMedicalFlow" className="w-12 h-12 object-contain" />
        </div>

        <div className="text-center">
          <h1 className="text-2xl font-semibold text-teal-700 dark:text-teal-400">
            MyMedicalFlow
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Gestionale medico offline
          </p>
        </div>

        {/* Spinner */}
        <div className="flex gap-1.5">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="w-2 h-2 bg-teal-500 rounded-full animate-bounce"
              style={{ animationDelay: `${i * 0.15}s` }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
