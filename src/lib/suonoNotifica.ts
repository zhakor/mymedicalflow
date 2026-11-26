/**
 * Suono delle notifiche "Dal telefono": un breve rintocco a due note,
 * sintetizzato con Web Audio (nessun file audio da distribuire). Discreto: è
 * un gestionale in uno studio, non deve sobbalzare nessuno.
 */

let contesto: AudioContext | null = null

export function suonaNotifica(): void {
  try {
    contesto ??= new AudioContext()
    // Riprende il contesto se il browser l'ha sospeso in attesa di un'interazione
    void contesto.resume()
    const inizio = contesto.currentTime
    for (const [frequenza, ritardo] of [
      [880, 0], // La
      [1318.5, 0.12], // Mi, una quinta sopra
    ] as const) {
      const oscillatore = contesto.createOscillator()
      const volume = contesto.createGain()
      oscillatore.type = 'sine'
      oscillatore.frequency.value = frequenza
      // Attacco rapido e coda morbida, come un campanello
      volume.gain.setValueAtTime(0, inizio + ritardo)
      volume.gain.linearRampToValueAtTime(0.12, inizio + ritardo + 0.015)
      volume.gain.exponentialRampToValueAtTime(0.0001, inizio + ritardo + 0.6)
      oscillatore.connect(volume).connect(contesto.destination)
      oscillatore.start(inizio + ritardo)
      oscillatore.stop(inizio + ritardo + 0.65)
    }
  } catch {
    // Senza audio la notifica resta comunque visibile
  }
}
