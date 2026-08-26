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
    last_node_id: 22,
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
      node(117, 'VAEDecode', 'MOBILE_HIRES_RESIZE_DECODE', undefined, 4),
      node(118, 'ImageScaleBy', 'MOBILE_HIRES_RESIZE_IMAGE', ['lanczos', 1.5], 4),
      node(119, 'VAEEncode', 'MOBILE_HIRES_RESIZE_ENCODE', undefined, 4),
      node(120, 'KSampler', 'MOBILE_HIRES_RESIZE_SAMPLER', [1, 'fixed', 10, 3, 'euler', 'normal', 0.3], 4),
      node(121, 'ComfySwitchNode', 'MOBILE_HIRES_MODE', [false]),
      node(122, 'ComfySwitchNode', 'MOBILE_HIRES_RESULT_SELECT', [false]),
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
  it('keeps latent Hires and Lanczos resize defaults', () => {
    const defaults = form();

    expect(defaults.hiresMode).toBe('latent');
    expect(defaults.resizeMethod).toBe('lanczos');
  });

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
    expect(find(next, 'MOBILE_HIRES_RESIZE_DECODE').mode).toBe(4);
    expect(find(next, 'MOBILE_HIRES_RESIZE_IMAGE').mode).toBe(4);
    expect(find(next, 'MOBILE_HIRES_RESIZE_ENCODE').mode).toBe(4);
    expect(find(next, 'MOBILE_HIRES_RESIZE_SAMPLER').mode).toBe(4);
    expect((find(next, 'MOBILE_HIRES_MODE').widgets_values as unknown[])[0]).toBe(false);
    expect((find(next, 'MOBILE_HIRES_RESULT_SELECT').widgets_values as unknown[])[0]).toBe(true);
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
    }, makeWorkflow(), 42);
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
    expect(restored.seedMode).toBe('fixed');
    expect((find(next, 'MOBILE_BASE_SAMPLER').widgets_values as unknown[])[0]).toBe(42);
    expect((find(next, 'MOBILE_HIRES_SAMPLER').widgets_values as unknown[])[0]).toBe(42);
    expect((find(next, 'MOBILE_HIRES_RESIZE_SAMPLER').widgets_values as unknown[])[0]).toBe(42);
    expect((find(next, 'MOBILE_FACE_DETAILER').widgets_values as unknown[])[3]).toBe(42);
  });

  it('applies and restores the resize Hires branch', () => {
    const next = applyGenerationFormToWorkflow({
      ...form(),
      hiresEnabled: true,
      hiresMode: 'resize',
      resizeMethod: 'bicubic',
      hiresScale: 2,
      hiresSteps: 21,
      hiresCfg: 6.5,
      hiresDenoise: 0.4,
      hiresSampler: 'dpmpp_2m',
      hiresScheduler: 'karras',
    }, makeWorkflow(), 987);

    expect(find(next, 'MOBILE_HIRES_UPSCALE').mode).toBe(4);
    expect(find(next, 'MOBILE_HIRES_SAMPLER').mode).toBe(4);
    expect(find(next, 'MOBILE_HIRES_RESIZE_DECODE').mode).toBe(0);
    expect(find(next, 'MOBILE_HIRES_RESIZE_IMAGE').mode).toBe(0);
    expect(find(next, 'MOBILE_HIRES_RESIZE_ENCODE').mode).toBe(0);
    expect(find(next, 'MOBILE_HIRES_RESIZE_SAMPLER').mode).toBe(0);
    expect((find(next, 'MOBILE_HIRES_MODE').widgets_values as unknown[])[0]).toBe(true);
    expect((find(next, 'MOBILE_HIRES_RESULT_SELECT').widgets_values as unknown[])[0]).toBe(true);

    const resizeImageValues = find(next, 'MOBILE_HIRES_RESIZE_IMAGE').widgets_values as unknown[];
    expect(resizeImageValues[0]).toBe('bicubic');
    expect(resizeImageValues[1]).toBe(2);

    const resizeSamplerValues = find(next, 'MOBILE_HIRES_RESIZE_SAMPLER').widgets_values as unknown[];
    expect(resizeSamplerValues[0]).toBe(987);
    expect(resizeSamplerValues[2]).toBe(21);
    expect(resizeSamplerValues[3]).toBe(6.5);
    expect(resizeSamplerValues[4]).toBe('dpmpp_2m');
    expect(resizeSamplerValues[5]).toBe('karras');
    expect(resizeSamplerValues[6]).toBe(0.4);

    const restored = generationParamsFromWorkflow(next);
    expect(restored.hiresEnabled).toBe(true);
    expect(restored.hiresMode).toBe('resize');
    expect(restored.resizeMethod).toBe('bicubic');
    expect(restored.hiresScale).toBe(2);
    expect(restored.hiresSteps).toBe(21);
    expect(restored.hiresCfg).toBe(6.5);
    expect(restored.hiresDenoise).toBe(0.4);
    expect(restored.hiresSampler).toBe('dpmpp_2m');
    expect(restored.hiresScheduler).toBe('karras');
  });

  it('keeps legacy latent-only workflows restorable', () => {
    const legacy = makeWorkflow();
    legacy.nodes = legacy.nodes.filter((candidate) => ![
      'MOBILE_HIRES_MODE',
      'MOBILE_HIRES_RESIZE_DECODE',
      'MOBILE_HIRES_RESIZE_IMAGE',
      'MOBILE_HIRES_RESIZE_ENCODE',
      'MOBILE_HIRES_RESIZE_SAMPLER',
      'MOBILE_HIRES_RESULT_SELECT',
    ].includes(candidate.title ?? ''));
    const restored = generationParamsFromWorkflow(legacy);

    expect(restored.hiresEnabled).toBe(false);
    expect(restored.hiresMode).toBeUndefined();
    expect(restored.resizeMethod).toBeUndefined();
  });

  it('bypasses every Hires branch and selects base output when Hires is off', () => {
    const next = applyGenerationFormToWorkflow(form(), makeWorkflow());

    expect(find(next, 'MOBILE_HIRES_UPSCALE').mode).toBe(4);
    expect(find(next, 'MOBILE_HIRES_SAMPLER').mode).toBe(4);
    expect(find(next, 'MOBILE_HIRES_RESIZE_DECODE').mode).toBe(4);
    expect(find(next, 'MOBILE_HIRES_RESIZE_IMAGE').mode).toBe(4);
    expect(find(next, 'MOBILE_HIRES_RESIZE_ENCODE').mode).toBe(4);
    expect(find(next, 'MOBILE_HIRES_RESIZE_SAMPLER').mode).toBe(4);
    expect((find(next, 'MOBILE_HIRES_MODE').widgets_values as unknown[])[0]).toBe(false);
    expect((find(next, 'MOBILE_HIRES_RESULT_SELECT').widgets_values as unknown[])[0]).toBe(false);
  });

  it('uses one explicitly resolved seed for base, Hires, and FaceDetailer', () => {
    const next = applyGenerationFormToWorkflow({
      ...form(),
      seedMode: 'random',
      seed: Number.NaN,
    }, makeWorkflow(), 4294967295);

    expect((find(next, 'MOBILE_BASE_SAMPLER').widgets_values as unknown[])[0]).toBe(4294967295);
    expect((find(next, 'MOBILE_HIRES_SAMPLER').widgets_values as unknown[])[0]).toBe(4294967295);
    expect((find(next, 'MOBILE_FACE_DETAILER').widgets_values as unknown[])[3]).toBe(4294967295);
  });

  it('leaves random mode unchanged when a workflow has no seed value', () => {
    const source = makeWorkflow();
    const baseSampler = find(source, 'MOBILE_BASE_SAMPLER');
    baseSampler.widgets_values = undefined;

    const restored = generationParamsFromWorkflow(source);

    expect(restored.seed).toBeUndefined();
    expect(restored.seedMode).toBeUndefined();
  });
});
