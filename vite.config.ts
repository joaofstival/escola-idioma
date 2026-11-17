// Vite builda só o renderer (React) para dist/renderer. main e preload seguem no esbuild (scripts/build.mjs).
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  root: 'src/renderer',
  base: './',
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src/renderer', import.meta.url)) } },
  build: {
    outDir: '../../dist/renderer',
    emptyOutDir: true,
    sourcemap: true,
    target: 'es2023',
    chunkSizeWarningLimit: 1500, // app local (file://): sem custo de rede, um bundle só
    // arquivo local (file://): sem modulepreload polyfill inline, compatível com a CSP script-src 'self'
    modulePreload: { polyfill: false },
  },
  server: { port: 5173, strictPort: true },
});
