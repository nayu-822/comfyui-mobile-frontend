import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Workflow } from '@/api/types';
import { useNavigationStore } from '@/hooks/useNavigation';
import { useAnimaGenerationForm, useGenerationForm } from '@/hooks/useGenerationForm';
import { useSimpleGenerationStore } from '@/hooks/useSimpleGeneration';

const metadataMocks = vi.hoisted(() => ({
  extractGenerationMetadataFromImageFile: vi.fn(),
}));

vi.mock('@/utils/imageWorkflowMetadata', () => metadataMocks);
vi.mock('@/hooks/useCheckpoints', () => ({
  useCheckpoints: () => ({
    checkpoints: ['models/available.safetensors'],
    status: 'loaded',
    error: null,
    reload: vi.fn(),
  }),
}));
vi.mock('@/hooks/useLoras', () => ({
  useLoras: () => ({
    loras: ['models/style.safetensors'],
    status: 'loaded',
    error: null,
    reload: vi.fn(),
  }),
}));
vi.mock('@/hooks/useWorkflow', () => ({
  useWorkflowStore: (selector: (state: { nodeTypes: null }) => unknown) =>
    selector({ nodeTypes: null }),
}));
vi.mock('../BasicSettings', () => ({ BasicSettings: () => <div data-testid="basic-settings" /> }));
vi.mock('../FeatureToggles', () => ({ FeatureToggles: () => <div data-testid="feature-toggles" /> }));
vi.mock('../AdvancedSettings', () => ({ AdvancedSettings: () => <div data-testid="advanced-settings" /> }));
vi.mock('../BatchSettings', () => ({ BatchSettings: () => <div data-testid="batch-settings" /> }));

import { GenerationPanel } from '../GenerationPanel';

const prompt = {
  checkpoint: {
    class_type: 'CheckpointLoaderSimple',
    inputs: { ckpt_name: 'restored/missing.safetensors' },
    _meta: { title: 'MOBILE_CHECKPOINT' },
  },
  positive: {
    class_type: 'CLIPTextEncode',
    inputs: { text: 'restored positive' },
    _meta: { title: 'MOBILE_POSITIVE' },
  },
  negative: {
    class_type: 'CLIPTextEncode',
    inputs: { text: 'restored negative' },
    _meta: { title: 'MOBILE_NEGATIVE' },
  },
  facePositive: {
    class_type: 'CLIPTextEncode',
    inputs: { text: 'restored face positive' },
    _meta: { title: 'MOBILE_FACE_POSITIVE' },
  },
  faceNegative: {
    class_type: 'CLIPTextEncode',
    inputs: { text: 'restored face negative' },
    _meta: { title: 'MOBILE_FACE_NEGATIVE' },
  },
  size: {
    class_type: 'EmptyLatentImage',
    inputs: { width: 640, height: 768, batch_size: 2 },
    _meta: { title: 'MOBILE_SIZE' },
  },
  lora: {
    class_type: 'LoraLoader',
    inputs: { lora_name: 'restored/missing-style.safetensors', strength_model: 0.75, strength_clip: 0.8 },
    _meta: { title: 'MOBILE_LORA_1' },
  },
};

describe('GenerationPanel image restore', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    useGenerationForm.getState().reset();
    useAnimaGenerationForm.getState().reset();
    useNavigationStore.setState({ currentPanel: 'generation', currentGenerationMode: 'sdxl' });
    useSimpleGenerationStore.setState({ error: null, baseWorkflow: null });
    metadataMocks.extractGenerationMetadataFromImageFile.mockReset();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  async function restore(metadata: unknown, mode: 'sdxl' | 'anima' = 'sdxl'): Promise<void> {
    metadataMocks.extractGenerationMetadataFromImageFile.mockResolvedValue(metadata);
    useNavigationStore.setState({ currentGenerationMode: mode, currentPanel: 'generation' });
    await act(async () => root.render(<GenerationPanel visible mode={mode} />));
    const input = container.querySelector('input[type="file"]') as HTMLInputElement | null;
    if (!input) throw new Error('Restore file input was not rendered.');
    Object.defineProperty(input, 'files', {
      configurable: true,
      value: [new File(['image'], 'restored.png', { type: 'image/png' })],
    });
    await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));
  }

  it('uses prompt metadata when workflow metadata is absent and only patches form values', async () => {
    await restore({ workflow: null, prompt, found: true, malformed: false });

    expect(useGenerationForm.getState()).toMatchObject({
      checkpoint: 'restored/missing.safetensors',
      positivePrompt: 'restored positive',
      negativePrompt: 'restored negative',
      facePositivePrompt: 'restored face positive',
      faceNegativePrompt: 'restored face negative',
      width: 640,
      height: 768,
      batchSize: 2,
    });
    expect(useGenerationForm.getState().loras[0].name).toBe('restored/missing-style.safetensors');
    expect(useSimpleGenerationStore.getState().baseWorkflow?.nodes.length).toBeGreaterThan(0);
    expect(useSimpleGenerationStore.getState().error).toBeNull();
  });

  it('gives a valid workflow priority over a conflicting prompt fallback', async () => {
    const workflow = {
      last_node_id: 1,
      last_link_id: 0,
      nodes: [{
        id: 1,
        type: 'CheckpointLoaderSimple',
        title: 'MOBILE_CHECKPOINT',
        pos: [0, 0],
        size: [100, 100],
        flags: {},
        order: 0,
        mode: 0,
        inputs: [],
        outputs: [],
        properties: {},
        widgets_values: ['workflow-priority.safetensors'],
      }],
      links: [],
      groups: [],
      config: {},
      version: 0.4,
    } as unknown as Workflow;
    await restore({
      workflow,
      prompt: {
        checkpoint: {
          class_type: 'CheckpointLoaderSimple',
          inputs: { ckpt_name: 'prompt-fallback.safetensors' },
        },
      },
      found: true,
      malformed: false,
    });

    expect(useGenerationForm.getState().checkpoint).toBe('workflow-priority.safetensors');
  });

  it('restores image parameters into the Anima form without changing SDXL state', async () => {
    await restore({ workflow: null, prompt, found: true, malformed: false }, 'anima');

    expect(useAnimaGenerationForm.getState()).toMatchObject({
      checkpoint: 'restored/missing.safetensors',
      positivePrompt: 'restored positive',
      negativePrompt: 'restored negative',
      width: 640,
      height: 768,
      batchSize: 2,
    });
    expect(useGenerationForm.getState().positivePrompt)
      .not.toBe('restored positive');
    expect(useSimpleGenerationStore.getState().contexts.anima.baseWorkflow?.extra)
      .toMatchObject({ mobile_generation_profile: { workflowKind: 'anima' } });
  });

  it('reports malformed metadata with a dedicated error', async () => {
    await restore({ workflow: null, prompt: null, found: true, malformed: true });
    expect(useSimpleGenerationStore.getState().error).toBe('Unsupported or malformed ComfyUI metadata.');
  });

  it('reports an image with no generation metadata separately', async () => {
    await restore({ workflow: null, prompt: null, found: false, malformed: false });
    expect(useSimpleGenerationStore.getState().error)
      .toBe('No embedded ComfyUI generation metadata was found in that image.');
  });
});
