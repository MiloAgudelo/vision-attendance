import { createHash } from 'node:crypto';

import { InvalidDeviceNameError, isDeviceApiKeyShaped } from '@va/shared';
import { describe, expect, it } from 'vitest';

import { extractBearerApiKey, hashDeviceApiKey, issueDeviceApiKey } from './credentials';

describe('issueDeviceApiKey', () => {
  it('emite una credencial con la forma del contrato y su hash SHA-256', () => {
    const { apiKey, apiKeyHash } = issueDeviceApiKey('LAB-DESARROLLO-01');

    expect(apiKey.startsWith('vad_LAB-DESARROLLO-01_')).toBe(true);
    expect(isDeviceApiKeyShaped(apiKey)).toBe(true);
    expect(apiKeyHash).toBe(createHash('sha256').update(apiKey, 'utf8').digest('hex'));
    expect(apiKeyHash).toHaveLength(64);
  });

  it('nunca repite el secreto entre dos altas del mismo nombre', () => {
    const first = issueDeviceApiKey('LECTOR-01');
    const second = issueDeviceApiKey('LECTOR-01');

    expect(first.apiKey).not.toBe(second.apiKey);
    expect(first.apiKeyHash).not.toBe(second.apiKeyHash);
  });

  it('rechaza nombres que no caben en una credencial `vad_<nombre>_<secreto>`', () => {
    expect(() => issueDeviceApiKey('LAB_DESARROLLO')).toThrow(InvalidDeviceNameError);
    expect(() => issueDeviceApiKey('Lector de laboratorio')).toThrow(InvalidDeviceNameError);
  });
});

describe('hashDeviceApiKey', () => {
  it('es estable: la misma key da siempre el mismo hash', () => {
    const apiKey = 'vad_LECTOR-01_0123456789abcdefghij';
    expect(hashDeviceApiKey(apiKey)).toBe(hashDeviceApiKey(apiKey));
  });
});

describe('extractBearerApiKey', () => {
  const apiKey = 'vad_LECTOR-01_0123456789abcdefghij';

  it('acepta la cabecera del contrato', () => {
    expect(extractBearerApiKey(`Bearer ${apiKey}`)).toBe(apiKey);
  });

  it('acepta el esquema sin distinguir mayúsculas y con espacios de sobra', () => {
    expect(extractBearerApiKey(`  bearer   ${apiKey}  `)).toBe(apiKey);
  });

  it.each([
    ['ausente', null],
    ['vacía', ''],
    ['sin esquema', apiKey],
    ['con otro esquema', `Basic ${apiKey}`],
    ['sin token', 'Bearer'],
    ['con dos tokens', `Bearer ${apiKey} extra`],
    ['con un token que no tiene la forma del contrato', 'Bearer no-es-una-credencial'],
    ['con el prefijo equivocado', 'Bearer abc_LECTOR-01_0123456789abcdefghij'],
    ['con el secreto demasiado corto', 'Bearer vad_LECTOR-01_corto'],
  ])('devuelve null si la cabecera está %s', (_caso, header) => {
    expect(extractBearerApiKey(header)).toBeNull();
  });
});
