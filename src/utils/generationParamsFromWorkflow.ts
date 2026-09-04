import type { Workflow, WorkflowNode } from '@/api/types';
import {
  HIRES_RESIZE_METHODS,
  type GenerationFormState,
  type HiresMode,
  type HiresResizeMethod,
  type LoraSlot,
  type LoraSlots,
} from '@/hooks/useGenerationForm';
import {
  DEFAULT_MOBILE_NODE_NAMES,
  findMobileNode,
  getMobileGenerationProfile,
} from '@/config/workflowProfile';
import { getGenerationWidgetValue } from './applyGenerationFormToWorkflow';

export type GenerationFormPatch = Partial<Omit<GenerationFormState, 'loras'>> & {
  loras?: LoraSlots;
};

function numberValue(value: unknown, fallback: number): number {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) ? number : fallback;
}
function numberValueOrUndefined(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value !== 'string' || value.trim() === '') return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}
function stringValue(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  return value;
}

function hiresModeValue(value: unknown): HiresMode | undefined {
  if (value === 'latent' || value === 'resize') return value;
  if (value === true) return 'resize';
  if (value === false) return 'latent';
  return undefined;
}

function resizeMethodValue(value: unknown): HiresResizeMethod | undefined {
  if (typeof value !== 'string') return undefined;
  return HIRES_RESIZE_METHODS.includes(value as HiresResizeMethod)
    ? value as HiresResizeMethod
    : undefined;
}

function findByType(workflow: Workflow, types: string[], skip: WorkflowNode[] = []): WorkflowNode | undefined {
  const skipped = new Set(skip);
  return workflow.nodes.find((node) => types.includes(node.type) && !skipped.has(node));
}

function findNamedOrType(
  workflow: Workflow,
  name: string,
  types: string[],
  skip: WorkflowNode[] = [],
): WorkflowNode | undefined {
  return findMobileNode(workflow, name) ?? findByType(workflow, types, skip);
}

function enabled(node: WorkflowNode | undefined): boolean | undefined {
  return node ? node.mode !== 4 : undefined;
}

/**
 * Extract only mobile generation parameters from an embedded canonical
 * workflow. It intentionally ignores topology, node positions, and output
 * nodes so an image never replaces the current workflow graph.
 */
export function generationParamsFromWorkflow(workflow: Workflow): GenerationFormPatch {
  const { nodeNames } = getMobileGenerationProfile(workflow);
  const patch: GenerationFormPatch = {};

  const checkpoint = findNamedOrType(
    workflow,
    nodeNames.checkpoint,
    ['CheckpointLoaderSimple', 'CheckpointLoader', 'UNETLoader'],
  );
  const positive = findNamedOrType(workflow, nodeNames.positive, ['CLIPTextEncode']);
  const negative = findNamedOrType(
    workflow,
    nodeNames.negative,
    ['CLIPTextEncode'],
    positive ? [positive] : [],
  );
  const size = findNamedOrType(workflow, nodeNames.size, ['EmptyLatentImage']);
  const baseSampler = findNamedOrType(workflow, nodeNames.baseSampler, ['KSampler', 'KSamplerAdvanced']);

  const checkpointValue = stringValue(getGenerationWidgetValue(
    checkpoint,
    0,
    checkpoint?.type === 'UNETLoader' ? 'unet_name' : 'ckpt_name',
  ));
  if (checkpointValue !== undefined) patch.checkpoint = checkpointValue;
  const positiveValue = stringValue(getGenerationWidgetValue(positive, 0, 'text'));
  if (positiveValue !== undefined) patch.positivePrompt = positiveValue;
  const negativeValue = stringValue(getGenerationWidgetValue(negative, 0, 'text'));
  if (negativeValue !== undefined) patch.negativePrompt = negativeValue;
  if (size) {
    patch.width = numberValue(getGenerationWidgetValue(size, 0, 'width'), 1024);
    patch.height = numberValue(getGenerationWidgetValue(size, 1, 'height'), 1536);
  }
  if (baseSampler) {
    const restoredSeed = numberValueOrUndefined(getGenerationWidgetValue(baseSampler, 0, 'seed'));
    if (restoredSeed !== undefined) {
      patch.seed = restoredSeed;
      patch.seedMode = 'fixed';
    }
    patch.steps = numberValue(getGenerationWidgetValue(baseSampler, 2, 'steps'), 28);
    patch.cfg = numberValue(getGenerationWidgetValue(baseSampler, 3, 'cfg'), 5);
    const sampler = stringValue(getGenerationWidgetValue(baseSampler, 4, 'sampler_name'));
    const scheduler = stringValue(getGenerationWidgetValue(baseSampler, 5, 'scheduler'));
    if (sampler !== undefined) patch.sampler = sampler;
    if (scheduler !== undefined) patch.scheduler = scheduler;
  }

  const loras: LoraSlot[] = [];
  let foundLora = false;
  for (let index = 0; index < 3; index += 1) {
    const name = nodeNames.loraSlots[index] ?? DEFAULT_MOBILE_NODE_NAMES.loraSlots[index];
    const node = findMobileNode(workflow, name);
    if (node) foundLora = true;
    loras.push({
      enabled: node?.mode !== 4,
      name: stringValue(getGenerationWidgetValue(node, 0, 'lora_name')) ?? '',
      strengthModel: numberValue(getGenerationWidgetValue(node, 1, 'strength_model'), 1),
      strengthClip: numberValue(getGenerationWidgetValue(node, 2, 'strength_clip'), 1),
    });
  }
  if (foundLora) patch.loras = loras as LoraSlots;

  const hiresUpscale = findNamedOrType(workflow, nodeNames.hiresUpscale, ['LatentUpscaleBy']);
  const hiresSampler = findNamedOrType(workflow, nodeNames.hiresSampler, ['KSampler', 'KSamplerAdvanced'], hiresUpscale ? [hiresUpscale] : []);
  const hiresModeNode = findMobileNode(workflow, nodeNames.hiresMode);
  const hiresResultSelect = findMobileNode(workflow, nodeNames.hiresResultSelect);
  const resizeImage = findMobileNode(workflow, nodeNames.hiresResizeImage);
  const resizeSampler = findMobileNode(workflow, nodeNames.hiresResizeSampler);
  const restoredHiresMode = hiresModeValue(
    getGenerationWidgetValue(hiresModeNode, 0, 'switch'),
  );
  const inferredHiresMode: HiresMode = restoredHiresMode
    ?? ((resizeImage || resizeSampler) && enabled(resizeSampler) && !enabled(hiresSampler)
      ? 'resize'
      : 'latent');
  if (restoredHiresMode !== undefined || resizeImage || resizeSampler) {
    patch.hiresMode = inferredHiresMode;
  }

  const restoredHiresEnabled = getGenerationWidgetValue(hiresResultSelect, 0, 'switch');
  if (typeof restoredHiresEnabled === 'boolean') {
    patch.hiresEnabled = restoredHiresEnabled;
  } else if (hiresUpscale || hiresSampler || resizeImage || resizeSampler) {
    const activeSampler = inferredHiresMode === 'resize' ? resizeSampler : hiresSampler;
    const activeScale = inferredHiresMode === 'resize' ? resizeImage : hiresUpscale;
    patch.hiresEnabled = (enabled(activeScale) ?? true) && (enabled(activeSampler) ?? true);
  }

  const activeHiresSampler = inferredHiresMode === 'resize' ? resizeSampler : hiresSampler;
  const activeScaleNode = inferredHiresMode === 'resize' ? resizeImage : hiresUpscale;
  if (activeScaleNode || activeHiresSampler) {
    if (activeScaleNode) {
      patch.hiresScale = numberValue(getGenerationWidgetValue(activeScaleNode, 1, 'scale_by'), 1.5);
    }
    if (activeHiresSampler) {
      patch.hiresSteps = numberValue(getGenerationWidgetValue(activeHiresSampler, 2, 'steps'), 15);
      patch.hiresCfg = numberValue(getGenerationWidgetValue(activeHiresSampler, 3, 'cfg'), 5);
      patch.hiresDenoise = numberValue(getGenerationWidgetValue(activeHiresSampler, 6, 'denoise'), 0.35);
      const sampler = stringValue(getGenerationWidgetValue(activeHiresSampler, 4, 'sampler_name'));
      const scheduler = stringValue(getGenerationWidgetValue(activeHiresSampler, 5, 'scheduler'));
      if (sampler !== undefined) patch.hiresSampler = sampler;
      if (scheduler !== undefined) patch.hiresScheduler = scheduler;
    }
  }
  if (resizeImage) {
    const resizeMethod = resizeMethodValue(
      getGenerationWidgetValue(resizeImage, 0, 'upscale_method'),
    );
    if (resizeMethod !== undefined) patch.resizeMethod = resizeMethod;
  }

  // These are deliberately name-only lookups. Older workflows can have
  // CLIPTextEncode nodes for the main prompts but no FaceDetailer-specific
  // nodes; in that case leave the new fields untouched so restore remains
  // backward compatible.
  const facePositive = findMobileNode(workflow, nodeNames.facePositive);
  const faceNegative = findMobileNode(workflow, nodeNames.faceNegative);
  const facePositiveValue = stringValue(getGenerationWidgetValue(facePositive, 0, 'text'));
  const faceNegativeValue = stringValue(getGenerationWidgetValue(faceNegative, 0, 'text'));
  if (facePositiveValue !== undefined) patch.facePositivePrompt = facePositiveValue;
  if (faceNegativeValue !== undefined) patch.faceNegativePrompt = faceNegativeValue;

  const detector = findNamedOrType(workflow, nodeNames.faceDetector, ['UltralyticsDetectorProvider']);
  const faceDetailer = findNamedOrType(workflow, nodeNames.faceDetailer, ['FaceDetailer']);
  if (detector || faceDetailer) {
    patch.faceDetailerEnabled = enabled(faceDetailer) ?? true;
    if (faceDetailer) {
      patch.faceGuideSize = numberValue(getGenerationWidgetValue(faceDetailer, 0, 'guide_size'), 768);
      patch.faceMaxSize = numberValue(getGenerationWidgetValue(faceDetailer, 2, 'max_size'), 1024);
      patch.faceSteps = numberValue(getGenerationWidgetValue(faceDetailer, 5, 'steps'), 15);
      patch.faceCfg = numberValue(getGenerationWidgetValue(faceDetailer, 6, 'cfg'), 5);
      patch.faceDenoise = numberValue(getGenerationWidgetValue(faceDetailer, 9, 'denoise'), 0.35);
      patch.faceBBoxThreshold = numberValue(getGenerationWidgetValue(faceDetailer, 13, 'bbox_threshold'), 0.5);
    }
  }

  const upscaleModel = findNamedOrType(workflow, nodeNames.upscaleModel, ['UpscaleModelLoader']);
  const upscale = findNamedOrType(workflow, nodeNames.upscale, ['ImageUpscaleWithModel']);
  if (upscaleModel || upscale) {
    patch.upscaleEnabled = (enabled(upscaleModel) ?? true) && (enabled(upscale) ?? true);
    const model = stringValue(getGenerationWidgetValue(upscaleModel, 0, 'model_name'));
    if (model !== undefined) patch.upscaleModel = model;
  }

  return patch;
}
