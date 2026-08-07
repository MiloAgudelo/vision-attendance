import { describe, expect, it } from 'vitest';

import {
  CONTRACT_VERSION,
  DEVICE_ERROR_CODES,
  DEVICE_ERROR_HTTP_STATUS,
  DEVICE_EVENTS_PATH,
  DEVICE_NAME_MAX_LENGTH,
  InvalidCardUidError,
  InvalidDeviceNameError,
  cardUidSchema,
  contractVersionProbeSchema,
  deviceNameSchema,
  isValidDeviceName,
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
    ['A1B2C3D4E5', '10 caracteres'],
    ['A1B2C3D4E5F6A', '13 caracteres'],
    ['A1B2C3D4E5F6A7B', '15 caracteres'],
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

  it.each(['A1B2C3', 'A1B2C3D4E5', 'A1B2C3D4E5F6A', 'A1B2C3D4E5F6A7B'])(
    'rechaza la longitud de %s',
    (uid) => {
      expect(cardUidSchema.safeParse(uid).success).toBe(false);
    },
  );

  // La política de separadores es lo único no evidente del normalizador: se descartan SIEMPRE, así
  // que lo que decide la validez es la longitud de lo que queda, no la de la cadena original.
  it('descarta los separadores sobrantes antes de medir la longitud', () => {
    expect(cardUidSchema.parse('A1-B2-C3-D4-')).toBe('A1B2C3D4');
  });

  it('rechaza una cadena que solo son separadores', () => {
    expect(cardUidSchema.safeParse('--------').success).toBe(false);
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

  // Sin esta comprobación, un nombre que la tabla `devices` admite (text libre) produciría en
  // silencio una credencial que el propio validador rechaza y que ni siquiera es un token Bearer
  // válido; el fallo aparecería en el primer POST del lector, no al dar de alta el dispositivo.
  it.each([
    ['Lab 01', 'espacio'],
    ['aula.1', 'punto'],
    ['LAB_01', 'guion bajo, que es el separador de la credencial'],
    ['Ñ1', 'fuera de US-ASCII'],
    ['', 'vacío'],
  ])('lanza InvalidDeviceNameError con el nombre %s (%s)', (name) => {
    expect(() => formatDeviceApiKey(name, 'a'.repeat(32))).toThrow(InvalidDeviceNameError);
  });

  it('el error conserva el nombre original', () => {
    try {
      formatDeviceApiKey('Lab 01', 'a'.repeat(32));
      expect.unreachable('debería haber lanzado');
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidDeviceNameError);
      expect((error as InvalidDeviceNameError).rawValue).toBe('Lab 01');
    }
  });

  it('todo nombre aceptado por deviceNameSchema forma una credencial válida', () => {
    for (const name of ['LAB-DESARROLLO-01', 'a', 'A1', 'x'.repeat(DEVICE_NAME_MAX_LENGTH)]) {
      expect(deviceNameSchema.safeParse(name).success).toBe(true);
      expect(isValidDeviceName(name)).toBe(true);
      expect(isDeviceApiKeyShaped(formatDeviceApiKey(name, 'a'.repeat(32)))).toBe(true);
    }
  });

  it('deviceNameSchema rechaza por encima del máximo', () => {
    expect(deviceNameSchema.safeParse('x'.repeat(DEVICE_NAME_MAX_LENGTH + 1)).success).toBe(false);
  });
});

describe('contractVersionProbeSchema', () => {
  // El contrato exige distinguir `unsupported_contract` de `invalid_payload`, y con el esquema
  // completo un contractVersion incompatible es indistinguible de cualquier otro fallo.
  it('lee la versión aunque el resto del cuerpo sea inválido', () => {
    const probe = contractVersionProbeSchema.safeParse({ contractVersion: 2, basura: true });
    expect(probe.success).toBe(true);
    expect(probe.success && probe.data.contractVersion).toBe(2);
    expect(isSupportedContractVersion(2)).toBe(false);
  });

  it('acepta la versión soportada del ejemplo del contrato', () => {
    const probe = contractVersionProbeSchema.safeParse(VALID_REQUEST);
    expect(probe.success && isSupportedContractVersion(probe.data.contractVersion)).toBe(true);
  });

  it.each([{}, { contractVersion: '1' }, { contractVersion: 1.5 }])(
    'rechaza el cuerpo sin versión entera %j',
    (body) => {
      expect(contractVersionProbeSchema.safeParse(body).success).toBe(false);
    },
  );
});

describe('canonización de la petición', () => {
  // (device_id, event_id) es la clave de idempotencia (RN7) y se almacena como texto: si la caja del
  // uuid sobreviviera, el mismo reintento en mayúsculas crearía un segundo evento.
  it('canoniza el eventId a minúsculas', () => {
    const parsed = deviceEventRequestSchema.parse({
      ...VALID_REQUEST,
      eventId: '5F3A2C9E-8D41-4B7A-9C1E-2A6F8E4D0B73',
    });
    expect(parsed.eventId).toBe('5f3a2c9e-8d41-4b7a-9c1e-2a6f8e4d0b73');
  });

  it.each([
    ['scannedAt', { scannedAt: null }],
    ['firmwareVersion', { firmwareVersion: null }],
  ])('acepta %s en null, que el firmware puede serializar así', (_campo, patch) => {
    expect(deviceEventRequestSchema.safeParse({ ...VALID_REQUEST, ...patch }).success).toBe(true);
  });
});
