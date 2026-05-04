/**
 * Servizio di storage locale.
 * Wrapper su localStorage con serializzazione JSON.
 * Isolato per poter essere sostituito in futuro (SQLite via Tauri, ecc.).
 */

const PREFIX = 'mmf_' // MyMedicalFlow prefix

export const storageService = {
  get<T>(key: string): T | null {
    try {
      const raw = localStorage.getItem(PREFIX + key)
      if (raw === null) return null
      return JSON.parse(raw) as T
    } catch {
      return null
    }
  },

  set<T>(key: string, value: T): void {
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(value))
    } catch (err) {
      console.error('[StorageService] Errore nel salvataggio:', err)
    }
  },

  remove(key: string): void {
    localStorage.removeItem(PREFIX + key)
  },

  clear(): void {
    const keys = Object.keys(localStorage).filter(k => k.startsWith(PREFIX))
    keys.forEach(k => localStorage.removeItem(k))
  },
}
