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
> [playbook de agentes](docs/agent-playbook.md).

**Estado:** fundaciones. Existen el monorepo, el contrato del dispositivo, el esquema completo de
la base de datos y el esqueleto de la aplicación web. Todavía no hay pantallas de administración,
ingesta de eventos ni vista de asistencia en vivo.

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

Para terminar la jornada, `pnpm db:down` detiene la base de datos local; el servidor sigue en pie
entre sesiones si no se detiene.

## Pruebas y verificaciones

```bash
pnpm lint         # ESLint sobre todo el repositorio
pnpm typecheck    # TypeScript en modo estricto en todos los paquetes
pnpm test         # Vitest en todos los paquetes
pnpm build        # compila @va/shared, @va/db y la aplicación Next.js
pnpm format       # aplica Prettier (pnpm format:check solo comprueba)
```

Son exactamente los pasos que corre la integración continua, que además aplica las migraciones
sobre un PostgreSQL 17 efímero.

## Estructura del monorepo

```
apps/web         @va/web    — Next.js (App Router): interfaz en español y API de dispositivos
packages/shared  @va/shared — tipos de dominio, enums y contrato del dispositivo (paquete hoja)
packages/db      @va/db     — esquema Drizzle, migraciones SQL, cliente y datos de desarrollo
tools/simulator  @va/simulator — CLI que simula el ESP32 (pendiente, lane W3)
firmware/        ESP32 + RC522 (track paralelo, fuera del grafo de pnpm)
docs/            documentación normativa
```

### Reglas de importación

| Módulo            | Puede importar         | Prohibido                               |
| ----------------- | ---------------------- | --------------------------------------- |
| `apps/web`        | `@va/db`, `@va/shared` | `@va/simulator`                         |
| `packages/db`     | `@va/shared` (tipos)   | `apps/*`, `tools/*`                     |
| `packages/shared` | — (paquete hoja)       | todo el workspace                       |
| `tools/simulator` | `@va/shared`           | `@va/db`, `apps/*` (nunca toca la base) |

El acceso a datos ocurre **solo en el servidor**: todas las tablas tienen RLS activado en modo
deny-all y ningún componente de React habla con Drizzle directamente.

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
responsable mediante `.env` (ver [`.env.example`](.env.example)).

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
