import { beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_ANIMA_GENERATION_FORM_STATE,
  DEFAULT_GENERATION_FORM_STATE,
  useAnimaGenerationForm,
  useGenerationForm,
} from '../useGenerationForm';

const SDXL_STORAGE_KEY = 'generation-form-sdxl';
const ANIMA_STORAGE_KEY = 'generation-form-anima';
const LEGACY_STORAGE_KEY = 'simple-generation-form-storage';

describe('useGenerationForm', () => {
  beforeEach(() => {
    sessionStorage.removeItem(SDXL_STORAGE_KEY);
    sessionStorage.removeItem(ANIMA_STORAGE_KEY);
    sessionStorage.removeItem(LEGACY_STORAGE_KEY);
    useGenerationForm.getState().reset();
    useAnimaGenerationForm.getState().reset();
  });

  it('defaults FaceDetailer prompts to empty strings', () => {
    expect(DEFAULT_GENERATION_FORM_STATE.facePositivePrompt).toBe('');
    expect(DEFAULT_GENERATION_FORM_STATE.faceNegativePrompt).toBe('');
  });

  it('persists FaceDetailer prompts in sessionStorage', () => {
    useGenerationForm.getState().patch({
      facePositivePrompt: 'face positive',
      faceNegativePrompt: 'face negative',
    });

    const persisted = JSON.parse(sessionStorage.getItem(SDXL_STORAGE_KEY) ?? '{}') as {
      state?: Record<string, unknown>;
    };
    expect(persisted.state).toMatchObject({
      facePositivePrompt: 'face positive',
      faceNegativePrompt: 'face negative',
    });
  });

  it('keeps SDXL and Anima form values in separate stores and storage keys', () => {
    useGenerationForm.getState().patch({
      positivePrompt: 'sdxl prompt',
      checkpoint: 'sdxl/checkpoint.safetensors',
    });
    useAnimaGenerationForm.getState().patch({
      positivePrompt: 'anima prompt',
      checkpoint: 'anima/checkpoint.safetensors',
    });

    expect(useGenerationForm.getState().positivePrompt).toBe('sdxl prompt');
    expect(useGenerationForm.getState().checkpoint).toBe('sdxl/checkpoint.safetensors');
    expect(useAnimaGenerationForm.getState().positivePrompt).toBe('anima prompt');
    expect(useAnimaGenerationForm.getState().checkpoint).toBe('anima/checkpoint.safetensors');
    expect(JSON.parse(sessionStorage.getItem(SDXL_STORAGE_KEY) ?? '{}').state)
      .toMatchObject({ positivePrompt: 'sdxl prompt' });
    expect(JSON.parse(sessionStorage.getItem(ANIMA_STORAGE_KEY) ?? '{}').state)
      .toMatchObject({ positivePrompt: 'anima prompt' });
  });

  it('uses mode-specific defaults for a fresh form', () => {
    expect(useGenerationForm.getState().checkpoint).toBe(DEFAULT_GENERATION_FORM_STATE.checkpoint);
    expect(useAnimaGenerationForm.getState().checkpoint)
      .toBe(DEFAULT_ANIMA_GENERATION_FORM_STATE.checkpoint);
  });
});
