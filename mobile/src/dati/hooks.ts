import { useEffect, useState, useSyncExternalStore } from 'react'
import { suCambioDati, versioneDati } from './archivio'

/** Ridisegna il componente a ogni modifica dei dati, locale o arrivata dal cloud. */
export function useDati(): number {
  return useSyncExternalStore(suCambioDati, versioneDati)
}

export function useOnline(): boolean {
  const [online, setOnline] = useState(navigator.onLine)
  useEffect(() => {
    const su = () => setOnline(true)
    const giu = () => setOnline(false)
    window.addEventListener('online', su)
    window.addEventListener('offline', giu)
    return () => {
      window.removeEventListener('online', su)
      window.removeEventListener('offline', giu)
    }
  }, [])
  return online
}
