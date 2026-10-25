/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#fdf4ff',
          100: '#fae8ff',
          500: '#b026ff',
          600: '#8f1fe0',
          700: '#7518ba',
        },
        ink: { 900: '#160821', 800: '#200d2e', 700: '#2e1440' },
        accent: { violet: '#a855f7', amber: '#e8932b' },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
