/**
 * Blocco dell'app con Face ID (o impronta, o codice del telefono) tramite
 * WebAuthn, lo standard delle passkey. Protegge dal caso del telefono
 * sbloccato in mano ad altri: senza il riconoscimento i dati non si mostrano.
 *
 * Non è una protezione crittografica della chiave dell'archivio: contro
 * codice malevolo nella pagina c'è la CSP (vercel.json). La credenziale resta
 * nel portachiavi del telefono; qui se ne ricorda solo l'id, per account.
 */

const CHIAVE = 'mmf.mobile.blocco'

type Registro = Record<string, string>

function registro(): Registro {
  try {
    return (JSON.parse(localStorage.getItem(CHIAVE) ?? '{}') as Registro) ?? {}
  } catch {
    return {}
  }
}

function salva(r: Registro): void {
  try {
    localStorage.setItem(CHIAVE, JSON.stringify(r))
  } catch {
    // Senza spazio il blocco non si ricorda: si riproporrà
  }
}

const inBase64 = (b: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(b)))
const daBase64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))
const casuale = (n: number) => crypto.getRandomValues(new Uint8Array(n))

/** Il telefono ha Face ID, impronta o codice utilizzabili dal browser. */
export async function bloccoDisponibile(): Promise<boolean> {
  try {
    return !!window.PublicKeyCredential && (await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable())
  } catch {
    return false
  }
}

export const bloccoAttivo = (uid: string): boolean => !!registro()[uid]

/** Da chiamare dal tocco di un pulsante: Safari lo richiede. */
export async function attivaBlocco(uid: string, email: string): Promise<void> {
  const credenziale = (await navigator.credentials.create({
    publicKey: {
      challenge: casuale(32),
      rp: { name: 'MyMedicalFlow', id: location.hostname },
      user: { id: casuale(16), name: email, displayName: email },
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 }, // ES256
        { type: 'public-key', alg: -257 }, // RS256
      ],
      authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required' },
      attestation: 'none',
      timeout: 60_000,
    },
  })) as PublicKeyCredential | null
  if (!credenziale) throw new Error('Attivazione annullata.')
  salva({ ...registro(), [uid]: inBase64(credenziale.rawId) })
}

export function disattivaBlocco(uid: string): void {
  const r = registro()
  delete r[uid]
  salva(r)
}

/**
 * Chiede Face ID (o il codice del telefono). Risolve solo se il telefono ha
 * davvero verificato la persona (flag UV dei dati dell'autenticatore).
 * Da chiamare dal tocco di un pulsante.
 */
export async function sblocca(uid: string): Promise<void> {
  const id = registro()[uid]
  if (!id) return
  const risposta = (await navigator.credentials.get({
    publicKey: {
      challenge: casuale(32),
      rpId: location.hostname,
      allowCredentials: [{ type: 'public-key', id: daBase64(id) }],
      userVerification: 'required',
      timeout: 60_000,
    },
  })) as PublicKeyCredential | null
  const dati = (risposta?.response as AuthenticatorAssertionResponse | undefined)?.authenticatorData
  // Byte 32: flag; 0x04 = utente verificato (Face ID, impronta o codice)
  if (!dati || (new Uint8Array(dati)[32] & 0x04) === 0) throw new Error('Riconoscimento non riuscito.')
}
