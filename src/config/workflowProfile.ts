import type { Workflow, WorkflowNode } from '@/api/types';

export interface MobileNodeNames {
  checkpoint: string;
  loraSlots: [string, string, string];
  positive: string;
  negative: string;
  facePositive: string;
  faceNegative: string;
  size: string;
  baseSampler: string;
  hiresUpscale: string;
  hiresSampler: string;
  /** Legacy ComfySwitchNode name; absent from the current canonical graph. */
  hiresMode: string;
  hiresResizeDecode: string;
  hiresResizeImage: string;
  hiresResizeEncode: string;
  hiresResizeSampler: string;
  /** Legacy ComfySwitchNode name; absent from the current canonical graph. */
  hiresResultSelect: string;
  vaeDecode: string;
  faceDetector: string;
  faceDetailer: string;
  upscaleModel: string;
  upscale: string;
  saveImage: string;
}

export interface MobileFeatureProfile {
  nodes: string[];
  defaultEnabled?: boolean;
}

export interface MobileGenerationProfile {
  nodeNames: MobileNodeNames;
  features: Record<string, MobileFeatureProfile>;
}

export const DEFAULT_MOBILE_NODE_NAMES: MobileNodeNames = {
  checkpoint: 'MOBILE_CHECKPOINT',
  loraSlots: ['MOBILE_LORA_1', 'MOBILE_LORA_2', 'MOBILE_LORA_3'],
  positive: 'MOBILE_POSITIVE',
  negative: 'MOBILE_NEGATIVE',
  facePositive: 'MOBILE_FACE_POSITIVE',
  faceNegative: 'MOBILE_FACE_NEGATIVE',
  size: 'MOBILE_SIZE',
  baseSampler: 'MOBILE_BASE_SAMPLER',
  hiresUpscale: 'MOBILE_HIRES_UPSCALE',
  hiresSampler: 'MOBILE_HIRES_SAMPLER',
  hiresMode: 'MOBILE_HIRES_MODE',
  hiresResizeDecode: 'MOBILE_HIRES_RESIZE_DECODE',
  hiresResizeImage: 'MOBILE_HIRES_RESIZE_IMAGE',
  hiresResizeEncode: 'MOBILE_HIRES_RESIZE_ENCODE',
  hiresResizeSampler: 'MOBILE_HIRES_RESIZE_SAMPLER',
  hiresResultSelect: 'MOBILE_HIRES_RESULT_SELECT',
  vaeDecode: 'MOBILE_VAE_DECODE',
  faceDetector: 'MOBILE_FACE_DETECTOR',
  faceDetailer: 'MOBILE_FACE_DETAILER',
  upscaleModel: 'MOBILE_UPSCALE_MODEL',
  upscale: 'MOBILE_UPSCALE',
  saveImage: 'MOBILE_SAVE_IMAGE',
};

const DEFAULT_FEATURES: Record<string, MobileFeatureProfile> = {
  lora1: { nodes: [DEFAULT_MOBILE_NODE_NAMES.loraSlots[0]], defaultEnabled: false },
  lora2: { nodes: [DEFAULT_MOBILE_NODE_NAMES.loraSlots[1]], defaultEnabled: false },
  lora3: { nodes: [DEFAULT_MOBILE_NODE_NAMES.loraSlots[2]], defaultEnabled: false },
  hires: {
    nodes: [
      DEFAULT_MOBILE_NODE_NAMES.hiresUpscale,
      DEFAULT_MOBILE_NODE_NAMES.hiresSampler,
      DEFAULT_MOBILE_NODE_NAMES.hiresResizeDecode,
      DEFAULT_MOBILE_NODE_NAMES.hiresResizeImage,
      DEFAULT_MOBILE_NODE_NAMES.hiresResizeEncode,
      DEFAULT_MOBILE_NODE_NAMES.hiresResizeSampler,
    ],
    defaultEnabled: false,
  },
  faceDetailer: {
    nodes: [
      DEFAULT_MOBILE_NODE_NAMES.facePositive,
      DEFAULT_MOBILE_NODE_NAMES.faceNegative,
      DEFAULT_MOBILE_NODE_NAMES.faceDetailer,
    ],
    defaultEnabled: false,
  },
  upscaler: {
    nodes: [DEFAULT_MOBILE_NODE_NAMES.upscaleModel, DEFAULT_MOBILE_NODE_NAMES.upscale],
    defaultEnabled: false,
  },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function stringOr(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value : fallback;
}

function readProfile(workflow: Workflow): Record<string, unknown> {
  const extra = isRecord(workflow.extra) ? workflow.extra : null;
  const profile = extra && isRecord(extra.mobile_generation_profile)
    ? extra.mobile_generation_profile
    : null;
  return profile ?? {};
}

/** Read the optional profile while keeping the committed MOBILE_* names as a safe fallback. */
export function getMobileGenerationProfile(workflow: Workflow): MobileGenerationProfile {
  const rawProfile = readProfile(workflow);
  const rawNames = isRecord(rawProfile.nodeNames) ? rawProfile.nodeNames : {};
  const rawLoraSlots = Array.isArray(rawNames.loraSlots) ? rawNames.loraSlots : [];
  const nodeNames: MobileNodeNames = {
    checkpoint: stringOr(rawNames.checkpoint, DEFAULT_MOBILE_NODE_NAMES.checkpoint),
    loraSlots: [
      stringOr(rawLoraSlots[0], DEFAULT_MOBILE_NODE_NAMES.loraSlots[0]),
      stringOr(rawLoraSlots[1], DEFAULT_MOBILE_NODE_NAMES.loraSlots[1]),
      stringOr(rawLoraSlots[2], DEFAULT_MOBILE_NODE_NAMES.loraSlots[2]),
    ],
    positive: stringOr(rawNames.positive, DEFAULT_MOBILE_NODE_NAMES.positive),
    negative: stringOr(rawNames.negative, DEFAULT_MOBILE_NODE_NAMES.negative),
    facePositive: stringOr(rawNames.facePositive, DEFAULT_MOBILE_NODE_NAMES.facePositive),
    faceNegative: stringOr(rawNames.faceNegative, DEFAULT_MOBILE_NODE_NAMES.faceNegative),
    size: stringOr(rawNames.size, DEFAULT_MOBILE_NODE_NAMES.size),
    baseSampler: stringOr(rawNames.baseSampler, DEFAULT_MOBILE_NODE_NAMES.baseSampler),
    hiresUpscale: stringOr(rawNames.hiresUpscale, DEFAULT_MOBILE_NODE_NAMES.hiresUpscale),
    hiresSampler: stringOr(rawNames.hiresSampler, DEFAULT_MOBILE_NODE_NAMES.hiresSampler),
    hiresMode: stringOr(rawNames.hiresMode, DEFAULT_MOBILE_NODE_NAMES.hiresMode),
    hiresResizeDecode: stringOr(rawNames.hiresResizeDecode, DEFAULT_MOBILE_NODE_NAMES.hiresResizeDecode),
    hiresResizeImage: stringOr(rawNames.hiresResizeImage, DEFAULT_MOBILE_NODE_NAMES.hiresResizeImage),
    hiresResizeEncode: stringOr(rawNames.hiresResizeEncode, DEFAULT_MOBILE_NODE_NAMES.hiresResizeEncode),
    hiresResizeSampler: stringOr(rawNames.hiresResizeSampler, DEFAULT_MOBILE_NODE_NAMES.hiresResizeSampler),
    hiresResultSelect: stringOr(rawNames.hiresResultSelect, DEFAULT_MOBILE_NODE_NAMES.hiresResultSelect),
    vaeDecode: stringOr(rawNames.vaeDecode, DEFAULT_MOBILE_NODE_NAMES.vaeDecode),
    faceDetector: stringOr(rawNames.faceDetector, DEFAULT_MOBILE_NODE_NAMES.faceDetector),
    faceDetailer: stringOr(rawNames.faceDetailer, DEFAULT_MOBILE_NODE_NAMES.faceDetailer),
    upscaleModel: stringOr(rawNames.upscaleModel, DEFAULT_MOBILE_NODE_NAMES.upscaleModel),
    upscale: stringOr(rawNames.upscale, DEFAULT_MOBILE_NODE_NAMES.upscale),
    saveImage: stringOr(rawNames.saveImage, DEFAULT_MOBILE_NODE_NAMES.saveImage),
  };

  const features: Record<string, MobileFeatureProfile> = { ...DEFAULT_FEATURES };
  const rawFeatures = isRecord(rawProfile.features) ? rawProfile.features : {};
  for (const [key, rawFeature] of Object.entries(rawFeatures)) {
    if (!isRecord(rawFeature) || !Array.isArray(rawFeature.nodes)) continue;
    const nodes = rawFeature.nodes.filter((node): node is string => typeof node === 'string');
    if (nodes.length === 0) continue;
    features[key] = {
      nodes,
      defaultEnabled: typeof rawFeature.defaultEnabled === 'boolean'
        ? rawFeature.defaultEnabled
        : features[key]?.defaultEnabled,
    };
  }

  return { nodeNames, features };
}

export function getWorkflowNodeName(node: WorkflowNode): string | null {
  const title = typeof node.title === 'string' ? node.title : null;
  if (title?.trim()) return title.trim();
  const searchName = node.properties?.['Node name for S&R'];
  return typeof searchName === 'string' && searchName.trim() ? searchName.trim() : null;
}

/** Locate a node by its author-facing title/S&R name, never by its numeric id. */
export function findMobileNode(workflow: Workflow, name: string): WorkflowNode | undefined {
  return (workflow.nodes ?? []).find((node) => {
    const title = typeof node.title === 'string' ? node.title.trim() : '';
    const searchName = typeof node.properties?.['Node name for S&R'] === 'string'
      ? node.properties['Node name for S&R'].trim()
      : '';
    return title === name || searchName === name;
  });
}

export function findMobileNodes(workflow: Workflow, names: string[]): WorkflowNode[] {
  return names
    .map((name) => findMobileNode(workflow, name))
    .filter((node): node is WorkflowNode => Boolean(node));
}
