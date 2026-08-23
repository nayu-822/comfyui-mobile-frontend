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
});
