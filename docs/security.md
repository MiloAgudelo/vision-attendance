# Seguridad del MVP

Checklist de la revisión W6 (`docs/agent-playbook.md` §4). No sustituye el alcance normativo
(`docs/alcance-v2.md` §15); resume lo que el código garantiza hoy.

## RLS deny-all

- Migración `packages/db/migrations/0001_rls_deny_all.sql`: `ENABLE ROW LEVEL SECURITY` en las 12
  tablas, **sin** `CREATE POLICY`.
- El servidor usa `DATABASE_URL` (rol dueño / Drizzle). Los roles de Supabase `anon` y
  `authenticated` no pueden leer ni escribir filas.
- Pruebas: `packages/db/src/schema.test.ts` (SQL de migraciones) y `e2e/src/seguridad.e2e.test.ts`
  (estado en vivo: filas invisibles + INSERT denegado a un rol sin `BYPASSRLS`).

## Secretos

| Secreto                         | Dónde vive                         | Regla                                      |
| ------------------------------- | ---------------------------------- | ------------------------------------------ |
| `DATABASE_URL`                  | `.env` (no versionado)             | Solo servidor                              |
| `SUPABASE_SERVICE_ROLE_KEY`     | `.env`                             | Nunca `NEXT_PUBLIC_*`                      |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `…_PUBLISHABLE_KEY` | `.env` / cliente Auth | Solo Auth; RLS deny-all bloquea datos |

| API key del dispositivo         | Hash SHA-256 en `devices.api_key_hash` | En claro solo al emitir / firmware `secrets.h` |
| `firmware/**/secrets.h`         | Local del firmware                 | En `.gitignore` desde F1                   |

Plantilla: [`.env.example`](../.env.example). Los agentes no crean proyectos cloud ni rotan keys.

## Rate-limit del endpoint de eventos

- `POST /api/v1/events` aplica un cupo **por dispositivo autenticado** tras validar la Bearer key
  (`apps/web/src/server/events/rate-limit.ts`).
- Respuesta del contrato: `429` / `rate_limited` (reintentable con backoff).
- Variables (opcionales):

  | Variable                       | Default | Significado                                      |
  | ------------------------------ | ------- | ------------------------------------------------ |
  | `EVENTS_RATE_LIMIT`            | `120`   | Máximo de solicitudes por dispositivo y ventana  |
  | `EVENTS_RATE_LIMIT_WINDOW_MS`  | `60000` | Ventana deslizante en ms                         |

  `EVENTS_RATE_LIMIT=0` desactiva el límite (útil en pruebas de carga locales).

- Es un contador en memoria del proceso: suficiente para el piloto de un lector; no se comparte entre
  réplicas.
