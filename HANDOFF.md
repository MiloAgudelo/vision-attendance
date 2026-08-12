# Handoff ΓÇö vision-attendance

Estado del proyecto para continuar en otra sesi├│n. ├Ültima actualizaci├│n: **2026-08-12**
(`America/Bogota`).

## 0. Actualizaci├│n de cierre ΓÇö fase 4 completa

W5 qued├│ mergeada por squash en `main`, en dos historias separadas (auth primero, UI despu├⌐s):

| PR                                                              | Lane                              | Merge en `main`                                                           |
| --------------------------------------------------------------- | --------------------------------- | ------------------------------------------------------------------------- |
| [#18](https://github.com/MiloAgudelo/vision-attendance/pull/18) | W5 Auth + autorizaci├│n por roles  | `3b6b067 feat(web): a├▒ade autenticaci├│n y autorizaci├│n por roles`         |
| [#19](https://github.com/MiloAgudelo/vision-attendance/pull/19) | W5 UI de asistencia en vivo       | `31791ca feat(web): a├▒ade la UI de asistencia en vivo`                    |

### Entregables cerrados

- Supabase Auth SSR (`@supabase/ssr`) con cookies de Next.js 16; `getCurrentUser()` valida con
  `auth.getUser()`; rol y estado se resuelven solo desde `public.users`.
- Autorizaci├│n server-side: layouts y p├íginas reautorizan antes de consultar; Server Actions con
  guard admin; teacher redirigido fuera del panel administrativo.
- Tablero de aula: `/sessions` y `/sessions/[id]` con polling 4 s, roster presentes/ausentes
  calculados (RN5), hora de ingreso y minutos vs inicio (RN4).
- Historial por sesi├│n (correcciones) y por estudiante; bit├ícora admin `/events` de `rfid_events`.
- Correcciones admin-only: `userId` derivado de `requireRole('admin')`, nunca de FormData (RN9).
- Teacher solo consulta sus grupos; sesi├│n o estudiante ajenos ΓåÆ `notFound()`.
- UI en espa├▒ol, WCAG 2.2 AA como objetivo, direcci├│n visual seed `4e33298b` / `operate` /
  `tablero-de-aula`. Activos oficiales en `apps/web/PRODUCT.md` y `public/`.

No hubo migraciones ni cambios en el esquema f├¡sico o el contrato v1.

### Excepciones de propiedad declaradas

- #18 toc├│ p├íginas y actions de W1/W2 para cerrar pantallas y mutaciones preexistentes por rol, y
  el lockfile ra├¡z por dependencias SSR (autorizado por el entregable de Auth).
- #19 a├▒adi├│ entradas de Sesiones y Bit├ícora en `ADMIN_SECTIONS` y la bit├ícora bajo `(admin)/events`.

### Puerta de salida verificada

- `pnpm test`: **465/465** (shared 98, db 23, simulador 136, web 208).
- `pnpm lint`, `pnpm typecheck`, `pnpm build` y CI de #18/#19: verdes.
- Auth: an├│nimo no entra; teacher no corrige ni consulta sesi├│n/grupo ajeno; actor de correcci├│n
  proviene de la sesi├│n autenticada.
- UI: roster con ausentes calculados; polling actualiza sin recarga manual (intervalo 3ΓÇô5 s).
- Smoke real contra Next en `:3104` y el simulador: `/sessions` an├│nimo ΓåÆ 307 `/login`;
  `enviar` fuera de ventana de clase ΓåÆ `no_session` con entrada registrada (RN1).
- Impeccable no estuvo disponible; detector/capturas/revisi├│n visual fresca quedan pendientes si se
  instala la skill.

PostgreSQL compartido en `127.0.0.1:54322`. La lane us├│ la base aislada `va_w5` (migrada y
sembrada). No se ejecut├│ `db:down` ni `db:reset`.

### Siguiente trabajo

Fase 5 / **W6 estabilizaci├│n**: e2e del flujo completo con el simulador (enrolar ΓåÆ escanear ΓåÆ en
vivo ΓåÆ corregir ΓåÆ auditar); matriz del alcance (duplicados, atrasados, revocado, reasignaci├│n de
carnet); revisi├│n de seguridad (RLS deny-all, secretos, rate-limit b├ísico); README/docs finales y
despliegue documentado (Vercel + Supabase). W6 hereda propiedad de CI/docs de F1 y escribe en
`e2e/**`.

Los agentes no crean recursos cloud: el humano conecta Supabase remoto v├¡a `.env`.

Los commits hist├│ricos `19fa300` y `c449a42` no se tocaron; sigue pendiente la decisi├│n expresa del
responsable antes de cualquier reescritura de `main`.

---

## 0.1 Actualizaci├│n de cierre ΓÇö fase 3 completa (hist├│rico)

W4 qued├│ mergeada por squash en `main`:

| PR                                                              | Lane                   | Merge en `main`                                        |
| --------------------------------------------------------------- | ---------------------- | ------------------------------------------------------ |
| [#16](https://github.com/MiloAgudelo/vision-attendance/pull/16) | W4 motor de asistencia | `bee5c68 feat(web): implementa el motor de asistencia` |

### Entregables cerrados

- Resoluci├│n de horarios locales en `America/Bogota`, ventana inclusiva RN2 y sesiones perezosas
  RN3 con `ON CONFLICT DO NOTHING` + relectura.
- Asistencia idempotente RN6, serializaci├│n concurrente por sesi├│n/estudiante y uso exclusivo de
  `received_at` como hora oficial RN8.
- Correcciones manuales admin-only con motivo, actor, valores anterior/nuevo y auditor├¡a RN9.
- Consultas server-side para sesi├│n en vivo, ausentes calculados, historial, correcciones y bit├ícora
  de eventos; W5 no necesita consultar Drizzle desde componentes.
- El pipeline de W2 usa el motor W4 por defecto.

No hubo migraciones ni cambios en el esquema f├¡sico o el contrato v1.

### Decisi├│n reversible declarada en #16

Si varias franjas contienen el evento, el motor prioriza: inscripci├│n activa ΓåÆ coincidencia de
sal├│n ΓåÆ inicio m├ís cercano.

### Puerta de salida verificada sobre W4

- Matriz obligatoria W4: **13/13**.
- `pnpm test`: **430/430** (shared 98, db 23, simulador 136, web 173).
- Smoke real en `va_w4` contra Next y el simulador: reintentos concurrentes idempotentes.

### Siguiente trabajo al cerrar fase 3 (completado)

W5 Auth (#18) y UI de asistencia (#19).

---

## 0.2 Actualizaci├│n de cierre ΓÇö fase 2 completa (hist├│rico)

| PR  | Lane                      | Merge en `main`                                                          |
| --- | ------------------------- | ------------------------------------------------------------------------ |
| #12 | W3 simulador              | `dda9fae feat(simulator): a├▒ade el simulador de dispositivo RFID`        |
| #13 | W2 dispositivos + eventos | `368de60 feat(web): a├▒ade los dispositivos y la ingesta de eventos RFID` |
| #14 | W1 dominio acad├⌐mico      | `0125431 feat(web): a├▒ade el dominio acad├⌐mico con su administraci├│n`    |
| #15 | cierre documental         | `70d4728 docs(repo): actualiza el cierre de la fase 2`                   |

Puerta de salida hist├│rica: **417/417** pruebas; smoke de idempotencia y `unknown_card`.

---

## 1. Qu├⌐ es esto y qu├⌐ manda

Sistema de registro de asistencia por RFID (Instituci├│n Universitaria Visi├│n de las Am├⌐ricas).
Se construye con agentes de IA en lanes paralelas, sin sprints.

**Documentos normativos** ΓÇö l├⌐elos completos antes de escribir c├│digo, en este orden:

1. `docs/alcance-v2.md` ΓÇö alcance aprobado y reglas de negocio **RN1ΓÇôRN11**
2. `docs/architecture.md` ΓÇö stack, monorepo, reglas de importaci├│n
3. `docs/data-model.md` ΓÇö esquema f├¡sico completo (ya implementado; **no redise├▒ar**)
4. `docs/device-contract.md` ΓÇö contrato v1 del dispositivo (**no cambiar**)
5. `docs/agent-playbook.md` ΓÇö lanes, propiedad de archivos, convenciones de git

Ante una contradicci├│n o un vac├¡o: si es reversible, decide y decl├íralo en la PR; si es
estructural, detente y rep├│rtalo.

**Fuera de alcance (no hacer en W6 salvo lo listado en el playbook):** exportaciones
CSV/Excel/PDF, offline en firmware, estados ┬½tarde┬╗/┬½justificado┬╗ persistidos, paquetes
`ui`/`config`/`auth`, `apps/api` separada, crear recursos cloud. **El firmware ESP32 no se
implementa en esta corrida** (track paralelo; gate de UID en `alcance-v2.md` ┬º18).

---

## 2. Entorno (verificado)

| Herramienta | Estado |
|---|---|
| node 24.18 ┬╖ pnpm 11.18 ┬╖ gh autenticado ┬╖ git | Γ£à |
| Docker / Docker Desktop | Γ¥î no existe |
| Supabase CLI | Γ¥î no existe |
| PostgreSQL del sistema / psql | Γ¥î no existe |

Base local con `embedded-postgres` (PostgreSQL **17**) en `127.0.0.1:54322`, gestionada por
`packages/db/scripts/pg.mjs`.

```
DATABASE_URL=postgres://postgres:postgres@127.0.0.1:54322/va_w5
```

Regla: nunca `db:down` / `db:reset`. `db:up` solo tras comprobar que no hay agentes paralelos.
Cada lane usa su propia base y solo `pnpm db:migrate`. `.claude/` es ajeno: no versionar.

---

## 3. Prompt de reanudaci├│n (W6)

```text
Contin├║a el MVP de vision-attendance desde el estado documentado en HANDOFF.md.

Antes de escribir c├│digo:
1. Lee HANDOFF.md completo.
2. Lee, en orden, docs/alcance-v2.md, docs/architecture.md, docs/data-model.md,
   docs/device-contract.md y docs/agent-playbook.md.
3. Verifica el estado real de git y PRs abiertas; no asumas que el handoff sigue actualizado.
4. Excluye siempre .claude/ y no reescribas main ni los commits hist├│ricos 19fa300/c449a42.

Estado esperado:
- main en 31791ca (UI W5) o posterior si ya merge├│ el cierre documental de fase 4.
- Fases 2ΓÇô4 cerradas; W5 Auth (#18) y UI (#19) integradas.
- PostgreSQL compartido en 127.0.0.1:54322; usa una base aislada (p. ej. va_w6).
- No hay recursos Supabase cloud configurados por el agente.

Implementa W6 estabilizaci├│n:
- e2e con el simulador: enrolar ΓåÆ escanear ΓåÆ ver en vivo ΓåÆ corregir ΓåÆ auditar;
- matriz del alcance (duplicados, atrasados, revocado, reasignaci├│n de carnet);
- revisi├│n de seguridad (RLS deny-all, secretos, rate-limit b├ísico del endpoint);
- README/docs finales y despliegue documentado (Vercel + Supabase) sin crear recursos cloud.

Una PR por historia, Conventional Commits con scope en ingl├⌐s y mensaje en espa├▒ol.
Antes de mergear: pnpm lint, typecheck, test, build y smoke real. No db:down/db:reset.
```
