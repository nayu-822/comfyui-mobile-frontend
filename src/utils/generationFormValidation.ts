import type { GenerationFormState } from '@/hooks/useGenerationForm';

const PLACEHOLDER_MODEL_NAME = /^(?:PUT_[A-Z0-9_]+_HERE|PLACEHOLDER(?:_[A-Z0-9_]+)?|YOUR_[A-Z0-9_]+_HERE)(?:\.[A-Z0-9._-]+)?$/i;

/** True for an empty model selection or the placeholder values shipped in the form. */
export function isEmptyOrPlaceholderModelName(value: string): boolean {
  const normalized = value.trim();
  if (!normalized) return true;
  const filename = normalized.split(/[\\/]/).pop() ?? normalized;
  return PLACEHOLDER_MODEL_NAME.test(filename);
}

/** Return user-facing errors that must be fixed before a simple generation can be queued. */
export function validateGenerationForm(form: GenerationFormState): string[] {
  const errors: string[] = [];

  if (isEmptyOrPlaceholderModelName(form.checkpoint)) {
    errors.push('Choose a checkpoint before generating.');
  }

  form.loras.forEach((lora, index) => {
    if (lora.enabled && isEmptyOrPlaceholderModelName(lora.name)) {
      errors.push(`Choose a model for LoRA ${index + 1} or turn it off.`);
    }
  });

  return errors;
}
