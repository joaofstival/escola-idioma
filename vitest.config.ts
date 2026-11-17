// Testes de interface (React + Testing Library em jsdom). Os testes do backend e das regras puras seguem no node:test (`npm test`).
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src/renderer', import.meta.url)) } },
  test: {
    environment: 'jsdom',
    include: ['src/renderer/**/*.test.tsx'],
    setupFiles: ['src/renderer/test/setup.ts'],
    restoreMocks: true,
  },
});
