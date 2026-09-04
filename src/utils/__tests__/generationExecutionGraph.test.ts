import { describe, expect, it } from 'vitest';
import type { NodeTypes, Workflow, WorkflowNode } from '@/api/types';
import mobileSdxlWorkflowAsset from '@/workflows/mobile_sdxl_default.json';
import mobileAnimaWorkflowAsset from '@/workflows/mobile_anima_default.json';
import { DEFAULT_GENERATION_FORM_STATE, type GenerationFormState } from '@/hooks/useGenerationForm';
import {
  applyGenerationFormToAnimaWorkflow,
  applyGenerationFormToWorkflow,
} from '../applyGenerationFormToWorkflow';
import { buildPromptFromWorkflow } from '../buildPromptFromWorkflow';
import { generationParamsFromWorkflow } from '../generationParamsFromWorkflow';

const canonicalWorkflow = mobileSdxlWorkflowAsset as unknown as Workflow;
const animaWorkflow = mobileAnimaWorkflowAsset as unknown as Workflow;

function form(overrides: Partial<GenerationFormState> = {}): GenerationFormState {
  return {
    ...DEFAULT_GENERATION_FORM_STATE,
    loras: DEFAULT_GENERATION_FORM_STATE.loras.map((slot) => ({ ...slot })) as GenerationFormState['loras'],
    ...overrides,
  };
}

/** Minimal object_info-shaped definitions are enough to exercise prompt wiring. */
function nodeTypesFor(workflow: Workflow): NodeTypes {
  const types = new Set(
    workflow.nodes
      .map((node) => node.type)
      .filter((type) => type !== 'ComfySwitchNode'),
  );
  return Object.fromEntries([...types].map((type) => [type, {
    input: { required: {}, optional: {} },
    output: [],
    output_name: [],
    name: type,
    display_name: type,
    description: '',
    python_module: '',
    category: '',
  }])) as unknown as NodeTypes;
}

const nodeTypes = {
  ...nodeTypesFor(canonicalWorkflow),
  CLIPTextEncode: {
    input: {
      required: {
        clip: ['CLIP', {}],
        text: ['STRING', { default: '' }],
      },
    },
    output: ['CONDITIONING'],
    name: 'CLIPTextEncode',
    display_name: 'CLIPTextEncode',
    description: '',
    python_module: '',
    category: '',
  },
} as unknown as NodeTypes;

const animaNodeTypes = {
  ...nodeTypesFor(animaWorkflow),
  UNETLoader: {
    input: {
      required: {
        unet_name: ['COMBO', { default: 'anima-base-v1.0.safetensors' }],
        weight_dtype: ['COMBO', { default: 'default' }],
      },
    },
    output: ['MODEL'],
    name: 'UNETLoader',
    display_name: 'UNETLoader',
    description: '',
    python_module: '',
    category: '',
  },
  CLIPLoader: {
    input: {
      required: {
        clip_name: ['COMBO', { default: 'qwen_3_06b_base.safetensors' }],
        type: ['COMBO', { default: 'stable_diffusion' }],
        device: ['COMBO', { default: 'default' }],
      },
    },
    output: ['CLIP'],
    name: 'CLIPLoader',
    display_name: 'CLIPLoader',
    description: '',
    python_module: '',
    category: '',
  },
  VAELoader: {
    input: {
      required: {
        vae_name: ['COMBO', { default: 'qwen_image_vae.safetensors' }],
      },
    },
    output: ['VAE'],
    name: 'VAELoader',
    display_name: 'VAELoader',
    description: '',
    python_module: '',
    category: '',
  },
  KSampler: {
    input: {
      required: {
        model: ['MODEL', {}],
        positive: ['CONDITIONING', {}],
        negative: ['CONDITIONING', {}],
        latent_image: ['LATENT', {}],
        seed: ['INT', { default: 0 }],
        steps: ['INT', { default: 30 }],
        cfg: ['FLOAT', { default: 4 }],
        sampler_name: ['COMBO', { default: 'er_sde' }],
        scheduler: ['COMBO', { default: 'simple' }],
        denoise: ['FLOAT', { default: 1 }],
      },
    },
    output: ['LATENT'],
    name: 'KSampler',
    display_name: 'KSampler',
    description: '',
    python_module: '',
    category: '',
  },
  CLIPTextEncode: {
    input: {
      required: {
        clip: ['CLIP', {}],
        text: ['STRING', { default: '' }],
      },
    },
    output: ['CONDITIONING'],
    name: 'CLIPTextEncode',
    display_name: 'CLIPTextEncode',
    description: '',
    python_module: '',
    category: '',
  },
} as unknown as NodeTypes;

function nodeId(workflow: Workflow, title: string): number {
  const node = workflow.nodes.find((candidate) => candidate.title === title);
  if (!node) throw new Error(`Missing ${title}`);
  return node.id;
}

function promptNode(
  prompt: Record<string, unknown>,
  id: number,
): { class_type: string; inputs: Record<string, unknown> } {
  const node = prompt[String(id)];
  if (!node || typeof node !== 'object') throw new Error(`Missing prompt node ${id}`);
  return node as { class_type: string; inputs: Record<string, unknown> };
}

function assertWorkflowLinkIntegrity(workflow: Workflow): void {
  const linksById = new Map(workflow.links.map((link) => [link[0], link]));
  const nodesById = new Map(workflow.nodes.map((node) => [node.id, node]));

  for (const link of workflow.links) {
    const source = nodesById.get(link[1]);
    const target = nodesById.get(link[3]);
    expect(source?.outputs[link[2]]?.links ?? []).toContain(link[0]);
    expect(target?.inputs[link[4]]?.link).toBe(link[0]);
  }
  for (const node of workflow.nodes) {
    for (const input of node.inputs) {
      if (input.link != null) expect(linksById.has(input.link)).toBe(true);
    }
  }
}

function assertNoDanglingPromptReferences(prompt: Record<string, unknown>): void {
  for (const value of Object.values(prompt)) {
    if (!value || typeof value !== 'object') continue;
    const inputs = (value as { inputs?: Record<string, unknown> }).inputs ?? {};
    for (const input of Object.values(inputs)) {
      if (!Array.isArray(input) || input.length !== 2) continue;
      if (typeof input[0] !== 'string' || typeof input[1] !== 'number') continue;
      expect(prompt[input[0]]).toBeDefined();
    }
  }
}

describe('simple generation execution graph', () => {
  it('uses only backend node types and no ComfySwitchNode in the canonical workflow', () => {
    for (const type of [
      'ImageScaleBy',
      'LatentUpscaleBy',
      'VAEDecode',
      'VAEEncode',
      'KSampler',
    ]) {
      expect(nodeTypes[type]).toBeDefined();
    }
    expect(nodeTypes.ComfySwitchNode).toBeUndefined();
    expect(canonicalWorkflow.nodes.some((node) => node.type === 'ComfySwitchNode')).toBe(false);
  });

  it('keeps FaceDetailer conditioning separate while sharing the final LoRA CLIP', () => {
    const executionWorkflow = applyGenerationFormToWorkflow(form({
      faceDetailerEnabled: true,
      hiresEnabled: true,
      hiresMode: 'latent',
      facePositivePrompt: 'face-specific positive',
      faceNegativePrompt: 'face-specific negative',
      loras: form().loras.map((slot) => ({ ...slot, enabled: true })) as GenerationFormState['loras'],
    }), canonicalWorkflow);
    const prompt = buildPromptFromWorkflow(executionWorkflow, nodeTypes);
    const finalLoraId = nodeId(executionWorkflow, 'MOBILE_LORA_3');
    const mainPositiveId = nodeId(executionWorkflow, 'MOBILE_POSITIVE');
    const mainNegativeId = nodeId(executionWorkflow, 'MOBILE_NEGATIVE');
    const facePositiveId = nodeId(executionWorkflow, 'MOBILE_FACE_POSITIVE');
    const faceNegativeId = nodeId(executionWorkflow, 'MOBILE_FACE_NEGATIVE');
    const faceDetailerId = nodeId(executionWorkflow, 'MOBILE_FACE_DETAILER');

    expect(promptNode(prompt, mainPositiveId).inputs.clip).toEqual([String(finalLoraId), 1]);
    expect(promptNode(prompt, mainNegativeId).inputs.clip).toEqual([String(finalLoraId), 1]);
    expect(promptNode(prompt, facePositiveId).inputs.clip).toEqual([String(finalLoraId), 1]);
    expect(promptNode(prompt, faceNegativeId).inputs.clip).toEqual([String(finalLoraId), 1]);
    expect(promptNode(prompt, faceDetailerId).inputs.positive).toEqual([String(facePositiveId), 0]);
    expect(promptNode(prompt, faceDetailerId).inputs.negative).toEqual([String(faceNegativeId), 0]);
    expect(promptNode(prompt, faceDetailerId).inputs.positive).not.toEqual([String(mainPositiveId), 0]);
    expect(promptNode(prompt, faceDetailerId).inputs.negative).not.toEqual([String(mainNegativeId), 0]);
    expect(promptNode(prompt, nodeId(executionWorkflow, 'MOBILE_BASE_SAMPLER')).inputs.positive)
      .toEqual([String(mainPositiveId), 0]);
    expect(promptNode(prompt, nodeId(executionWorkflow, 'MOBILE_HIRES_SAMPLER')).inputs.positive)
      .toEqual([String(mainPositiveId), 0]);
    expect(promptNode(prompt, facePositiveId).inputs.text).toBe('face-specific positive');
    expect(promptNode(prompt, faceNegativeId).inputs.text).toBe('face-specific negative');
    const restored = generationParamsFromWorkflow(executionWorkflow);
    expect(restored.facePositivePrompt).toBe('face-specific positive');
    expect(restored.faceNegativePrompt).toBe('face-specific negative');
    assertWorkflowLinkIntegrity(executionWorkflow);
  });

  it('uses the main prompts for blank FaceDetailer prompts and bypasses dedicated nodes with FaceDetailer', () => {
    const executionWorkflow = applyGenerationFormToWorkflow(form({
      positivePrompt: 'main positive',
      negativePrompt: 'main negative',
      facePositivePrompt: '  ',
      faceNegativePrompt: '',
      faceDetailerEnabled: true,
    }), canonicalWorkflow);
    const prompt = buildPromptFromWorkflow(executionWorkflow, nodeTypes);

    expect(promptNode(prompt, nodeId(executionWorkflow, 'MOBILE_FACE_POSITIVE')).inputs.text)
      .toBe('main positive');
    expect(promptNode(prompt, nodeId(executionWorkflow, 'MOBILE_FACE_NEGATIVE')).inputs.text)
      .toBe('main negative');

    const disabled = applyGenerationFormToWorkflow(form({ faceDetailerEnabled: false }), canonicalWorkflow);
    expect(nodeId(disabled, 'MOBILE_FACE_POSITIVE')).toBeDefined();
    expect(disabled.nodes.find((node) => node.title === 'MOBILE_FACE_POSITIVE')?.mode).toBe(4);
    expect(disabled.nodes.find((node) => node.title === 'MOBILE_FACE_NEGATIVE')?.mode).toBe(4);
    expect(disabled.nodes.find((node) => node.title === 'MOBILE_FACE_DETAILER')?.mode).toBe(4);
    const disabledPrompt = buildPromptFromWorkflow(disabled, nodeTypes);
    expect(disabledPrompt[String(nodeId(disabled, 'MOBILE_FACE_POSITIVE'))]).toBeUndefined();
    expect(disabledPrompt[String(nodeId(disabled, 'MOBILE_FACE_NEGATIVE'))]).toBeUndefined();
  });

  it.each([
    {
      name: 'Hires OFF',
      values: { hiresEnabled: false },
      expectedSource: 'MOBILE_BASE_SAMPLER',
      activeBranch: [],
      inactiveBranch: [
        'MOBILE_HIRES_UPSCALE',
        'MOBILE_HIRES_SAMPLER',
        'MOBILE_HIRES_RESIZE_DECODE',
        'MOBILE_HIRES_RESIZE_IMAGE',
        'MOBILE_HIRES_RESIZE_ENCODE',
        'MOBILE_HIRES_RESIZE_SAMPLER',
      ],
    },
    {
      name: 'Hires ON + latent',
      values: { hiresEnabled: true, hiresMode: 'latent' as const },
      expectedSource: 'MOBILE_HIRES_SAMPLER',
      activeBranch: ['MOBILE_HIRES_UPSCALE', 'MOBILE_HIRES_SAMPLER'],
      inactiveBranch: [
        'MOBILE_HIRES_RESIZE_DECODE',
        'MOBILE_HIRES_RESIZE_IMAGE',
        'MOBILE_HIRES_RESIZE_ENCODE',
        'MOBILE_HIRES_RESIZE_SAMPLER',
      ],
    },
    {
      name: 'Hires ON + resize',
      values: { hiresEnabled: true, hiresMode: 'resize' as const },
      expectedSource: 'MOBILE_HIRES_RESIZE_SAMPLER',
      activeBranch: [
        'MOBILE_HIRES_RESIZE_DECODE',
        'MOBILE_HIRES_RESIZE_IMAGE',
        'MOBILE_HIRES_RESIZE_ENCODE',
        'MOBILE_HIRES_RESIZE_SAMPLER',
      ],
      inactiveBranch: ['MOBILE_HIRES_UPSCALE', 'MOBILE_HIRES_SAMPLER'],
    },
  ])('$name builds a connected prompt graph', ({ values, expectedSource, activeBranch, inactiveBranch }) => {
    const executionWorkflow = applyGenerationFormToWorkflow(form(values), canonicalWorkflow);
    const prompt = buildPromptFromWorkflow(executionWorkflow, nodeTypes);
    const vaeDecode = nodeId(executionWorkflow, 'MOBILE_VAE_DECODE');
    const source = nodeId(executionWorkflow, expectedSource);

    expect(promptNode(prompt, vaeDecode).inputs.samples).toEqual([String(source), 0]);
    const restored = generationParamsFromWorkflow(executionWorkflow);
    expect(restored.hiresEnabled).toBe(values.hiresEnabled ?? false);
    expect(restored.hiresMode).toBe(values.hiresMode ?? 'latent');
    assertWorkflowLinkIntegrity(executionWorkflow);
    assertNoDanglingPromptReferences(prompt);

    for (const title of activeBranch) {
      expect(prompt[String(nodeId(executionWorkflow, title))]).toBeDefined();
    }
    for (const title of inactiveBranch) {
      expect(prompt[String(nodeId(executionWorkflow, title))]).toBeUndefined();
    }
  });

  it('maps the form to Anima native loaders instead of an SDXL checkpoint graph', () => {
    const executionWorkflow = applyGenerationFormToAnimaWorkflow(form({
      checkpoint: 'anima-base-v1.0.safetensors',
      positivePrompt: 'anima positive',
      negativePrompt: 'anima negative',
      width: 896,
      height: 1152,
      steps: 42,
      cfg: 4.5,
      sampler: 'er_sde',
      scheduler: 'simple',
    }), animaWorkflow);
    const prompt = buildPromptFromWorkflow(executionWorkflow, animaNodeTypes);

    const modelId = nodeId(executionWorkflow, 'MOBILE_CHECKPOINT');
    const textEncoderId = nodeId(executionWorkflow, 'MOBILE_TEXT_ENCODER');
    const vaeId = nodeId(executionWorkflow, 'MOBILE_VAE_LOADER');
    const baseSamplerId = nodeId(executionWorkflow, 'MOBILE_BASE_SAMPLER');
    expect(promptNode(prompt, modelId)).toMatchObject({
      class_type: 'UNETLoader',
      inputs: { unet_name: 'anima-base-v1.0.safetensors', weight_dtype: 'default' },
    });
    expect(promptNode(prompt, textEncoderId)).toMatchObject({
      class_type: 'CLIPLoader',
      inputs: {
        clip_name: 'qwen_3_06b_base.safetensors',
        type: 'stable_diffusion',
        device: 'default',
      },
    });
    expect(promptNode(prompt, vaeId)).toMatchObject({
      class_type: 'VAELoader',
      inputs: { vae_name: 'qwen_image_vae.safetensors' },
    });
    expect(promptNode(prompt, baseSamplerId).inputs).toMatchObject({
      steps: 42,
      cfg: 4.5,
      sampler_name: 'er_sde',
      scheduler: 'simple',
    });
    expect(promptNode(prompt, nodeId(executionWorkflow, 'MOBILE_POSITIVE')).inputs.text)
      .toBe('anima positive');
    expect(promptNode(prompt, nodeId(executionWorkflow, 'MOBILE_NEGATIVE')).inputs.text)
      .toBe('anima negative');
    expect(promptNode(prompt, nodeId(executionWorkflow, 'MOBILE_VAE_DECODE')).inputs.vae)
      .toEqual([String(vaeId), 0]);
    expect(generationParamsFromWorkflow(executionWorkflow)).toMatchObject({
      checkpoint: 'anima-base-v1.0.safetensors',
      positivePrompt: 'anima positive',
      negativePrompt: 'anima negative',
      width: 896,
      height: 1152,
      steps: 42,
      cfg: 4.5,
      sampler: 'er_sde',
      scheduler: 'simple',
    });
    expect(executionWorkflow.nodes.some((node) => node.type === 'CheckpointLoaderSimple')).toBe(false);
    expect(executionWorkflow.nodes.some((node) => node.type === 'UNETLoader')).toBe(true);
    assertWorkflowLinkIntegrity(executionWorkflow);
    assertNoDanglingPromptReferences(prompt);
  });

  it('maps Anima LoRA, Hires, FaceDetailer, and upscaler values to their nodes', () => {
    const executionWorkflow = applyGenerationFormToAnimaWorkflow(form({
      checkpoint: 'anima-base-v1.0.safetensors',
      loras: [
        { enabled: true, name: 'style-one.safetensors', strengthModel: 0.7, strengthClip: 0.8 },
        { enabled: true, name: 'style-two.safetensors', strengthModel: 0.5, strengthClip: 0.6 },
        { enabled: true, name: 'style-three.safetensors', strengthModel: 0.3, strengthClip: 0.4 },
      ],
      hiresEnabled: true,
      hiresMode: 'resize',
      hiresScale: 1.75,
      hiresSteps: 18,
      hiresCfg: 4.25,
      hiresDenoise: 0.4,
      resizeMethod: 'bicubic',
      faceDetailerEnabled: true,
      facePositivePrompt: 'face positive',
      faceNegativePrompt: 'face negative',
      faceGuideSize: 640,
      faceMaxSize: 896,
      faceSteps: 12,
      faceCfg: 4.5,
      faceDenoise: 0.25,
      faceBBoxThreshold: 0.6,
      upscaleEnabled: true,
      upscaleModel: '4x-AnimaSharp.pth',
    }), animaWorkflow);

    const node = (title: string): WorkflowNode => {
      const result = executionWorkflow.nodes.find((candidate) => candidate.title === title);
      if (!result) throw new Error(`Missing ${title}`);
      return result;
    };
    expect(node('MOBILE_LORA_1').widgets_values).toEqual(['style-one.safetensors', 0.7, 0.8]);
    expect(node('MOBILE_LORA_2').widgets_values).toEqual(['style-two.safetensors', 0.5, 0.6]);
    expect(node('MOBILE_LORA_3').widgets_values).toEqual(['style-three.safetensors', 0.3, 0.4]);
    expect(node('MOBILE_HIRES_RESIZE_IMAGE').widgets_values).toEqual(['bicubic', 1.75]);
    expect((node('MOBILE_HIRES_RESIZE_SAMPLER').widgets_values as unknown[]).slice(2, 7))
      .toEqual([18, 4.25, 'euler_ancestral', 'normal', 0.4]);
    expect((node('MOBILE_FACE_DETAILER').widgets_values as unknown[]).slice(0, 10))
      .toEqual([640, true, 896, 123456789, 'fixed', 12, 4.5, 'euler_ancestral', 'normal', 0.25]);
    expect((node('MOBILE_FACE_DETAILER').widgets_values as unknown[])[13]).toBe(0.6);
    expect(node('MOBILE_FACE_POSITIVE').widgets_values).toEqual(['face positive']);
    expect(node('MOBILE_FACE_NEGATIVE').widgets_values).toEqual(['face negative']);
    expect(node('MOBILE_UPSCALE_MODEL').widgets_values).toEqual(['4x-AnimaSharp.pth']);
    expect(node('MOBILE_SAVE_IMAGE').widgets_values)
      .toEqual(['%date:yyyyMMdd%_upscale/mobile_anima']);
  });

  it.each([
    { hiresEnabled: false, faceDetailerEnabled: false, upscaleEnabled: false },
    { hiresEnabled: true, hiresMode: 'latent' as const, faceDetailerEnabled: true, upscaleEnabled: true },
    { hiresEnabled: true, hiresMode: 'resize' as const, faceDetailerEnabled: false, upscaleEnabled: true },
    { hiresEnabled: false, faceDetailerEnabled: true, upscaleEnabled: false },
  ])('keeps Anima feature toggles free of dangling links (%o)', (values) => {
    const executionWorkflow = applyGenerationFormToAnimaWorkflow(
      form(values),
      animaWorkflow,
    );
    const prompt = buildPromptFromWorkflow(executionWorkflow, animaNodeTypes);

    assertWorkflowLinkIntegrity(executionWorkflow);
    assertNoDanglingPromptReferences(prompt);
    expect(promptNode(prompt, nodeId(executionWorkflow, 'MOBILE_CHECKPOINT')).class_type)
      .toBe('UNETLoader');
    if (values.hiresEnabled && values.hiresMode === 'latent') {
      expect(prompt[String(nodeId(executionWorkflow, 'MOBILE_HIRES_SAMPLER'))]).toBeDefined();
      expect(prompt[String(nodeId(executionWorkflow, 'MOBILE_HIRES_RESIZE_SAMPLER'))]).toBeUndefined();
    }
    if (values.hiresEnabled && values.hiresMode === 'resize') {
      expect(prompt[String(nodeId(executionWorkflow, 'MOBILE_HIRES_RESIZE_SAMPLER'))]).toBeDefined();
      expect(prompt[String(nodeId(executionWorkflow, 'MOBILE_HIRES_SAMPLER'))]).toBeUndefined();
    }
    if (!values.hiresEnabled) {
      expect(prompt[String(nodeId(executionWorkflow, 'MOBILE_HIRES_SAMPLER'))]).toBeUndefined();
      expect(prompt[String(nodeId(executionWorkflow, 'MOBILE_HIRES_RESIZE_SAMPLER'))]).toBeUndefined();
    }
  });
});
