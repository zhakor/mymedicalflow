import plugin from 'tailwindcss/plugin'

/**
 * Tema scuro come quello dell'app sul telefono: le superfici scure
 * (gray-800/900/950) virano al verde-acqua dei colori dell'app. Solo in scuro,
 * con variabili CSS: in chiaro restano i grigi di Tailwind, e i grigi più
 * chiari (testi) non cambiano, così la leggibilità resta quella di prima.
 */
const GRIGI_SCURI = {
  //       chiaro (Tailwind)   scuro (telefono)
  800: ['31 41 55', '20 32 34'], //  #1f2937 → #142022
  900: ['17 24 39', '12 20 21'], //  #111827 → #0c1415, i pannelli del telefono
  950: ['3 7 18', '5 10 11'], //     #030712 → #050a0b, il fondo del telefono
}

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        gray: Object.fromEntries(Object.keys(GRIGI_SCURI).map((t) => [t, `rgb(var(--grigio-${t}) / <alpha-value>)`])),
        teal: {
          50:  '#f0fdfa',
          100: '#ccfbf1',
          200: '#99f6e4',
          300: '#5eead4',
          400: '#2dd4bf',
          500: '#14b8a6',
          600: '#0d9488',
          700: '#0f766e',
          800: '#115e59',
          900: '#134e4a',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [
    plugin(({ addBase }) =>
      addBase({
        ':root': Object.fromEntries(Object.entries(GRIGI_SCURI).map(([t, [chiaro]]) => [`--grigio-${t}`, chiaro])),
        '.dark': Object.fromEntries(Object.entries(GRIGI_SCURI).map(([t, [, scuro]]) => [`--grigio-${t}`, scuro])),
      }),
    ),
  ],
}
