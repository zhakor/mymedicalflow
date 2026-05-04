import { storageService } from './storageService'
import type { ProfiloProfessionista } from '../types'

const KEY = 'profilo'

export const profiloService = {
  get(): ProfiloProfessionista | null {
    return storageService.get<ProfiloProfessionista>(KEY)
  },

  save(profilo: ProfiloProfessionista): void {
    storageService.set(KEY, profilo)
  },

  isCompleto(profilo: ProfiloProfessionista | null): boolean {
    if (!profilo) return false
    return (
      !!profilo.professione &&
      !!profilo.nome.trim() &&
      !!profilo.cognome.trim() &&
      !!profilo.partitaIva.trim()
    )
  },

  clear(): void {
    storageService.remove(KEY)
  },
}
