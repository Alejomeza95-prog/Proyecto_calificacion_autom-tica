import react from '@vitejs/plugin-react';
import { loadEnv } from 'vite';
import { configDefaults, defineConfig } from 'vitest/config';

/** Destino local por defecto del proxy (HT-AUTH-02 DEC-01). */
const DEFAULT_API_PROXY_TARGET = 'http://localhost:3000';

// Puerto fijo: docker-compose.yml publica 127.0.0.1:5173 (plan HT-CORE-01 §9.8).
export default defineConfig(({ mode }) => {
  // `API_PROXY_TARGET` solo se usa aquí, en el servidor de desarrollo: sin prefijo `VITE_`, no llega al navegador.
  const target = loadEnv(mode, '.', '').API_PROXY_TARGET || DEFAULT_API_PROXY_TARGET;

  return {
    plugins: [react()],
    server: {
      port: 5173,
      strictPort: true,
      // Mismo origen (DEC-01): sin reescribir rutas, para conservar `Path=/api/v1/auth` de la cookie, ni cambiar `Origin`.
      proxy: { '/api/v1': { target } },
    },
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      exclude: [...configDefaults.exclude, 'e2e/**'],
      // Como máximo 2 procesos: con más, la contención de CPU y memoria hacía que las esperas de Testing Library
      // (1 s) vencieran de forma intermitente. No se aumenta el timeout global (decisión del desarrollador, 2026-11-10).
      maxWorkers: 2,
    },
  };
});
