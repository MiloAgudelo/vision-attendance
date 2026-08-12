# Handoff — vision-attendance

Estado del proyecto para continuar en otra sesión. Última actualización: **2026-08-12**
(`America/Bogota`).

## 0. Actualización de cierre — fase 5 / W6 completa

W6 estabilización quedó en `main` por historias separadas:

| PR                                                              | Historia                        | Merge en `main`                                                   |
| --------------------------------------------------------------- | ------------------------------- | ----------------------------------------------------------------- |
| [#21](https://github.com/MiloAgudelo/vision-attendance/pull/21) | e2e flujo completo              | `de5bb4f feat(e2e): añade el flujo completo con el simulador`     |
| [#22](https://github.com/MiloAgudelo/vision-attendance/pull/22) | matriz del alcance              | `81f8aa3 feat(e2e): añade la matriz del alcance con el simulador` |
| [#23](https://github.com/MiloAgudelo/vision-attendance/pull/23) | seguridad (RLS, secretos, rate) | `fea7b39 feat(web): añade rate-limit y revisión de seguridad`     |
| [#24](https://github.com/MiloAgudelo/vision-attendance/pull/24) | README + despliegue documentado | (esta PR) `docs(repo): documenta el despliegue Vercel + Supabase` |

### Entregables cerrados

- e2e con el simulador: enrolar → escanear → en vivo → corregir → auditar (`e2e/`).
- Matriz del alcance: duplicados, atrasados (`scannedAt`), dispositivo revocado, reasignación de
  carnet.
- Seguridad: RLS deny-all verificado en migraciones y en vivo; higiene de secretos;
  rate-limit básico por dispositivo en la ingesta (`docs/security.md`).
- README actualizado al estado MVP; runbook de despliegue Vercel + Supabase sin crear recursos
  cloud (`docs/deploy.md`).

### Puerta de salida W6

- Gates locales y CI de #21–#23 verdes; esta PR solo toca docs / `.env.example` / `HANDOFF.md`.
- Los agentes **no** despliegan: el humano sigue `docs/deploy.md` (Supabase + Vercel + Auth ↔
  `public.users`).

### Siguiente trabajo (fuera de W6 / opcional)

- Conectar proyecto Supabase y Vercel reales (humano).
- Firmware ESP32 (track paralelo; gate de UID en `alcance-v2.md` §18).
- Impeccable / pase visual si se instala la skill.
- Fase 2 del alcance (exportaciones, multi-grupo UI, etc.) — no comprometida en el MVP.

Los agentes no crean recursos cloud. `.claude/` es ajeno: no versionar.

---

## 0.1 Actualización de cierre — fase 4 completa (histórico)

W5 quedó mergeada por squash en `main`, en dos historias separadas (auth primero, UI después):

| PR                                                              | Lane                             | Merge en `main`                                                   |
| --------------------------------------------------------------- | -------------------------------- | ----------------------------------------------------------------- |
| [#18](https://github.com/MiloAgudelo/vision-attendance/pull/18) | W5 Auth + autorización por roles | `0a278de feat(web): añade autenticación y autorización por roles` |
| [#19](https://github.com/MiloAgudelo/vision-attendance/pull/19) | W5 UI de asistencia en vivo      | `4583929 feat(web): añade la UI de asistencia en vivo`            |

### Entregables cerrados

- Supabase Auth SSR (`@supabase/ssr`) con cookies de Next.js 16; `getCurrentUser()` valida con
  `auth.getUser()`; rol y estado se resuelven solo desde `public.users`.
- Autorización server-side: layouts y páginas reautorizan antes de consultar; Server Actions con
  guard admin; teacher redirigido fuera del panel administrativo.
- Tablero de aula: `/sessions` y `/sessions/[id]` con polling 4 s, roster presentes/ausentes
  calculados (RN5), hora de ingreso y minutos vs inicio (RN4).
- Historial por sesión (correcciones) y por estudiante; bitácora admin `/events` de `rfid_events`.
- Correcciones admin-only: `userId` derivado de `requireRole('admin')`, nunca de FormData (RN9).
- Teacher solo consulta sus grupos; sesión o estudiante ajenos → `notFound()`.
- UI en español, WCAG 2.2 AA como objetivo, dirección visual seed `4e33298b` / `operate` /
  `tablero-de-aula`. Activos oficiales en `apps/web/PRODUCT.md` y `public/`.

No hubo migraciones ni cambios en el esquema físico o el contrato v1.

### Excepciones de propiedad declaradas

- #18 tocó páginas y actions de W1/W2 para cerrar pantallas y mutaciones preexistentes por rol, y
  el lockfile raíz por dependencias SSR (autorizado por el entregable de Auth).
- #19 añadió entradas de Sesiones y Bitácora en `ADMIN_SECTIONS` y la bitácora bajo `(admin)/events`.

### Puerta de salida verificada

- `pnpm test`: **465/465** (shared 98, db 23, simulador 136, web 208).
- `pnpm lint`, `pnpm typecheck`, `pnpm build` y CI de #18/#19: verdes.
- Auth: anónimo no entra; teacher no corrige ni consulta sesión/grupo ajeno; actor de corrección
  proviene de la sesión autenticada.
- UI: roster con ausentes calculados; polling actualiza sin recarga manual (intervalo 3–5 s).
- Smoke real contra Next en `:3104` y el simulador: `/sessions` anónimo → 307 `/login`;
  `enviar` fuera de ventana de clase → `no_session` con entrada registrada (RN1).
- Impeccable no estuvo disponible; detector/capturas/revisión visual fresca quedan pendientes si se
  instala la skill.

PostgreSQL compartido en `127.0.0.1:54322`. La lane usó la base aislada `va_w5` (migrada y
sembrada). No se ejecutó `db:down` ni `db:reset`.

W6 estabilización se documenta en la sección 0 (arriba).

---

## 0.2 Actualización de cierre — fase 3 completa (histórico)

W4 quedó mergeada por squash en `main`:

| PR                                                              | Lane                   | Merge en `main`                                        |
| --------------------------------------------------------------- | ---------------------- | ------------------------------------------------------ |
| [#16](https://github.com/MiloAgudelo/vision-attendance/pull/16) | W4 motor de asistencia | `55ad4a4 feat(web): implementa el motor de asistencia` |

### Entregables cerrados

- Resolución de horarios locales en `America/Bogota`, ventana inclusiva RN2 y sesiones perezosas
  RN3 con `ON CONFLICT DO NOTHING` + relectura.
- Asistencia idempotente RN6, serialización concurrente por sesión/estudiante y uso exclusivo de
  `received_at` como hora oficial RN8.
- Correcciones manuales admin-only con motivo, actor, valores anterior/nuevo y auditoría RN9.
- Consultas server-side para sesión en vivo, ausentes calculados, historial, correcciones y bitácora
  de eventos; W5 no necesita consultar Drizzle desde componentes.
- El pipeline de W2 usa el motor W4 por defecto.

No hubo migraciones ni cambios en el esquema físico o el contrato v1.

### Decisión reversible declarada en #16

Si varias franjas contienen el evento, el motor prioriza: inscripción activa → coincidencia de
salón → inicio más cercano.

### Puerta de salida verificada sobre W4

- Matriz obligatoria W4: **13/13**.
- `pnpm test`: **430/430** (shared 98, db 23, simulador 136, web 173).
- Smoke real en `va_w4` contra Next y el simulador: reintentos concurrentes idempotentes.

### Siguiente trabajo al cerrar fase 3 (completado)

W5 Auth (#18) y UI de asistencia (#19).

---

## 0.3 Actualización de cierre — fase 2 completa (histórico)

| PR  | Lane                      | Merge en `main`                                                          |
| --- | ------------------------- | ------------------------------------------------------------------------ |
| #12 | W3 simulador              | `793c640 feat(simulator): añade el simulador de dispositivo RFID`        |
| #13 | W2 dispositivos + eventos | `5759aab feat(web): añade los dispositivos y la ingesta de eventos RFID` |
| #14 | W1 dominio académico      | `11d3e3b feat(web): añade el dominio académico con su administración`    |
| #15 | cierre documental         | `bc610a9 docs(repo): actualiza el cierre de la fase 2`                   |

Puerta de salida histórica: **417/417** pruebas; smoke de idempotencia y `unknown_card`.

---

## 1. Qué es esto y qué manda

Sistema de registro de asistencia por RFID (Institución Universitaria Visión de las Américas).
Se construye con agentes de IA en lanes paralelas, sin sprints.

**Documentos normativos** — léelos completos antes de escribir código, en este orden:

1. `docs/alcance-v2.md` — alcance aprobado y reglas de negocio **RN1–RN11**
2. `docs/architecture.md` — stack, monorepo, reglas de importación
3. `docs/data-model.md` — esquema físico completo (ya implementado; **no rediseñar**)
4. `docs/device-contract.md` — contrato v1 del dispositivo (**no cambiar**)
5. `docs/agent-playbook.md` — lanes, propiedad de archivos, convenciones de git

Ante una contradicción o un vacío: si es reversible, decide y decláralo en la PR; si es
estructural, detente y repórtalo.

**Fuera de alcance (no hacer en W6 salvo lo listado en el playbook):** exportaciones
CSV/Excel/PDF, offline en firmware, estados «tarde»/«justificado» persistidos, paquetes
`ui`/`config`/`auth`, `apps/api` separada, crear recursos cloud. **El firmware ESP32 no se
implementa en esta corrida** (track paralelo; gate de UID en `alcance-v2.md` §18).

---

## 2. Entorno (verificado)

| Herramienta                                    | Estado       |
| ---------------------------------------------- | ------------ |
| node 24.18 · pnpm 11.18 · gh autenticado · git | ✅           |
| Docker / Docker Desktop                        | ❌ no existe |
| Supabase CLI                                   | ❌ no existe |
| PostgreSQL del sistema / psql                  | ❌ no existe |

Base local con `embedded-postgres` (PostgreSQL **17**) en `127.0.0.1:54322`, gestionada por
`packages/db/scripts/pg.mjs`.

```
DATABASE_URL=postgres://postgres:postgres@127.0.0.1:54322/va_w5
```

Regla: nunca `db:down` / `db:reset`. `db:up` solo tras comprobar que no hay agentes paralelos.
Cada lane usa su propia base y solo `pnpm db:migrate`. `.claude/` es ajeno: no versionar.

---

## 3. Prompt de reanudación (post-W6)

```text
Continúa vision-attendance desde el estado documentado en HANDOFF.md.

Antes de escribir código:
1. Lee HANDOFF.md completo (sección 0 = cierre W6).
2. Lee, en orden, docs/alcance-v2.md, docs/architecture.md, docs/data-model.md,
   docs/device-contract.md, docs/security.md, docs/deploy.md y docs/agent-playbook.md.
3. Verifica el estado real de git y PRs abiertas; no asumas que el handoff sigue actualizado.
4. Excluye siempre .claude/.

Estado esperado:
- MVP de software cerrado (fases 2–5 / W1–W6). main incluye e2e, matriz, seguridad y docs
  de despliegue (#21–#24).
- PostgreSQL compartido en 127.0.0.1:54322; base aislada por lane si aplica.
- No hay recursos Supabase/Vercel cloud creados por el agente; el humano sigue docs/deploy.md.

Trabajo típico a partir de aquí (solo si el responsable lo pide):
- acompañar el deploy real (sin crear cloud desde el agente);
- firmware ESP32 (track paralelo; gate UID en alcance-v2.md §18);
- fase 2 del alcance (exportaciones, multi-grupo, etc.).

Una PR por historia, Conventional Commits con scope en inglés y mensaje en español.
Antes de mergear: pnpm lint, typecheck, test, build. No db:down/db:reset.
```
