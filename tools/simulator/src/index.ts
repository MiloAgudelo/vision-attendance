/**
 * `@va/simulator` — simulador de dispositivo RFID.
 *
 * Cliente EXTERNO de la API, igual que lo será el firmware ESP32: habla HTTP contra
 * `POST /api/v1/events` y valida todo con los esquemas de `@va/shared`. No importa `@va/db` ni
 * nada de `apps/web`, y nunca toca la base de datos.
 *
 * Además de la CLI (`pnpm --filter @va/simulator sim -- …`), el paquete se usa como biblioteca:
 * W6 lo emplea como cliente en las pruebas e2e y W2/W4 pueden usarlo en integración.
 */

export {
  DeviceSimulator,
  createDeviceSimulator,
  deviceNameFromApiKey,
  maskApiKey,
  DEFAULT_BASE_URL,
  DEFAULT_INITIAL_BACKOFF_MS,
  DEFAULT_MAX_ATTEMPTS,
  DEFAULT_TIMEOUT_MS,
  type BurstOptions,
  type DeviceSimulatorOptions,
  type FetchLike,
  type SendOutcome,
  type SendReadingOptions,
} from './client.js';

export {
  buildDeviceEvent,
  newEventId,
  parseDurationMs,
  randomCardUid,
  toIsoWithOffset,
  SIMULATOR_FIRMWARE_VERSION,
  type BuildDeviceEventOptions,
  type CardUidBytes,
} from './event.js';

export {
  backoffForAttempt,
  isRetryableStatus,
  type AttemptOutcome,
  type SendAttempt,
} from './attempts.js';

export {
  ContractViolationError,
  InvalidApiKeyError,
  InvalidEventError,
  SimulatorError,
  TransportError,
  describeZodIssues,
} from './errors.js';

export { EXIT_CODES, type ExitCode } from './cli/exit-codes.js';
export { runCli, type CliDependencies } from './cli/run.js';
