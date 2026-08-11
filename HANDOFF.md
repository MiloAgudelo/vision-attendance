# Handoff — vision-attendance

Estado operativo para continuar en otra sesión. Última actualización: **2026-08-11**
(`America/Bogota`).

## 0. Resumen ejecutivo

- `main` está en `56df2d9 docs(repo): actualiza el cierre de la fase 3`.
- Fases 2 y 3 están cerradas y mergeadas. W1, W2, W3 y W4 están integradas.
- Rama actual: `w5/auth-y-asistencia-ui`.
- PR en borrador: [#18 — feat(web): añade autenticación y autorización por roles](https://github.com/MiloAgudelo/vision-attendance/pull/18).
- Commit funcional publicado: `cf0c475 feat(web): añade autenticación y autorización por roles`.
- La historia de **Auth + autorización** de W5 está implementada. La UI de asistencia en vivo,
  historial, correcciones y bitácora todavía no existe.
- No hay migraciones, cambios de esquema ni cambios del contrato v1 en W5.
- No se crearon recursos cloud. No hay proyecto Supabase remoto conectado en este entorno.

Al actualizar este archivo, el CI de #18 estaba ejecutándose. Verificar su estado real antes de
mergear; el commit de documentación posterior vuelve a dispararlo.

## 1. Qué está cerrado

### Fase 2

Merge por squash y en orden:

| PR  | Entregable                | Commit en `main`                                                         |
| --- | ------------------------- | ------------------------------------------------------------------------ |
| #12 | W3 simulador              | `793c640 feat(simulator): añade el simulador de dispositivo RFID`        |
| #13 | W2 dispositivos + eventos | `5759aab feat(web): añade los dispositivos y la ingesta de eventos RFID` |
| #14 | W1 dominio académico      | `11d3e3b feat(web): añade el dominio académico con su administración`    |
| #15 | cierre documental         | `bc610a9 docs(repo): actualiza el cierre de la fase 2`                   |

Los hallazgos históricos de W1/W2 ya fueron corregidos. W2 conserva RN1 mediante SAVEPOINTs y RN7
mediante advisory lock + relectura transaccional. El simulador prueba reintentos concurrentes e
idempotencia real.

### Fase 3

| PR  | Entregable             | Commit en `main`                                       |
| --- | ---------------------- | ------------------------------------------------------ |
| #16 | W4 motor de asistencia | `55ad4a4 feat(web): implementa el motor de asistencia` |
| #17 | cierre documental      | `56df2d9 docs(repo): actualiza el cierre de la fase 3` |

W4 implementa ventana RN2, sesiones perezosas RN3, asistencia RN6, idempotencia RN7, hora oficial
RN8, correcciones y auditoría RN9, y `America/Bogota` RN10. El pipeline real usa
`attendanceEngine`.

Funciones server-side disponibles para W5:

- `listClassSessions`
- `getSessionRoster`
- `listStudentAttendanceHistory`
- `listSessionCorrections`
- `listRfidEventLog`
- `correctAttendance`

Están en `apps/web/src/server/attendance/`. Los componentes no deben consultar Drizzle
directamente.

## 2. W5 Auth — estado exacto de PR #18

Implementado:

- `@supabase/ssr@0.12.4` y `@supabase/supabase-js@2.112.2`.
- Cliente SSR con cookies de Next.js 16 y `src/proxy.ts` para refrescar sesión.
- `getCurrentUser()` valida con `auth.getUser()`; `getClaims()` no autoriza, solo refresca.
- Rol y estado se resuelven exclusivamente desde `public.users`. Nunca se confía en
  `user_metadata`.
- Cuenta inexistente o `inactive` falla cerrada. Los errores de base propagan; no conceden acceso.
- Login y logout en español. Redirecciones fijas por rol; no existe `returnUrl` abierto.
- Variables admitidas:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (preferida)
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY` (compatibilidad)
- Sin configuración Supabase, el build sigue funcionando y el acceso protegido redirige al login.
- Layout administrativo protegido para UX.
- Las diez páginas `app/(admin)/**/page.tsx` reautorizan **antes** de consultar datos. Esto es
  obligatorio porque los layouts de Next no se reejecutan en cada navegación parcial.
- Todas las Server Actions académicas pasan por `runFormAction` con guard admin. Las acciones de
  dispositivos y enrolamiento tienen guard admin propio.
- Prueba arquitectónica: `app/(admin)/page-authorization.test.ts` cubre las diez páginas y exige
  que el guard preceda la primera consulta.
- `vitest.config.ts` usa `fileParallelism: false`: las suites web comparten el único PostgreSQL y
  en paralelo mezclaban horarios recurrentes o borraban fixtures de otra suite. Es estabilización
  de tests; no cambia producción.

Revisión adversarial:

- Se encontró un hallazgo alto: confiar solo en el layout permitía conservar una vista administrativa
  tras degradar/inactivar al usuario durante navegación parcial.
- Se corrigió reautorizando cada página antes de sus consultas y manteniendo los guards de acciones.
- Después de la corrección no quedaron otros hallazgos críticos/altos conocidos.

Excepciones de propiedad declaradas en #18:

- W5 toca páginas y actions de los subárboles W1/W2 porque el entregable exige cerrar las pantallas y
  mutaciones preexistentes por rol.
- Se modifica el lockfile raíz por las dependencias SSR.
- Se añade `apps/web/PRODUCT.md` y activos oficiales autorizados por el responsable.

## 3. Diseño e identidad visual

El responsable autorizó reutilizar los activos de
`https://github.com/miloagudelo/vision-electoral`:

- `apps/web/public/logo-institucional.png`
- `apps/web/src/app/favicon.ico`
- `apps/web/src/app/icon.png`
- `apps/web/src/app/apple-icon.png`

La fuente de verdad de producto está en `apps/web/PRODUCT.md`.

Dirección visual ya elegida:

- seed: `4e33298b`
- modo: `operate`
- concepto: `tablero-de-aula`
- usuario primario: profesor durante la clase
- administrador: configuración, correcciones y auditoría
- WCAG 2.2 AA, textos en español, sin inventar claims o activos institucionales

Validación semántica realizada en login:

- escritorio 1280×800 y móvil 390×844
- sin overflow horizontal
- inputs de 49,6 px y botón de 44 px
- etiquetas asociadas y foco visible de 3 px
- logo cargado en ambos breakpoints

El snapshot del preview colaborativo falló por un error interno aunque la navegación y evaluación DOM
funcionaban. Al terminar toda la UI W5 todavía hay que ejecutar el detector de Impeccable, obtener
capturas escritorio/móvil y pedir una revisión final fresca si esa skill está disponible.

## 4. Gates verificados

Último resultado local después de estabilizar Vitest:

- `pnpm test`: **450/450**
  - shared 98
  - db 23
  - simulator 136
  - web 193
- `pnpm lint`: verde
- `pnpm typecheck`: verde
- `pnpm build`: verde
- Prettier sobre archivos W5: verde
- Pruebas focalizadas de Auth/autorización: 17/17

Incidencia reproducida y resuelta: PostgreSQL se apagó una vez durante una corrida y produjo
`ECONNREFUSED`. Se verificó que no había agentes paralelos, se ejecutó `pnpm db:up` y
`pnpm db:migrate`. Luego se confirmó la carrera entre archivos de integración y se corrigió con
`fileParallelism: false`.

## 5. Entorno actual

- Node 24.18, pnpm 11.18, Git y `gh` disponibles.
- PostgreSQL embedded 17 compartido en `127.0.0.1:54322`.
- `.env` local ignorado apunta a la base aislada `va_w5`.
- `va_w5` existe y está migrada.
- No hay Supabase CLI, Docker, `psql` ni proyecto remoto configurado.
- No hay servidor Next escuchando en 3104 al cerrar este handoff.
- El puerto 3000 estuvo ocupado por un proceso ajeno de `D:\dev\chatbot-zulu`; verificar antes de
  usarlo. 3104 es la alternativa usada anteriormente.
- `.claude/` es contenido ajeno, no versionado. No añadirlo, modificarlo ni borrarlo.
- Los commits históricos `c915adc` y `cc61e29` siguen intactos. No reescribir `main` sin una
  decisión expresa del responsable.

Regla de base: nunca ejecutar `db:down` o `db:reset`. `db:up` solo cuando se compruebe que no
hay agentes paralelos. Cada lane usa su propia base y solo `pnpm db:migrate`.

## 6. Siguiente trabajo, por orden

1. Verificar CI y revisión de PR #18. Corregir cualquier hallazgo antes de mergear.
2. Mergear #18 únicamente con CI verde:
   `gh pr merge 18 --squash --subject "feat(web): añade autenticación y autorización por roles"`.
3. Actualizar `main` y crear una rama/PR nueva para la siguiente historia W5. No convertir #18 en
   una mega-PR.
4. Implementar UI de asistencia:
   - `/sessions`: profesor ve solo sus grupos/sesiones; admin puede ver todas.
   - `/sessions/[id]`: contexto persistente, métricas claras, roster presentes/ausentes y actividad
     reciente; polling de 3–5 s.
   - Historial por sesión y por estudiante.
   - Correcciones admin-only. El `userId` de `correctAttendance` debe provenir de
     `requireRole('admin')`, nunca del formulario.
   - Bitácora admin de `rfid_events`.
   - Teacher nunca corrige ni consulta grupos ajenos.
5. Añadir pruebas obligatorias:
   - anónimo no entra
   - teacher no corrige
   - teacher no consulta sesión/grupo ajeno
   - roster renderiza ausentes calculados
   - actor de corrección deriva de la sesión
   - polling actualiza sin recarga manual
6. Ejecutar gates y smoke real con simulador antes de cerrar fase 4.
7. Actualizar este handoff al cerrar W5. Después comienza W6: e2e, matriz completa, seguridad y docs
   de despliegue.

## 7. Prompt de reanudación

```text
Continúa el MVP de vision-attendance desde el estado documentado en HANDOFF.md.

Antes de escribir código:
1. Lee HANDOFF.md completo.
2. Lee, en orden, docs/alcance-v2.md, docs/architecture.md, docs/data-model.md,
   docs/device-contract.md y docs/agent-playbook.md.
3. Verifica el estado real de git, PR #18 y CI; no supongas que el handoff sigue actualizado.
4. Excluye siempre .claude/ y no reescribas main ni los commits históricos c915adc/cc61e29.

Estado esperado:
- main en 56df2d9.
- rama w5/auth-y-asistencia-ui con PR draft #18.
- commit publicado cf0c475 implementa Supabase Auth SSR y autorización por roles.
- PostgreSQL compartido en 127.0.0.1:54322; .env apunta a va_w5.
- no hay recursos Supabase cloud configurados.

Primero cierra PR #18: espera CI, revisa hallazgos, corrige y mergea solo con CI verde mediante:
gh pr merge 18 --squash --subject "feat(web): añade autenticación y autorización por roles"

Después crea una nueva rama/PR W5 para la UI de asistencia. Implementa /sessions, sesión en vivo con
polling 3–5 s, roster presentes/ausentes, historial por sesión/estudiante, correcciones admin-only y
bitácora de eventos. Consume únicamente apps/web/src/server/attendance; no uses Drizzle en
componentes. Teacher solo puede consultar sus grupos. En correcciones, deriva userId de la sesión
admin y nunca del formulario.

Usa los activos oficiales ya incluidos y apps/web/PRODUCT.md. Mantén UI en español, WCAG 2.2 AA y
la dirección visual seed 4e33298b / operate / tablero-de-aula. Si Impeccable está disponible, termina
con detector, capturas desktop/mobile y revisión fresca.

Antes de avanzar o mergear: pnpm lint, pnpm typecheck, pnpm test, pnpm build y smoke real con el
simulador. No ejecutes db:down/db:reset; db:up solo si no hay agentes paralelos. No agregues
migraciones: después de F1 solo W4 puede hacerlo. Una PR por historia, commits Conventional Commit
con scope inglés y mensaje en español.
```
