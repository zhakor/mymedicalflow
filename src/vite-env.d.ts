/// <reference types="vite/client" />

// Dichiarazioni per import di asset immagine
declare module '*.png' {
  const src: string
  export default src
}
declare module '*.ico' {
  const src: string
  export default src
}
declare module '*.svg' {
  const src: string
  export default src
}
