# @va/simulator — simulador de dispositivo RFID

CLI y cliente programático que hablan el **contrato v1** (`docs/device-contract.md`) contra
`POST /api/v1/events`. Es un **cliente externo de la API**, exactamente igual que lo será el
firmware ESP32: solo habla HTTP. No importa `@va/db`, no toca la base de datos y no importa nada de
`apps/web`; su única dependencia del monorepo es `@va/shared`, de donde saca los esquemas Zod con
los que valida **lo que envía y lo que recibe**.

Ese doble control es su valor: si el servidor devuelve algo que no cumple el contrato —cuerpo que no
valida, código HTTP que no corresponde al error declarado, `eventId` que no es el enviado— el
simulador lo dice en voz alta en vez de tragárselo.

## Uso rápido

```bash
pnpm --filter @va/simulator sim -- --help
pnpm --filter @va/simulator sim -- enviar --uid A1B2C3D4 --key vad_LAB-DESARROLLO-01_<secreto>
```

La credencial la imprime `pnpm db:seed`, y también se muestra una sola vez al dar de alta un
dispositivo desde la web. Para no repetirla en cada comando (ni dejarla en el historial del shell),
usa variables de entorno:

```bash
export SIM_KEY=vad_LAB-DESARROLLO-01_<secreto>
export SIM_URL=http://localhost:3000     # opcional, es el valor por defecto
export SIM_DEVICE=LAB-DESARROLLO-01      # opcional, se deduce de la credencial
```

En PowerShell: `$env:SIM_KEY = 'vad_LAB-DESARROLLO-01_<secreto>'`.

## Comandos

| Comando      | Qué hace                                                                        |
| ------------ | ------------------------------------------------------------------------------- |
| `enviar`     | Una lectura, como un carnet acercado al lector.                                 |
| `repetir`    | La MISMA lectura N veces (mismo `eventId`): prueba de idempotencia (RN7).       |
| `rafaga`     | N lecturas distintas con retardo entre ellas: una fila de estudiantes entrando. |
| `reintentar` | Fuerza el timeout para ver la escalera de backoff con el mismo `eventId`.       |
| `enrolar`    | Envía un UID nuevo para el flujo de enrolamiento.                               |

Ejemplos:

```bash
# lectura normal, exigiendo que quede registrada
pnpm --filter @va/simulator sim -- enviar --uid a1:b2:c3:d4 --expect registered

# idempotencia: 3 envíos del mismo eventId → 1 sola asistencia
pnpm --filter @va/simulator sim -- repetir --uid A1B2C3D4 --count 3

# 10 lecturas distintas, 200 ms entre ellas, UID de 7 bytes
pnpm --filter @va/simulator sim -- rafaga --count 10 --delay 200 --bytes 7

# reloj del dispositivo 3 horas atrasado: la hora oficial la pone el servidor (RN8)
pnpm --filter @va/simulator sim -- enviar --uid A1B2C3D4 --scanned-at-offset -3h

# dispositivo sin reloj fiable
pnpm --filter @va/simulator sim -- enviar --uid A1B2C3D4 --scanned-at null

# timeout + reintento contra un puerto muerto: 1 s, 2 s, 4 s, 8 s, siempre el mismo eventId
pnpm --filter @va/simulator sim -- reintentar --uid A1B2C3D4 --url http://127.0.0.1:3999

# enrolamiento (el dispositivo debe estar en modo `enrollment`)
pnpm --filter @va/simulator sim -- enrolar --expect enrollment_captured
```

`--help` (general o por comando) documenta todas las opciones en español.

## Códigos de salida

Pensados para usar el simulador dentro de pruebas automáticas y scripts:

| Código | Significado                                                           |
| -----: | --------------------------------------------------------------------- |
|    `0` | Respuesta procesada, y con el `result` esperado si se usó `--expect`. |
|    `1` | El servidor respondió un error del contrato (`ok: false`).            |
|    `2` | El `result` no está entre los de `--expect`.                          |
|    `3` | El servidor respondió algo que **no cumple el contrato v1**.          |
|    `4` | Sin respuesta tras agotar los reintentos, o la lectura era inválida.  |
|   `64` | Argumentos mal usados.                                                |

Con `--json` la salida es un único objeto JSON con la petición, todos los intentos, la respuesta y
el código de salida, para consumirlo desde un script.

## Como biblioteca

Es la forma en que lo usarán las pruebas e2e de W6 y, si les sirve, las de integración de W2/W4.
Todo lo que toca el exterior se inyecta, así que se puede probar sin servidor:

```ts
import { DeviceSimulator } from '@va/simulator';

const simulator = new DeviceSimulator({
  apiKey: process.env.SIM_KEY!,
  baseUrl: 'http://localhost:3000',
  // fetch, sleep y now son inyectables; por defecto usan los globales.
});

// Una lectura. Reintenta según el contrato y valida la respuesta contra @va/shared.
const outcome = await simulator.send({ cardUid: 'a1:b2:c3:d4' });
outcome.response; // DeviceEventResponse, ya tipada y validada
outcome.attempts; // bitácora de intentos, todos con el mismo eventId

// Idempotencia: mismo eventId 3 veces.
const repeated = await simulator.repeat(3, { cardUid: 'A1B2C3D4' });

// Ráfaga: UID y eventId nuevos en cada lectura.
const burst = await simulator.burst(10, { delayMs: 200 });

// Enrolamiento: UID nuevo aleatorio.
const enrolled = await simulator.enroll();
```

Errores exportados, para distinguir el fallo en una aserción:

- `InvalidEventError` — el cuerpo que se iba a enviar no cumple el contrato (no se envía nada).
- `ContractViolationError` — la respuesta del servidor no cumple el contrato.
- `TransportError` — sin respuesta tras agotar los intentos; lleva la bitácora `attempts`.
- `InvalidApiKeyError` — la credencial no tiene la forma `vad_<nombre>_<secreto>`.

También se exportan piezas sueltas útiles en pruebas: `buildDeviceEvent`, `newEventId`,
`randomCardUid`, `toIsoWithOffset`, `parseDurationMs` y `runCli`.

## Reintentos e idempotencia (RN7)

El cliente aplica la política del contrato: tiempo límite de 5 s por intento, backoff exponencial
de 1 s, 2 s, 4 s, 8 s y un máximo de 5 intentos, **siempre con el mismo `eventId`**. Se reintenta
ante fallo de red, timeout y los códigos que el contrato marca como reintentables (429 y 5xx); los
errores definitivos (400, 401, 403) se devuelven al primer intento.

## Prueba de humo real (cuando W2 esté mergeada)

`POST /api/v1/events` todavía no existe: lo construye W2 en paralelo. Las pruebas de este paquete
son unitarias, con el `fetch` inyectado. Cuando el endpoint exista, la prueba de humo es:

```bash
pnpm db:migrate && pnpm db:seed     # el seed imprime la credencial del dispositivo
pnpm dev                            # en otra terminal
export SIM_KEY=vad_LAB-DESARROLLO-01_<secreto-del-seed>

# 1. el UID del seed queda registrado
pnpm --filter @va/simulator sim -- enviar --uid <uid-del-seed> --expect registered,no_session

# 2. idempotencia: 3 envíos, 1 sola asistencia (compruébalo en la base o en la web)
pnpm --filter @va/simulator sim -- repetir --uid <uid-del-seed> --count 3

# 3. carnet desconocido
pnpm --filter @va/simulator sim -- enviar --uid FFFFFFFF --expect unknown_card

# 4. credencial inválida → 401, salida 1
pnpm --filter @va/simulator sim -- enviar --uid <uid> --key vad_LAB-DESARROLLO-01_credencial-que-no-existe
```

La prueba e2e de verdad (enrolar → escanear → en vivo → corregir → auditar) es de W6.

## Desarrollo

```bash
pnpm --filter @va/simulator test        # Vitest
pnpm --filter @va/simulator typecheck
pnpm --filter @va/simulator build       # dist/, para consumirlo como biblioteca
```
