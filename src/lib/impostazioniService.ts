import { storageService } from './storageService'
import type { ImpostazioniApp } from '../types'

const KEY = 'impostazioni'

const DEFAULT_IMPOSTAZIONI: ImpostazioniApp = {
  tema: 'dark',
}

export const impostazioniService = {
  get(): ImpostazioniApp {
    return storageService.get<ImpostazioniApp>(KEY) ?? DEFAULT_IMPOSTAZIONI
  },

  save(impostazioni: ImpostazioniApp): void {
    storageService.set(KEY, impostazioni)
  },
}
