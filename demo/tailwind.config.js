/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        supabase: {
          lime: '#3ECF8E',
          'lime-hover': '#37BA80',
        },
        dark: {
          bg: '#111714',
          surface: '#17201a',
          'surface-2': '#1e2922',
          border: '#263029',
          'border-strong': '#2f3d32',
        },
        text: {
          primary: '#f0f4f1',
          secondary: '#8fa494',
          tertiary: '#4f6355',
        },
      },
    },
  },
  plugins: [],
};
