import { create } from 'zustand'
import type { ImpostazioniApp } from '../types'
import { impostazioniService } from '../lib/impostazioniService'

interface ImpostazioniStore {
  impostazioni: ImpostazioniApp
  caricaImpostazioni: () => void
  salvaImpostazioni: (impostazioni: ImpostazioniApp) => void
  applicaTema: (tema: 'light' | 'dark') => void
}

export const useImpostazioniStore = create<ImpostazioniStore>((set) => ({
  impostazioni: impostazioniService.get(),

  caricaImpostazioni: () => {
    const impostazioni = impostazioniService.get()
    set({ impostazioni })
  },

  salvaImpostazioni: (impostazioni: ImpostazioniApp) => {
    impostazioniService.save(impostazioni)
    set({ impostazioni })
  },

  applicaTema: (tema: 'light' | 'dark') => {
    if (tema === 'dark') {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  },
}))
