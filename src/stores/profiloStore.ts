import { create } from 'zustand'
import type { ProfiloProfessionista } from '../types'
import { profiloService } from '../lib/profiloService'

interface ProfiloStore {
  profilo: ProfiloProfessionista | null
  caricaProfilo: () => void
  salvaProfilo: (profilo: ProfiloProfessionista) => void
  isProfiloCompleto: () => boolean
}

export const useProfiloStore = create<ProfiloStore>((set, get) => ({
  profilo: null,

  caricaProfilo: () => {
    const profilo = profiloService.get()
    set({ profilo })
  },

  salvaProfilo: (profilo: ProfiloProfessionista) => {
    profiloService.save(profilo)
    set({ profilo })
  },

  isProfiloCompleto: () => {
    return profiloService.isCompleto(get().profilo)
  },
}))
