import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Resolve content globs against this file's directory so Tailwind works
// regardless of the process working directory.
const here = dirname(fileURLToPath(import.meta.url));

/** @type {import('tailwindcss').Config} */
export default {
  content: [join(here, 'index.html'), join(here, 'src/**/*.{js,jsx}')],
  theme: {
    extend: {
      colors: {
        navy: '#1B2A4A',
        'navy-light': '#2A3F66',
        gold: '#F5A623',
        'gold-dark': '#D98E15',
        cloud: '#F5F7FA',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
