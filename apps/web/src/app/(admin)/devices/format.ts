/**
 * Formato de fechas del panel, siempre en hora local de Bogotá (RN10).
 *
 * La zona se fija explícitamente para que el servidor y el navegador rindan el mismo texto y
 * React no reporte una discrepancia de hidratación.
 */

const BOGOTA = new Intl.DateTimeFormat('es-CO', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'America/Bogota',
});

/** Fecha y hora legibles en Bogotá, o un guion si el dato no existe. */
export function formatBogota(value: Date | null | undefined): string {
  return value ? BOGOTA.format(value) : '—';
}
