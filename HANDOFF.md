# Handoff — vision-attendance

Estado operativo para continuar en otra sesión. Última actualización: **2026-08-11**
(`America/Bogota`).

## 0. Resumen ejecutivo

- `main` está en `0a278de feat(web): añade autenticación y autorización por roles` (squash de #18).
- Fases 2 y 3 cerradas. W1–W4 integradas. Auth W5 mergeada.
- Rama actual de trabajo: `w5/ui-asistencia-en-vivo` (UI de asistencia; PR nueva).
- La UI de asistencia en vivo, historial, correcciones y bitácora está implementada en esa rama.
- No hay migraciones, cambios de esquema ni cambios del contrato v1 en W5.
- No se crearon recursos cloud. No hay proyecto Supabase remoto conectado en este entorno.

## 1. Qué está cerrado

### Fase 2

| PR  | Entregable                | Commit en `main`                                                         |
| --- | ------------------------- | ------------------------------------------------------------------------ |
| #12 | W3 simulador              | `793c640 feat(simulator): añade el simulador de dispositivo RFID`        |
| #13 | W2 dispositivos + eventos | `5759aab feat(web): añade los dispositivos y la ingesta de eventos RFID` |
| #14 | W1 dominio académico      | `11d3e3b feat(web): añade el dominio académico con su administración`    |
| #15 | cierre documental         | `bc610a9 docs(repo): actualiza el cierre de la fase 2`                   |

### Fase 3

| PR  | Entregable             | Commit en `main`                                       |
| --- | ---------------------- | ------------------------------------------------------ |
| #16 | W4 motor de asistencia | `55ad4a4 feat(web): implementa el motor de asistencia` |
| #17 | cierre documental      | `56df2d9 docs(repo): actualiza el cierre de la fase 3` |

### W5 Auth

| PR  | Entregable                         | Commit en `main`                                              |
| --- | ---------------------------------- | ------------------------------------------------------------- |
| #18 | Auth + autorización por roles      | `0a278de feat(web): añade autenticación y autorización por roles` |

## 2. W5 UI asistencia — estado

Implementado en `w5/ui-asistencia-en-vivo`:

- `/sessions`: listado; teacher filtra por `teacherId`; admin ve todas.
- `/sessions/[id]`: tablero en vivo con polling 4 s (`router.refresh`), roster presentes/ausentes,
  minutos vs inicio, historial de correcciones (admin) y formulario de corrección admin-only.
- `/students/[id]/attendance`: historial por estudiante con alcance por rol.
- `/events`: bitácora admin de `rfid_events`.
- `correctAttendanceAction` deriva `userId` de `requireRole('admin')` y borra cualquier `userId`
  del FormData.
- Consume solo `apps/web/src/server/attendance/*`; sin Drizzle en componentes.
- Dirección visual: seed `4e33298b` / `operate` / `tablero-de-aula` (CSS `.classroom-board`).

Pruebas añadidas: anónimo, teacher no corrige, teacher no ve sesión/estudiante ajenos, ausentes
calculados, actor de corrección desde sesión, polling 3–5 s.

## 3. Gates verificados (rama UI)

- `pnpm lint`, `typecheck`, `test` (465: shared 98 + db 23 + simulator 136 + web 208), `build`: verde.
- Smoke: Next en `:3104`; `/sessions` anónimo → 307 `/login`; simulador `enviar` → `no_session`
  (fuera de ventana de clase martes 18:00 Bogotá).
- Impeccable no está disponible en este entorno; quedan detector/capturas/revisión fresca pendientes
  si se instala la skill.

## 4. Entorno

- PostgreSQL embedded 17 en `127.0.0.1:54322`; `.env` → `va_w5` (migrada y sembrada).
- No ejecutar `db:down` / `db:reset`. `db:up` solo sin agentes paralelos.
- `.claude/` ajeno: no versionar.
- Commits históricos `c915adc` y `cc61e29` intactos.

## 5. Siguiente trabajo

1. Abrir/mergear la PR de UI asistencia con CI verde.
2. Cerrar fase 4 documental si corresponde.
3. W6: e2e con simulador, matriz completa, seguridad y docs de despliegue.
