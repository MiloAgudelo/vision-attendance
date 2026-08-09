/**
 * Conversión explícita entre horarios locales y UTC (RN10).
 *
 * No se construyen fechas a partir de strings sin zona. `Intl.DateTimeFormat` aporta la base de
 * datos IANA del runtime y permite conservar este módulo libre de dependencias de UI o de Next.js.
 */

export const ATTENDANCE_TIME_ZONE = 'America/Bogota';

interface LocalDateTimeParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const localFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: ATTENDANCE_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

function readPart(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): number {
  const value = parts.find((part) => part.type === type)?.value;
  if (!value) throw new Error(`Intl no devolvió la parte local ${type}.`);
  return Number(value);
}

function localPartsAt(instant: Date): LocalDateTimeParts {
  const parts = localFormatter.formatToParts(instant);
  return {
    year: readPart(parts, 'year'),
    month: readPart(parts, 'month'),
    day: readPart(parts, 'day'),
    hour: readPart(parts, 'hour'),
    minute: readPart(parts, 'minute'),
    second: readPart(parts, 'second'),
  };
}

function parseLocalDate(value: string): Pick<LocalDateTimeParts, 'year' | 'month' | 'day'> {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new Error(`Fecha local inválida: ${value}`);
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

function parseLocalTime(value: string): Pick<LocalDateTimeParts, 'hour' | 'minute' | 'second'> {
  const match = /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/.exec(value);
  if (!match) throw new Error(`Hora local inválida: ${value}`);
  return { hour: Number(match[1]), minute: Number(match[2]), second: Number(match[3] ?? 0) };
}

function utcMillis(parts: LocalDateTimeParts): number {
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
}

/**
 * Convierte fecha + hora de Bogotá a un instante UTC usando la zona IANA del runtime.
 *
 * La iteración también funciona si la zona adopta cambios históricos de offset: parte de una
 * aproximación UTC, calcula el offset observado y converge en el instante cuyos componentes
 * locales son los solicitados.
 */
export function bogotaLocalDateTimeToUtc(localDate: string, localTime: string): Date {
  const desired = { ...parseLocalDate(localDate), ...parseLocalTime(localTime) };
  const desiredAsUtc = utcMillis(desired);
  let candidate = desiredAsUtc;

  for (let iteration = 0; iteration < 3; iteration += 1) {
    const observedAsUtc = utcMillis(localPartsAt(new Date(candidate)));
    candidate += desiredAsUtc - observedAsUtc;
  }

  const result = new Date(candidate);
  const observed = localPartsAt(result);
  if (utcMillis(observed) !== desiredAsUtc) {
    throw new Error(
      `La hora local ${localDate} ${localTime} no existe en ${ATTENDANCE_TIME_ZONE}.`,
    );
  }
  return result;
}

export interface BogotaDateParts {
  date: string;
  isoWeekday: number;
}

/** Fecha local e índice ISO del día correspondientes a un instante UTC. */
export function getBogotaDateParts(instant: Date): BogotaDateParts {
  const { year, month, day } = localPartsAt(instant);
  const date = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const utcWeekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return { date, isoWeekday: utcWeekday === 0 ? 7 : utcWeekday };
}
