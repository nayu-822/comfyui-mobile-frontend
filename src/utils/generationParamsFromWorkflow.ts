import type { Workflow, WorkflowNode } from '@/api/types';
import type { GenerationFormState, LoraSlot, LoraSlots } from '@/hooks/useGenerationForm';
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

  const checkpoint = findNamedOrType(workflow, nodeNames.checkpoint, ['CheckpointLoaderSimple', 'CheckpointLoader']);
  const positive = findNamedOrType(workflow, nodeNames.positive, ['CLIPTextEncode']);
  const negative = findNamedOrType(
    workflow,
    nodeNames.negative,
    ['CLIPTextEncode'],
    positive ? [positive] : [],
  );
  const size = findNamedOrType(workflow, nodeNames.size, ['EmptyLatentImage']);
  const baseSampler = findNamedOrType(workflow, nodeNames.baseSampler, ['KSampler', 'KSamplerAdvanced']);

  const checkpointValue = stringValue(getGenerationWidgetValue(checkpoint, 0, 'ckpt_name'));
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
  if (hiresUpscale || hiresSampler) {
    patch.hiresEnabled = (enabled(hiresUpscale) ?? true) && (enabled(hiresSampler) ?? true);
    if (hiresUpscale) patch.hiresScale = numberValue(getGenerationWidgetValue(hiresUpscale, 1, 'scale_by'), 1.5);
    if (hiresSampler) {
      patch.hiresSteps = numberValue(getGenerationWidgetValue(hiresSampler, 2, 'steps'), 15);
      patch.hiresCfg = numberValue(getGenerationWidgetValue(hiresSampler, 3, 'cfg'), 5);
      patch.hiresDenoise = numberValue(getGenerationWidgetValue(hiresSampler, 6, 'denoise'), 0.35);
      const sampler = stringValue(getGenerationWidgetValue(hiresSampler, 4, 'sampler_name'));
      const scheduler = stringValue(getGenerationWidgetValue(hiresSampler, 5, 'scheduler'));
      if (sampler !== undefined) patch.hiresSampler = sampler;
      if (scheduler !== undefined) patch.hiresScheduler = scheduler;
    }
  }

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
