/**
 * Dominio académico (lane W1): estudiantes, materias, grupos, inscripciones y horarios.
 *
 * TypeScript puro sobre Drizzle, sin dependencias de Next: se puede probar sin HTTP
 * (`docs/architecture.md` §3). Es la única puerta de entrada a estos datos para la interfaz.
 */

export * from './database';
export * from './enrollments';
export * from './errors';
export * from './groups';
export * from './schedules';
export * from './students';
export * from './subjects';
export * from './validation';
