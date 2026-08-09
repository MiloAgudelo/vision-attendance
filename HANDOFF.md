# Handoff — vision-attendance

Estado del proyecto para continuar en otra sesión. Última actualización: 2026-08-09.

## 0. Actualización de cierre — fase 3 completa

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
- El pipeline de W2 usa el motor W4 por defecto. El cambio mínimo en
  `apps/web/src/server/events/ingest.ts` fue autorizado expresamente por el responsable porque el
  playbook exige reemplazar el stub, aunque el archivo pertenecía originalmente a W2.

No hubo migraciones ni cambios en el esquema físico o el contrato v1.

### Decisión reversible declarada en #16

Si varias franjas contienen el evento, el motor prioriza: inscripción activa → coincidencia de
salón → inicio más cercano. El esquema no relaciona dispositivo y grupo; este desempate evita una
migración y puede reemplazarse cuando exista esa relación.

### Puerta de salida verificada sobre W4 y `main`

- Matriz obligatoria W4: **13/13** (10 integración con PostgreSQL real + 3 zona horaria).
- `pnpm test`: **430/430** (shared 98, db 23, simulador 136, web 173).
- `pnpm lint`, `pnpm typecheck`, `pnpm build` y CI de #16: verdes.
- Revisión adversarial: sin hallazgos críticos/altos después de conectar el endpoint. W5 debe
  derivar el `userId` de corrección de la sesión autenticada, nunca del formulario.
- Smoke real en `va_w4` contra Next.js local y el simulador: cinco reintentos concurrentes del
  mismo `eventId` devolvieron la respuesta `registered` idéntica; un evento nuevo del mismo UID
  devolvió `already_registered`. PostgreSQL confirmó 2 eventos, 1 sesión y 1 asistencia, con
  `checked_in_at` igual al `received_at` del primer evento.

El fixture del smoke se eliminó al terminar. Se usó el puerto 3104 porque el 3000 estaba ocupado
por un proceso ajeno de otro repositorio; no se tocó ese proceso. PostgreSQL se apagó una vez de
forma inesperada durante el gate, se reencendió cuando solo quedaba el agente raíz y `va_w4` volvió
a migrar y probar correctamente.

### Siguiente trabajo

Fase 4, W5: UI de sesión en vivo con polling de 3–5 s, historial por sesión/estudiante,
correcciones admin-only, bitácora y Supabase Auth con autorización server-side para admin/teacher.
Todas las pantallas administrativas existentes siguen abiertas y deben quedar protegidas. Los
textos son en español y W5 consume las funciones de `src/server/attendance/` ya disponibles.

Los commits históricos `c915adc` y `cc61e29` no se tocaron; sigue pendiente la decisión expresa
del responsable antes de cualquier reescritura de `main`.

---

## 0.1 Actualización de cierre — fase 2 completa (histórico)

La fase 2 quedó mergeada en `main`, en el orden obligatorio y por squash con título
Conventional Commit:

| PR  | Lane                      | Merge en `main`                                                          |
| --- | ------------------------- | ------------------------------------------------------------------------ |
| #12 | W3 simulador              | `793c640 feat(simulator): añade el simulador de dispositivo RFID`        |
| #13 | W2 dispositivos + eventos | `5759aab feat(web): añade los dispositivos y la ingesta de eventos RFID` |
| #14 | W1 dominio académico      | `11d3e3b feat(web): añade el dominio académico con su administración`    |

### Correcciones cerradas

- W1: se confirmaron todos los hallazgos de §5.1 (cero falsos positivos). El dominio académico ya
  no consulta/publica UIDs; conserva materia/profesor actuales aunque estén inactivos; rechaza
  horarios solapados incluso bajo doble alta concurrente; la baja del estudiante retira sus
  inscripciones; la edición no pisa la ventana RN2 vacía; ids malformados son 404; la validación de
  hora no duplica mensajes; `app/page.tsx` quedó idéntico a `main`.
- W2: se confirmaron todos los hallazgos de §5.2 (cero falsos positivos). El motor y su `persist`
  se aíslan con SAVEPOINTs para no perder `rfid_events` tras un error SQL (RN1); `persist(tx)`
  queda documentado como idempotente; enrolamiento vive en `server/devices/`; `deviceId` vacío
  es 400.
- Hallazgo adversarial adicional de W2: dos requests concurrentes podían ejecutar ambos motores
  antes de que el UNIQUE eligiera ganador. Se corrigió serializando `(device_id,event_id)` con
  advisory lock y re-check dentro de la transacción (RN7).

Los advisory locks de W1/W2 son decisiones técnicas reversibles, documentadas en #13/#14, y no
requirieron migraciones. No cambió el contrato v1, el esquema físico ni las migraciones.

### Puerta de salida verificada sobre `main`

- `pnpm db:migrate` sobre `va_integracion`: verde.
- `pnpm lint`, `pnpm typecheck`, `pnpm build`: verdes.
- `pnpm test`: **417/417** (shared 98, db 23, simulador 136, web 160).
- Smoke real contra Next.js local: `repetir --count 5 --concurrentes` devolvió cinco respuestas
  idénticas `no_session` y dejó exactamente una fila en PostgreSQL; `FFFFFFFF` devolvió
  `unknown_card`.

`va_integracion` figuraba como existente en este handoff, pero no existía al comprobar el estado
real. Se creó de forma aislada, sin `db:reset`, y quedó migrada/sembrada. PostgreSQL compartido
sigue encendido en `127.0.0.1:54322`.

### Siguiente trabajo al cerrar fase 2 (completado)

Crear W4 desde `main@11d3e3b`: motor de asistencia en
`apps/web/src/server/{attendance,sessions}/`, reemplazando el stub de W2. W4 es la única lane que
puede añadir migraciones. Ejecutar todas las pruebas obligatorias del playbook §4 y el smoke con
simulador antes de avanzar a W5.

Los commits históricos `c915adc` y `cc61e29` no se tocaron; sigue pendiente la decisión expresa
del responsable antes de cualquier reescritura de `main`.

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

**Fuera de alcance (no hacer):** exportaciones CSV/Excel/PDF, offline en firmware, estados
«tarde»/«justificado» persistidos, paquetes `ui`/`config`/`auth`, `apps/api` separada, recursos
cloud. **El firmware ESP32 no se implementa en esta corrida** (track paralelo, con gate pendiente
de verificar la estabilidad del UID, ver `alcance-v2.md` §18).

---

## 2. Entorno (verificado — no volver a investigarlo)

| Herramienta                                              | Estado           |
| -------------------------------------------------------- | ---------------- |
| node 24.18 · pnpm 11.18 · gh 2.97 autenticado · git 2.55 | ✅               |
| Docker / Docker Desktop                                  | ❌ **no existe** |
| Supabase CLI                                             | ❌ **no existe** |
| PostgreSQL del sistema / psql                            | ❌ **no existe** |

**La base de datos local no usa Docker.** Se resolvió con el paquete npm `embedded-postgres`
(binarios reales de PostgreSQL **17.10**, sin admin), gestionado con `pg_ctl` desde
`packages/db/scripts/pg.mjs`.

```
DATABASE_URL=postgres://postgres:postgres@127.0.0.1:54322/postgres
```

Es **la misma forma de URL que produce `supabase start`**, a propósito: el día que exista el CLI de
Supabase, ambas vías son intercambiables sin tocar código. El CI usa un servicio `postgres:17`
(misma versión mayor, para tener paridad).

> ⚠️ `pnpm db:up` / `db:down` / `db:reset` actúan sobre un **clúster compartido**. Si hay varios
> agentes trabajando en paralelo, **no los ejecutes**: bajarías la base de todos. Usa una base por
> lane (ver §7).

Bases ya creadas en ese servidor: `postgres` (la de desarrollo, con seed), `va_w1`, `va_w2`,
`va_w3`, `va_w4`, `va_integracion`.

---

## 3. Dónde está el trabajo

### `main` — fase F1 completa y mergeada

Monorepo pnpm funcional con CI en verde:

- `packages/shared` (`@va/shared`) — paquete hoja. Enums de dominio + contrato v1 del dispositivo
  en Zod (`src/contracts/device.ts`): petición, respuesta con los 7 `result`, los 7 códigos de
  error con su estado HTTP, `normalizeCardUid`/`parseCardUid`/`cardUidSchema`, `deviceNameSchema`,
  `formatDeviceApiKey`, `contractVersionProbeSchema`. **98 pruebas.**
- `packages/db` (`@va/db`) — esquema Drizzle **completo** de las 12 tablas con enums, CHECKs e
  índices críticos; migración inicial + `0001_rls_deny_all.sql` (escrita a mano: RLS activo en las
  12 tablas, **cero policies**); cliente, runner de migraciones y seed idempotente. **23 pruebas.**
- `apps/web` — Next.js App Router + TypeScript + Tailwind, en español. `GET /api/health`
  (200 / 503). **5 pruebas.**
- CI en `.github/workflows/ci.yml`: install → lint → typecheck → migraciones → test → build.

### PRs abiertas — fase 2, las tres en **borrador** y basadas en `main`

| PR                                                              | Lane                                     | Estado                                                                        |
| --------------------------------------------------------------- | ---------------------------------------- | ----------------------------------------------------------------------------- |
| [#12](https://github.com/MiloAgudelo/vision-attendance/pull/12) | **W3** simulador                         | ✅ verificada (2 verificadores) y **corregida**. 136 pruebas.                 |
| [#13](https://github.com/MiloAgudelo/vision-attendance/pull/13) | **W2** dispositivos + ingesta de eventos | ⚠️ verificada **solo parcialmente** (1 de 3 verificadores). **Sin corregir.** |
| [#14](https://github.com/MiloAgudelo/vision-attendance/pull/14) | **W1** dominio académico                 | ⚠️ verificada (3 verificadores). **Sin corregir.**                            |

Se pidió `@codex review` en las tres. Las ramas locales existen con esos mismos nombres
(`w1/dominio-academico`, `w2/dispositivos-y-eventos`, `w3/simulador`).

---

## 4. LO SIGUIENTE (por orden)

### 4.1 Corregir W1 y W2 antes de la fase 3

**W4 depende directamente de W1 y W2**, así que sus defectos se heredan. Los hallazgos están en §5.
Ninguno está aplicado todavía.

### 4.2 Mergear la fase 2

Orden sugerido: **#12 (W3) → #13 (W2) → #14 (W1)**. W3 no toca `apps/web`, así que entra sin
riesgo. Antes de cada merge hay que hacer `git merge origin/main` en la rama (ver la trampa del
lockfile en §6).

### 4.3 Fase 3 — W4, motor de asistencia

`apps/web/src/server/attendance/` y `apps/web/src/server/sessions/`. **Única lane autorizada a
escribir migraciones nuevas** después de F1.

Determinación de sesión (ventana RN2), creación perezosa con `ON CONFLICT` (RN3), verificación de
inscripción, unicidad de asistencia (RN6), correcciones manuales admin-only con auditoría (RN9),
zona horaria `America/Bogota` (RN10). Sustituye el motor stub de W2 (ver §5.2).

**Sus pruebas del playbook §4 son obligatorias, no opcionales**: límites exactos de la ventana
(−60 min y fin de clase), creación perezosa concurrente (2 eventos simultáneos → 1 sesión), mismo
UID dos veces → `already_registered`, no inscrito, sin sesión, corrección + fila de auditoría,
cálculo tz con horario local vs timestamps UTC, y `scannedAt` incorrecto que no altera
`checked_in_at`.

### 4.4 Fase 4 — W5, UI de asistencia

Vista de sesión en vivo con polling 3–5 s, historial, correcciones, login Supabase Auth con roles.
Textos en español. **Hoy no hay ninguna autenticación**: las pantallas de administración están
abiertas y W5 debe ponerlas detrás de autorización por rol.

### 4.5 Fase 5 — W6, estabilización

e2e con el simulador como cliente, matriz de casos, revisión de seguridad, docs de despliegue.

---

## 5. Hallazgos de verificación pendientes de aplicar

### 5.1 W1 — dominio académico (PR #14)

Tres verificadores independientes. Los que coincidieron en más de uno están marcados.

**Bloqueante**

- **`students.ts` lee la tabla `cards` y publica el UID** en el listado y en la ficha
  (`students.ts:11,79,101`; `students/page.tsx:101`; `students/[id]/page.tsx` panel «Carnet»).
  El encargo de W1 prohíbe expresamente los carnets —son de W2— y limita el dato del estudiante a
  nombre, código y estado (minimización, `alcance-v2.md` §16). _(3 de 3 verificadores)_
  → Quitar el import de `cards`, el campo `cardUid` y los dos `leftJoin`; eliminar la columna y el
  panel «Carnet». W2 aportará esa vista en su subárbol.

**Importante**

- **El `leftJoin` con `cards` duplica estudiantes.** El índice único del esquema es por `uid`, no
  por `student_id`, así que un estudiante con dos carnets activos (reposición sin desactivar el
  anterior, que es justo el caso que `cards` existe para soportar) **aparece dos veces** en
  `/students`, con `key` de React repetida, y **infla el contador** «Estudiantes activos» del panel.
  Se resuelve solo al aplicar el bloqueante. _(3 de 3)_
- **Editar un grupo puede borrarle el profesor en silencio.** `listTeachers` solo devuelve
  profesores **activos**; si el profesor asignado pasa a `inactive` (o tiene rol `admin`, escenario
  contemplado en `alcance-v2.md` §17.5), el `<select>` no contiene su id, el navegador selecciona
  «Sin asignar», y guardar **cualquier otro campo** pone `teacher_id` a NULL sin avisar. W5 necesita
  ese vínculo para la vista del profesor. (`groups/[id]/page.tsx:105`, `actions.ts:32`) _(2 de 3)_
- **Un grupo cuya materia fue dada de baja queda inaccesible.** El `<select>` de materia solo lista
  materias activas y es `required`: el formulario no deja guardar, así que ya no se puede editar ni
  la ventana de sesión de RN2. Y si el admin elige otra materia para desbloquearlo, **el grupo
  cambia de materia sin aviso**. (`groups/[id]/page.tsx:47,82`) _(2 de 3)_
- **No hay validación de solapamiento de horarios.** `addSchedule`/`updateSchedule` admiten dos
  franjas idénticas (doble clic en «Añadir franja») y, peor, dos solapadas el mismo día
  (18:00–20:00 y 19:00–21:00). Un escaneo a las 19:30 caería dentro de la ventana de **dos sesiones
  del mismo grupo**, y RN6 solo garantiza unicidad por (sesión, estudiante).
  **Esto le explota a W4**, no a W1. (`schedules.ts:71-95,174`) _(2 de 3)_
- **Dar de baja a un estudiante no retira sus inscripciones.** Siguen `active`, el grupo lo sigue
  contando como inscrito, y como `/students` ya no lo muestra, el admin no tiene forma de saber
  dónde quedó inscrito. Contradice que `enrollStudent` sí prohíba inscribir a alguien dado de baja.
  (`students.ts:179`)

**Menor**

- `sessionWindowMinutes` vacío en la **edición** se sobrescribe con el default 60 en vez de
  conservarse: un grupo con ventana 25 pasa a 60 sin aviso (RN2). Además
  `z.coerce.number(...).default(60)` convierte `null` y `''` en **0**, lo que anula la ventana por
  completo si otra lane llama al dominio con `null`. (`groups/actions.ts:33`, `groups.ts:33`)
- Un id malformado en la URL (`/students/abc`) da **500** en vez de 404: el `catch` solo traduce
  `not_found` y deja subir `validation`. Igual en `subjects/[id]` y `groups/[id]`.
- Con una hora inválida (`25:00`), el `refine` de objeto añade un **segundo mensaje falso** sobre la
  hora de fin. La prueba solo mira `issues[0]`, por eso no lo detecta. (`schedules.ts:90`)
- **W1 modificó `apps/web/src/app/page.tsx`**, la portada, que está fuera de su subárbol y es
  territorio de W5. _(3 de 3)_ → Revertir; el panel ya es accesible por `/admin`.

### 5.2 W2 — dispositivos e ingesta (PR #13)

> ⚠️ **Solo corrió 1 de los 3 verificadores** (el de reglas de negocio). Los de conformidad y
> robustez murieron por el límite de gasto. **Esta lane necesita completar su verificación**, y es
> la que tiene el endpoint crítico del sistema.

**Importante — los dos rompen RN1, que es la regla central del proyecto**

- **`ingest.ts:314-321`** — el `catch` que promete registrar el evento con `result: 'error'` está
  **dentro** de la transacción. Si el fallo del motor es un error de SQL, PostgreSQL marca la
  transacción como abortada, el `INSERT` posterior en `rfid_events` falla, **la fila se pierde y
  RN1 se incumple**. Le explota a W4 en cuanto su motor real provoque cualquier violación de
  restricción (doble escaneo concurrente, FK, deadlock).
  → Ejecutar el motor en un SAVEPOINT (`await tx.transaction(...)`) o llamarlo antes de abrir la
  transacción del evento. Añadir una prueba con un motor que falle con un error real de PostgreSQL.
- **`ingest.ts:163`** — `await outcome.persist?.()` corre sin `try/catch`, dentro de la misma
  transacción y **después** de insertar la fila de `rfid_events`: si falla, el ROLLBACK **borra el
  evento ya registrado**, justo en el caso que el contrato considera «ya persistido».
  → Envolver `persist` en su propio SAVEPOINT y documentar en `attendance-engine.ts` que debe ser
  idempotente.

**Menor**

- La lane creó `apps/web/src/server/enrollment/`, que no está en sus carpetas autorizadas del
  playbook §4 (aunque el entregable de enrolamiento sí es suyo). → Moverlo a
  `src/server/devices/enrollment.ts`, o añadir la carpeta al playbook en el mismo PR.
- Un `deviceId` presente pero vacío (`""`) devuelve **403 `device_mismatch`** en vez de **400
  `invalid_payload`**, que es lo que corresponde a un cuerpo malformado. (`ingest.ts:86-88`)

### 5.3 W3 — simulador (PR #12) — ✅ ya corregido

Se deja constancia de lo que se arregló, porque explica decisiones del diseño:

- `repeat()` reenviaba el mismo `eventId` N veces pero **nunca comparaba las respuestas entre sí**:
  la herramienta cuya razón de ser es probar la idempotencia (RN7) no podía detectar su violación, y
  su prueba unitaria **daba por bueno** un servidor que respondía `already_registered` donde antes
  respondió `registered`. Ahora cualquier diferencia lanza `IdempotencyViolationError`.
- **`--concurrentes`** en `repetir` y `rafaga`: el simulador era estrictamente secuencial, así que
  las carreras que W2 y W4 deben resolver eran **inalcanzables** desde la herramienta.
  **W4 y W6 lo necesitan** para sus pruebas de concurrencia.
- `enrolar --bytes 7` se ignoraba (no se podían enrolar carnets MIFARE de 7 bytes);
  `repetir --delay` estaba documentado y nunca se aplicaba; `reintentar --count` se aceptaba y se
  ignoraba; el análisis de números aceptaba `0x10` como 16 y `''` como 0.

---

## 6. Trampas conocidas (leer antes de tocar git)

- **Un force-push a una rama base cierra sus PRs de forma irreversible.** Ya pasó: la reescritura de
  autoría cerró las 7 PRs originales y **GitHub no deja reabrir una PR cuyos commits ya no existen**.
  Hubo que recrearlas — por eso la numeración empieza en #8 y no en #1. Si vas a reescribir historia
  publicada, cuenta con recrear las PRs afectadas.
- **El squash de una PR de una pila hace divergir la siguiente rama.** Conserva los commits
  originales mientras `main` ya tiene la versión aplastada, y el conflicto sale casi siempre en
  `pnpm-lock.yaml`. Se resuelve así:
  ```bash
  git checkout <rama> && git merge origin/main
  git checkout --ours pnpm-lock.yaml && pnpm install --lockfile-only
  git add pnpm-lock.yaml && git commit --no-edit
  pnpm install --frozen-lockfile   # comprobar que el lockfile quedó coherente
  ```
- **`apps/web/next-env.d.ts` bloquea los rebase.** El primer commit de `f1/web-esqueleto` lo versiona
  y el último deja de hacerlo; como Next.js lo regenera, un rebase se detiene con _«untracked working
  tree files would be overwritten»_. Basta `rm -f apps/web/next-env.d.ts` antes de rebasar.
- **Los workflows de agentes se cortan por el límite de gasto de la organización.** Ha pasado tres
  veces, siempre a mitad. **El trabajo commiteado sobrevive**; lo que se pierde son los agentes que
  no habían terminado. Al retomar, revisa el estado real de git antes de suponer que algo falta, y
  lee `journal.jsonl` del run en `.claude/projects/.../subagents/workflows/<run>/` para recuperar lo
  que sí devolvieron.
- **El clasificador de permisos bloquea operaciones destructivas** aunque haya permisos de sesión:
  `git reset --hard`, `git filter-branch` sobre `main`, y escribir `.claude/settings.json` (un agente
  no puede autoconcederse permisos). **`.claude/settings.json` no existe**; si quieres reglas
  persistentes, créalo tú.
- **`.claude/` no está en `.gitignore`** y contiene `worktrees/`. Conviene ignorarlo.
- Quedaron directorios huérfanos en `.claude/worktrees/` que no se pudieron borrar por rutas
  demasiado largas (`node_modules`). No estorban a git, pero ocupan disco.

---

## 7. Convenciones en uso

**Commits.** Conventional Commits con prefijo y scope **en inglés** (`web`, `db`, `shared`,
`simulator`, `ci`, `docs`, `repo`) y **mensaje en español, con tildes y ortografía correcta**.

**Autoría.** `git config user.name/email` del repositorio está fijado a
`MiloAgudelo <contacto@miloagudelo.com>`. Los 39 commits anteriores se reescribieron a esa identidad
(contenido idéntico, verificado con `git diff` vacío entre las puntas vieja y nueva).

**PRs.** Una PR por historia, nunca mega-PRs; apiladas si dependen entre sí. Merge **solo con CI en
verde**, en orden de dependencias.

**Merge = `--squash` con título Conventional Commit**, no el «Merge pull request #N from…» por
defecto:

```bash
gh pr merge <n> --squash --subject "feat(web): ..." --body "..."
```

> Pendiente: los dos merge commits del 7 de agosto en `main` (`c915adc` y `cc61e29`) conservan el
> mensaje por defecto, porque se mergearon antes de acordar esta convención. Reescribirlos requiere
> `git filter-branch --msg-filter` sobre `main` + force-push, con el riesgo de cerrar las PRs
> abiertas descrito en §6. **Decisión pendiente del responsable.**

**Propiedad de archivos (playbook §3).** Cada lane escribe solo dentro de sus carpetas autorizadas.
Después de F1, **solo W4 puede escribir migraciones**. Si una lane necesita tocar territorio ajeno,
se detiene y lo reporta en su PR.

---

## 8. Comandos útiles

```bash
pnpm install                 # instalar (el prepare compila @va/shared y @va/db)
pnpm db:up                   # arrancar PostgreSQL 17 local (¡compartido! ver §2)
pnpm db:migrate              # aplicar migraciones
pnpm db:seed                 # datos de desarrollo (imprime la API key del dispositivo una sola vez)
pnpm dev                     # Next.js en :3000
pnpm lint && pnpm typecheck && pnpm test && pnpm build

# una base propia por lane, para no pisar a nadie:
#   .env con DATABASE_URL=postgres://postgres:postgres@127.0.0.1:54322/va_w4
#   y luego pnpm db:migrate (nunca db:up/db:down/db:reset con agentes en paralelo)

# simulador (cuando /api/v1/events esté mergeado)
pnpm --filter @va/simulator sim -- --help
pnpm --filter @va/simulator sim -- repetir --uid A1B2C3D4 --count 5 --concurrentes
```

**Recuento de pruebas actual:** `@va/shared` 98 · `@va/db` 23 · `apps/web` 5 · `@va/simulator` 136.
