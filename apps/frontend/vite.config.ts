import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// Puerto fijo: docker-compose.yml publica 127.0.0.1:5173 (plan HT-CORE-01 §9.8).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
});
