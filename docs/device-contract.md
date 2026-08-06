# Contrato de integración de dispositivos — v1

Contrato único para el **simulador** (MVP) y el **firmware ESP32** (track paralelo). Los esquemas Zod que lo implementan viven en `packages/shared/src/contracts/device.ts` y son la fuente de verdad ejecutable; este documento es su especificación. Cambios de contrato = PR que toca `@va/shared` + este doc (propiedad única, ver playbook).

## Endpoint

```
POST /api/v1/events
Host: <despliegue> | http://localhost:3000
Content-Type: application/json
Authorization: Bearer vad_<deviceName>_<secreto>
```

- La credencial identifica y autentica al dispositivo (se valida contra `api_key_hash`). El `deviceId` del cuerpo debe coincidir con la credencial; si no, 403.
- El **UID del carnet no es credencial ni secreto** (RN11).

## Cuerpo de la solicitud

```json
{
  "contractVersion": 1,
  "deviceId": "LAB-DESARROLLO-01",
  "eventId": "5f3a2c9e-8d41-4b7a-9c1e-2a6f8e4d0b73",
  "cardUid": "A1B2C3D4",
  "scannedAt": "2026-08-10T13:05:12-05:00",
  "firmwareVersion": "0.1.0"
}
```

| Campo | Tipo | Reglas |
|---|---|---|
| contractVersion | int | `1`. Versión mayor incompatible → 400 `unsupported_contract` |
| deviceId | string | nombre del dispositivo registrado |
| eventId | string (uuid) | **generado por el dispositivo, único por lectura física**; se reutiliza el MISMO en cada reintento de esa lectura |
| cardUid | string | hex, 8 o 14 caracteres; el servidor normaliza a mayúsculas sin separadores |
| scannedAt | string ISO-8601 con offset | reloj del dispositivo; **informativo** — la hora oficial es la del servidor (RN8). Opcional: si el dispositivo no tiene hora confiable, envía `null` |
| firmwareVersion | string | opcional |

## Respuesta (HTTP 200 — evento procesado)

Toda lectura procesada responde 200, incluso cuando el resultado de negocio es negativo. El firmware decide LED/buzzer por `result`, no por el código HTTP.

```json
{
  "ok": true,
  "eventId": "5f3a2c9e-8d41-4b7a-9c1e-2a6f8e4d0b73",
  "result": "registered",
  "receivedAt": "2026-08-10T18:05:13.412Z",
  "message": "Asistencia registrada",
  "student": { "code": "202410123", "name": "Nombre Apellido" },
  "session": { "id": "…", "scheduledStart": "2026-08-10T18:00:00Z" }
}
```

`student` y `session` son `null` cuando no aplican. `message` viene en español, pensado para pantalla futura.

### Catálogo de resultados

| result | Significado | Feedback físico sugerido |
|---|---|---|
| `registered` | Asistencia creada en la sesión | LED verde + beep corto |
| `already_registered` | Ya tenía asistencia en esta sesión (RN6) | LED amarillo |
| `no_session` | Entrada registrada (RN1) pero sin sesión en ventana | LED amarillo, "Entrada registrada, sin clase activa" |
| `not_enrolled` | Entrada registrada; estudiante no inscrito en el grupo | LED amarillo |
| `unknown_card` | Carnet no asociado (modo normal) | LED rojo + beep error |
| `enrollment_captured` | Modo enrolamiento: UID capturado para asociar | LED azul/parpadeo, "Carnet capturado" |
| `error` | Error interno ya persistido | LED rojo |

## Errores HTTP

| Código | body.error | Cuándo | ¿Reintentar? |
|---|---|---|---|
| 400 | `invalid_payload` / `unsupported_contract` | cuerpo malformado | No (bug) |
| 401 | `invalid_credentials` | key ausente/incorrecta | No |
| 403 | `device_revoked` / `device_mismatch` | dispositivo revocado o deviceId≠credencial | No |
| 429 | `rate_limited` | abuso | Sí, con backoff |
| 500 | `internal_error` | fallo no persistido | Sí, mismo eventId |

```json
{ "ok": false, "error": "device_revoked", "message": "Dispositivo revocado" }
```

## Idempotencia y reintentos (RN7)

- Clave de idempotencia: `(deviceId, eventId)`. Un `eventId` ya procesado devuelve **la respuesta original almacenada**, byte-a-byte, con 200.
- Estrategia del cliente: timeout ~5 s → reintento con backoff exponencial (1 s, 2 s, 4 s… máx 5 intentos) → **siempre el mismo `eventId`**. Perder la respuesta nunca duplica asistencia.
- Eventos atrasados: aceptados en cualquier momento; la hora oficial de entrada es `received_at` del servidor. `scannedAt` queda almacenado para diagnóstico (RN8). El MVP no reconstruye asistencia retroactiva con `scannedAt` (el firmware v1 es online-only).
- Anti-replay: la idempotencia hace inocuo el replay del mismo evento; un `eventId` nuevo con datos viejos solo crea un evento más (visible en la bitácora). Suficiente para el MVP.

## Ejemplos

**Reintento (misma lectura, red intermitente):** dos POST con el mismo `eventId` → ambas respuestas idénticas, una sola asistencia.

**Carnet desconocido en modo normal:**
```json
{ "ok": true, "eventId": "…", "result": "unknown_card", "receivedAt": "…", "message": "Carnet no registrado", "student": null, "session": null }
```

**Escaneo sin clase activa (RN1 — la entrada SÍ queda registrada):**
```json
{ "ok": true, "eventId": "…", "result": "no_session", "receivedAt": "2026-08-10T23:41:02Z", "message": "Entrada registrada; no hay clase activa", "student": { "code": "202410123", "name": "…" }, "session": null }
```
