# Arquitectura — vision-attendance

Fuentes: `docs/alcance-v2.md` (alcance aprobado), `docs/adr/0001-database-supabase-postgres.md`.

## 1. Vista lógica

```
┌────────────┐     ┌───────────────┐      HTTPS      ┌─────────────────────────────────┐
│  ESP32 +   │     │  Simulador    │  POST /api/v1/  │  apps/web (Next.js, App Router) │
│  RC522     │────▶│  (CLI, mismo  │────  events ───▶│                                 │
│ (paralelo) │     │   contrato)   │                 │  ┌──────────────────────────┐   │
└────────────┘     └───────────────┘                 │  │ Route Handlers (API)     │   │
                                                     │  │  /api/v1/events (device) │   │
        Navegador (admin, profesor)                  │  │  server actions (web)    │   │
        ───────── HTTPS ────────────────────────────▶│  └──────────┬───────────────┘   │
                                                     │  ┌──────────▼───────────────┐   │
                                                     │  │ Dominio (attendance      │   │
                                                     │  │ engine, enrolamiento,    │   │
                                                     │  │ sesiones RN1–RN11)       │   │
                                                     │  └──────────┬───────────────┘   │
                                                     └─────────────┼───────────────────┘
                                                           packages/db (Drizzle)
                                                                   │
                                                     ┌─────────────▼───────────────┐
                                                     │  Supabase: Postgres + Auth  │
                                                     └─────────────────────────────┘
```

No hay API separada ni microservicios: los Route Handlers de Next.js cubren el MVP. El firmware es un track paralelo que consume el mismo endpoint que el simulador.

## 2. Estructura del monorepo (pnpm workspaces)

```
vision-attendance/
├── apps/
│   └── web/                  # Next.js (UI en español + API). Importa @va/db y @va/shared.
├── packages/
│   ├── db/                   # @va/db — esquema Drizzle, migraciones SQL, cliente. Importa @va/shared (solo tipos).
│   └── shared/               # @va/shared — tipos de dominio, esquemas Zod, contrato del dispositivo. Paquete hoja: no importa nada del workspace.
├── tools/
│   └── simulator/            # @va/simulator — CLI. Importa SOLO @va/shared (es un cliente externo de la API, como el ESP32).
├── firmware/                 # ESP32 + RC522 (PlatformIO). Fuera del grafo de pnpm. Track paralelo.
├── docs/                     # Alcance, ADRs, arquitectura, contrato, playbook.
├── .github/workflows/        # CI.
├── package.json              # Raíz. Propiedad única (ver playbook).
└── pnpm-workspace.yaml
```

**Paquetes deliberadamente NO creados** (se crean cuando exista un segundo consumidor real): `ui`, `config`, `auth`, `apps/api`. Código en inglés; textos de UI en español.

### Reglas de importación

| Módulo | Puede importar | Prohibido |
|---|---|---|
| `apps/web` | `@va/db`, `@va/shared` | `@va/simulator` |
| `packages/db` | `@va/shared` | `apps/*`, `tools/*` |
| `packages/shared` | — (hoja) | todo el workspace |
| `tools/simulator` | `@va/shared` | `@va/db`, `apps/*` (nunca toca la BD directamente) |

## 3. Componentes y responsabilidades

- **`apps/web` — capa API (device):** `POST /api/v1/events`. Autentica el dispositivo (Bearer key → hash), aplica idempotencia, delega al dominio, persiste el evento SIEMPRE (RN1). Validación de entrada con Zod desde `@va/shared`.
- **`apps/web` — dominio:** módulo `src/server/` puro-TypeScript con la lógica de negocio (resolución de carnet, ventana de sesión, creación perezosa de sesión, unicidad de asistencia, correcciones + auditoría). Testeable sin HTTP.
- **`apps/web` — UI:** panel admin (estudiantes, carnets/enrolamiento, materia, grupo, inscripciones, horarios, dispositivos, correcciones) y vista de sesión en vivo (polling cada 3–5 s). Autenticación Supabase Auth (`@supabase/ssr`); autorización por rol en el servidor.
- **`packages/db`:** esquema Drizzle (fuente de verdad del modelo), migraciones generadas con drizzle-kit, cliente exportado. Ver `docs/data-model.md`.
- **`packages/shared`:** tipos + Zod del contrato del dispositivo (`docs/device-contract.md`) y enums de dominio. Es el contrato entre web, simulador y (futuro) firmware.
- **`tools/simulator`:** CLI que envía eventos reales a la API: UID arbitrario, `eventId` repetible, timestamps alterables, ráfagas, reintentos, modo enrolamiento. Sirve como cliente en pruebas de integración.

## 4. Decisiones arquitectónicas

1. **Route Handlers de Next.js, no API separada.** Suficiente para 1 dispositivo + panel; separar sería costo sin beneficio. (Reversible: el dominio en `src/server/` no depende de Next.)
2. **Drizzle ORM + drizzle-kit.** Esquema en TypeScript (un solo archivo propiedad de la lane de datos), migraciones SQL versionadas, sin binarios de motor, buen encaje con Supabase. Alternativa descartada: Prisma (válida; Drizzle es más liviano y las migraciones son SQL plano legible por agentes).
3. **Acceso a datos solo desde el servidor.** El navegador nunca usa la anon key para datos: RLS activado en modo deny-all en todas las tablas; el servidor usa `DATABASE_URL` directa (Drizzle) y la service-role solo si hiciera falta la API de Supabase. Autorización por rol en código de servidor.
4. **Vista en vivo por polling** (≤5 s). Supabase Realtime es la mejora directa si se necesita; no se diseña nada especial para permitirla — ya es compatible.
5. **Hora del servidor como verdad (RN8); horarios en `America/Bogota`, timestamps en UTC (RN10).** Conversión con una librería tz en el dominio; prohibido `new Date()` sobre strings sin zona.
6. **Simulador como CLI** y no página web: usable en pruebas automáticas y por agentes, cero superficie de UI extra. Una página interna podrá añadirse en fase 2 si se quiere demo visual.
7. **Credencial de dispositivo:** `vad_<deviceId>_<secreto>`; se almacena solo el hash SHA-256. Revocación = cambiar `status` del dispositivo.

## 5. Flujos de datos

**Ingesta de evento:** dispositivo/simulador → `POST /api/v1/events` → auth dispositivo → rate-limit
por dispositivo (429 `rate_limited`) → ¿`(device_id, event_id)` ya existe? → sí: devolver respuesta
almacenada (RN7) → no: resolver carnet → **insertar `rfid_events` (siempre, RN1)** → buscar/crear
sesión en ventana (RN2/RN3) → verificar inscripción → insertar asistencia si no existe (RN6) →
actualizar el evento con resultado y respuesta → responder.

**Enrolamiento:** dispositivo en modo `enrollment` → UID desconocido → evento `enrollment_captured` → la web lista UIDs capturados sin asignar → admin crea estudiante o asocia a existente → se crea `cards`.

**Vista en vivo:** página de sesión → fetch del roster cada 3–5 s → presentes (asistencias con hora) + ausentes (inscritos − presentes, calculado en SQL).

**Corrección:** admin marca presente/ausente con motivo → transacción: upsert/update asistencia + insert en `attendance_corrections`.

## 6. Riesgos arquitectónicos

| Riesgo | Mitigación |
|---|---|
| Lógica de dominio filtrándose a componentes React | Regla dura: mutaciones solo vía server actions/route handlers que llaman a `src/server/` |
| Migraciones concurrentes de varios agentes | Propiedad única del esquema (playbook §3); el esquema MVP completo nace en la fase de fundaciones |
| Diferencias local/Supabase | Desarrollo contra `supabase start` (Postgres local idéntico); CI con Postgres efímero |
| Deriva del contrato entre simulador y API | Ambos importan los mismos Zod de `@va/shared`; test de contrato en CI |
| Polling costoso con muchas sesiones | Irrelevante en el piloto (1 grupo); Realtime como salida |
