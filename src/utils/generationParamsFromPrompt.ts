import {
  DEFAULT_GENERATION_FORM_STATE,
  HIRES_RESIZE_METHODS,
  type HiresMode,
  type HiresResizeMethod,
  type LoraSlot,
  type LoraSlots,
} from '@/hooks/useGenerationForm';
import type { GenerationFormPatch } from './generationParamsFromWorkflow';

interface PromptNode {
  id: string;
  classType: string;
  inputs: Record<string, unknown>;
  labels: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function promptRoot(value: unknown): Record<string, unknown> | null {
  if (!isRecord(value)) return null;
  return isRecord(value.prompt) ? value.prompt : value;
}

function labelsForNode(node: Record<string, unknown>): string[] {
  const labels: string[] = [];
  const meta = isRecord(node._meta) ? node._meta : null;
  for (const value of [
    node.title,
    node.name,
    meta?.title,
    meta?.name,
    meta?.['Node name for S&R'],
    node['Node name for S&R'],
  ]) {
    if (typeof value === 'string' && value.trim()) labels.push(value.trim());
  }
  const inputs = isRecord(node.inputs) ? node.inputs : {};
  for (const key of ['Node name for S&R', 'node_name', 'title']) {
    const value = inputs[key];
    if (typeof value === 'string' && value.trim()) labels.push(value.trim());
  }
  return labels;
}

function readPromptNodes(value: unknown): PromptNode[] {
  const root = promptRoot(value);
  if (!root) return [];
  return Object.entries(root).flatMap(([id, rawNode]) => {
    if (!isRecord(rawNode)) return [];
    const classType = typeof rawNode.class_type === 'string' ? rawNode.class_type : '';
    const inputs = isRecord(rawNode.inputs) ? rawNode.inputs : null;
    if (!classType || !inputs) return [];
    return [{ id, classType, inputs, labels: labelsForNode(rawNode) }];
  });
}

function sameLabel(label: string, wanted: string): boolean {
  return label.trim().toLowerCase() === wanted.trim().toLowerCase();
}

function hasClass(node: PromptNode, classes: readonly string[]): boolean {
  return classes.some((className) => node.classType === className);
}

function findNamed(nodes: PromptNode[], names: readonly string[], skip = new Set<PromptNode>()): PromptNode | undefined {
  return nodes.find((node) => !skip.has(node) && node.labels.some((label) => names.some((name) => sameLabel(label, name))));
}

function findClass(nodes: PromptNode[], classes: readonly string[], skip = new Set<PromptNode>()): PromptNode | undefined {
  return nodes.find((node) => !skip.has(node) && hasClass(node, classes));
}

function findNamedOrClass(
  nodes: PromptNode[],
  names: readonly string[],
  classes: readonly string[],
  skip: PromptNode[] = [],
): PromptNode | undefined {
  const skipped = new Set(skip);
  return findNamed(nodes, names, skipped) ?? findClass(nodes, classes, skipped);
}

function allClasses(nodes: PromptNode[], classes: readonly string[], skip: PromptNode[] = []): PromptNode[] {
  const skipped = new Set(skip);
  return nodes.filter((node) => !skipped.has(node) && hasClass(node, classes));
}

function scalar(value: unknown): unknown {
  return Array.isArray(value) ? undefined : value;
}

function input(node: PromptNode | undefined, names: readonly string[], fallbackIndex?: number): unknown {
  if (!node) return undefined;
  for (const name of names) {
    if (name in node.inputs) return scalar(node.inputs[name]);
  }
  if (fallbackIndex === undefined) return undefined;
  return scalar(Object.values(node.inputs)[fallbackIndex]);
}

function stringInput(node: PromptNode | undefined, names: readonly string[], fallbackIndex?: number): string | undefined {
  const value = input(node, names, fallbackIndex);
  return typeof value === 'string' ? value : undefined;
}

function numberInput(node: PromptNode | undefined, names: readonly string[], fallbackIndex?: number): number | undefined {
  const value = input(node, names, fallbackIndex);
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function booleanInput(node: PromptNode | undefined, names: readonly string[]): boolean | undefined {
  const value = input(node, names);
  return typeof value === 'boolean' ? value : undefined;
}

function loraFromNode(node: PromptNode): LoraSlot {
  return {
    enabled: booleanInput(node, ['enabled']) ?? true,
    name: stringInput(node, ['lora_name', 'model_name'], 0) ?? '',
    strengthModel: numberInput(node, ['strength_model', 'strength'], 1) ?? 1,
    strengthClip: numberInput(node, ['strength_clip'], 2) ?? 1,
  };
}

function setSamplerValues(
  patch: GenerationFormPatch,
  node: PromptNode | undefined,
  prefix: '' | 'hires',
): void {
  if (!node) return;
  const steps = numberInput(node, ['steps'], 2);
  const cfg = numberInput(node, ['cfg'], 3);
  const sampler = stringInput(node, ['sampler_name', 'sampler'], 4);
  const scheduler = stringInput(node, ['scheduler'], 5);
  const seed = numberInput(node, ['seed'], 0);
  if (prefix === '') {
    if (seed !== undefined) {
      patch.seed = seed;
      patch.seedMode = 'fixed';
    }
    if (steps !== undefined) patch.steps = steps;
    if (cfg !== undefined) patch.cfg = cfg;
    if (sampler !== undefined) patch.sampler = sampler;
    if (scheduler !== undefined) patch.scheduler = scheduler;
    return;
  }
  if (steps !== undefined) patch.hiresSteps = steps;
  if (cfg !== undefined) patch.hiresCfg = cfg;
  if (sampler !== undefined) patch.hiresSampler = sampler;
  if (scheduler !== undefined) patch.hiresScheduler = scheduler;
  const denoise = numberInput(node, ['denoise'], 6);
  if (denoise !== undefined) patch.hiresDenoise = denoise;
}

function resizeMethod(value: unknown): HiresResizeMethod | undefined {
  return typeof value === 'string' && HIRES_RESIZE_METHODS.includes(value as HiresResizeMethod)
    ? value as HiresResizeMethod
    : undefined;
}

const NAMES = {
  checkpoint: ['MOBILE_CHECKPOINT'],
  positive: ['MOBILE_POSITIVE'],
  negative: ['MOBILE_NEGATIVE'],
  size: ['MOBILE_SIZE'],
  baseSampler: ['MOBILE_BASE_SAMPLER'],
  loras: ['MOBILE_LORA_1', 'MOBILE_LORA_2', 'MOBILE_LORA_3'],
  hiresUpscale: ['MOBILE_HIRES_UPSCALE'],
  hiresSampler: ['MOBILE_HIRES_SAMPLER'],
  hiresResizeImage: ['MOBILE_HIRES_RESIZE_IMAGE'],
  hiresResizeSampler: ['MOBILE_HIRES_RESIZE_SAMPLER'],
  faceDetector: ['MOBILE_FACE_DETECTOR'],
  faceDetailer: ['MOBILE_FACE_DETAILER'],
  upscaleModel: ['MOBILE_UPSCALE_MODEL'],
  upscale: ['MOBILE_UPSCALE'],
} as const;

/**
 * Extract form values from ComfyUI's execution prompt metadata. Prompt JSON
 * has no canvas topology, so this function only returns a form patch; it never
 * replaces the canonical mobile workflow held by GenerationPanel.
 */
export function generationParamsFromPrompt(prompt: unknown): GenerationFormPatch {
  const nodes = readPromptNodes(prompt);
  const patch: GenerationFormPatch = {};
  if (nodes.length === 0) return patch;

  const checkpoint = findNamedOrClass(
    nodes,
    NAMES.checkpoint,
    ['CheckpointLoaderSimple', 'CheckpointLoader'],
  );
  const positive = findNamedOrClass(nodes, NAMES.positive, ['CLIPTextEncode']);
  const negative = findNamedOrClass(
    nodes,
    NAMES.negative,
    ['CLIPTextEncode'],
    positive ? [positive] : [],
  );
  const size = findNamedOrClass(nodes, NAMES.size, ['EmptyLatentImage']);
  const baseSampler = findNamedOrClass(nodes, NAMES.baseSampler, ['KSampler', 'KSamplerAdvanced']);

  const checkpointValue = stringInput(checkpoint, ['ckpt_name', 'checkpoint'], 0);
  if (checkpointValue !== undefined) patch.checkpoint = checkpointValue;
  const positiveValue = stringInput(positive, ['text', 'prompt'], 0);
  if (positiveValue !== undefined) patch.positivePrompt = positiveValue;
  const negativeValue = stringInput(negative, ['text', 'prompt'], 0);
  if (negativeValue !== undefined) patch.negativePrompt = negativeValue;
  const width = numberInput(size, ['width'], 0);
  const height = numberInput(size, ['height'], 1);
  const batchSize = numberInput(size, ['batch_size', 'batchSize'], 2);
  if (width !== undefined) patch.width = width;
  if (height !== undefined) patch.height = height;
  if (batchSize !== undefined) patch.batchSize = batchSize;
  setSamplerValues(patch, baseSampler, '');
  const hasGenerationPrompt = Boolean(checkpoint || positive || negative || size || baseSampler);

  const loraNodes = NAMES.loras.map((name) => findNamed(nodes, [name]));
  const fallbackLoras = allClasses(nodes, ['LoraLoader', 'LoraLoaderModelOnly']);
  const selectedLoras = loraNodes.some(Boolean)
    ? loraNodes
    : fallbackLoras.slice(0, 3);
  if (selectedLoras.some(Boolean)) {
    const loras: LoraSlot[] = DEFAULT_GENERATION_FORM_STATE.loras.map((slot) => ({ ...slot }));
    selectedLoras.forEach((node, index) => {
      if (node) loras[index] = loraFromNode(node);
    });
    patch.loras = loras as LoraSlots;
  }

  const latentUpscale = findNamedOrClass(nodes, NAMES.hiresUpscale, ['LatentUpscaleBy']);
  const namedLatentSampler = findNamed(nodes, NAMES.hiresSampler);
  const resizeImage = findNamedOrClass(
    nodes,
    NAMES.hiresResizeImage,
    ['ImageScale', 'ImageScaleBy'],
  );
  const namedResizeSampler = findNamed(nodes, NAMES.hiresResizeSampler);
  const latentSamplers = allClasses(
    nodes,
    ['KSampler', 'KSamplerAdvanced'],
    baseSampler ? [baseSampler] : [],
  );
  // An execution prompt normally contains only the selected Hires branch. Do
  // not mistake a resize branch's lone KSampler for latent Hires merely because
  // it lacks the canonical title.
  const inferredLatentSampler = namedLatentSampler
    ?? (!resizeImage ? latentSamplers[0] : undefined);
  const inferredResizeSampler = namedResizeSampler
    ?? (resizeImage
      ? latentSamplers.find((node) => node !== inferredLatentSampler) ?? latentSamplers[0]
      : undefined);
  const hasResizeBranch = Boolean(resizeImage || inferredResizeSampler);
  const hasLatentBranch = Boolean(latentUpscale || inferredLatentSampler);
  if (hasGenerationPrompt) patch.hiresEnabled = hasResizeBranch || hasLatentBranch;
  if (hasResizeBranch || hasLatentBranch) {
    const mode: HiresMode = hasResizeBranch && !hasLatentBranch ? 'resize' : 'latent';
    patch.hiresMode = mode;
    const scaleNode = mode === 'resize' ? resizeImage : latentUpscale;
    const samplerNode = mode === 'resize' ? inferredResizeSampler : (latentUpscale ? inferredLatentSampler : undefined);
    const scale = numberInput(scaleNode, ['scale_by', 'scale'], 1);
    if (scale !== undefined) patch.hiresScale = scale;
    setSamplerValues(patch, samplerNode, 'hires');
    const method = resizeMethod(input(resizeImage, ['upscale_method', 'method'], 0));
    if (method !== undefined) patch.resizeMethod = method;
  }

  const faceDetailer = findNamedOrClass(nodes, NAMES.faceDetailer, ['FaceDetailer']);
  if (hasGenerationPrompt) patch.faceDetailerEnabled = Boolean(faceDetailer);
  if (faceDetailer) {
    const values: Array<[keyof GenerationFormPatch, string[], number?]> = [
      ['faceGuideSize', ['guide_size'], 0],
      ['faceMaxSize', ['max_size'], 2],
      ['faceSteps', ['steps'], 5],
      ['faceCfg', ['cfg'], 6],
      ['faceDenoise', ['denoise'], 9],
      ['faceBBoxThreshold', ['bbox_threshold'], 13],
    ];
    for (const [key, names, index] of values) {
      const value = numberInput(faceDetailer, names, index);
      if (value !== undefined) (patch as Record<string, unknown>)[key] = value;
    }
  }

  const upscaleModel = findNamedOrClass(nodes, NAMES.upscaleModel, ['UpscaleModelLoader']);
  const upscale = findNamedOrClass(nodes, NAMES.upscale, ['ImageUpscaleWithModel']);
  if (hasGenerationPrompt) patch.upscaleEnabled = Boolean(upscaleModel && upscale);
  if (upscaleModel || upscale) {
    const model = stringInput(upscaleModel, ['model_name'], 0);
    if (model !== undefined) patch.upscaleModel = model;
  }

  return patch;
}
