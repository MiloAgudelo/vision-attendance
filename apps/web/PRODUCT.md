# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

El usuario principal es el profesor que consulta la asistencia de su grupo durante la clase. El
administrador configura estudiantes, grupos, horarios y dispositivos; además corrige asistencias y
consulta la auditoría. En el piloto, administrador y operador pueden ser la misma persona.

## Product Purpose

Registrar automáticamente la hora de ingreso de estudiantes mediante su carnet RFID y permitir
consultar la asistencia en vivo y en el histórico. El éxito del MVP significa que cada lectura
autorizada queda trazada, las sesiones y asistencias se resuelven de forma idempotente y los usuarios
web solo acceden a las funciones permitidas por su rol.

## Positioning

Combina un lector RFID autenticado con una bitácora inmutable, sesiones académicas creadas de forma
perezosa y correcciones auditables. La interfaz muestra el estado derivado de esos eventos sin
convertir el UID del carnet en una credencial ni persistir estados como «tarde» o «ausente».

## Operating Context

- El profesor usa la vista en vivo durante una clase y espera ver nuevos registros en cinco segundos
  o menos.
- El administrador prepara el dominio académico, gestiona lectores y corrige casos excepcionales con
  un motivo obligatorio.
- Los lectores hablan con `POST /api/v1/events`; la web consume funciones server-side y nunca accede
  directamente a Drizzle desde componentes.
- Horarios en `America/Bogota`; timestamps almacenados en UTC y hora del servidor como verdad.

## Capabilities and Constraints

- Roles web: `admin` y `teacher`. El profesor consulta sus grupos; solo un administrador activo puede
  corregir o usar las pantallas administrativas.
- Autenticación con Supabase Auth y autorización por rol en el servidor. La tabla `users.id` coincide
  con `auth.users.id`.
- UI en español, polling de 3–5 segundos para la sesión en vivo y ausencias calculadas al consultar.
- Sin exportaciones CSV/Excel/PDF, firmware offline, estados persistidos «tarde»/«justificado»,
  paquetes `ui`/`config`/`auth`, API separada ni recursos cloud creados por el agente.
- Los registros del piloto no tienen validez administrativa y el MVP minimiza datos del estudiante a
  nombre, código y UID del carnet.

## Brand Commitments

- Nombre institucional: Institución Universitaria Visión de las Américas.
- Voz clara, operativa y respetuosa; textos de interfaz en español.
- Logo y favicon oficiales reutilizados desde
  `https://github.com/MiloAgudelo/vision-electoral/tree/main/apps/web/public`:
  `public/logo-institucional.png`, `src/app/favicon.ico`, `src/app/icon.png` y
  `src/app/apple-icon.png`.
- No inventar logos, sellos, acreditaciones, cifras institucionales ni otros activos oficiales.

## Evidence on Hand

- Alcance y reglas aprobadas en `docs/alcance-v2.md`.
- Arquitectura y roles en `docs/architecture.md`; esquema físico en `docs/data-model.md`.
- Contrato del lector en `docs/device-contract.md` y pruebas de integración del flujo RFID.
- No hay testimonios, métricas institucionales, fotografías oficiales ni claims comerciales que
  puedan publicarse como hechos.

## Product Principles

1. Cada lectura autorizada debe ser trazable, incluso cuando no produce asistencia.
2. La hora y los estados se muestran con precisión, sin inventar categorías administrativas.
3. La operación en clase debe ser inmediata y fácil de escanear visualmente.
4. Toda mutación sensible se autoriza en el servidor y deja el rastro exigido.
5. La interfaz minimiza datos y comunica los errores en lenguaje accionable.

## Accessibility & Inclusion

Objetivo confirmado: WCAG 2.2 nivel AA. La interfaz debe funcionar con teclado, conservar foco
visible, usar nombres accesibles, comunicar estados sin depender solo del color y adaptarse a móvil y
escritorio.
