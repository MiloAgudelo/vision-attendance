/**
 * Formato de fechas y minutos del tablero de aula, siempre en America/Bogota (RN10).
 */

const BOGOTA_DATE = new Intl.DateTimeFormat('es-CO', {
  dateStyle: 'medium',
  timeZone: 'America/Bogota',
});

const BOGOTA_TIME = new Intl.DateTimeFormat('es-CO', {
  timeStyle: 'short',
  timeZone: 'America/Bogota',
});

const BOGOTA_DATE_TIME = new Intl.DateTimeFormat('es-CO', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'America/Bogota',
});

export function formatBogotaDate(value: Date | string): string {
  return BOGOTA_DATE.format(
    typeof value === 'string' ? new Date(`${value}T12:00:00-05:00`) : value,
  );
}

export function formatBogotaTime(value: Date): string {
  return BOGOTA_TIME.format(value);
}

export function formatBogotaDateTime(value: Date): string {
  return BOGOTA_DATE_TIME.format(value);
}

/** Minutos respecto al inicio programado: negativo = anticipado. */
export function formatMinutesFromStart(minutes: number | null): string {
  if (minutes === null) return '—';
  if (minutes === 0) return 'al inicio';
  if (minutes > 0) return `+${minutes} min`;
  return `${minutes} min`;
}
