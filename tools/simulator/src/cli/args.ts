/**
 * Análisis de los argumentos de la CLI.
 *
 * Función pura: recibe `argv` y el entorno, devuelve opciones ya validadas o un error de uso en
 * español. No imprime nada ni toca la red, para poder probarla directamente.
 */

import { EVENT_RESULTS, isDeviceApiKeyShaped, type EventResult } from '@va/shared';

import {
  DEFAULT_BASE_URL,
  DEFAULT_INITIAL_BACKOFF_MS,
  DEFAULT_MAX_ATTEMPTS,
  DEFAULT_TIMEOUT_MS,
} from '../client.js';
import { parseDurationMs, type CardUidBytes } from '../event.js';
import { SimulatorError } from '../errors.js';

/** Comandos de la CLI. En español, como el resto de la interfaz. */
export const CLI_COMMANDS = ['enviar', 'repetir', 'rafaga', 'reintentar', 'enrolar'] as const;
export type CliCommand = (typeof CLI_COMMANDS)[number];

export interface CliOptions {
  readonly command: CliCommand;
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly deviceId: string | undefined;
  readonly timeoutMs: number;
  readonly maxAttempts: number;
  readonly initialBackoffMs: number;
  readonly json: boolean;
  readonly cardUid: string | undefined;
  readonly cardUidBytes: CardUidBytes;
  readonly eventId: string | undefined;
  readonly scannedAt: string | null | undefined;
  readonly scannedAtOffsetMs: number | undefined;
  readonly firmwareVersion: string | null | undefined;
  readonly expect: readonly EventResult[] | undefined;
  readonly count: number;
  readonly delayMs: number;
  /** Envía las lecturas simultáneamente para provocar carreras en el servidor. */
  readonly concurrent: boolean;
}

export type ParsedArgs =
  | { readonly kind: 'help'; readonly topic: CliCommand | null }
  | { readonly kind: 'options'; readonly options: CliOptions }
  | { readonly kind: 'usage-error'; readonly message: string };

/** Tiempo límite por defecto del comando `reintentar`: corto a propósito, para forzar el backoff. */
export const RETRY_DEMO_TIMEOUT_MS = 1_000;

const BOOLEAN_FLAGS = new Set(['--json', '--help', '-h', '--concurrentes']);

const KNOWN_FLAGS = new Set([
  '--url',
  '--device',
  '--key',
  '--uid',
  '--bytes',
  '--event-id',
  '--scanned-at',
  '--scanned-at-offset',
  '--firmware-version',
  '--expect',
  '--count',
  '--delay',
  '--concurrentes',
  '--timeout',
  '--max-attempts',
  '--backoff',
  ...BOOLEAN_FLAGS,
]);

class UsageError extends SimulatorError {
  constructor(message: string) {
    super(message);
    this.name = 'UsageError';
  }
}

interface RawArgs {
  readonly command: string | null;
  readonly flags: ReadonlyMap<string, string>;
  readonly help: boolean;
  readonly json: boolean;
  readonly concurrent: boolean;
}

function tokenize(argv: readonly string[]): RawArgs {
  const flags = new Map<string, string>();
  let command: string | null = null;
  let help = false;
  let json = false;
  let concurrent = false;

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === undefined || token === '--') {
      // pnpm ya separa los argumentos del script; un `--` suelto se ignora.
      continue;
    }

    if (!token.startsWith('-')) {
      if (command !== null) {
        throw new UsageError(
          `Sobra el argumento ${JSON.stringify(token)}: solo se admite un comando.`,
        );
      }
      command = token;
      continue;
    }

    const equals = token.indexOf('=');
    const name = equals === -1 ? token : token.slice(0, equals);
    const inlineValue = equals === -1 ? null : token.slice(equals + 1);

    if (!KNOWN_FLAGS.has(name)) {
      throw new UsageError(
        `Opción desconocida: ${name}. Usa "--help" para ver las opciones disponibles.`,
      );
    }

    if (BOOLEAN_FLAGS.has(name)) {
      if (inlineValue !== null) {
        throw new UsageError(`La opción ${name} no admite valor.`);
      }
      if (name === '--json') {
        json = true;
      } else if (name === '--concurrentes') {
        concurrent = true;
      } else {
        help = true;
      }
      continue;
    }

    let value: string;
    if (inlineValue !== null) {
      value = inlineValue;
    } else {
      const next = argv[index + 1];
      if (next === undefined) {
        throw new UsageError(`La opción ${name} necesita un valor.`);
      }
      value = next;
      index += 1;
    }

    if (flags.has(name)) {
      throw new UsageError(`La opción ${name} está repetida.`);
    }
    flags.set(name, value);
  }

  return { command, flags, help, json, concurrent };
}

/**
 * Solo dígitos decimales. `Number()` a secas acepta `0x10` como 16, `1e3` como 1000 y la cadena
 * vacía como 0, que son tres formas de que el usuario crea haber pedido algo distinto de lo que pide.
 */
const DECIMAL_DIGITS = /^\d+$/;

function requireDecimalInt(name: string, raw: string, expectation: string): number {
  const trimmed = raw.trim();
  if (!DECIMAL_DIGITS.test(trimmed)) {
    throw new UsageError(
      `La opción ${name} espera ${expectation}; se recibió ${JSON.stringify(raw)}.`,
    );
  }
  const value = Number(trimmed);
  if (!Number.isSafeInteger(value)) {
    throw new UsageError(
      `La opción ${name} espera ${expectation}; se recibió ${JSON.stringify(raw)}.`,
    );
  }
  return value;
}

function requirePositiveInt(name: string, raw: string): number {
  const value = requireDecimalInt(name, raw, 'un entero positivo');
  if (value <= 0) {
    throw new UsageError(
      `La opción ${name} espera un entero positivo; se recibió ${JSON.stringify(raw)}.`,
    );
  }
  return value;
}

function requireNonNegativeInt(name: string, raw: string): number {
  return requireDecimalInt(name, raw, 'un entero mayor o igual que cero');
}

function parseExpected(raw: string): EventResult[] {
  const values = raw
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value !== '');
  if (values.length === 0) {
    throw new UsageError('La opción --expect espera al menos un valor de "result".');
  }
  const allowed = new Set<string>(EVENT_RESULTS);
  for (const value of values) {
    if (!allowed.has(value)) {
      throw new UsageError(
        `Valor de --expect no reconocido: ${JSON.stringify(value)}. ` +
          `Valores válidos: ${EVENT_RESULTS.join(', ')}.`,
      );
    }
  }
  return values as EventResult[];
}

function parseUidBytes(raw: string): CardUidBytes {
  if (raw === '4') {
    return 4;
  }
  if (raw === '7') {
    return 7;
  }
  throw new UsageError(
    `La opción --bytes solo admite 4 o 7 (UID de 4 o 7 bytes); se recibió ${JSON.stringify(raw)}.`,
  );
}

/** Valores por defecto de `--count` y `--delay`, distintos según el comando. */
const COMMAND_DEFAULTS: Record<CliCommand, { count: number; delayMs: number }> = {
  enviar: { count: 1, delayMs: 0 },
  repetir: { count: 3, delayMs: 0 },
  rafaga: { count: 5, delayMs: 500 },
  reintentar: { count: 1, delayMs: 0 },
  enrolar: { count: 1, delayMs: 0 },
};

/** Comandos que exigen `--uid`: se está probando un carnet concreto, no uno cualquiera. */
const COMMANDS_REQUIRING_UID = new Set<CliCommand>(['enviar', 'repetir', 'reintentar']);

function isCliCommand(value: string): value is CliCommand {
  return (CLI_COMMANDS as readonly string[]).includes(value);
}

export interface ParseArgsEnvironment {
  readonly SIM_URL?: string | undefined;
  readonly SIM_DEVICE?: string | undefined;
  readonly SIM_KEY?: string | undefined;
}

/** Analiza `argv` (sin `node` ni el nombre del script) y el entorno. */
export function parseArgs(argv: readonly string[], env: ParseArgsEnvironment = {}): ParsedArgs {
  let raw: RawArgs;
  try {
    raw = tokenize(argv);
  } catch (error) {
    return { kind: 'usage-error', message: (error as Error).message };
  }

  try {
    if (raw.command === null || raw.command === 'ayuda') {
      if (raw.help || raw.command === 'ayuda' || argv.length === 0) {
        return { kind: 'help', topic: null };
      }
      throw new UsageError('Falta el comando. Usa "--help" para ver los disponibles.');
    }

    if (!isCliCommand(raw.command)) {
      throw new UsageError(
        `Comando desconocido: ${JSON.stringify(raw.command)}. ` +
          `Comandos disponibles: ${CLI_COMMANDS.join(', ')}.`,
      );
    }
    const command = raw.command;

    if (raw.help) {
      return { kind: 'help', topic: command };
    }

    const flags = raw.flags;
    const apiKey = flags.get('--key') ?? env.SIM_KEY;
    if (apiKey === undefined || apiKey === '') {
      throw new UsageError(
        'Falta la credencial del dispositivo: usa "--key vad_<nombre>_<secreto>" o la variable ' +
          'de entorno SIM_KEY. La genera la web al dar de alta el dispositivo.',
      );
    }
    if (!isDeviceApiKeyShaped(apiKey)) {
      throw new UsageError(
        'La credencial no tiene la forma del contrato: vad_<nombre-del-dispositivo>_<secreto>.',
      );
    }

    const uid = flags.get('--uid');
    if (uid === undefined && COMMANDS_REQUIRING_UID.has(command)) {
      throw new UsageError(
        `El comando "${command}" necesita "--uid <hex>" (8 o 14 caracteres, con o sin separadores).`,
      );
    }
    if (uid !== undefined && command === 'rafaga') {
      throw new UsageError(
        'El comando "rafaga" genera un UID distinto por lectura, así que no admite "--uid". ' +
          'Usa "--bytes 4|7" para elegir la longitud.',
      );
    }

    const eventIdFlag = flags.get('--event-id');
    if (eventIdFlag !== undefined && command === 'rafaga') {
      throw new UsageError(
        'El comando "rafaga" genera un "eventId" por lectura, así que no admite "--event-id".',
      );
    }

    const scannedAtFlag = flags.get('--scanned-at');
    const scannedAtOffsetFlag = flags.get('--scanned-at-offset');
    if (scannedAtFlag !== undefined && scannedAtOffsetFlag !== undefined) {
      throw new UsageError(
        'Las opciones "--scanned-at" y "--scanned-at-offset" son excluyentes: la primera fija la ' +
          'hora del dispositivo y la segunda la desplaza respecto al reloj real.',
      );
    }

    const firmwareFlag = flags.get('--firmware-version');
    const expectFlag = flags.get('--expect');
    const countFlag = flags.get('--count');
    const delayFlag = flags.get('--delay');
    const timeoutFlag = flags.get('--timeout');
    const defaults = COMMAND_DEFAULTS[command];

    // `reintentar` también envía una sola lectura (la reintenta, que es otra cosa): aceptar
    // `--count` ahí lo ignoraba en silencio y encima rotulaba la salida como una serie de N.
    if (
      countFlag !== undefined &&
      (command === 'enviar' || command === 'enrolar' || command === 'reintentar')
    ) {
      throw new UsageError(
        `El comando "${command}" envía una sola lectura; usa "repetir" o "rafaga" para varias.`,
      );
    }

    if (delayFlag !== undefined && command !== 'repetir' && command !== 'rafaga') {
      throw new UsageError(`La opción --delay solo aplica a "repetir" y "rafaga".`);
    }

    if (raw.concurrent && command !== 'repetir' && command !== 'rafaga') {
      throw new UsageError(`La opción --concurrentes solo aplica a "repetir" y "rafaga".`);
    }

    if (raw.concurrent && delayFlag !== undefined) {
      throw new UsageError(
        `--concurrentes y --delay se contradicen: o las lecturas salen a la vez, o espaciadas.`,
      );
    }

    const maxAttemptsFlag = flags.get('--max-attempts');
    const backoffFlag = flags.get('--backoff');
    const bytesFlag = flags.get('--bytes');
    // El comando `reintentar` existe para ver la escalera de backoff, así que corta antes.
    const defaultTimeoutMs = command === 'reintentar' ? RETRY_DEMO_TIMEOUT_MS : DEFAULT_TIMEOUT_MS;

    const options: CliOptions = {
      command,
      baseUrl: flags.get('--url') ?? env.SIM_URL ?? DEFAULT_BASE_URL,
      apiKey,
      deviceId: flags.get('--device') ?? env.SIM_DEVICE,
      timeoutMs:
        timeoutFlag === undefined ? defaultTimeoutMs : requirePositiveInt('--timeout', timeoutFlag),
      maxAttempts:
        maxAttemptsFlag === undefined
          ? DEFAULT_MAX_ATTEMPTS
          : requirePositiveInt('--max-attempts', maxAttemptsFlag),
      initialBackoffMs:
        backoffFlag === undefined
          ? DEFAULT_INITIAL_BACKOFF_MS
          : requireNonNegativeInt('--backoff', backoffFlag),
      json: raw.json,
      cardUid: uid,
      cardUidBytes: bytesFlag === undefined ? 4 : parseUidBytes(bytesFlag),
      eventId: eventIdFlag,
      scannedAt:
        scannedAtFlag === undefined ? undefined : scannedAtFlag === 'null' ? null : scannedAtFlag,
      scannedAtOffsetMs:
        scannedAtOffsetFlag === undefined ? undefined : parseDurationMs(scannedAtOffsetFlag),
      firmwareVersion:
        firmwareFlag === undefined ? undefined : firmwareFlag === 'null' ? null : firmwareFlag,
      expect: expectFlag === undefined ? undefined : parseExpected(expectFlag),
      count: countFlag === undefined ? defaults.count : requirePositiveInt('--count', countFlag),
      delayMs:
        delayFlag === undefined ? defaults.delayMs : requireNonNegativeInt('--delay', delayFlag),
      concurrent: raw.concurrent,
    };

    return { kind: 'options', options };
  } catch (error) {
    return { kind: 'usage-error', message: (error as Error).message };
  }
}
