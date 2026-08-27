import {
  HIRES_RESIZE_METHODS,
  MAX_BATCH_COUNT,
  MAX_BATCH_SIZE,
  MIN_BATCH_COUNT,
  MIN_BATCH_SIZE,
  type GenerationFormState,
} from '@/hooks/useGenerationForm';
import { MAX_GENERATION_SEED } from '@/utils/generationSeed';

const PLACEHOLDER_MODEL_NAME = /^(?:PUT_[A-Z0-9_]+_HERE|PLACEHOLDER(?:_[A-Z0-9_]+)?|YOUR_[A-Z0-9_]+_HERE)(?:\.[A-Z0-9._-]+)?$/i;

/** True for an empty model selection or the placeholder values shipped in the form. */
export function isEmptyOrPlaceholderModelName(value: string): boolean {
  const normalized = value.trim();
  if (!normalized) return true;
  const filename = normalized.split(/[\\/]/).pop() ?? normalized;
  return PLACEHOLDER_MODEL_NAME.test(filename);
}

function isFiniteAtLeast(value: number, minimum: number): boolean {
  return Number.isFinite(value) && value >= minimum;
}

function isFiniteBetween(value: number, minimum: number, maximum: number): boolean {
  return Number.isFinite(value) && value >= minimum && value <= maximum;
}

/** Return user-facing errors that must be fixed before a simple generation can be queued. */
export function validateGenerationForm(
  form: GenerationFormState,
  availableCheckpoints?: readonly string[],
): string[] {
  const errors: string[] = [];

  if (isEmptyOrPlaceholderModelName(form.checkpoint)) {
    errors.push('Choose a checkpoint before generating.');
  } else if (
    availableCheckpoints !== undefined
    && !availableCheckpoints.includes(form.checkpoint)
  ) {
    errors.push('The selected checkpoint is not available in this ComfyUI instance.');
  }

  form.loras.forEach((lora, index) => {
    if (lora.enabled && isEmptyOrPlaceholderModelName(lora.name)) {
      errors.push(`Choose a model for LoRA ${index + 1} or turn it off.`);
    }
  });

  if (!isFiniteAtLeast(form.width, 64)) errors.push('Width must be at least 64.');
  if (!isFiniteAtLeast(form.height, 64)) errors.push('Height must be at least 64.');
  if (!Number.isSafeInteger(form.batchSize) || form.batchSize < MIN_BATCH_SIZE || form.batchSize > MAX_BATCH_SIZE) {
    errors.push(`Batch size must be an integer between ${MIN_BATCH_SIZE} and ${MAX_BATCH_SIZE}.`);
  }
  if (!Number.isSafeInteger(form.batchCount) || form.batchCount < MIN_BATCH_COUNT || form.batchCount > MAX_BATCH_COUNT) {
    errors.push(`Batch count must be an integer between ${MIN_BATCH_COUNT} and ${MAX_BATCH_COUNT}.`);
  }
  if (!isFiniteAtLeast(form.steps, 1)) errors.push('Steps must be at least 1.');
  if (!isFiniteAtLeast(form.cfg, 0)) errors.push('CFG must be at least 0.');
  if (form.seedMode === 'fixed') {
    if (!Number.isSafeInteger(form.seed)) errors.push('Seed must be an integer.');
    else if (form.seed < 0) errors.push('Seed must be at least 0.');
    else if (form.seed > MAX_GENERATION_SEED) errors.push(`Seed must be at most ${MAX_GENERATION_SEED}.`);
  }

  if (form.hiresEnabled) {
    if (form.hiresMode !== 'latent' && form.hiresMode !== 'resize') {
      errors.push('Choose a Hires method.');
    }
    if (!isFiniteAtLeast(form.hiresScale, 1)) errors.push('Hires scale must be at least 1.');
    if (!isFiniteAtLeast(form.hiresSteps, 1)) errors.push('Hires steps must be at least 1.');
    if (!isFiniteAtLeast(form.hiresCfg, 0)) errors.push('Hires CFG must be at least 0.');
    if (!isFiniteBetween(form.hiresDenoise, 0, 1)) errors.push('Hires denoise must be between 0 and 1.');
    if (form.hiresMode === 'resize' && !HIRES_RESIZE_METHODS.includes(form.resizeMethod)) {
      errors.push('Choose a resize method.');
    }
  }

  if (form.faceDetailerEnabled) {
    if (!isFiniteAtLeast(form.faceGuideSize, 1)) errors.push('Face guide size must be at least 1.');
    if (!isFiniteAtLeast(form.faceMaxSize, 1)) errors.push('Face max size must be at least 1.');
    if (!isFiniteAtLeast(form.faceSteps, 1)) errors.push('Face steps must be at least 1.');
    if (!isFiniteAtLeast(form.faceCfg, 0)) errors.push('Face CFG must be at least 0.');
    if (!isFiniteBetween(form.faceDenoise, 0, 1)) errors.push('Face denoise must be between 0 and 1.');
    if (!isFiniteBetween(form.faceBBoxThreshold, 0, 1)) errors.push('Face BBox threshold must be between 0 and 1.');
  }

  if (form.upscaleEnabled && isEmptyOrPlaceholderModelName(form.upscaleModel)) {
    errors.push('Choose an upscaler model before generating.');
  }

  return errors;
}
