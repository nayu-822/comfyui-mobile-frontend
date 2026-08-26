import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_GENERATION_FORM_STATE } from '@/hooks/useGenerationForm';
import {
  generateRandomSeed,
  MAX_GENERATION_SEED,
  resolveGenerationSeed,
} from '../generationSeed';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('generationSeed', () => {
  it('returns a fixed seed without generating a replacement', () => {
    const randomValues = vi.fn();
    vi.stubGlobal('crypto', { getRandomValues: randomValues });

    expect(resolveGenerationSeed({ seedMode: 'fixed', seed: 123 })).toBe(123);
    expect(randomValues).not.toHaveBeenCalled();
  });

  it('generates a new unsigned 32-bit seed in random mode', () => {
    const randomValues = vi.fn((values: Uint32Array) => {
      values[0] = MAX_GENERATION_SEED;
      return values;
    });
    vi.stubGlobal('crypto', { getRandomValues: randomValues });

    expect(resolveGenerationSeed({
      ...DEFAULT_GENERATION_FORM_STATE,
      seedMode: 'random',
      seed: Number.NaN,
    })).toBe(MAX_GENERATION_SEED);
    expect(randomValues).toHaveBeenCalledTimes(1);
    expect(generateRandomSeed()).toBe(MAX_GENERATION_SEED);
  });

  it('falls back to a safe range when Web Crypto is unavailable', () => {
    vi.stubGlobal('crypto', undefined);
    vi.spyOn(Math, 'random').mockReturnValue(0.5);

    const seed = generateRandomSeed();

    expect(seed).toBe(2147483648);
    expect(seed).toBeGreaterThanOrEqual(0);
    expect(seed).toBeLessThanOrEqual(MAX_GENERATION_SEED);
  });
});
