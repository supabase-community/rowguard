import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      'rowguard': path.resolve(__dirname, '../dist/index.js'),
    },
  },
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
});
