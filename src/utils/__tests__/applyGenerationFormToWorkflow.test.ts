import { describe, expect, it } from 'vitest';
import type { Workflow, WorkflowNode } from '@/api/types';
import {
  DEFAULT_GENERATION_FORM_STATE,
  type GenerationFormState,
} from '@/hooks/useGenerationForm';
import { applyGenerationFormToWorkflow } from '../applyGenerationFormToWorkflow';
import { generationParamsFromWorkflow } from '../generationParamsFromWorkflow';

function node(
  id: number,
  type: string,
  title: string,
  widgets_values: unknown,
  mode = 0,
): WorkflowNode {
  return {
    id,
    type,
    title,
    pos: [0, 0],
    size: [100, 100],
    flags: {},
    order: 0,
    mode,
    inputs: [],
    outputs: [],
    properties: { 'Node name for S&R': title },
    widgets_values: widgets_values as WorkflowNode['widgets_values'],
  };
}

function makeWorkflow(): Workflow {
  return {
    last_node_id: 16,
    last_link_id: 0,
    nodes: [
      node(101, 'CheckpointLoaderSimple', 'MOBILE_CHECKPOINT', 'base.safetensors'),
      node(102, 'LoraLoader', 'MOBILE_LORA_1', ['a.safetensors', 1, 1], 4),
      node(103, 'LoraLoader', 'MOBILE_LORA_2', ['b.safetensors', 1, 1], 4),
      node(104, 'LoraLoader', 'MOBILE_LORA_3', ['c.safetensors', 1, 1], 4),
      node(105, 'CLIPTextEncode', 'MOBILE_POSITIVE', 'old positive'),
      node(106, 'CLIPTextEncode', 'MOBILE_NEGATIVE', 'old negative'),
      node(107, 'EmptyLatentImage', 'MOBILE_SIZE', [512, 512, 4]),
      node(108, 'KSampler', 'MOBILE_BASE_SAMPLER', [1, 'fixed', 10, 3, 'euler', 'normal', 1]),
      node(109, 'LatentUpscaleBy', 'MOBILE_HIRES_UPSCALE', ['bilinear', 1.5], 4),
      node(110, 'KSampler', 'MOBILE_HIRES_SAMPLER', [1, 'fixed', 10, 3, 'euler', 'normal', 0.3], 4),
      node(111, 'VAEDecode', 'MOBILE_VAE_DECODE', undefined),
      node(112, 'UltralyticsDetectorProvider', 'MOBILE_FACE_DETECTOR', 'old.pt'),
      node(113, 'FaceDetailer', 'MOBILE_FACE_DETAILER', [768, true, 1024, 1, 'fixed', 10, 3, 'euler', 'normal', 0.3, 5, true, true, 0.5], 4),
      node(114, 'UpscaleModelLoader', 'MOBILE_UPSCALE_MODEL', 'old.pth'),
      node(115, 'ImageUpscaleWithModel', 'MOBILE_UPSCALE', undefined, 4),
      node(116, 'SaveImage', 'MOBILE_SAVE_IMAGE', '%date:yyyyMMdd%_normal/mobile_sdxl'),
    ],
    links: [],
    groups: [],
    config: {},
    extra: {
      mobile_generation_profile: {
        nodeNames: {
          checkpoint: 'MOBILE_CHECKPOINT',
          loraSlots: ['MOBILE_LORA_1', 'MOBILE_LORA_2', 'MOBILE_LORA_3'],
          positive: 'MOBILE_POSITIVE',
          negative: 'MOBILE_NEGATIVE',
          size: 'MOBILE_SIZE',
          baseSampler: 'MOBILE_BASE_SAMPLER',
          hiresUpscale: 'MOBILE_HIRES_UPSCALE',
          hiresSampler: 'MOBILE_HIRES_SAMPLER',
          vaeDecode: 'MOBILE_VAE_DECODE',
          faceDetector: 'MOBILE_FACE_DETECTOR',
          faceDetailer: 'MOBILE_FACE_DETAILER',
          upscaleModel: 'MOBILE_UPSCALE_MODEL',
          upscale: 'MOBILE_UPSCALE',
          saveImage: 'MOBILE_SAVE_IMAGE',
        },
      },
    },
    version: 0.4,
  };
}

function form(): GenerationFormState {
  return {
    ...DEFAULT_GENERATION_FORM_STATE,
    loras: DEFAULT_GENERATION_FORM_STATE.loras.map((slot) => ({ ...slot })) as GenerationFormState['loras'],
  };
}

function find(workflow: Workflow, title: string): WorkflowNode {
  const result = workflow.nodes.find((candidate) => candidate.title === title);
  if (!result) throw new Error(`missing ${title}`);
  return result;
}

describe('applyGenerationFormToWorkflow', () => {
  it.each([
    [false, false, false],
    [true, false, false],
    [true, true, true],
  ])('sets LoRA modes for %s/%s/%s without changing links', (lora1, lora2, lora3) => {
    const source = makeWorkflow();
    const next = applyGenerationFormToWorkflow({
      ...form(),
      loras: [
        { ...form().loras[0], enabled: lora1 },
        { ...form().loras[1], enabled: lora2 },
        { ...form().loras[2], enabled: lora3 },
      ],
    }, source);

    expect(find(next, 'MOBILE_LORA_1').mode).toBe(lora1 ? 0 : 4);
    expect(find(next, 'MOBILE_LORA_2').mode).toBe(lora2 ? 0 : 4);
    expect(find(next, 'MOBILE_LORA_3').mode).toBe(lora3 ? 0 : 4);
    expect(next.links).toEqual(source.links);
    expect(find(source, 'MOBILE_LORA_1').mode).toBe(4);
  });

  it('toggles paired optional branches and switches the SaveImage prefix', () => {
    const source = makeWorkflow();
    const next = applyGenerationFormToWorkflow({
      ...form(),
      hiresEnabled: true,
      faceDetailerEnabled: true,
      upscaleEnabled: true,
    }, source);

    expect(find(next, 'MOBILE_HIRES_UPSCALE').mode).toBe(0);
    expect(find(next, 'MOBILE_HIRES_SAMPLER').mode).toBe(0);
    expect(find(next, 'MOBILE_FACE_DETAILER').mode).toBe(0);
    expect(find(next, 'MOBILE_UPSCALE_MODEL').mode).toBe(0);
    expect(find(next, 'MOBILE_UPSCALE').mode).toBe(0);
    expect((find(next, 'MOBILE_SAVE_IMAGE').widgets_values as unknown[])[0]).toBe(
      '%date:yyyyMMdd%_upscale/mobile_sdxl',
    );

    const normal = applyGenerationFormToWorkflow(form(), source);
    expect((find(normal, 'MOBILE_SAVE_IMAGE').widgets_values as unknown[])[0]).toBe(
      '%date:yyyyMMdd%_normal/mobile_sdxl',
    );
  });

  it('writes parameters by MOBILE name and can restore them without loading the graph', () => {
    const next = applyGenerationFormToWorkflow({
      ...form(),
      checkpoint: 'custom.safetensors',
      positivePrompt: 'a fox',
      negativePrompt: 'blurry',
      width: 768,
      height: 1024,
      seed: 42,
      steps: 33,
      cfg: 6.5,
      sampler: 'dpmpp_2m',
      scheduler: 'karras',
    }, makeWorkflow());
    const restored = generationParamsFromWorkflow(next);

    expect(restored.checkpoint).toBe('custom.safetensors');
    expect(restored.positivePrompt).toBe('a fox');
    expect(restored.negativePrompt).toBe('blurry');
    expect(restored.width).toBe(768);
    expect(restored.height).toBe(1024);
    expect(restored.seed).toBe(42);
    expect(restored.steps).toBe(33);
    expect(restored.cfg).toBe(6.5);
    expect(restored.sampler).toBe('dpmpp_2m');
    expect(restored.scheduler).toBe('karras');
  });
});
