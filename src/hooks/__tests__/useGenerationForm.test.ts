import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_GENERATION_FORM_STATE, useGenerationForm } from '../useGenerationForm';

const STORAGE_KEY = 'simple-generation-form-storage';

describe('useGenerationForm', () => {
  beforeEach(() => {
    sessionStorage.removeItem(STORAGE_KEY);
    useGenerationForm.getState().reset();
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

    const persisted = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? '{}') as {
      state?: Record<string, unknown>;
    };
    expect(persisted.state).toMatchObject({
      facePositivePrompt: 'face positive',
      faceNegativePrompt: 'face negative',
    });
  });
});
