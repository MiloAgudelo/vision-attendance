# Alcance consolidado v2
## Sistema de registro de asistencia mediante RFID
**Institución Universitaria Visión de las Américas**

> Este documento reemplaza a `alcance-inicial.md` como fuente de verdad del alcance.
> Cada punto está etiquetado según su naturaleza:
> **[Confirmado]** decidido por el responsable del proyecto ·
> **[Supuesto]** adoptado por el equipo técnico, reversible, se revisa si alguien lo objeta ·
> **[Decisión técnica]** resuelta por el equipo de desarrollo ·
> **[Decisión institucional]** tomada o pendiente por la universidad / responsable autorizado ·
> **[Futuro]** fuera del MVP.

---

## 1. Problema

El control de asistencia en clase se realiza con procesos manuales (llamado a lista, firmas), que consumen tiempo de clase, producen errores, no registran la hora real de llegada y generan información dispersa y difícil de consultar. **[Confirmado]**

## 2. Contexto

- Los carnets institucionales incorporan tecnología RFID de 13.56 MHz, verificada como legible con un lector RC522. **[Confirmado — pendiente verificar estabilidad del UID, ver §18]**
- El desarrollo inicial ocurre en el contexto de la asignatura Laboratorio de Desarrollo, con un piloto en un solo grupo. **[Confirmado]**
- La construcción se realizará principalmente con agentes de IA y workflows; el trabajo debe estar particionado en módulos con límites claros para permitir trabajo paralelo de agentes. No se planifica por sprints con fechas. **[Confirmado]**
- Existe interés institucional en las fases futuras (múltiples materias, profesores, despliegue institucional). **[Confirmado]**

## 3. Objetivo general

Registrar automáticamente la hora de ingreso de los estudiantes a las sesiones de una materia mediante la lectura de su carnet RFID, y permitir su consulta en vivo y su administración desde una aplicación web. **[Confirmado]**

(La visión de largo plazo — profesores, despliegue institucional — se documenta en §21 como fases futuras y no forma parte de este objetivo.)

## 4. Objetivos específicos

1. Asociar el UID RFID de cada carnet con un estudiante mediante un modo de enrolamiento (escaneo del carnet por primera vez). **[Confirmado]**
2. Recibir eventos de lectura desde un dispositivo (ESP32 real o simulador) a través de una API autenticada e idempotente. **[Confirmado]**
3. Registrar de forma fiel y auditable la hora de ingreso de cada persona, con o sin sesión de clase asociada. **[Confirmado]**
4. Determinar la sesión de clase correspondiente y la lista de presentes/ausentes por sesión. **[Confirmado]**
5. Mostrar la asistencia en vivo durante la clase en la aplicación web. **[Confirmado]**
6. Permitir correcciones manuales por el administrador, con rastro de auditoría. **[Confirmado]**
7. Desarrollar y probar todo el flujo sin hardware, mediante un simulador que use el contrato exacto del ESP32. **[Decisión técnica]**

## 5. Actores

| Actor | Acceso en el MVP |
|---|---|
| **Administrador** | Gestiona estudiantes, carnets, materia, grupo, horarios, dispositivos; corrige asistencias; ve todo. **[Confirmado]** |
| **Profesor** | Consulta la asistencia de su grupo (en vivo y en histórico). No corrige. **[Confirmado — correcciones solo admin]** |
| **Dispositivo** | ESP32 (1 unidad) o simulador. Solo envía eventos de lectura por la API con credencial propia. **[Confirmado]** |
| **Estudiante** | Solo interactúa con el lector físico. Sin acceso web en el MVP. **[Confirmado]** |

En el piloto el administrador y el operador del sistema pueden ser la misma persona. **[Supuesto]**

## 6. Alcance del MVP

1. Registro de estudiantes (nombre, código estudiantil, UID del carnet). **[Confirmado]**
2. **Modo enrolamiento**: al escanear un carnet desconocido en modo enrolamiento, el UID queda disponible en la web para crear el estudiante o asociarlo a uno existente. **[Confirmado]**
3. Creación de la materia, un grupo, inscripciones y horarios semanales. Modelo de datos multi-materia/multi-grupo; interfaz enfocada en un solo grupo. **[Confirmado]**
4. API de eventos RFID: autenticación por dispositivo, idempotencia por `eventId`, validación completa. **[Confirmado]**
5. Registro garantizado de la hora de entrada: **todo evento válido de un carnet conocido queda registrado con su hora, exista o no una sesión de clase que coincida**. **[Confirmado — regla central pedida por el responsable]**
6. Creación perezosa de sesiones: la sesión se crea automáticamente al primer evento dentro de la ventana del horario. **[Supuesto aceptado por el responsable]**
7. Vista de sesión en vivo: presentes con su hora de llegada, ausentes (inscritos sin registro), actualizada durante la clase. **[Confirmado]**
8. Historial de asistencia por sesión y por estudiante dentro del grupo. **[Confirmado]**
9. Corrección manual por el administrador (marcar presente/ausente con motivo), con auditoría mínima. **[Confirmado]**
10. Simulador de dispositivo con el contrato exacto del futuro ESP32. **[Decisión técnica]**
11. Firmware ESP32 + RC522 como track paralelo, integrable al final contra la misma API. **[Confirmado]**

## 7. Fuera del alcance del MVP

- Exportación a Excel/CSV/PDF. **[Confirmado — "no por ahora"]**
- Funcionamiento offline del firmware (almacenamiento local y sincronización). La API sí tolera eventos atrasados. **[Confirmado]**
- Estados "Justificado", "Pendiente de revisión" y flujos de novedades. **[Futuro]**
- Registro de asistencia de profesores. **[Futuro — Decisión institucional]**
- Cancelaciones, reprogramaciones, festivos, clases extraordinarias. **[Futuro]**
- Portal del estudiante. **[Futuro]**
- Múltiples dispositivos, rotación automática de credenciales, pantalla en el lector. **[Futuro]**
- Integración con sistemas académicos institucionales. **[Futuro]**
- Control de acceso físico, reconocimiento facial, apps móviles. **[Futuro]**

## 8. Reglas de negocio

**RN1 — Registro de entrada incondicional.** Un evento de un dispositivo autorizado con un carnet conocido siempre produce un registro de entrada con fecha y hora, aunque no coincida con ninguna sesión. "Solo necesito que quede registro de a qué hora entró la persona." **[Confirmado]**

**RN2 — Asociación a sesión.** Si el evento cae dentro de la ventana de una sesión del grupo del estudiante, además se genera (o confirma) su asistencia a esa sesión. Ventana: desde 60 minutos antes de la hora programada de inicio hasta la hora programada de fin. **[Supuesto — el valor 60 min es configurable por grupo]**

**RN3 — Sesión perezosa.** La sesión de un grupo/fecha se crea automáticamente cuando llega el primer evento dentro de su ventana, según el horario. No hay creación manual ni programada de sesiones en el MVP. **[Confirmado — recomendación aceptada]**

**RN4 — Puntualidad derivada, no almacenada.** No existe estado "tarde" persistido. La asistencia guarda la hora exacta de entrada; la interfaz muestra los minutos transcurridos respecto a la hora programada de inicio. Cualquier regla futura de tardanza se calcula sobre los datos, sin migración. **[Decisión técnica, derivada de RN1]**

**RN5 — Estados de asistencia.** `presente` (por escaneo o por corrección manual) y `ausente` (calculado al consultar: inscrito sin registro en la sesión; no se persiste). Campo separado `origen`: `dispositivo` | `manual`. **[Decisión técnica]**

**RN6 — Unicidad.** Máximo una asistencia por (sesión, estudiante). Un escaneo repetido responde "ya registrado" sin crear duplicado. **[Confirmado]**

**RN7 — Idempotencia.** Cada evento porta un `eventId` único generado por el dispositivo. Un `eventId` repetido devuelve la misma respuesta original sin reprocesar. **[Confirmado]**

**RN8 — Hora del servidor como verdad.** El timestamp del servidor al recibir el evento determina la hora de entrada. El timestamp del dispositivo se almacena como dato informativo (útil para diagnosticar atrasos). **[Decisión técnica]**

**RN9 — Correcciones.** Solo el administrador corrige asistencias. Toda corrección registra: quién, cuándo, valor anterior, valor nuevo y motivo. **[Confirmado]**

**RN10 — Zona horaria.** Timestamps almacenados en UTC (`timestamptz`); horarios definidos en hora local `America/Bogota`; conversión en el backend. **[Decisión técnica]**

**RN11 — El UID no autentica.** El UID identifica al estudiante pero no es secreto ni credencial. La autenticación de la solicitud es del dispositivo. **[Decisión técnica]**

## 9. Flujo principal

1. Admin crea materia, grupo, horario e inscribe estudiantes (o los enrola por escaneo).
2. El estudiante acerca su carnet al lector al entrar a clase.
3. El dispositivo envía `{deviceId, eventId, cardUid, scannedAt}` a la API con su credencial.
4. El backend: autentica el dispositivo → verifica idempotencia → resuelve el carnet → **registra la entrada (RN1)** → busca/crea sesión (RN2, RN3) → verifica inscripción → crea asistencia si no existe (RN6).
5. Responde al dispositivo con el resultado (registrado / ya registrado / carnet desconocido / etc.).
6. El profesor ve la lista en vivo en la vista de sesión.

## 10. Flujos alternativos

| Caso | Comportamiento |
|---|---|
| Carnet desconocido (modo normal) | Evento registrado como `carnet_desconocido`; respuesta de error al dispositivo; visible para el admin. |
| Carnet desconocido (modo enrolamiento) | UID capturado y ofrecido en la web para asociar/crear estudiante. |
| Evento fuera de toda ventana de sesión | Entrada registrada (RN1) con resultado `sin_sesion`; sin asistencia. |
| Estudiante no inscrito en el grupo | Entrada registrada; sin asistencia; resultado `no_inscrito`. |
| Escaneo repetido en la misma sesión | Respuesta `ya_registrado`; sin duplicado. |
| `eventId` repetido (reintento) | Misma respuesta original (RN7). |
| Dispositivo con credencial inválida o revocada | 401/403; el evento no se procesa. |
| Evento atrasado (reintento tras caída de red) | Aceptado; se usa `scannedAt` del dispositivo como referencia informativa y el criterio de sesión se evalúa con tolerancia. **[Supuesto: tolerancia simple en MVP]** |
| Corrección manual | Admin marca presente/ausente con motivo; queda en auditoría (RN9). |

## 11. Entidades principales

Modelo conceptual (el esquema físico se define en la fase de arquitectura):

- **Usuario** (admin, profesor — cuentas de acceso web).
- **Estudiante** (nombre, código estudiantil, estado). *Sin cuenta de usuario en el MVP.*
- **Carnet** (UID, estudiante, estado activo/inactivo, fecha de asociación). *Separado del estudiante para permitir reasignación/reposición.*
- **Materia**, **Grupo** (materia, periodo como texto, profesor), **Inscripción** (estudiante, grupo, estado) ← *entidad que faltaba en el borrador*, **Horario** (grupo, día de semana, hora inicio/fin local).
- **Sesión** (grupo, fecha, horas programadas; creada perezosamente).
- **Dispositivo** (nombre, credencial hasheada, estado, modo normal/enrolamiento, última conexión).
- **EventoRFID** (eventId, dispositivo, UID, scannedAt del dispositivo, receivedAt del servidor, resultado, respuesta). *Bitácora inmutable: todo evento recibido queda aquí — es el "registro de a qué hora entró".*
- **Asistencia** (sesión, estudiante, hora de entrada, origen, evento de origen, observaciones). Única por (sesión, estudiante).
- **Corrección/Auditoría** (asistencia, usuario, timestamp, valor anterior, valor nuevo, motivo).

Salón y Periodo académico: campos de texto simples en el MVP, entidades propias en fase futura. **[Decisión técnica]**

## 12. Restricciones

- Presupuesto: tier gratuito de Supabase. **[Confirmado]**
- Un solo ESP32 físico. **[Confirmado]**
- Red del piloto: la red institucional tiene portal cautivo (hay credenciales); el piloto puede correr con hotspot. Se asume **hotspot como plan principal** para el ESP32 — los portales cautivos son hostiles para microcontroladores. **[Confirmado + Supuesto técnico]**
- Interfaz en español; código, identificadores y esquema en inglés. **[Confirmado]**
- Repositorio: `vision-attendance` (nombre existente). **[Confirmado]**

## 13. Requisitos funcionales (resumen)

RF1 CRUD de estudiantes y asociación de carnets (incl. enrolamiento por escaneo). RF2 CRUD de materia, grupo, inscripciones, horarios. RF3 Registro y gestión de dispositivos (alta, credencial, revocación, modo). RF4 Endpoint de eventos RFID (autenticado, idempotente, validado). RF5 Registro incondicional de entradas (RN1). RF6 Creación perezosa de sesiones y asignación de asistencia. RF7 Vista de sesión en vivo con presentes/ausentes y hora de llegada. RF8 Historial por sesión y por estudiante. RF9 Corrección manual con auditoría. RF10 Simulador de dispositivo (mismo contrato del ESP32, reintentos, eventos duplicados y atrasados).

## 14. Requisitos no funcionales

- Respuesta del endpoint de eventos < 2 s en condiciones normales (feedback inmediato en el lector).
- La vista en vivo refleja un nuevo escaneo en ≤ 5 s (polling; Supabase Realtime como mejora si el polling se queda corto). **[Decisión técnica]**
- Trazabilidad completa: ningún evento recibido se descarta silenciosamente.
- Todo el flujo ejecutable en local sin hardware y sin servicios de pago.
- Módulos con límites claros para trabajo paralelo de agentes de IA. **[Confirmado]**
- Migraciones de base de datos versionadas desde la primera tabla.

## 15. Seguridad

- Autenticación de usuarios web (admin, profesor) con Supabase Auth. **[Decisión técnica]**
- Autorización por rol en el servidor; el navegador nunca escribe asistencias directamente — toda mutación pasa por la API. **[Decisión técnica]**
- Credencial única por dispositivo (API key de alta entropía, almacenada hasheada, revocable). **[Decisión técnica]**
- HTTPS extremo a extremo; secretos fuera del repositorio (variables de entorno). 
- El UID nunca se usa como autenticación (RN11).
- Auditoría mínima de correcciones en el MVP; auditoría general de mutaciones en fase futura.

## 16. Privacidad y tratamiento de datos

- El piloto usará **datos reales de estudiantes sin texto de consentimiento**, por decisión del responsable del proyecto (2026-08-06). **[Decisión institucional — riesgo aceptado por el responsable]**
- Mitigación técnica adoptada: **minimización de datos** — el MVP captura solo nombre, código estudiantil y UID del carnet; sin correo, sin programa académico. **[Decisión técnica]**
- Retención: los datos del piloto se conservan hasta decisión contraria; revisar al cierre del semestre. **[Supuesto]**
- Los registros del MVP **no tienen validez administrativa** (la suplantación por préstamo de carnet es un riesgo aceptado). **[Confirmado en el borrador original]**

## 17. Supuestos vigentes

1. Un grupo, un horario semanal estable durante el piloto.
2. Solo ingreso; un segundo escaneo no significa salida.
3. Ventana de sesión: −60 min / fin de clase (configurable por grupo).
4. Ausente = calculado al consultar; no se persiste ni hay proceso de cierre de sesión.
5. Admin y profesor pueden ser la misma persona en el piloto.
6. Hotspot como red del dispositivo en el piloto.
7. El UID de los carnets es estable entre lecturas (**pendiente de verificación**, §18).

## 18. Dependencias y verificaciones pendientes

1. **Verificar estabilidad del UID** (única verificación de hardware pendiente): con el RC522 que ya lee el carnet, leer **el mismo carnet 3+ veces, retirándolo y reacercándolo**, y confirmar que el UID es idéntico en todas las lecturas; repetir con un segundo carnet y confirmar que su UID es distinto. Si el UID cambia entre lecturas (UID aleatorio), el diseño de identificación debe replantearse antes de construir el firmware. *El desarrollo del software no se bloquea por esto.*
2. Anotar la longitud del UID observado (4 o 7 bytes) para el contrato de la API.
3. Cuenta de Supabase (tier gratuito) creada por el responsable o el equipo.

## 19. Riesgos

| Riesgo | Estado | Mitigación |
|---|---|---|
| UID aleatorio o inestable | Abierto (verificación §18) | Software avanza con simulador; verificar antes del firmware |
| Datos reales sin consentimiento | **Aceptado por el responsable** | Minimización de datos; sin validez administrativa; revisar si el piloto escala |
| Portal cautivo institucional | Mitigado | Hotspot como plan principal |
| Conflictos entre agentes de IA en archivos compartidos | Abierto | Propiedad única de esquema, contratos y config raíz (se define en la estrategia de agentes) |
| Tier gratuito de Supabase (pausa por inactividad, límites) | Bajo | Suficiente para el piloto; documentar límites |
| Suplantación por préstamo de carnet | Aceptado | Fuera del MVP |

## 20. Criterios de éxito del MVP

1. Con el **simulador**: el flujo completo (enrolar → escanear → validar → sesión → asistencia → ver en vivo → corregir → auditar) funciona de extremo a extremo en local.
2. Todo evento recibido queda registrado con su hora, incluso sin sesión coincidente.
3. Eventos duplicados y reintentos no generan asistencias duplicadas (probado automáticamente).
4. La vista en vivo muestra un escaneo nuevo en ≤ 5 s.
5. Una corrección manual queda trazada en auditoría.
6. Con el **hardware**: el ESP32+RC522 reproduce el mismo flujo contra la misma API en una sesión real de Laboratorio de Desarrollo.

Los criterios 1–5 no dependen del hardware.

## 21. Fases futuras

- **Fase 2:** múltiples materias y grupos en la UI, panel por profesor, reportes, exportación CSV/Excel, justificaciones y novedades.
- **Fase 3:** registro de presencia de profesores. **[Decisión institucional — requiere aval expreso de la universidad; implica supervisión laboral; no se compromete técnicamente]**
- **Fase 4:** despliegue institucional: múltiples dispositivos, rotación de credenciales, integración con el sistema académico, importación masiva, alertas, auditoría completa, gestión de periodos, offline en firmware.
