# Playbook de agentes — vision-attendance

Cómo se particiona la construcción para trabajo paralelo de agentes de IA. Sin sprints ni fechas: el orden lo dicta el grafo de dependencias. Documentos normativos: `alcance-v2.md`, `architecture.md`, `data-model.md`, `device-contract.md`, ADRs.

## 1. Convenciones de git (obligatorias)

- **Conventional Commits**: `feat|fix|chore|docs|test|refactor|ci(scope): mensaje`. Scopes: `web`, `db`, `shared`, `simulator`, `ci`, `docs`, `repo`. **Mensajes en español, siempre con tildes y ortografía correcta** (los prefijos y scopes se mantienen en inglés por convención del estándar).
- **Todo cambio entra por PR** hacia `main`. La rama local actual es `master`: la fase F0 la renombra a `main` (`git branch -m master main`) y la publica.
- **Stacked PRs de GitHub** cuando una lane produce trabajo dependiente: rama B se crea desde rama A y su PR usa A como base (`gh pr create --base <rama-A>`); al mergear A, GitHub retargetea B a `main` automáticamente. Regla: una PR por historia, apilada sobre su dependencia, nunca una mega-PR por fase.
- Ramas: `<lane>/<breve-descripcion>` — ej. `f1/scaffold-monorepo`, `w2/events-endpoint`, `w2/idempotency` (apilada sobre la anterior).
- Merge solo con CI en verde. Sin `--no-verify`.

## 2. Lanes y grafo de dependencias

```
F0 repo (main, CI vacío)
 └─ F1 fundaciones (monorepo + shared + db + esquema completo + web esqueleto)
     ├─ W1 dominio académico (CRUD)        ─┐
     ├─ W2 dispositivos + ingesta eventos   ├─ W4 motor de asistencia ── W5 UI asistencia
     └─ W3 simulador                       ─┘        (W4 depende de W1+W2; W3 solo de F1)
                                            W6 estabilización (depende de todo)
FW firmware ESP32: track paralelo, solo depende del contrato; se integra al final.
```

**F1 es UNA sola lane secuencial** (toca todos los archivos raíz). W1, W2, W3 corren en paralelo tras F1. W5 puede empezar su parte de UI admin en paralelo con W4.

## 3. Propiedad única de archivos compartidos

Estos archivos tienen un dueño; nadie más los modifica (si otra lane necesita un cambio, lo pide en su PR como comentario/issue y lo aplica el dueño):

| Archivo(s) | Dueño |
|---|---|
| `package.json` raíz, `pnpm-workspace.yaml`, tsconfig base, `.github/workflows/*`, `.env.example` | F1 (tras F1: lane de mantenimiento W6) |
| `packages/db/src/schema.ts` y `packages/db/migrations/*` | F1 crea el esquema MVP completo; después, **solo W4** puede migrar (cambios esperados: ninguno o mínimos) |
| `packages/shared/src/contracts/*` y `docs/device-contract.md` | W2 |
| `docs/alcance-v2.md`, ADRs | humano/orquestador |

Regla anti-conflicto adicional: cada lane escribe solo dentro de sus carpetas autorizadas (§4). Migraciones nuevas siempre con timestamp posterior a las existentes; jamás editar una migración ya mergeada.

## 4. Definición de cada lane

### F1 — Fundaciones (secuencial, un agente)
- **Entregables:** monorepo pnpm funcional; `@va/shared` (enums de dominio + Zod del contrato v1); `@va/db` (esquema Drizzle COMPLETO según `data-model.md`, migraciones iniciales, cliente, seed de desarrollo); `apps/web` Next.js + TypeScript + Tailwind con página inicial y `GET /api/health`; Supabase local (`supabase start`) o Docker Postgres documentado; `.env.example`; CI (install → lint → typecheck → test → build); README de arranque.
- **Autorizado:** todo el repo. **Criterio de salida:** `pnpm install && pnpm db:migrate && pnpm db:seed && pnpm dev` funciona desde cero; CI verde; esquema migra sobre Postgres limpio.

### W1 — Dominio académico
- **Entregables:** CRUD server-side + UI admin de: estudiantes, materias, grupos, inscripciones, horarios. Validación Zod. Soft-delete por status.
- **Autorizado:** `apps/web/src/**` (subárbol académico: `src/server/academic/`, `src/app/(admin)/{students,subjects,groups,schedules}/`). **Prohibido:** esquema db, contratos, archivos raíz.
- **Pruebas:** unitarias de validación + integración de unicidad (enrollments, groups).

### W2 — Dispositivos e ingesta de eventos
- **Entregables:** CRUD de dispositivos (creación muestra la key una sola vez, revocación, modo normal/enrolamiento); `POST /api/v1/events` completo según `device-contract.md`: auth por hash, idempotencia `(device_id, event_id)`, registro incondicional (RN1), resolución de carnet, respuesta almacenada en `response`; flujo de enrolamiento (captura + asociación en la web); normalización de UID.
- **Autorizado:** `apps/web/src/server/devices/`, `apps/web/src/server/events/`, `apps/web/src/app/api/v1/events/`, `apps/web/src/app/(admin)/devices/`, `packages/shared/src/contracts/` (dueño). 
- **Pruebas:** contrato (Zod), idempotencia (mismo eventId 2× → misma respuesta, 1 evento), auth (401/403), carnet desconocido, enrolamiento, dos eventos concurrentes con mismo eventId (constraint).
- **Nota:** en esta lane el evento puede quedar `no_session` siempre (stub del motor); W4 conecta la sesión.

### W3 — Simulador
- **Entregables:** CLI `@va/simulator` (`pnpm sim -- …`): enviar lectura (uid, device, key), repetir mismo eventId, ráfaga de N lecturas, alterar `scannedAt` (atrasado/incorrecto), simular timeout+reintento, modo enrolamiento; salida legible con la respuesta completa; exportable como cliente programático para pruebas de W2/W4/W6.
- **Autorizado:** `tools/simulator/**`. **Prohibido:** importar `@va/db`; tocar `apps/web`.
- **Pruebas:** unitarias del generador de eventos; smoke contra `localhost`.

### W4 — Motor de asistencia
- **Entregables:** determinación de sesión (ventana RN2, creación perezosa RN3 con `ON CONFLICT`), verificación de inscripción, creación de asistencia (RN6), conexión completa del pipeline de eventos (reemplaza el stub de W2), correcciones manuales admin-only con auditoría (RN9), manejo de zona horaria (RN10, `America/Bogota`).
- **Autorizado:** `apps/web/src/server/attendance/`, `apps/web/src/server/sessions/`; único autorizado a nuevas migraciones si hicieran falta.
- **Pruebas (obligatorias, el corazón del sistema):** ventana de sesión (límites exactos, −60 min, fin de clase); creación perezosa concurrente (2 eventos simultáneos → 1 sesión); mismo UID 2× en sesión → `already_registered`; no inscrito; sin sesión; corrección crea/actualiza + fila de auditoría; cálculo tz con horario local vs timestamps UTC; evento con `scannedAt` incorrecto no altera `checked_in_at`.

### W5 — UI de asistencia
- **Entregables:** vista de sesión **en vivo** (roster presentes con hora y minutos vs inicio + ausentes, polling 3–5 s); historial por sesión y por estudiante; pantalla de correcciones (admin); bitácora de eventos (`no_session`, `unknown_card`, etc.); login Supabase Auth + roles admin/teacher; UI en español.
- **Autorizado:** `apps/web/src/app/**` (vistas de asistencia/sesiones/login), `apps/web/src/components/`. Consume solo funciones de `src/server/` — prohibido acceder a Drizzle directamente desde componentes.
- **Pruebas:** autorización (teacher no corrige, anónimo no entra), render del roster con ausentes calculados.

### W6 — Estabilización
- **Entregables:** e2e del flujo completo usando el simulador como cliente (enrolar → escanear → en vivo → corregir → auditar); casos de la matriz de pruebas del alcance (duplicados, atrasados, revocado, reasignación de carnet); revisión de seguridad (RLS deny-all activo, secretos, rate-limit básico del endpoint); README/docs finales; despliegue (Vercel + Supabase) documentado.
- **Autorizado:** `e2e/**`, docs, CI (hereda propiedad de F1).

### FW — Firmware (track paralelo, no bloquea nada)
- PlatformIO, ESP32 + RC522, contrato v1, credencial en `secrets.h` fuera del repo (`.gitignore` desde F1). **Gate previo:** verificación de estabilidad del UID (`alcance-v2.md` §18). **Autorizado:** `firmware/**`.

## 5. Reglas de integración

1. Una PR por historia; apilada si depende de otra PR abierta de la misma lane.
2. CI verde + typecheck + tests de la lane antes de merge. Definición de terminado: código + pruebas + textos UI en español + sin `TODO` sin issue.
3. Ninguna PR mezcla lanes. Si un agente descubre que necesita tocar territorio ajeno, se detiene y lo reporta al orquestador.
4. El orquestador (sesión principal) hace merge en orden de dependencias y relanza lanes bloqueadas.
5. Los agentes no despliegan ni crean recursos cloud; Supabase remoto lo conecta el humano vía `.env`.
