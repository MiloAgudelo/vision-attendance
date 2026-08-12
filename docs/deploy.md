# Despliegue — Vercel + Supabase

Runbook para el **humano** responsable del piloto. Los agentes **no** crean proyectos cloud ni
escriben secretos reales (`docs/agent-playbook.md` §5).

Stack de producción alineado con `docs/architecture.md` y ADR
[`0001-database-supabase-postgres.md`](adr/0001-database-supabase-postgres.md):

| Pieza        | Proveedor                         | Rol                                                                 |
| ------------ | --------------------------------- | ------------------------------------------------------------------- |
| App web + API | Vercel (Next.js 16)              | UI, Auth SSR, `POST /api/v1/events`, dominio en `apps/web/src/server` |
| Postgres 17  | Supabase                          | Datos; acceso solo con `DATABASE_URL` (Drizzle)                     |
| Auth         | Supabase Auth                     | Sesión de admin/profesor; rol en `public.users`                     |

No se usan Storage, Edge Functions ni Realtime en el MVP.

## 1. Proyecto Supabase

1. Crea un proyecto en [supabase.com](https://supabase.com) (tier gratuito vale para el piloto).
2. Anota, desde **Project Settings → API / Database**:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon / publishable key** → `NEXT_PUBLIC_SUPABASE_ANON_KEY` (o
     `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`)
   - **service_role** → `SUPABASE_SERVICE_ROLE_KEY` (solo si hace falta API admin de Auth; **nunca**
     en el cliente ni en `NEXT_PUBLIC_*`)
   - **Connection string** (modo URI) → `DATABASE_URL`
3. Preferencias de conexión:
   - Migraciones y `pnpm db:seed` / scripts: cadena **directa** (puerto `5432`) cuando esté
     disponible.
   - La app en Vercel puede usar el **pooler** (Supabase lo recomienda en serverless). El cliente
     Drizzle ya desactiva prepared statements (`prepare: false`) para encajar con el pooler en modo
     transacción.

## 2. Esquema (migraciones)

Desde un clone local, con `DATABASE_URL` apuntando al Postgres de Supabase:

```bash
cp .env.example .env   # rellena DATABASE_URL remoto
pnpm install
pnpm db:migrate
```

Eso aplica `packages/db/migrations/` (esquema + RLS deny-all). Comprueba con el health de la app
después del deploy: `GET /api/health` → `{"ok":true,"db":"up"}`.

**No** uses el seed de desarrollo (`pnpm db:seed`) contra producción: crea usuarios locales con UUID
aleatorio que **no** coinciden con `auth.users`, y publica una API key de dispositivo de demo.

## 3. Cuentas web (Auth + `public.users`)

El id de `public.users` **debe ser** el mismo UUID que `auth.users.id`
(`docs/data-model.md`, `getCurrentUser()`).

1. En Supabase → **Authentication → Users**: crea el admin (y el profesor si aplica) con email y
   contraseña.
2. Copia el UUID de cada usuario.
3. Inserta la fila de dominio (SQL editor o cliente), por ejemplo:

```sql
insert into public.users (id, email, full_name, role, status)
values
  ('<uuid-auth-admin>', 'admin@institucion.edu', 'Admin piloto', 'admin', 'active'),
  ('<uuid-auth-profesor>', 'profesor@institucion.edu', 'Profesor piloto', 'teacher', 'active');
```

Sin esa fila (o con `status = 'inactive'`), el login de Auth no abre la aplicación.

## 4. Datos del piloto

Carga mínima recomendada (panel admin o SQL), en este orden:

1. Materia → grupo (con `teacher_id` del profesor) → horario(s) en `America/Bogota`.
2. Estudiantes → carnets (UID hex) → inscripciones.
3. Dispositivo: créalo en la UI admin; **guarda la API key en claro** (`vad_…`) solo en el momento
   de emisión (va hasheada en `devices`). Configúrala en el firmware (`secrets.h`, fuera del repo) o
   en el simulador (`SIM_KEY`).

## 5. Proyecto Vercel

1. Importa el repositorio en Vercel (framework **Next.js**).
2. **Root Directory:** `apps/web`.
3. Activa la opción de incluir archivos fuera del Root Directory (monorepo).
4. Overrides sugeridos:

   | Campo           | Valor                                                                 |
   | --------------- | --------------------------------------------------------------------- |
   | Install Command | `cd ../.. && pnpm install`                                            |
   | Build Command   | `cd ../.. && pnpm --filter @va/shared --filter @va/db --filter @va/web run build` |
   | Node.js         | **22** (ver `engines` del `package.json` raíz)                        |

5. Variables de entorno del proyecto (Production / Preview):

   | Variable                         | Notas                                              |
   | -------------------------------- | -------------------------------------------------- |
   | `DATABASE_URL`                   | Postgres de Supabase (pooler OK)                   |
   | `NEXT_PUBLIC_SUPABASE_URL`       | Project URL                                        |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY`  | o `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`           |
   | `TZ`                             | `America/Bogota`                                   |
   | `EVENTS_RATE_LIMIT`              | opcional; default `120` (ver `docs/security.md`)   |
   | `EVENTS_RATE_LIMIT_WINDOW_MS`    | opcional; default `60000`                          |
   | `SUPABASE_SERVICE_ROLE_KEY`      | solo si la necesitas en servidor; no es obligatoria hoy |

6. Deploy. URL pública de la app: `https://<proyecto>.vercel.app` (o dominio propio).

## 6. Dispositivos y simulador contra producción

El contrato no cambia: `POST https://<host>/api/v1/events` con `Authorization: Bearer <api-key>`.

```bash
export SIM_URL=https://<host>
export SIM_KEY=vad_<deviceId>_<secreto>
pnpm --filter @va/simulator sim -- enviar --uid A1B2C3D4 --expect registered
```

Comprueba también la vista en vivo (`/sessions`) tras un escaneo dentro de la ventana de clase.

## 7. Checklist post-deploy

- [ ] `GET /api/health` → base arriba.
- [ ] Login admin y profesor; el profesor no entra al panel administrativo.
- [ ] Un evento del simulador deja fila en `rfid_events` (RN1) y, en ventana, asistencia.
- [ ] Reintento con el mismo `eventId` → respuesta idéntica (RN7).
- [ ] RLS: el cliente anon no lee tablas (deny-all; ver `docs/security.md`).
- [ ] La API key del dispositivo no está en el repo ni en logs de Vercel.

## 8. Límites y riesgos del piloto

- Tier gratuito de Supabase puede **pausar** proyectos inactivos (~1 semana).
- El rate-limit es **por proceso** en memoria: en varias réplicas de Vercel el cupo no es global.
- No hay provisión automática de Auth ↔ `public.users`; es un paso manual (o script futuro).
- El firmware ESP32 es track paralelo; el piloto de software se valida con el simulador.
