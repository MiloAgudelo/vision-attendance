import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@': path.join(here, 'src'),
    },
  },
  test: {
    // Solo se prueba lógica de servidor: no hace falta un DOM.
    environment: 'node',
    // Las suites de integración comparten la base indicada por DATABASE_URL. Ejecutarlas por
    // archivo en paralelo mezcla horarios recurrentes y permite que una suite borre fixtures que
    // otra todavía usa; la serialización conserva el aislamiento sin reiniciar PostgreSQL.
    fileParallelism: false,
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});
