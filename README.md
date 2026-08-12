# vision-attendance

Sistema de registro de asistencia mediante RFID para la **Institución Universitaria Visión de las
Américas**. Los estudiantes acercan su carnet RFID a un lector al entrar a clase y el sistema
registra la hora de entrada, la asocia a la sesión correspondiente y la muestra en vivo en una
aplicación web.

La regla central del proyecto: **toda lectura de un dispositivo autorizado deja registro de la hora
de entrada, exista o no una sesión de clase que coincida** (RN1).

> Documentación normativa en [`docs/`](docs/):
> [alcance](docs/alcance-v2.md) · [arquitectura](docs/architecture.md) ·
> [modelo de datos](docs/data-model.md) · [contrato del dispositivo](docs/device-contract.md) ·
> [seguridad](docs/security.md) · [despliegue](docs/deploy.md) ·
> [playbook de agentes](docs/agent-playbook.md).

**Estado:** MVP de software listo para piloto. Monorepo, contrato v1, esquema completo, ingesta
RFID, motor de asistencia, Auth por roles, UI de sesión en vivo, simulador, e2e y revisión de
seguridad. El firmware ESP32 es un track paralelo (gate de UID en `docs/alcance-v2.md` §18).

## Requisitos

- Node.js >= 22
- pnpm 11.18.0 (`corepack enable`, o instalación global)

**No hace falta Docker ni instalar PostgreSQL**: la base de datos local es un PostgreSQL 17
embebido que se descarga como dependencia de npm (ver [nota más abajo](#base-de-datos-local)).

## Arranque desde cero

```bash
pnpm install                 # instala y compila @va/shared y @va/db
cp .env.example .env         # en Windows: copy .env.example .env
pnpm db:up                   # arranca PostgreSQL 17 local en el puerto 54322
pnpm db:migrate              # crea el esquema
pnpm db:seed                 # carga datos de desarrollo e imprime la API key del dispositivo
pnpm dev                     # http://localhost:3000
```

Comprobación rápida: `curl http://localhost:3000/api/health` devuelve
`{"ok":true,"db":"up"}` (y `503` con `{"ok":false,"db":"down"}` si la base no responde).

Auth local: rellena `NEXT_PUBLIC_SUPABASE_URL` y la anon/publishable key en `.env` cuando conectes
un proyecto Supabase (local o remoto). Sin esas variables la app arranca, pero el login no opera.
Los usuarios de `pnpm db:seed` (`admin@vision.local`, etc.) solo existen en `public.users`; en un
proyecto Auth real el UUID de `auth.users` debe coincidir (ver [`docs/deploy.md`](docs/deploy.md)).

Simulador (tras el seed):

```bash
# PowerShell: $env:SIM_KEY = 'vad_…'  (la imprime db:seed)
pnpm --filter @va/simulator sim -- enviar --uid A1B2C3D4
```

Para terminar la jornada, `pnpm db:down` detiene la base de datos local; el servidor sigue en pie
entre sesiones si no se detiene.

## Pruebas y verificaciones

```bash
pnpm lint         # ESLint sobre todo el repositorio
pnpm typecheck    # TypeScript en modo estricto en todos los paquetes
pnpm test         # Vitest (shared, db, simulador, web, e2e)
pnpm build        # compila @va/shared, @va/db, simulador y la aplicación Next.js
pnpm format       # aplica Prettier (pnpm format:check solo comprueba)
```

Son exactamente los pasos que corre la integración continua, que además aplica las migraciones
sobre un PostgreSQL 17 efímero.

## Estructura del monorepo

```
apps/web         @va/web       — Next.js (App Router): UI en español + API de dispositivos
packages/shared  @va/shared    — tipos de dominio, enums y contrato del dispositivo (paquete hoja)
packages/db      @va/db        — esquema Drizzle, migraciones SQL, cliente y seed de desarrollo
tools/simulator  @va/simulator — CLI que simula el ESP32 contra POST /api/v1/events
e2e              @va/e2e       — flujo completo y matriz del alcance con el simulador
firmware/        ESP32 + RC522 (track paralelo, fuera del grafo de pnpm)
docs/            documentación normativa y de operación
```

### Reglas de importación

| Módulo            | Puede importar         | Prohibido                               |
| ----------------- | ---------------------- | --------------------------------------- |
| `apps/web`        | `@va/db`, `@va/shared` | `@va/simulator`                         |
| `packages/db`     | `@va/shared` (tipos)   | `apps/*`, `tools/*`                     |
| `packages/shared` | — (paquete hoja)       | todo el workspace                       |
| `tools/simulator` | `@va/shared`           | `@va/db`, `apps/*` (nunca toca la base) |

El acceso a datos ocurre **solo en el servidor**: todas las tablas tienen RLS activado en modo
deny-all y ningún componente de React habla con Drizzle directamente. Detalle en
[`docs/security.md`](docs/security.md).

Código, identificadores y esquema en **inglés**; textos de interfaz y mensajes en **español**.

## Base de datos local

`pnpm db:up` levanta un **PostgreSQL 17 real** usando los binarios que publica el paquete npm
`embedded-postgres`, manejados con `pg_ctl`. No requiere Docker, ni el CLI de Supabase, ni
privilegios de administrador, y el servidor sobrevive al cierre de la terminal.

Los parámetros de conexión son los mismos que expone `supabase start`
(`postgres://postgres:postgres@127.0.0.1:54322/postgres`), así que el día que el CLI de Supabase
esté disponible es una alternativa intercambiable sin tocar código. El detalle está en el
[README de `@va/db`](packages/db/README.md).

En producción, `DATABASE_URL` apunta al Postgres de Supabase; el proyecto remoto lo conecta el
responsable mediante variables de entorno (ver [`.env.example`](.env.example) y
[`docs/deploy.md`](docs/deploy.md)).

## Despliegue

Piloto previsto: **Vercel** (app) + **Supabase** (Postgres + Auth). Instrucciones paso a paso,
sin que el agente cree recursos cloud: [`docs/deploy.md`](docs/deploy.md).

## Scripts de la raíz

| Script             | Qué hace                                                        |
| ------------------ | --------------------------------------------------------------- |
| `pnpm dev`         | Levanta la aplicación web en modo desarrollo                    |
| `pnpm build`       | Compila todos los paquetes y la aplicación                      |
| `pnpm lint`        | ESLint sobre el repositorio                                     |
| `pnpm typecheck`   | TypeScript en modo estricto                                     |
| `pnpm test`        | Pruebas de todos los paquetes                                   |
| `pnpm db:up`       | Arranca la base de datos local                                  |
| `pnpm db:down`     | Detiene la base de datos local                                  |
| `pnpm db:status`   | Informa si la base de datos local está corriendo                |
| `pnpm db:migrate`  | Aplica las migraciones                                          |
| `pnpm db:seed`     | Carga datos de desarrollo                                       |
| `pnpm db:reset`    | Recrea la base desde cero: borrar → arrancar → migrar → sembrar |
| `pnpm db:generate` | Regenera la migración SQL tras cambiar el esquema Drizzle       |
