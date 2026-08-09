/**
 * Orquestación de la CLI.
 *
 * `runCli` devuelve el código de salida en vez de llamar a `process.exit`, y recibe la escritura,
 * el `fetch`, el reloj y las esperas por inyección. Así la CLI entera se prueba sin servidor y sin
 * capturar la consola; `src/cli.ts` es solo la cáscara que la conecta a `process`.
 */

import type { EventResult } from '@va/shared';

import { DeviceSimulator, type FetchLike, type SendOutcome } from '../client.js';
import { ContractViolationError, SimulatorError, TransportError } from '../errors.js';
import { parseArgs, type CliOptions } from './args.js';
import { EXIT_CODES } from './exit-codes.js';
import {
  formatAttempts,
  formatFailure,
  formatOutcome,
  formatRequest,
  formatSummary,
  formatTarget,
} from './format.js';
import { helpText } from './help.js';

export interface CliDependencies {
  /** Escritura de la salida estándar, una línea por llamada. */
  out: (line: string) => void;
  /** Escritura de la salida de errores, una línea por llamada. */
  err: (line: string) => void;
  env?: Record<string, string | undefined> | undefined;
  fetch?: FetchLike | undefined;
  sleep?: ((ms: number) => Promise<void>) | undefined;
  now?: (() => Date) | undefined;
}

function buildSimulator(options: CliOptions, deps: CliDependencies): DeviceSimulator {
  return new DeviceSimulator({
    apiKey: options.apiKey,
    baseUrl: options.baseUrl,
    deviceId: options.deviceId,
    timeoutMs: options.timeoutMs,
    maxAttempts: options.maxAttempts,
    initialBackoffMs: options.initialBackoffMs,
    fetch: deps.fetch,
    sleep: deps.sleep,
    now: deps.now,
  });
}

function readingOptions(options: CliOptions): {
  cardUid?: string | undefined;
  cardUidBytes: 4 | 7;
  eventId?: string | undefined;
  scannedAt?: string | null | undefined;
  scannedAtOffsetMs?: number | undefined;
  firmwareVersion?: string | null | undefined;
} {
  return {
    cardUid: options.cardUid,
    cardUidBytes: options.cardUidBytes,
    eventId: options.eventId,
    scannedAt: options.scannedAt,
    scannedAtOffsetMs: options.scannedAtOffsetMs,
    firmwareVersion: options.firmwareVersion,
  };
}

/** ¿El `result` obtenido está entre los esperados por `--expect`? */
function matchesExpectation(
  outcome: SendOutcome,
  expected: readonly EventResult[] | undefined,
): boolean {
  if (expected === undefined || !outcome.response.ok) {
    return true;
  }
  return expected.includes(outcome.response.result);
}

function exitCodeFor(
  outcomes: readonly SendOutcome[],
  expected: readonly EventResult[] | undefined,
): number {
  if (outcomes.some((outcome) => !outcome.response.ok)) {
    return EXIT_CODES.errorResponse;
  }
  if (outcomes.some((outcome) => !matchesExpectation(outcome, expected))) {
    return EXIT_CODES.unexpectedResult;
  }
  return EXIT_CODES.ok;
}

function exitCodeForError(error: unknown): number {
  if (error instanceof ContractViolationError) {
    return EXIT_CODES.contractViolation;
  }
  if (error instanceof TransportError || error instanceof SimulatorError) {
    return EXIT_CODES.transport;
  }
  return EXIT_CODES.transport;
}

async function collectOutcomes(
  simulator: DeviceSimulator,
  options: CliOptions,
  report: (outcome: SendOutcome, index: number) => void,
): Promise<SendOutcome[]> {
  const reading = readingOptions(options);

  switch (options.command) {
    case 'enviar':
    case 'reintentar': {
      const outcome = await simulator.send(reading);
      report(outcome, 0);
      return [outcome];
    }
    case 'enrolar': {
      const outcome = await simulator.enroll(reading);
      report(outcome, 0);
      return [outcome];
    }
    case 'repetir':
      return simulator.repeat(
        options.count,
        { ...reading, delayMs: options.delayMs, concurrent: options.concurrent },
        report,
      );
    case 'rafaga':
      return simulator.burst(
        options.count,
        {
          cardUidBytes: options.cardUidBytes,
          scannedAt: options.scannedAt,
          scannedAtOffsetMs: options.scannedAtOffsetMs,
          firmwareVersion: options.firmwareVersion,
          delayMs: options.delayMs,
          concurrent: options.concurrent,
        },
        report,
      );
  }
}

function serializeError(error: unknown): Record<string, unknown> {
  if (error instanceof ContractViolationError) {
    return {
      name: error.name,
      message: error.message,
      status: error.status,
      issues: error.issues,
      rawBody: error.rawBody,
    };
  }
  if (error instanceof TransportError) {
    return { name: error.name, message: error.message, attempts: error.attempts };
  }
  if (error instanceof Error) {
    return { name: error.name, message: error.message };
  }
  return { name: 'Error', message: String(error) };
}

/**
 * Ejecuta la CLI y devuelve el código de salida.
 *
 * @param argv argumentos sin `node` ni el nombre del script.
 */
export async function runCli(argv: readonly string[], deps: CliDependencies): Promise<number> {
  const parsed = parseArgs(argv, deps.env ?? {});

  if (parsed.kind === 'help') {
    deps.out(helpText(parsed.topic));
    return EXIT_CODES.ok;
  }

  if (parsed.kind === 'usage-error') {
    deps.err(parsed.message);
    deps.err('Usa "--help" para ver el uso completo.');
    return EXIT_CODES.usage;
  }

  const options = parsed.options;
  let simulator: DeviceSimulator;
  try {
    simulator = buildSimulator(options, deps);
  } catch (error) {
    for (const line of formatFailure(error)) {
      deps.err(line);
    }
    return exitCodeForError(error);
  }

  const outcomes: SendOutcome[] = [];
  const report = (outcome: SendOutcome, index: number): void => {
    outcomes.push(outcome);
    if (options.json) {
      return;
    }
    const label = options.count > 1 ? `${index + 1}/${options.count}` : undefined;
    for (const line of [
      ...formatRequest(outcome.request, label),
      ...formatAttempts(outcome.attempts),
      ...formatOutcome(outcome),
    ]) {
      deps.out(line);
    }
  };

  if (!options.json) {
    for (const line of formatTarget(
      simulator.endpoint,
      simulator.maskedApiKey,
      simulator.deviceId,
    )) {
      deps.out(line);
    }
  }

  try {
    // `collectOutcomes` notifica cada envío por `report`, que va acumulando en `outcomes`; así, si
    // la serie se corta a la mitad, lo ya enviado sigue estando en el informe.
    await collectOutcomes(simulator, options, report);
  } catch (error) {
    if (options.json) {
      deps.err(
        JSON.stringify(
          {
            command: options.command,
            endpoint: simulator.endpoint,
            deviceId: simulator.deviceId,
            outcomes,
            error: serializeError(error),
            exitCode: exitCodeForError(error),
          },
          null,
          2,
        ),
      );
    } else {
      for (const line of formatFailure(error)) {
        deps.err(line);
      }
    }
    return exitCodeForError(error);
  }

  const exitCode = exitCodeFor(outcomes, options.expect);

  if (options.json) {
    deps.out(
      JSON.stringify(
        {
          command: options.command,
          endpoint: simulator.endpoint,
          deviceId: simulator.deviceId,
          outcomes,
          exitCode,
        },
        null,
        2,
      ),
    );
    return exitCode;
  }

  if (outcomes.length > 1) {
    for (const line of formatSummary(outcomes)) {
      deps.out(line);
    }
  }

  if (exitCode === EXIT_CODES.unexpectedResult && options.expect !== undefined) {
    deps.err('');
    deps.err(`El resultado no es el esperado: se esperaba ${options.expect.join(' o ')}.`);
  }

  return exitCode;
}
