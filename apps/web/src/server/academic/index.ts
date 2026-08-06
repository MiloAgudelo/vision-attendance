/**
 * Dominio académico (lane W1): estudiantes, materias, grupos, inscripciones y horarios.
 *
 * TypeScript puro sobre Drizzle, sin dependencias de Next: se puede probar sin HTTP
 * (`docs/architecture.md` §3). Es la única puerta de entrada a estos datos para la interfaz.
 */

export * from './database.js';
export * from './enrollments.js';
export * from './errors.js';
export * from './groups.js';
export * from './schedules.js';
export * from './students.js';
export * from './subjects.js';
export * from './validation.js';
