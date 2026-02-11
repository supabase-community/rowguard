import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { migrationsPlugin } from './vite-plugin-migrations';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), migrationsPlugin()],
  resolve: {
    alias: {
      // Use source files directly so Vite can bundle as ESM
      rowguard: path.resolve(__dirname, '../src/index.ts'),
    },
  },
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
});
