import { describe, expect, it } from 'vitest';
import { DEFAULT_GENERATION_FORM_STATE, type GenerationFormState } from '@/hooks/useGenerationForm';
import {
  isEmptyOrPlaceholderModelName,
  validateGenerationForm,
} from '../generationFormValidation';

function form(): GenerationFormState {
  return {
    ...DEFAULT_GENERATION_FORM_STATE,
    loras: DEFAULT_GENERATION_FORM_STATE.loras.map((slot) => ({ ...slot })) as GenerationFormState['loras'],
  };
}

describe('generationFormValidation', () => {
  it('recognizes empty and shipped placeholder model names', () => {
    expect(isEmptyOrPlaceholderModelName('')).toBe(true);
    expect(isEmptyOrPlaceholderModelName('PUT_CHECKPOINT_HERE.safetensors')).toBe(true);
    expect(isEmptyOrPlaceholderModelName('models/PUT_LORA_1_HERE.safetensors')).toBe(true);
    expect(isEmptyOrPlaceholderModelName('real-model.safetensors')).toBe(false);
  });

  it('requires a real checkpoint', () => {
    const errors = validateGenerationForm(form());
    expect(errors).toEqual(['Choose a checkpoint before generating.']);
  });

  it('validates only enabled LoRA slots', () => {
    const next = form();
    next.checkpoint = 'real-checkpoint.safetensors';
    next.loras[0].enabled = true;
    expect(validateGenerationForm(next)).toEqual(['Choose a model for LoRA 1 or turn it off.']);

    next.loras[0].name = 'real-lora.safetensors';
    expect(validateGenerationForm(next)).toEqual([]);
  });

  it('rejects invalid base numeric settings', () => {
    const next = form();
    next.checkpoint = 'real-checkpoint.safetensors';
    next.seedMode = 'fixed';
    next.width = 63;
    next.height = Number.NaN;
    next.steps = 0;
    next.cfg = -0.1;
    next.seed = -1;

    expect(validateGenerationForm(next)).toEqual([
      'Width must be at least 64.',
      'Height must be at least 64.',
      'Steps must be at least 1.',
      'CFG must be at least 0.',
      'Seed must be at least 0.',
    ]);
  });

  it('requires an integer seed only in fixed mode', () => {
    const next = form();
    next.checkpoint = 'real-checkpoint.safetensors';
    next.seedMode = 'fixed';
    next.seed = 12.5;

    expect(validateGenerationForm(next)).toEqual(['Seed must be an integer.']);
  });

  it('does not require a seed value in random mode', () => {
    const next = form();
    next.checkpoint = 'real-checkpoint.safetensors';
    next.seedMode = 'random';
    next.seed = Number.NaN;

    expect(validateGenerationForm(next)).toEqual([]);
  });

  it('rejects a checkpoint that was restored but is not in the server list', () => {
    const next = form();
    next.checkpoint = 'missing.safetensors';

    expect(validateGenerationForm(next, ['available.safetensors'])).toEqual([
      'The selected checkpoint is not available in this ComfyUI instance.',
    ]);
  });

  it('validates Hires and FaceDetailer numeric settings only when enabled', () => {
    const next = form();
    next.checkpoint = 'real-checkpoint.safetensors';
    next.hiresScale = 0;
    next.hiresSteps = 0;
    next.hiresCfg = -1;
    next.hiresDenoise = 2;
    next.faceGuideSize = 0;
    next.faceMaxSize = 0;
    next.faceSteps = 0;
    next.faceCfg = -1;
    next.faceDenoise = -1;
    next.faceBBoxThreshold = 2;

    expect(validateGenerationForm(next)).toEqual([]);

    next.hiresEnabled = true;
    next.faceDetailerEnabled = true;
    expect(validateGenerationForm(next)).toEqual([
      'Hires scale must be at least 1.',
      'Hires steps must be at least 1.',
      'Hires CFG must be at least 0.',
      'Hires denoise must be between 0 and 1.',
      'Face guide size must be at least 1.',
      'Face max size must be at least 1.',
      'Face steps must be at least 1.',
      'Face CFG must be at least 0.',
      'Face denoise must be between 0 and 1.',
      'Face BBox threshold must be between 0 and 1.',
    ]);
  });

  it('ignores Hires method fields while Hires is disabled', () => {
    const next = form();
    next.checkpoint = 'real-checkpoint.safetensors';
    next.hiresMode = 'unsupported' as GenerationFormState['hiresMode'];
    next.resizeMethod = 'unsupported' as GenerationFormState['resizeMethod'];

    expect(validateGenerationForm(next)).toEqual([]);
  });

  it('validates the selected Hires mode and resize method when enabled', () => {
    const next = form();
    next.checkpoint = 'real-checkpoint.safetensors';
    next.hiresEnabled = true;
    next.hiresMode = 'unsupported' as GenerationFormState['hiresMode'];
    expect(validateGenerationForm(next)).toEqual(['Choose a Hires method.']);

    next.hiresMode = 'resize';
    next.resizeMethod = 'unsupported' as GenerationFormState['resizeMethod'];
    expect(validateGenerationForm(next)).toEqual(['Choose a resize method.']);
  });

  it('requires a real upscaler model when Upscaler is enabled', () => {
    const next = form();
    next.checkpoint = 'real-checkpoint.safetensors';
    next.upscaleEnabled = true;
    next.upscaleModel = 'PUT_UPSCALER_HERE.pth';
    expect(validateGenerationForm(next)).toEqual(['Choose an upscaler model before generating.']);

    next.upscaleModel = '4x-UltraSharp.pth';
    expect(validateGenerationForm(next)).toEqual([]);
  });
});
