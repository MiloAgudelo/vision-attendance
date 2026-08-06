import { describe, expect, it } from 'vitest';

import {
  CONTRACT_VERSION,
  DEVICE_ERROR_CODES,
  DEVICE_ERROR_HTTP_STATUS,
  DEVICE_EVENTS_PATH,
  InvalidCardUidError,
  cardUidSchema,
  deviceEventErrorResponseSchema,
  deviceEventRequestSchema,
  deviceEventResponseSchema,
  deviceEventSuccessResponseSchema,
  formatDeviceApiKey,
  isDeviceApiKeyShaped,
  isSupportedContractVersion,
  isValidCardUid,
  normalizeCardUid,
  parseCardUid,
} from './device.js';

const VALID_REQUEST = {
  contractVersion: 1,
  deviceId: 'LAB-DESARROLLO-01',
  eventId: '5f3a2c9e-8d41-4b7a-9c1e-2a6f8e4d0b73',
  cardUid: 'A1B2C3D4',
  scannedAt: '2026-08-10T13:05:12-05:00',
  firmwareVersion: '0.1.0',
};

describe('constantes del contrato', () => {
  it('la versión del contrato es 1', () => {
    expect(CONTRACT_VERSION).toBe(1);
    expect(isSupportedContractVersion(1)).toBe(true);
    expect(isSupportedContractVersion(2)).toBe(false);
    expect(isSupportedContractVersion(0)).toBe(false);
  });

  it('el endpoint es /api/v1/events', () => {
    expect(DEVICE_EVENTS_PATH).toBe('/api/v1/events');
  });

  it('cada código de error tiene su estado HTTP', () => {
    for (const code of DEVICE_ERROR_CODES) {
      expect(DEVICE_ERROR_HTTP_STATUS[code]).toBeGreaterThanOrEqual(400);
    }
    expect(DEVICE_ERROR_HTTP_STATUS.invalid_payload).toBe(400);
    expect(DEVICE_ERROR_HTTP_STATUS.unsupported_contract).toBe(400);
    expect(DEVICE_ERROR_HTTP_STATUS.invalid_credentials).toBe(401);
    expect(DEVICE_ERROR_HTTP_STATUS.device_revoked).toBe(403);
    expect(DEVICE_ERROR_HTTP_STATUS.device_mismatch).toBe(403);
    expect(DEVICE_ERROR_HTTP_STATUS.rate_limited).toBe(429);
    expect(DEVICE_ERROR_HTTP_STATUS.internal_error).toBe(500);
  });
});

describe('normalizeCardUid', () => {
  it.each([
    ['a1b2c3d4', 'A1B2C3D4'],
    ['A1:B2:C3:D4', 'A1B2C3D4'],
    ['a1 b2 c3 d4', 'A1B2C3D4'],
    ['a1-b2-c3-d4', 'A1B2C3D4'],
    ['a1.b2.c3.d4', 'A1B2C3D4'],
    ['04_A2_24_5A_B1_75_80', '04A2245AB17580'],
  ])('normaliza %s → %s', (input, expected) => {
    expect(normalizeCardUid(input)).toBe(expected);
  });

  it('es idempotente', () => {
    const once = normalizeCardUid('a1:b2:c3:d4');
    expect(normalizeCardUid(once)).toBe(once);
  });
});

describe('isValidCardUid', () => {
  it.each(['A1B2C3D4', '00000000', '04A2245AB17580', 'FFFFFFFFFFFFFF'])(
    'acepta el UID normalizado %s',
    (uid) => {
      expect(isValidCardUid(uid)).toBe(true);
    },
  );

  it.each([
    ['a1b2c3d4', 'minúsculas'],
    ['A1B2C3D', '7 caracteres (ni 4 ni 7 bytes)'],
    ['A1B2C3D4E', '9 caracteres'],
    ['A1B2C3D4E5F6A7B8', '16 caracteres'],
    ['A1B2C3G4', 'carácter no hexadecimal'],
    ['A1:B2:C3:D4', 'con separadores'],
    ['', 'vacío'],
  ])('rechaza %s (%s)', (uid) => {
    expect(isValidCardUid(uid)).toBe(false);
  });
});

describe('parseCardUid', () => {
  it('normaliza y valida en un paso', () => {
    expect(parseCardUid('  a1:b2:c3:d4 ')).toBe('A1B2C3D4');
    expect(parseCardUid('04 a2 24 5a b1 75 80')).toBe('04A2245AB17580');
  });

  it('lanza InvalidCardUidError con UID inválido', () => {
    expect(() => parseCardUid('ZZZZ')).toThrow(InvalidCardUidError);
    expect(() => parseCardUid('A1B2C3')).toThrow(InvalidCardUidError);
  });

  it('el error conserva el valor original', () => {
    try {
      parseCardUid('nope');
      expect.unreachable('debería haber lanzado');
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidCardUidError);
      expect((error as InvalidCardUidError).rawValue).toBe('nope');
    }
  });
});

describe('cardUidSchema', () => {
  it('devuelve el UID normalizado', () => {
    expect(cardUidSchema.parse('a1:b2:c3:d4')).toBe('A1B2C3D4');
  });

  it('rechaza longitudes fuera de 8 o 14', () => {
    expect(cardUidSchema.safeParse('A1B2C3').success).toBe(false);
  });
});

describe('deviceEventRequestSchema', () => {
  it('acepta el ejemplo exacto del contrato', () => {
    const parsed = deviceEventRequestSchema.parse(VALID_REQUEST);
    expect(parsed.deviceId).toBe('LAB-DESARROLLO-01');
    expect(parsed.cardUid).toBe('A1B2C3D4');
    expect(parsed.scannedAt).toBe('2026-08-10T13:05:12-05:00');
    expect(parsed.firmwareVersion).toBe('0.1.0');
  });

  it('acepta scannedAt nulo (dispositivo sin hora confiable)', () => {
    const parsed = deviceEventRequestSchema.parse({ ...VALID_REQUEST, scannedAt: null });
    expect(parsed.scannedAt).toBeNull();
  });

  it('acepta la petición mínima (sin scannedAt ni firmwareVersion)', () => {
    const result = deviceEventRequestSchema.safeParse({
      contractVersion: 1,
      deviceId: 'LAB-DESARROLLO-01',
      eventId: VALID_REQUEST.eventId,
      cardUid: 'a1b2c3d4',
    });
    expect(result.success).toBe(true);
    expect(result.data?.cardUid).toBe('A1B2C3D4');
  });

  it('normaliza el UID recibido con separadores', () => {
    const parsed = deviceEventRequestSchema.parse({
      ...VALID_REQUEST,
      cardUid: '04-a2-24-5a-b1-75-80',
    });
    expect(parsed.cardUid).toBe('04A2245AB17580');
  });

  it('descarta claves desconocidas en vez de rechazar la petición', () => {
    const parsed = deviceEventRequestSchema.parse({ ...VALID_REQUEST, rssi: -42 });
    expect(parsed).not.toHaveProperty('rssi');
  });

  it.each([
    ['contractVersion distinto de 1', { contractVersion: 2 }],
    ['contractVersion ausente', { contractVersion: undefined }],
    ['deviceId vacío', { deviceId: '' }],
    ['eventId que no es uuid', { eventId: 'no-es-uuid' }],
    ['cardUid inválido', { cardUid: 'XYZ' }],
    ['scannedAt sin offset', { scannedAt: '2026-08-10T13:05:12' }],
    ['scannedAt que no es fecha', { scannedAt: 'ayer' }],
  ])('rechaza %s', (_caso, patch) => {
    const result = deviceEventRequestSchema.safeParse({ ...VALID_REQUEST, ...patch });
    expect(result.success).toBe(false);
  });
});

describe('deviceEventSuccessResponseSchema', () => {
  const OK_RESPONSE = {
    ok: true,
    eventId: VALID_REQUEST.eventId,
    result: 'registered',
    receivedAt: '2026-08-10T18:05:13.412Z',
    message: 'Asistencia registrada',
    student: { code: '202410123', name: 'Nombre Apellido' },
    session: {
      id: '0f1c0c3a-9a3d-4b2f-8f0f-4d2f0f8b3a11',
      scheduledStart: '2026-08-10T18:00:00Z',
    },
  };

  it('acepta el ejemplo del contrato', () => {
    expect(deviceEventSuccessResponseSchema.parse(OK_RESPONSE).result).toBe('registered');
  });

  it('acepta student y session nulos (carnet desconocido)', () => {
    const parsed = deviceEventSuccessResponseSchema.parse({
      ...OK_RESPONSE,
      result: 'unknown_card',
      message: 'Carnet no registrado',
      student: null,
      session: null,
    });
    expect(parsed.student).toBeNull();
    expect(parsed.session).toBeNull();
  });

  it.each([
    'registered',
    'already_registered',
    'no_session',
    'not_enrolled',
    'unknown_card',
    'enrollment_captured',
    'error',
  ])('acepta el resultado %s del catálogo', (result) => {
    expect(deviceEventSuccessResponseSchema.safeParse({ ...OK_RESPONSE, result }).success).toBe(
      true,
    );
  });

  it('rechaza un resultado fuera del catálogo', () => {
    expect(
      deviceEventSuccessResponseSchema.safeParse({ ...OK_RESPONSE, result: 'tarde' }).success,
    ).toBe(false);
  });

  it('rechaza ok:false', () => {
    expect(deviceEventSuccessResponseSchema.safeParse({ ...OK_RESPONSE, ok: false }).success).toBe(
      false,
    );
  });
});

describe('deviceEventErrorResponseSchema', () => {
  it('acepta el ejemplo del contrato', () => {
    const parsed = deviceEventErrorResponseSchema.parse({
      ok: false,
      error: 'device_revoked',
      message: 'Dispositivo revocado',
    });
    expect(parsed.error).toBe('device_revoked');
  });

  it.each(DEVICE_ERROR_CODES)('acepta el código %s', (error) => {
    expect(
      deviceEventErrorResponseSchema.safeParse({ ok: false, error, message: 'x' }).success,
    ).toBe(true);
  });

  it('rechaza un código fuera del catálogo', () => {
    expect(
      deviceEventErrorResponseSchema.safeParse({ ok: false, error: 'boom', message: 'x' }).success,
    ).toBe(false);
  });
});

describe('deviceEventResponseSchema', () => {
  it('discrimina por ok', () => {
    const error = deviceEventResponseSchema.parse({
      ok: false,
      error: 'invalid_credentials',
      message: 'Credenciales inválidas',
    });
    expect(error.ok).toBe(false);

    const success = deviceEventResponseSchema.parse({
      ok: true,
      eventId: VALID_REQUEST.eventId,
      result: 'no_session',
      receivedAt: '2026-08-10T23:41:02Z',
      message: 'Entrada registrada; no hay clase activa',
      student: { code: '202410123', name: 'Nombre Apellido' },
      session: null,
    });
    expect(success.ok).toBe(true);
  });
});

describe('credencial del dispositivo', () => {
  it('formatea con la forma vad_<deviceName>_<secreto>', () => {
    const key = formatDeviceApiKey('LAB-DESARROLLO-01', 'a'.repeat(32));
    expect(key).toBe(`vad_LAB-DESARROLLO-01_${'a'.repeat(32)}`);
    expect(isDeviceApiKeyShaped(key)).toBe(true);
  });

  it.each(['', 'vad_', 'vad_LAB_corto', 'otra_cosa', 'LAB-01_secretosecretosecreto1234'])(
    'rechaza la forma inválida %s',
    (value) => {
      expect(isDeviceApiKeyShaped(value)).toBe(false);
    },
  );
});
