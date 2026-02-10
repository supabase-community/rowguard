/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        'supabase': {
          'lime': '#3ECF8E',
          'lime-hover': '#37BA80',
        },
        'dark': {
          'bg': '#121212',
          'surface': '#1f1f1f',
          'surface-2': '#2a2a2a',
          'border': '#2e2e2e',
          'border-strong': '#363636',
        },
        'text': {
          'primary': '#fafafa',
          'secondary': '#b4b4b4',
          'tertiary': '#8a8a8a',
        }
      }
    },
  },
  plugins: [],
};
