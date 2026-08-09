/** Texto de ayuda de la CLI, en español. */

import { EVENT_RESULTS } from '@va/shared';

import { DEFAULT_BASE_URL, DEFAULT_MAX_ATTEMPTS, DEFAULT_TIMEOUT_MS } from '../client.js';
import { RETRY_DEMO_TIMEOUT_MS, type CliCommand } from './args.js';

const INVOCATION = 'pnpm --filter @va/simulator sim --';

const COMMON_OPTIONS = `Opciones comunes
  --url <url>              Base del servidor (por defecto ${DEFAULT_BASE_URL}; o SIM_URL).
  --key <credencial>       Credencial del dispositivo: vad_<nombre>_<secreto> (o SIM_KEY).
  --device <nombre>        Nombre del dispositivo en el cuerpo. Por defecto, el de la credencial
                           (o SIM_DEVICE). Cámbialo para provocar un 403 device_mismatch.
  --timeout <ms>           Tiempo límite por intento (por defecto ${DEFAULT_TIMEOUT_MS}).
  --max-attempts <n>       Intentos por lectura, contando el primero (por defecto ${DEFAULT_MAX_ATTEMPTS}).
  --backoff <ms>           Espera antes del 2.º intento; luego se duplica (por defecto 1000).
  --expect <result[,…]>    Códigos de salida: 0 solo si el "result" está en la lista.
                           Valores: ${EVENT_RESULTS.join(', ')}.
  --json                   Imprime el resultado como un único JSON, para usarlo en scripts.
  --help, -h               Muestra esta ayuda (o la del comando indicado).

Opciones de la lectura
  --uid <hex>              UID del carnet, 8 o 14 dígitos hexadecimales. Admite separadores
                           (a1:b2-c3 d4) y minúsculas: se normalizan.
  --bytes <4|7>            Longitud del UID cuando lo genera el simulador (rafaga, enrolar).
  --event-id <uuid>        Reutiliza un "eventId" concreto en vez de generar uno nuevo.
  --scanned-at <iso|null>  Hora del dispositivo, ISO-8601 con offset, o "null" si no tiene reloj.
  --scanned-at-offset <d>  Desplaza la hora del dispositivo respecto al reloj real: -3h, 90m,
                           1h30m, 250ms. Sirve para comprobar RN8 (la hora oficial la pone el
                           servidor). Excluyente con --scanned-at.
  --firmware-version <v>   Versión de firmware informada; "null" para omitirla.

Códigos de salida
  0   respuesta procesada (y con el "result" esperado, si se usó --expect)
  1   el servidor respondió un error del contrato (ok: false)
  2   el "result" no es el esperado
  3   el servidor respondió algo que no cumple el contrato v1
  4   no hubo respuesta tras agotar los reintentos, o la lectura era inválida
  64  argumentos mal usados`;

const COMMAND_HELP: Record<CliCommand, string> = {
  enviar: `Uso: ${INVOCATION} enviar --uid <hex> [opciones]

Envía UNA lectura, igual que haría el ESP32 al acercarse un carnet. Si el servidor no responde,
reintenta con backoff exponencial reutilizando el mismo "eventId" (RN7).

Ejemplos
  ${INVOCATION} enviar --uid A1B2C3D4 --key vad_LAB-01_…
  ${INVOCATION} enviar --uid a1:b2:c3:d4 --scanned-at-offset -3h --expect registered
  ${INVOCATION} enviar --uid A1B2C3D4 --scanned-at null   # dispositivo sin reloj fiable`,

  repetir: `Uso: ${INVOCATION} repetir --uid <hex> [--count <n>] [--delay <ms>] [--concurrentes] [opciones]

Envía la MISMA lectura (mismo "eventId") varias veces: la prueba de idempotencia de RN7. El
servidor debe devolver la respuesta original almacenada, IDÉNTICA, y no duplicar la asistencia.
El simulador compara las respuestas entre sí y falla si alguna difiere de la primera.
Por defecto --count 3.

  --delay <ms>      Espera entre reenvíos consecutivos.
  --concurrentes    Lanza los reenvíos a la vez, para provocar la carrera de dos peticiones con el
                    mismo "eventId" llegando simultáneamente. Incompatible con --delay.

Ejemplos
  ${INVOCATION} repetir --uid A1B2C3D4 --count 3 --expect registered
  ${INVOCATION} repetir --uid A1B2C3D4 --count 5 --concurrentes`,

  rafaga: `Uso: ${INVOCATION} rafaga [--count <n>] [--delay <ms>] [--concurrentes] [opciones]

Envía N lecturas DISTINTAS (UID y "eventId" nuevos en cada una) con un retardo entre ellas, como
una fila de estudiantes entrando a clase. Por defecto --count 5 --delay 500.
No admite --uid ni --event-id.

  --concurrentes    Lanza las N lecturas a la vez, para poner a prueba la creación perezosa de la
                    sesión bajo concurrencia. Incompatible con --delay.

Ejemplos
  ${INVOCATION} rafaga --count 10 --delay 200 --bytes 7
  ${INVOCATION} rafaga --count 10 --concurrentes`,

  reintentar: `Uso: ${INVOCATION} reintentar --uid <hex> [opciones]

Igual que "enviar", pero con un tiempo límite corto por defecto (${RETRY_DEMO_TIMEOUT_MS} ms) para
provocar el timeout y ver la escalera de reintentos: 1 s, 2 s, 4 s, 8 s, hasta ${DEFAULT_MAX_ATTEMPTS}
intentos, SIEMPRE con el mismo "eventId". Apúntalo a un servidor apagado o lento para verlo.

Ejemplo
  ${INVOCATION} reintentar --uid A1B2C3D4 --url http://localhost:9 --backoff 100`,

  enrolar: `Uso: ${INVOCATION} enrolar [--uid <hex>] [opciones]

Envía un UID nuevo (aleatorio si no se indica) para el flujo de enrolamiento. Con el dispositivo
en modo enrolamiento el resultado esperado es "enrollment_captured"; en modo normal, "unknown_card".

Ejemplo
  ${INVOCATION} enrolar --expect enrollment_captured`,
};

const GENERAL_HELP = `Simulador de dispositivo RFID — contrato v1 (docs/device-contract.md)

Cliente externo de la API, igual que el firmware ESP32: envía lecturas a POST /api/v1/events y
valida petición y respuesta con los esquemas de @va/shared. Nunca toca la base de datos.

Uso: ${INVOCATION} <comando> [opciones]

Comandos
  enviar        Envía una lectura.
  repetir       Reenvía la misma lectura N veces (idempotencia, RN7).
  rafaga        Envía N lecturas distintas con retardo entre ellas.
  reintentar    Fuerza el timeout para ver el backoff exponencial con el mismo "eventId".
  enrolar       Envía un UID nuevo para el flujo de enrolamiento.

${COMMON_OPTIONS}

Ayuda de un comando: ${INVOCATION} <comando> --help`;

/** Devuelve la ayuda general o la de un comando concreto. */
export function helpText(topic: CliCommand | null): string {
  if (topic === null) {
    return GENERAL_HELP;
  }
  return `${COMMAND_HELP[topic]}\n\n${COMMON_OPTIONS}`;
}
