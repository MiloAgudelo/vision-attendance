# ADR 0001 — Base de datos: Postgres en Supabase (no Firebase)

**Estado:** Aceptada (2026-08-06, confirmada por el responsable del proyecto)

## Contexto

El borrador inicial recomendaba Firebase/Firestore con una capa de repositorios para una migración futura a Postgres. El dominio es esencialmente relacional: estudiantes ↔ inscripciones ↔ grupos ↔ sesiones ↔ asistencias, con unicidad transaccional (una asistencia por sesión-estudiante), anti-joins ("ausentes = inscritos sin asistencia") y reportes futuros.

## Decisión

Postgres gestionado por **Supabase (tier gratuito)** desde el día 1. **Sin capa de abstracción de proveedor**: el código usa SQL/ORM directamente.

## Comparación

| Criterio | Firestore | Postgres (Supabase) |
|---|---|---|
| Dominio relacional (inscripciones, joins) | Modelado manual, duplicación de datos | Nativo |
| "Ausentes" (anti-join) | Varias consultas + merge en aplicación | `LEFT JOIN ... WHERE NULL` |
| Integridad referencial y unicidad (sesión, estudiante) | Manual / transacciones limitadas | Constraints y transacciones nativas |
| Idempotencia (unique eventId) | Documento con ID determinista (viable) | `UNIQUE(device_id, event_id)` |
| Migraciones versionadas | No existe el concepto | SQL versionado (drizzle-kit) |
| Desarrollo local y pruebas | Emuladores | `supabase start` o Postgres en Docker |
| Reportes futuros | Costoso | SQL |
| Tiempo real (vista en vivo) | Nativo | Polling (suficiente, ≤5 s) o Supabase Realtime |
| Auth integrada | Firebase Auth | Supabase Auth |
| Lock-in | Alto (modelo de datos) | Bajo (Postgres estándar, exportable con pg_dump) |
| Costo piloto | Gratis | Gratis |

## Consecuencias

- Se elimina la "capa de repositorios para migrar después": era el costo de una mala elección, no una buena práctica.
- Autenticación con Supabase Auth; el resto del stack de Supabase (Storage, Edge Functions) no se usa en el MVP.
- La vista en vivo se implementa con polling; Supabase Realtime queda como mejora directa si el polling se queda corto.
- Riesgo aceptado: el tier gratuito pausa proyectos inactivos (~1 semana sin uso); irrelevante durante el desarrollo activo, documentar para el piloto.

## Alternativa descartada

Firebase/Firestore. Se reconsideraría solo si apareciera un requisito dominante de sincronización offline multi-cliente en móviles, que no está en ninguna fase prevista.
