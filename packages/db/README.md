# @va/db

Esquema Drizzle, migraciones SQL versionadas, cliente de PostgreSQL y utilidades de base de datos
para desarrollo. Es la única puerta de entrada a la base: `apps/web` importa este paquete y nadie
más habla con PostgreSQL directamente.

- Modelo de datos: [`docs/data-model.md`](../../docs/data-model.md) — este paquete lo implementa
  literalmente.
- Reglas de importación: [`docs/architecture.md`](../../docs/architecture.md) §2. `@va/db` importa
  `@va/shared` **solo como tipos** y nunca importa `apps/*` ni `tools/*`.
- Propiedad del archivo: `src/schema.ts` y `migrations/` tienen dueño único
  ([`docs/agent-playbook.md`](../../docs/agent-playbook.md) §3). Tras la fase de fundaciones solo la
  lane W4 puede tocarlos, y siempre con una migración nueva; jamás editando una ya mergeada.

## Comandos

Todos existen también en la raíz del repositorio (`pnpm db:up`, `pnpm db:migrate`, …).

| Comando            | Qué hace                                                                |
| ------------------ | ----------------------------------------------------------------------- |
| `pnpm db:up`       | Inicializa (si hace falta) y arranca el PostgreSQL 17 local             |
| `pnpm db:down`     | Detiene el PostgreSQL local                                             |
| `pnpm db:status`   | Informa si el PostgreSQL local está corriendo                           |
| `pnpm db:migrate`  | Aplica las migraciones pendientes sobre `DATABASE_URL`                  |
| `pnpm db:seed`     | Siembra datos de desarrollo (idempotente)                               |
| `pnpm db:reset`    | Borra el directorio de datos y rehace todo: arrancar → migrar → sembrar |
| `pnpm db:generate` | Regenera la migración SQL a partir de los cambios de `src/schema.ts`    |

## Base de datos local: PostgreSQL 17 embebido (sin Docker)

La máquina de desarrollo del proyecto **no tiene Docker, ni el CLI de Supabase, ni PostgreSQL
instalado**, y no se puede instalar nada que requiera privilegios de administrador. La solución
adoptada es el paquete npm [`embedded-postgres`](https://www.npmjs.com/package/embedded-postgres),
que publica los **binarios reales de PostgreSQL** por plataforma. Se fija la serie **17.10** para
tener paridad de versión mayor con Supabase (PostgreSQL 17).

`scripts/pg.mjs` no usa la API de Node de `embedded-postgres`: esa API deja el servidor colgando de
un proceso hijo que muere al terminar el proceso de Node. En su lugar resuelve los binarios de
`@embedded-postgres/<plataforma>` y maneja el servidor con **`pg_ctl`**, que lo arranca como proceso
independiente. Así `pnpm db:up` devuelve el control a la terminal y la base sigue en pie.

El directorio de datos vive en `.pgdata/` en la raíz del repositorio (ignorado por git), junto con
`postgres.log` y `pg_ctl.log` para diagnóstico.

> **pnpm bloquea los postinstall por defecto.** Los paquetes `@embedded-postgres/*` están
> autorizados en el campo `allowBuilds` de `pnpm-workspace.yaml` (en pnpm 11 este campo sustituye a
> `onlyBuiltDependencies`). Sin esa autorización el postinstall no corre y los binarios quedan sin
> hidratar.

### Parámetros de conexión

```
postgres://postgres:postgres@127.0.0.1:54322/postgres
```

Puerto **54322**, usuario/clave `postgres`/`postgres`, base `postgres`: exactamente los mismos
valores que expone `supabase start`.

### Alternativa soportada: `supabase start`

Si algún día el CLI de Supabase está disponible en la máquina (requiere Docker), es una alternativa
**intercambiable sin tocar una línea de código**: levanta un PostgreSQL en el mismo puerto con las
mismas credenciales, así que basta con usarlo en vez de `pnpm db:up`. Es incluso preferible cuando
se quiera probar Supabase Auth o Realtime en local, que el PostgreSQL embebido no incluye.

En **CI no se usa nada de esto**: el flujo de trabajo levanta un servicio `postgres:17` y define
`DATABASE_URL` apuntando a él.

## Migraciones

Las migraciones son SQL plano en `migrations/`, versionadas y aplicadas en orden por
`src/migrate.ts` (runner de Drizzle, registra lo aplicado en `drizzle.__drizzle_migrations`).

- `0000_esquema_inicial.sql` — generada con `drizzle-kit generate` a partir de `src/schema.ts`:
  las 12 tablas del MVP con sus enums, defaults, claves foráneas, CHECKs e índices.
- `0001_rls_deny_all.sql` — **escrita a mano**: activa Row Level Security en todas las tablas y no
  declara ninguna policy. Con RLS activado y cero policies, los roles `anon` y `authenticated` de
  Supabase no pueden leer ni escribir nada; el servidor entra con la conexión directa de
  `DATABASE_URL` y hace la autorización por rol en código.

Para cambiar el esquema: editar `src/schema.ts` → `pnpm db:generate` → revisar el SQL generado →
commitear esquema y migración juntos. Si la migración nueva añade tablas, hay que activarles RLS en
una migración propia (`src/schema.test.ts` falla si alguna tabla se queda sin RLS).

## Datos de desarrollo

`pnpm db:seed` crea 1 administrador, 1 profesor, 1 materia, 1 grupo con ventana de sesión de 60
minutos (RN2), su horario semanal, 8 estudiantes con carnet activo e inscripción, y 1 dispositivo.

De la API key del dispositivo la base guarda **solo el hash SHA-256**; la key en claro
(`vad_<nombre>_<secreto>`, según el contrato v1) se imprime **una sola vez** al crearla. Si se
pierde, `pnpm db:reset` genera una nueva.

El seed es idempotente: repetirlo no duplica nada ni vuelve a mostrar la key.
