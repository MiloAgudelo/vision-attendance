#!/usr/bin/env node
/**
 * Punto de entrada de la CLI.
 *
 * Cáscara mínima: conecta {@link runCli} con `process`. Toda la lógica —y todas las pruebas— viven
 * en `src/cli/run.ts`, que no depende de `process` y por tanto es testeable.
 */

import { runCli } from './cli/run.js';

const exitCode = await runCli(process.argv.slice(2), {
  out: (line) => process.stdout.write(`${line}\n`),
  err: (line) => process.stderr.write(`${line}\n`),
  env: process.env,
});

process.exitCode = exitCode;
