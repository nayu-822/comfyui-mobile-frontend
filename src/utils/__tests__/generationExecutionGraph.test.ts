import { describe, expect, it } from 'vitest';
import type { NodeTypes, Workflow } from '@/api/types';
import mobileSdxlWorkflowAsset from '@/workflows/mobile_sdxl_default.json';
import { DEFAULT_GENERATION_FORM_STATE, type GenerationFormState } from '@/hooks/useGenerationForm';
import { applyGenerationFormToWorkflow } from '../applyGenerationFormToWorkflow';
import { buildPromptFromWorkflow } from '../buildPromptFromWorkflow';
import { generationParamsFromWorkflow } from '../generationParamsFromWorkflow';

const canonicalWorkflow = mobileSdxlWorkflowAsset as unknown as Workflow;

function form(overrides: Partial<GenerationFormState> = {}): GenerationFormState {
  return {
    ...DEFAULT_GENERATION_FORM_STATE,
    loras: DEFAULT_GENERATION_FORM_STATE.loras.map((slot) => ({ ...slot })) as GenerationFormState['loras'],
    ...overrides,
  };
}

/** Minimal object_info-shaped definitions are enough to exercise prompt wiring. */
function canonicalNodeTypes(): NodeTypes {
  const types = new Set(
    canonicalWorkflow.nodes
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

const nodeTypes = canonicalNodeTypes();

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
});
