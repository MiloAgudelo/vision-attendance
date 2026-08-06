# Modelo de datos físico — vision-attendance

Postgres (Supabase). Esquema definido en `packages/db/src/schema.ts` (Drizzle, propiedad única de la lane de datos). Todas las tablas del MVP se crean en las migraciones iniciales de la fase de fundaciones, para minimizar cambios de esquema concurrentes después.

Convenciones: ids `uuid` (default `gen_random_uuid()`), timestamps `timestamptz` en UTC, nombres en inglés `snake_case`. Eliminación: **soft-delete por `status`** en entidades de dominio; `rfid_events` y `attendance_corrections` son inmutables (nunca UPDATE de negocio ni DELETE). RLS activado deny-all en todas las tablas (acceso solo desde el servidor).

## Tablas

### `users` — cuentas web (admin, profesor)
| Columna | Tipo | Notas |
|---|---|---|
| id | uuid PK | = `auth.users.id` de Supabase Auth |
| email | text UNIQUE NOT NULL | sensible |
| full_name | text NOT NULL | |
| role | enum `user_role` ('admin','teacher') NOT NULL | |
| status | enum `record_status` ('active','inactive') NOT NULL default 'active' | |
| created_at | timestamptz default now() | |

### `students` — entidad de dominio, sin cuenta web (minimización de datos: sin correo, sin programa)
| Columna | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| student_code | text UNIQUE NOT NULL | código estudiantil |
| full_name | text NOT NULL | sensible |
| status | record_status default 'active' | |
| created_at | timestamptz | |

### `cards` — carnet RFID (separado del estudiante: permite reposición/reasignación)
| Columna | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| uid | text NOT NULL | UID hex normalizado MAYÚSCULAS sin separadores (4 o 7 bytes → 8 o 14 chars) |
| student_id | uuid FK → students NULL | NULL = capturado por enrolamiento, aún sin asignar |
| status | enum `card_status` ('active','inactive') default 'active' | |
| assigned_at | timestamptz NULL | |
| created_at | timestamptz | |

Índice: `UNIQUE (uid) WHERE status = 'active'` (parcial: permite historial de reasignación). Resolución de carnet = buscar uid activo.

### `subjects`
`id` uuid PK · `code` text UNIQUE NOT NULL · `name` text NOT NULL · `created_at`.

### `groups`
| Columna | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| subject_id | uuid FK → subjects NOT NULL | |
| name | text NOT NULL | ej. "G1" |
| term | text NOT NULL | periodo como texto en MVP, ej. "2026-2" |
| teacher_id | uuid FK → users NULL | |
| session_window_minutes | int NOT NULL default 60 | RN2: minutos antes del inicio en que se aceptan escaneos |
| status | record_status | |
| UNIQUE(subject_id, name, term) | | |

### `enrollments` — la entidad que faltaba en el borrador
`id` PK · `group_id` FK NOT NULL · `student_id` FK NOT NULL · `status` record_status · `created_at` · **UNIQUE(group_id, student_id)**.

### `schedules` — horario semanal en hora local America/Bogota
`id` PK · `group_id` FK NOT NULL · `weekday` smallint NOT NULL CHECK 1–7 (1=lunes, ISO) · `start_time` time NOT NULL · `end_time` time NOT NULL CHECK (> start_time) · `room` text NULL (texto simple en MVP).

### `class_sessions` — creadas perezosamente (RN3)
| Columna | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| group_id | uuid FK NOT NULL | |
| schedule_id | uuid FK → schedules NULL | de qué franja nació |
| session_date | date NOT NULL | fecha local Bogotá |
| scheduled_start / scheduled_end | timestamptz NOT NULL | instantes UTC calculados desde schedule + fecha + tz |
| created_at | timestamptz | |

Índice: `UNIQUE(group_id, session_date, scheduled_start)` — hace idempotente la creación perezosa bajo concurrencia (INSERT ... ON CONFLICT DO NOTHING + re-select).

### `devices`
| Columna | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| name | text UNIQUE NOT NULL | ej. "LAB-DESARROLLO-01" |
| api_key_hash | text NOT NULL | SHA-256 de la key; la key en claro solo se muestra al crearla |
| mode | enum `device_mode` ('normal','enrollment') default 'normal' | |
| status | enum `device_status` ('active','revoked') default 'active' | |
| room | text NULL · last_seen_at timestamptz NULL · firmware_version text NULL | |

### `rfid_events` — bitácora inmutable; ES el "registro de a qué hora entró" (RN1)
| Columna | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| device_id | uuid FK NOT NULL | |
| event_id | text NOT NULL | uuid generado por el dispositivo |
| card_uid | text NOT NULL | normalizado |
| card_id | uuid FK → cards NULL | resuelto en el momento del evento |
| scanned_at | timestamptz NULL | reloj del dispositivo, informativo |
| received_at | timestamptz NOT NULL default now() | **fuente de verdad (RN8)** |
| result | enum `event_result` NOT NULL | ver abajo |
| response | jsonb NOT NULL | respuesta exacta devuelta — se reenvía en replays (RN7) |

Índices: **UNIQUE(device_id, event_id)** (idempotencia) · (card_uid, received_at) · (received_at).

`event_result`: `registered` · `already_registered` · `no_session` · `not_enrolled` · `unknown_card` · `enrollment_captured` · `error`.

### `attendances`
| Columna | Tipo | Notas |
|---|---|---|
| id | uuid PK | |
| session_id | uuid FK → class_sessions NOT NULL | |
| student_id | uuid FK → students NOT NULL | |
| checked_in_at | timestamptz NOT NULL | = received_at del evento, o valor de la corrección manual |
| source | enum `attendance_source` ('device','manual') NOT NULL | |
| event_id | uuid FK → rfid_events NULL | NULL si source='manual' |
| notes | text NULL | |
| created_at / updated_at | timestamptz | |

Índice: **UNIQUE(session_id, student_id)** (RN6). Sin estado "tarde" (RN4) ni fila para "ausente" (RN5: ausente = inscrito sin fila, calculado con LEFT JOIN).

### `attendance_corrections` — auditoría mínima (RN9), inmutable
`id` PK · `session_id` FK NOT NULL · `student_id` FK NOT NULL · `attendance_id` FK NULL (NULL si la corrección eliminó la asistencia) · `user_id` FK → users NOT NULL · `action` enum ('mark_present','mark_absent','update') · `old_value` jsonb NULL · `new_value` jsonb NULL · `reason` text NOT NULL · `created_at`.

(Referencia session+student además de attendance para que "marcar ausente" —borrar la fila— no rompa la trazabilidad.)

## Datos sensibles
`students.full_name`, `users.email`, `cards.uid` (dato personal asociable), horas de entrada. Minimización aplicada por diseño (alcance v2 §16). Nunca en logs de aplicación en claro salvo el uid (necesario operativamente).

## Consultas canónicas
- **Roster en vivo:** inscritos del grupo LEFT JOIN asistencias de la sesión → presentes con `checked_in_at` (y minutos vs `scheduled_start`, derivado) + ausentes.
- **Entradas sin sesión / carnets desconocidos:** `rfid_events WHERE result IN ('no_session','not_enrolled','unknown_card')` — visibles para el admin, nada se pierde.
- **Enrolamiento pendiente:** `cards WHERE student_id IS NULL` + últimos eventos `enrollment_captured`.
