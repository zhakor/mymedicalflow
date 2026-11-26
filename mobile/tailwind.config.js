import path from 'path'
import { fileURLToPath } from 'url'
import desktop from '../tailwind.config.js'

const qui = path.dirname(fileURLToPath(import.meta.url))

/**
 * Stesso tema del desktop (colori, font, modalità scura). Le classi dei colori
 * dei servizi stanno nei tipi condivisi: vanno incluse nella scansione.
 */
/** @type {import('tailwindcss').Config} */
export default {
  ...desktop,
  content: [
    path.join(qui, 'index.html'),
    path.join(qui, 'src/**/*.{ts,tsx}'),
    path.join(qui, '../src/types/**/*.ts'),
    path.join(qui, '../src/components/ui/**/*.tsx'),
  ],
}
