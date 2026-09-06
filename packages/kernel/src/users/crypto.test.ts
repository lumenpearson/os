import { describe, expect, it } from 'vitest';
import {
  generateRecoveryKey,
  hashSecret,
  isRecoveryKeyShape,
  normalizeRecoveryKey,
  passwordStrength,
  randomSalt,
  verifySecret,
} from './crypto';

describe('user crypto', () => {
  it('hashes and verifies passwords', async () => {
    const salt = randomSalt();
    const hash = await hashSecret('correct horse', salt);
    expect(hash).toHaveLength(64);
    expect(await verifySecret('correct horse', salt, hash)).toBe(true);
    expect(await verifySecret('wrong', salt, hash)).toBe(false);
    expect(await hashSecret('correct horse', randomSalt())).not.toBe(hash);
  });

  it('generates and normalises recovery keys', () => {
    const key = generateRecoveryKey();
    expect(isRecoveryKeyShape(key)).toBe(true);
    expect(normalizeRecoveryKey(key.toLowerCase().replace(/-/g, ' '))).toBe(key);
    expect(isRecoveryKeyShape('abc')).toBe(false);
  });

  it('rates password strength', () => {
    expect(passwordStrength('').score).toBe(0);
    expect(passwordStrength('abcdefgh').score).toBe(1);
    expect(passwordStrength('Abcdefghijkl1!').score).toBe(4);
  });
});
