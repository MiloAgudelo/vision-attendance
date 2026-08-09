import { describe, expect, it } from 'vitest';

import { CONTRACT_VERSION, deviceEventRequestSchema } from '@va/shared';

import { InvalidEventError, SimulatorError } from './errors.js';
import {
  SIMULATOR_FIRMWARE_VERSION,
  buildDeviceEvent,
  newEventId,
  parseDurationMs,
  randomCardUid,
  toIsoWithOffset,
} from './event.js';

/** Instante fijo para que las pruebas no dependan del reloj real. */
const NOW = new Date('2026-08-10T18:05:12.000Z');
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('buildDeviceEvent — forma del cuerpo', () => {
  it('produce un cuerpo que cumple el contrato v1, con las claves exactas del contrato', () => {
    const event = buildDeviceEvent({
      deviceId: 'LAB-DESARROLLO-01',
      cardUid: 'A1B2C3D4',
      now: NOW,
      clockOffsetMinutes: -300,
    });

    // El propio esquema del contrato acepta lo que el simulador envía.
    expect(deviceEventRequestSchema.safeParse(event).success).toBe(true);
    expect(Object.keys(event).sort()).toEqual([
      'cardUid',
      'contractVersion',
      'deviceId',
      'eventId',
      'firmwareVersion',
      'scannedAt',
    ]);
    expect(event.contractVersion).toBe(CONTRACT_VERSION);
    expect(event.deviceId).toBe('LAB-DESARROLLO-01');
    expect(event.firmwareVersion).toBe(SIMULATOR_FIRMWARE_VERSION);
  });

  it('admite un UID de 7 bytes (14 caracteres)', () => {
    const event = buildDeviceEvent({
      deviceId: 'LAB-01',
      cardUid: '04A1B2C3D4E5F6',
      now: NOW,
    });
    expect(event.cardUid).toBe('04A1B2C3D4E5F6');
  });

  it('permite omitir la versión de firmware con null', () => {
    const event = buildDeviceEvent({
      deviceId: 'LAB-01',
      cardUid: 'A1B2C3D4',
      firmwareVersion: null,
      now: NOW,
    });
    expect(event.firmwareVersion).toBeNull();
  });
});

describe('buildDeviceEvent — eventId', () => {
  it('genera un uuid v4 distinto en cada lectura', () => {
    const ids = new Set(
      Array.from({ length: 200 }, () => {
        const event = buildDeviceEvent({ deviceId: 'LAB-01', cardUid: 'A1B2C3D4', now: NOW });
        return event.eventId;
      }),
    );

    expect(ids.size).toBe(200);
    for (const id of ids) {
      expect(id).toMatch(UUID_V4);
    }
  });

  it('newEventId devuelve uuid v4', () => {
    expect(newEventId()).toMatch(UUID_V4);
  });

  it('reutiliza el mismo eventId cuando se le pasa (reintento de la MISMA lectura, RN7)', () => {
    const eventId = newEventId();
    const first = buildDeviceEvent({
      deviceId: 'LAB-01',
      cardUid: 'A1B2C3D4',
      eventId,
      now: NOW,
    });
    const second = buildDeviceEvent({
      deviceId: 'LAB-01',
      cardUid: 'A1B2C3D4',
      eventId,
      now: NOW,
    });

    expect(first.eventId).toBe(eventId);
    expect(second.eventId).toBe(eventId);
  });

  it('canoniza el eventId a minúsculas, porque la clave de idempotencia es texto', () => {
    const event = buildDeviceEvent({
      deviceId: 'LAB-01',
      cardUid: 'A1B2C3D4',
      eventId: '5F3A2C9E-8D41-4B7A-9C1E-2A6F8E4D0B73',
      now: NOW,
    });
    expect(event.eventId).toBe('5f3a2c9e-8d41-4b7a-9c1e-2a6f8e4d0b73');
  });

  it('rechaza un eventId que no es uuid', () => {
    expect(() =>
      buildDeviceEvent({ deviceId: 'LAB-01', cardUid: 'A1B2C3D4', eventId: 'lectura-1', now: NOW }),
    ).toThrow(InvalidEventError);
  });
});

describe('buildDeviceEvent — normalización del UID', () => {
  it.each([
    ['a1b2c3d4', 'A1B2C3D4'],
    ['a1:b2:c3:d4', 'A1B2C3D4'],
    ['A1-B2-C3-D4', 'A1B2C3D4'],
    ['a1 b2 c3 d4', 'A1B2C3D4'],
    ['  04:a1:b2:c3:d4:e5:f6  ', '04A1B2C3D4E5F6'],
  ])('normaliza %s a %s', (raw, expected) => {
    const event = buildDeviceEvent({ deviceId: 'LAB-01', cardUid: raw, now: NOW });
    expect(event.cardUid).toBe(expected);
  });

  it.each([
    ['A1B2C3', 'longitud de 6'],
    ['A1B2C3D4E5', 'longitud de 10'],
    ['ZZZZZZZZ', 'caracteres no hexadecimales'],
    ['', 'vacío'],
  ])('rechaza %s (%s) con un error explicativo', (raw) => {
    let thrown: unknown;
    try {
      buildDeviceEvent({ deviceId: 'LAB-01', cardUid: raw, now: NOW });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(InvalidEventError);
    expect((thrown as InvalidEventError).issues.join(' ')).toContain('cardUid');
  });
});

describe('buildDeviceEvent — scannedAt', () => {
  it('usa el reloj con offset explícito por defecto', () => {
    const event = buildDeviceEvent({
      deviceId: 'LAB-01',
      cardUid: 'A1B2C3D4',
      now: NOW,
      clockOffsetMinutes: -300,
    });
    expect(event.scannedAt).toBe('2026-08-10T13:05:12.000-05:00');
  });

  it('aplica el desplazamiento de --scanned-at-offset (reloj atrasado, RN8)', () => {
    const event = buildDeviceEvent({
      deviceId: 'LAB-01',
      cardUid: 'A1B2C3D4',
      now: NOW,
      clockOffsetMinutes: 0,
      scannedAtOffsetMs: parseDurationMs('-3h'),
    });
    expect(event.scannedAt).toBe('2026-08-10T15:05:12.000Z');
  });

  it('acepta un desplazamiento hacia el futuro (reloj adelantado)', () => {
    const event = buildDeviceEvent({
      deviceId: 'LAB-01',
      cardUid: 'A1B2C3D4',
      now: NOW,
      clockOffsetMinutes: 0,
      scannedAtOffsetMs: parseDurationMs('90m'),
    });
    expect(event.scannedAt).toBe('2026-08-10T19:35:12.000Z');
  });

  it('envía null cuando el dispositivo no tiene hora fiable', () => {
    const event = buildDeviceEvent({
      deviceId: 'LAB-01',
      cardUid: 'A1B2C3D4',
      scannedAt: null,
      now: NOW,
    });
    expect(event.scannedAt).toBeNull();
    expect(deviceEventRequestSchema.safeParse(event).success).toBe(true);
  });

  it('acepta un scannedAt explícito con offset', () => {
    const event = buildDeviceEvent({
      deviceId: 'LAB-01',
      cardUid: 'A1B2C3D4',
      scannedAt: '2026-08-10T13:05:12-05:00',
      now: NOW,
    });
    expect(event.scannedAt).toBe('2026-08-10T13:05:12-05:00');
  });

  it('rechaza un scannedAt sin offset: el contrato exige la zona', () => {
    expect(() =>
      buildDeviceEvent({
        deviceId: 'LAB-01',
        cardUid: 'A1B2C3D4',
        scannedAt: '2026-08-10T13:05:12',
        now: NOW,
      }),
    ).toThrow(InvalidEventError);
  });
});

describe('toIsoWithOffset', () => {
  it.each([
    [0, '2026-08-10T18:05:12.000Z'],
    [-300, '2026-08-10T13:05:12.000-05:00'],
    [330, '2026-08-10T23:35:12.000+05:30'],
  ])('formatea con offset %i minutos', (offset, expected) => {
    expect(toIsoWithOffset(NOW, offset)).toBe(expected);
  });
});

describe('parseDurationMs', () => {
  it.each([
    ['-3h', -10_800_000],
    ['3h', 10_800_000],
    ['+3h', 10_800_000],
    ['90m', 5_400_000],
    ['1h30m', 5_400_000],
    ['250ms', 250],
    ['-1d2h', -93_600_000],
    ['45s', 45_000],
  ])('convierte %s a %i ms', (text, expected) => {
    expect(parseDurationMs(text)).toBe(expected);
  });

  it.each(['', '3', 'h', '3x', '3h ruido', 'abc'])('rechaza %s', (text) => {
    expect(() => parseDurationMs(text)).toThrow(SimulatorError);
  });
});

describe('randomCardUid', () => {
  it('genera UIDs válidos de 4 y de 7 bytes', () => {
    expect(randomCardUid(4)).toMatch(/^[0-9A-F]{8}$/);
    expect(randomCardUid(7)).toMatch(/^[0-9A-F]{14}$/);
  });

  it('genera UIDs distintos entre lecturas', () => {
    const uids = new Set(Array.from({ length: 100 }, () => randomCardUid(4)));
    expect(uids.size).toBe(100);
  });
});
