import type { GenerationFormState } from '@/hooks/useGenerationForm';

/** The largest seed accepted by the simple-generation workflow. */
export const MAX_GENERATION_SEED = 0xffffffff;

/** Generate a non-negative, JavaScript-safe 32-bit unsigned seed. */
export function generateRandomSeed(): number {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi?.getRandomValues) {
    const values = new Uint32Array(1);
    cryptoApi.getRandomValues(values);
    return values[0] ?? 0;
  }

  // Math.random() is only a fallback for older/non-browser runtimes. The
  // multiplication stays below 2^32, which is exactly representable in JS.
  return Math.floor(Math.random() * (MAX_GENERATION_SEED + 1));
}

/** Resolve the seed that will be sent to every sampler in one generation. */
export function resolveGenerationSeed(
  form: Pick<GenerationFormState, 'seedMode' | 'seed'>,
): number {
  return form.seedMode === 'fixed' ? form.seed : generateRandomSeed();
}
