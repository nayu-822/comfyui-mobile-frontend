import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NodeTypes, Workflow } from '@/api/types';
import mobileSdxlWorkflowAsset from '@/workflows/mobile_sdxl_default.json';
import mobileAnimaWorkflowAsset from '@/workflows/mobile_anima_default.json';
import { useNavigationStore } from '../useNavigation';
import {
  useAnimaGenerationForm,
  useGenerationForm,
} from '../useGenerationForm';

const apiMocks = vi.hoisted(() => ({
  clientId: 'test-client',
  queuePrompt: vi.fn(),
  upsertQueuePromptMetadata: vi.fn(),
  promptHasHistory: vi.fn(),
  deleteQueueItem: vi.fn(),
  interruptExecution: vi.fn(),
  getImageUrl: vi.fn((filename: string) => `/view/${filename}`),
  getImagePreviewUrl: vi.fn((filename: string) => `/preview/${filename}`),
}));

const seedMocks = vi.hoisted(() => ({
  MAX_GENERATION_SEED: 0xffffffff,
  resolveGenerationSeed: vi.fn(),
}));

const queueMocks = vi.hoisted(() => ({
  registerLocalPrompt: vi.fn(),
  recordQueuedPrompt: vi.fn(),
  fetchQueue: vi.fn(),
  pending: [] as Array<{ prompt_id: string }>,
  running: [] as Array<{ prompt_id: string }>,
  isLoading: false,
}));

const historyMocks = vi.hoisted(() => ({
  history: [] as Array<{
    prompt_id: string;
    timestamp: number;
    outputs: { images: Array<{ filename: string; subfolder: string; type: string }> };
    prompt: Record<string, unknown>;
  }>,
}));

const imageViewerMocks = vi.hoisted(() => ({
  setViewerState: vi.fn(),
}));

const workflowMocks = vi.hoisted(() => ({
  setFollowQueue: vi.fn(),
}));

vi.mock('@/api/client', () => apiMocks);
vi.mock('@/utils/generationSeed', () => seedMocks);
vi.mock('@/hooks/useQueue', () => ({
  useQueueStore: Object.assign(
    (selector: (state: typeof queueMocks) => unknown) => selector(queueMocks),
    { getState: () => queueMocks },
  ),
}));
vi.mock('@/hooks/useHistory', () => ({
  useHistoryStore: Object.assign(
    (selector: (state: typeof historyMocks) => unknown) => selector(historyMocks),
    { getState: () => historyMocks },
  ),
}));
vi.mock('@/hooks/useImageViewer', () => ({
  useImageViewerStore: { getState: () => imageViewerMocks },
}));
vi.mock('@/hooks/useWorkflow', () => ({
  useWorkflowStore: { getState: () => workflowMocks },
}));

import { useSimpleGeneration, useSimpleGenerationStore } from '../useSimpleGeneration';

function SimpleGenerationProbe() {
  const state = useSimpleGeneration();
  return createElement('output', { 'data-can-generate': String(state.canGenerate) });
}

const emptyWorkflow: Workflow = {
  last_node_id: 0,
  last_link_id: 0,
  nodes: [],
  links: [],
  groups: [],
  config: {},
  version: 0.4,
};

const canonicalWorkflow = mobileSdxlWorkflowAsset as unknown as Workflow;
const animaWorkflow = mobileAnimaWorkflowAsset as unknown as Workflow;
const canonicalNodeTypes = Object.fromEntries(
  [...new Set(canonicalWorkflow.nodes.map((node) => node.type))].map((type) => [type, {
    input: { required: {}, optional: {} },
    output: [],
    output_name: [],
    name: type,
    display_name: type,
    description: '',
    python_module: '',
    category: '',
  }]),
) as unknown as NodeTypes;
const animaNodeTypes = Object.fromEntries(
  [...new Set(animaWorkflow.nodes.map((node) => node.type))].map((type) => [type, {
    input: { required: {}, optional: {} },
    output: [],
    output_name: [],
    name: type,
    display_name: type,
    description: '',
    python_module: '',
    category: '',
  }]),
) as unknown as NodeTypes;

function seedFromRequest(request: unknown): unknown {
  const workflow = (request as {
    extra_data?: { extra_pnginfo?: { workflow?: Workflow } };
  }).extra_data?.extra_pnginfo?.workflow;
  const sampler = workflow?.nodes.find((node) => node.title === 'MOBILE_BASE_SAMPLER');
  return Array.isArray(sampler?.widgets_values) ? sampler.widgets_values[0] : undefined;
}

describe('useSimpleGeneration shared submit state', () => {
  beforeEach(() => {
    useGenerationForm.getState().reset();
    useAnimaGenerationForm.getState().reset();
    useNavigationStore.setState({ currentPanel: 'generation', currentGenerationMode: 'sdxl' });
    useSimpleGenerationStore.setState({
      baseWorkflow: null,
      nodeTypes: null,
      checkpoints: [],
      checkpointsStatus: 'loading',
      contexts: {
        sdxl: {
          baseWorkflow: null,
          nodeTypes: null,
          checkpoints: [],
          checkpointsStatus: 'loading',
        },
        anima: {
          baseWorkflow: null,
          nodeTypes: null,
          checkpoints: [],
          checkpointsStatus: 'loading',
        },
      },
      isGenerating: false,
      isCancelling: false,
      cancelRequested: false,
      cancellationBlocked: false,
      activePromptIds: [],
      error: null,
    });
    historyMocks.history.length = 0;
    imageViewerMocks.setViewerState.mockReset();
    workflowMocks.setFollowQueue.mockReset();
    apiMocks.queuePrompt.mockReset().mockResolvedValue({ prompt_id: 'prompt-1', number: 7 });
    apiMocks.upsertQueuePromptMetadata.mockReset().mockResolvedValue(undefined);
    apiMocks.promptHasHistory.mockReset().mockResolvedValue(false);
    apiMocks.deleteQueueItem.mockReset().mockImplementation(async (promptId: string) => {
      queueMocks.pending = queueMocks.pending.filter((item) => item.prompt_id !== promptId);
    });
    apiMocks.interruptExecution.mockReset().mockImplementation(async () => {
      const active = new Set(useSimpleGenerationStore.getState().activePromptIds);
      queueMocks.running = queueMocks.running.filter((item) => !active.has(item.prompt_id));
    });
    seedMocks.resolveGenerationSeed.mockReset().mockReturnValue(123);
    queueMocks.registerLocalPrompt.mockReset();
    queueMocks.recordQueuedPrompt.mockReset();
    queueMocks.fetchQueue.mockReset().mockResolvedValue(true);
    queueMocks.pending = [];
    queueMocks.running = [];
    queueMocks.isLoading = false;
  });

  afterEach(() => {
    useGenerationForm.getState().reset();
    useAnimaGenerationForm.getState().reset();
    useNavigationStore.setState({ currentPanel: 'generation', currentGenerationMode: 'sdxl' });
  });

  it('lets BottomBar-owned UI submit the current form through shared state', async () => {
    useGenerationForm.getState().patch({
      checkpoint: 'models/checkpoint.safetensors',
      seedMode: 'fixed',
      seed: 42,
    });
    useSimpleGenerationStore.getState().setContext({
      baseWorkflow: emptyWorkflow,
      nodeTypes: {},
      checkpoints: ['models/checkpoint.safetensors'],
      checkpointsStatus: 'loaded',
    });

    await expect(useSimpleGenerationStore.getState().generate()).resolves.toBe(true);

    expect(apiMocks.queuePrompt).toHaveBeenCalledTimes(1);
    expect(queueMocks.registerLocalPrompt).toHaveBeenCalledWith('prompt-1');
    expect(queueMocks.recordQueuedPrompt).toHaveBeenCalledWith(
      'prompt-1',
      expect.objectContaining({ client_id: 'test-client' }),
      { number: 7 },
    );
    expect(queueMocks.fetchQueue).toHaveBeenCalledTimes(1);
    expect(useSimpleGenerationStore.getState().isGenerating).toBe(false);
    expect(useSimpleGenerationStore.getState().activePromptIds).toEqual(['prompt-1']);
    expect(useSimpleGenerationStore.getState().error).toBeNull();
  });

  it('accumulates active prompt ids across sequential generates', async () => {
    useGenerationForm.getState().patch({
      checkpoint: 'models/checkpoint.safetensors',
      seedMode: 'fixed',
      seed: 42,
    });
    useSimpleGenerationStore.getState().setContext({
      baseWorkflow: emptyWorkflow,
      nodeTypes: {},
      checkpoints: ['models/checkpoint.safetensors'],
      checkpointsStatus: 'loaded',
    });

    apiMocks.queuePrompt.mockReset()
      .mockResolvedValueOnce({ prompt_id: 'prompt-a', number: 1 })
      .mockResolvedValueOnce({ prompt_id: 'prompt-b', number: 2 });
    queueMocks.pending = [{ prompt_id: 'prompt-a' }];

    await expect(useSimpleGenerationStore.getState().generate()).resolves.toBe(true);
    expect(useSimpleGenerationStore.getState().activePromptIds).toEqual(['prompt-a']);

    queueMocks.pending = [
      { prompt_id: 'prompt-a' },
      { prompt_id: 'prompt-b' },
    ];
    await expect(useSimpleGenerationStore.getState().generate()).resolves.toBe(true);

    expect(useSimpleGenerationStore.getState().activePromptIds).toEqual(['prompt-a', 'prompt-b']);
  });

  it('queues the Anima form through the Anima canonical workflow', async () => {
    useNavigationStore.setState({ currentGenerationMode: 'anima', currentPanel: 'generation' });
    useAnimaGenerationForm.getState().patch({
      checkpoint: 'models/anima.safetensors',
      positivePrompt: 'anima prompt',
      seedMode: 'fixed',
      seed: 42,
    });
    useSimpleGenerationStore.getState().setContextForMode('anima', {
      baseWorkflow: animaWorkflow,
      nodeTypes: animaNodeTypes,
      checkpoints: ['models/anima.safetensors'],
      checkpointsStatus: 'loaded',
    });
    apiMocks.queuePrompt.mockReset().mockResolvedValue({ prompt_id: 'anima-prompt', number: 1 });

    await expect(useSimpleGenerationStore.getState().generate()).resolves.toBe(true);

    const request = apiMocks.queuePrompt.mock.calls[0]?.[0] as {
      prompt?: Record<string, unknown>;
      extra_data?: { extra_pnginfo?: { workflow?: Workflow } };
    };
    expect(request.extra_data?.extra_pnginfo?.workflow?.extra)
      .toMatchObject({ mobile_generation_profile: { workflowKind: 'anima' } });
    const animaCheckpointWidgets = request.extra_data?.extra_pnginfo?.workflow?.nodes.find(
      (node) => node.title === 'MOBILE_CHECKPOINT',
    )?.widgets_values;
    expect(Array.isArray(animaCheckpointWidgets) ? animaCheckpointWidgets[0] : undefined)
      .toBe('models/anima.safetensors');
    const animaModelNode = request.extra_data?.extra_pnginfo?.workflow?.nodes.find(
      (node) => node.title === 'MOBILE_CHECKPOINT',
    );
    expect(animaModelNode?.type).toBe('UNETLoader');
    expect(request.extra_data?.extra_pnginfo?.workflow?.nodes.find(
      (node) => node.title === 'MOBILE_TEXT_ENCODER',
    )?.type).toBe('CLIPLoader');
    expect(request.extra_data?.extra_pnginfo?.workflow?.nodes.find(
      (node) => node.title === 'MOBILE_VAE_LOADER',
    )?.type).toBe('VAELoader');
    expect(request.prompt?.['1']).toMatchObject({ class_type: 'UNETLoader' });
    expect(useGenerationForm.getState().positivePrompt).not.toBe('anima prompt');
  });

  it('queues the SDXL form through the SDXL canonical workflow', async () => {
    useGenerationForm.getState().patch({
      checkpoint: 'models/sdxl.safetensors',
      positivePrompt: 'sdxl prompt',
      seedMode: 'fixed',
      seed: 42,
    });
    useSimpleGenerationStore.getState().setContextForMode('sdxl', {
      baseWorkflow: canonicalWorkflow,
      nodeTypes: canonicalNodeTypes,
      checkpoints: ['models/sdxl.safetensors'],
      checkpointsStatus: 'loaded',
    });
    apiMocks.queuePrompt.mockReset().mockResolvedValue({ prompt_id: 'sdxl-prompt', number: 1 });

    await expect(useSimpleGenerationStore.getState().generate()).resolves.toBe(true);

    const request = apiMocks.queuePrompt.mock.calls[0]?.[0] as {
      extra_data?: { extra_pnginfo?: { workflow?: Workflow } };
    };
    expect(request.extra_data?.extra_pnginfo?.workflow?.extra)
      .toMatchObject({ mobile_generation_profile: { workflowKind: 'sdxl' } });
    const sdxlCheckpointWidgets = request.extra_data?.extra_pnginfo?.workflow?.nodes.find(
      (node) => node.title === 'MOBILE_CHECKPOINT',
    )?.widgets_values;
    expect(Array.isArray(sdxlCheckpointWidgets) ? sdxlCheckpointWidgets[0] : undefined)
      .toBe('models/sdxl.safetensors');
  });

  it('keeps active prompt ids while the post-enqueue queue refresh is pending', async () => {
    useGenerationForm.getState().patch({
      checkpoint: 'models/checkpoint.safetensors',
      seedMode: 'fixed',
      seed: 42,
    });
    useSimpleGenerationStore.getState().setContext({
      baseWorkflow: emptyWorkflow,
      nodeTypes: {},
      checkpoints: ['models/checkpoint.safetensors'],
      checkpointsStatus: 'loaded',
    });
    let resolveFetch: ((success: boolean) => void) | undefined;
    queueMocks.fetchQueue.mockImplementation(() => new Promise<boolean>((resolve) => {
      resolveFetch = resolve;
    }));
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root: Root = createRoot(container);

    try {
      await act(async () => root.render(createElement(SimpleGenerationProbe)));
      let generation!: Promise<boolean>;
      await act(async () => {
        generation = useSimpleGenerationStore.getState().generate();
        await vi.waitFor(() => {
          expect(queueMocks.fetchQueue).toHaveBeenCalledTimes(1);
          expect(useSimpleGenerationStore.getState().activePromptIds).toEqual(['prompt-1']);
        });
      });
      expect(useSimpleGenerationStore.getState().isGenerating).toBe(true);

      resolveFetch?.(true);
      await act(async () => {
        await expect(generation).resolves.toBe(true);
      });
      expect(useSimpleGenerationStore.getState().isGenerating).toBe(false);
      expect(useSimpleGenerationStore.getState().activePromptIds).toEqual(['prompt-1']);
    } finally {
      await act(async () => root.unmount());
      container.remove();
    }
  });

  it('queues one prompt per batch count with incrementing fixed seeds', async () => {
    useGenerationForm.getState().patch({
      checkpoint: 'models/checkpoint.safetensors',
      seedMode: 'fixed',
      seed: 100,
      batchSize: 2,
      batchCount: 3,
    });
    useSimpleGenerationStore.getState().setContext({
      baseWorkflow: canonicalWorkflow,
      nodeTypes: canonicalNodeTypes,
      checkpoints: ['models/checkpoint.safetensors'],
      checkpointsStatus: 'loaded',
    });
    apiMocks.queuePrompt
      .mockReset()
      .mockResolvedValueOnce({ prompt_id: 'prompt-1', number: 1 })
      .mockResolvedValueOnce({ prompt_id: 'prompt-2', number: 2 })
      .mockResolvedValueOnce({ prompt_id: 'prompt-3', number: 3 });

    await expect(useSimpleGenerationStore.getState().generate()).resolves.toBe(true);

    expect(apiMocks.queuePrompt).toHaveBeenCalledTimes(3);
    expect(apiMocks.queuePrompt.mock.calls.map(([request]) => seedFromRequest(request)))
      .toEqual([100, 101, 102]);
    expect(useGenerationForm.getState().seed).toBe(102);
    expect(useSimpleGenerationStore.getState().activePromptIds)
      .toEqual(['prompt-1', 'prompt-2', 'prompt-3']);
  });

  it('resolves a new random seed for every batch prompt', async () => {
    useGenerationForm.getState().patch({
      checkpoint: 'models/checkpoint.safetensors',
      seedMode: 'random',
      batchCount: 3,
    });
    useSimpleGenerationStore.getState().setContext({
      baseWorkflow: canonicalWorkflow,
      nodeTypes: canonicalNodeTypes,
      checkpoints: ['models/checkpoint.safetensors'],
      checkpointsStatus: 'loaded',
    });
    apiMocks.queuePrompt
      .mockReset()
      .mockResolvedValueOnce({ prompt_id: 'prompt-a', number: 1 })
      .mockResolvedValueOnce({ prompt_id: 'prompt-b', number: 2 })
      .mockResolvedValueOnce({ prompt_id: 'prompt-c', number: 3 });
    seedMocks.resolveGenerationSeed
      .mockReset()
      .mockReturnValueOnce(400)
      .mockReturnValueOnce(401)
      .mockReturnValueOnce(402);

    await expect(useSimpleGenerationStore.getState().generate()).resolves.toBe(true);

    expect(seedMocks.resolveGenerationSeed).toHaveBeenCalledTimes(3);
    expect(apiMocks.queuePrompt.mock.calls.map(([request]) => seedFromRequest(request)))
      .toEqual([400, 401, 402]);
  });

  it('reports a validation failure and never queues invalid form data', async () => {
    useSimpleGenerationStore.getState().setContext({
      baseWorkflow: emptyWorkflow,
      nodeTypes: {},
      checkpoints: ['models/checkpoint.safetensors'],
      checkpointsStatus: 'loaded',
    });

    await expect(useSimpleGenerationStore.getState().generate()).resolves.toBe(false);

    expect(apiMocks.queuePrompt).not.toHaveBeenCalled();
    expect(useSimpleGenerationStore.getState().error).toBe('Choose a checkpoint before generating.');
  });

  it('disables Generate while cancellation is active and re-enables it after confirmation', async () => {
    useGenerationForm.getState().patch({ checkpoint: 'models/checkpoint.safetensors' });
    useSimpleGenerationStore.getState().setContext({
      baseWorkflow: emptyWorkflow,
      nodeTypes: {},
      checkpoints: ['models/checkpoint.safetensors'],
      checkpointsStatus: 'loaded',
    });
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root: Root = createRoot(container);

    try {
      useSimpleGenerationStore.setState({ isCancelling: true });
      await act(async () => root.render(createElement(SimpleGenerationProbe)));
      expect(container.querySelector('output')?.getAttribute('data-can-generate')).toBe('false');

      await act(async () => {
        useSimpleGenerationStore.setState({ isCancelling: false, cancellationBlocked: false });
        root.render(createElement(SimpleGenerationProbe));
      });
      expect(container.querySelector('output')?.getAttribute('data-can-generate')).toBe('true');
    } finally {
      await act(async () => root.unmount());
      container.remove();
    }
  });

  it('opens the newest history image in the shared viewer without changing panels', () => {
    historyMocks.history.push({
      prompt_id: 'prompt-latest',
      timestamp: 2,
      outputs: {
        images: [{ filename: 'latest.png', subfolder: '', type: 'output' }],
      },
      prompt: {},
    });

    expect(useSimpleGenerationStore.getState().openLatestImage()).toBe(true);
    expect(workflowMocks.setFollowQueue).toHaveBeenCalledWith(false);
    expect(imageViewerMocks.setViewerState).toHaveBeenCalledWith(expect.objectContaining({
      viewerOpen: true,
      viewerIndex: 0,
      viewerImages: expect.arrayContaining([
        expect.objectContaining({ filename: 'latest.png', promptId: 'prompt-latest' }),
      ]),
    }));
  });

  it('does not open the viewer when history has no generated images', () => {
    expect(useSimpleGenerationStore.getState().openLatestImage()).toBe(false);
    expect(imageViewerMocks.setViewerState).not.toHaveBeenCalled();
  });

  it('cancels only active pending prompts and leaves other queue items alone', async () => {
    useSimpleGenerationStore.setState({ activePromptIds: ['simple-pending'] });
    queueMocks.pending = [
      { prompt_id: 'simple-pending' },
      { prompt_id: 'other-pending' },
    ];
    queueMocks.running = [{ prompt_id: 'other-running' }];

    await expect(useSimpleGenerationStore.getState().cancelGeneration()).resolves.toBe(true);

    expect(apiMocks.deleteQueueItem).toHaveBeenCalledTimes(1);
    expect(apiMocks.deleteQueueItem).toHaveBeenCalledWith('simple-pending');
    expect(apiMocks.deleteQueueItem).not.toHaveBeenCalledWith('other-pending');
    expect(apiMocks.interruptExecution).not.toHaveBeenCalled();
    expect(useSimpleGenerationStore.getState().activePromptIds).toEqual([]);
    expect(useSimpleGenerationStore.getState().isCancelling).toBe(false);
  });

  it('cancels every tracked pending prompt while leaving another workflow untouched', async () => {
    useSimpleGenerationStore.setState({ activePromptIds: ['simple-a', 'simple-b'] });
    queueMocks.pending = [
      { prompt_id: 'simple-a' },
      { prompt_id: 'simple-b' },
      { prompt_id: 'other-pending' },
    ];
    queueMocks.running = [{ prompt_id: 'other-running' }];

    await expect(useSimpleGenerationStore.getState().cancelGeneration()).resolves.toBe(true);

    expect(apiMocks.deleteQueueItem).toHaveBeenCalledTimes(2);
    expect(apiMocks.deleteQueueItem).toHaveBeenCalledWith('simple-a');
    expect(apiMocks.deleteQueueItem).toHaveBeenCalledWith('simple-b');
    expect(apiMocks.deleteQueueItem).not.toHaveBeenCalledWith('other-pending');
    expect(apiMocks.interruptExecution).not.toHaveBeenCalled();
    expect(useSimpleGenerationStore.getState().activePromptIds).toEqual([]);
  });

  it('deletes tracked pending prompts and interrupts tracked running prompts only', async () => {
    useSimpleGenerationStore.setState({ activePromptIds: ['simple-running', 'simple-pending'] });
    queueMocks.pending = [
      { prompt_id: 'simple-pending' },
      { prompt_id: 'other-pending' },
    ];
    queueMocks.running = [
      { prompt_id: 'simple-running' },
      { prompt_id: 'other-running' },
    ];

    await expect(useSimpleGenerationStore.getState().cancelGeneration()).resolves.toBe(true);

    expect(apiMocks.deleteQueueItem).toHaveBeenCalledTimes(1);
    expect(apiMocks.deleteQueueItem).toHaveBeenCalledWith('simple-pending');
    expect(apiMocks.deleteQueueItem).not.toHaveBeenCalledWith('other-pending');
    expect(apiMocks.interruptExecution).toHaveBeenCalledTimes(1);
    expect(useSimpleGenerationStore.getState().activePromptIds).toEqual([]);
  });

  it('keeps tracked ids until a later queue poll confirms the backend stopped them', async () => {
    useSimpleGenerationStore.setState({ activePromptIds: ['simple-running'] });
    let refreshCount = 0;
    queueMocks.fetchQueue.mockImplementation(async () => {
      refreshCount += 1;
      if (refreshCount === 1) {
        queueMocks.pending = [{ prompt_id: 'simple-running' }];
        queueMocks.running = [];
      } else if (refreshCount === 2) {
        // The delete acknowledgement raced with execution; the next snapshot
        // proves that this prompt is now running.
        queueMocks.pending = [];
        queueMocks.running = [{ prompt_id: 'simple-running' }];
      } else {
        queueMocks.pending = [];
        queueMocks.running = [];
      }
      return true;
    });

    await expect(useSimpleGenerationStore.getState().cancelGeneration()).resolves.toBe(true);

    expect(refreshCount).toBe(3);
    expect(apiMocks.interruptExecution).toHaveBeenCalledTimes(1);
    expect(useSimpleGenerationStore.getState().activePromptIds).toEqual([]);
    expect(useSimpleGenerationStore.getState().cancellationBlocked).toBe(false);
  });

  it('retains ids and blocks a new Generate when cancellation times out', async () => {
    vi.useFakeTimers();
    try {
      useSimpleGenerationStore.setState({ activePromptIds: ['simple-stuck'] });
      queueMocks.pending = [{ prompt_id: 'simple-stuck' }];
      apiMocks.deleteQueueItem.mockReset().mockResolvedValue(undefined);
      queueMocks.fetchQueue.mockImplementation(async () => {
        queueMocks.pending = [{ prompt_id: 'simple-stuck' }];
        queueMocks.running = [];
        return true;
      });

      const cancellation = useSimpleGenerationStore.getState().cancelGeneration();
      await vi.advanceTimersByTimeAsync(5_000);

      await expect(cancellation).resolves.toBe(false);
      expect(useSimpleGenerationStore.getState().activePromptIds).toEqual(['simple-stuck']);
      expect(useSimpleGenerationStore.getState().cancellationBlocked).toBe(true);
      expect(useSimpleGenerationStore.getState().error)
        .toBe('Generation is still stopping. Please wait and try again.');
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not clear tracked ids when a backend delete request fails', async () => {
    useSimpleGenerationStore.setState({ activePromptIds: ['simple-delete-failed'] });
    queueMocks.pending = [{ prompt_id: 'simple-delete-failed' }];
    apiMocks.deleteQueueItem.mockReset().mockRejectedValue(new Error('Failed to delete queue item'));

    await expect(useSimpleGenerationStore.getState().cancelGeneration()).resolves.toBe(false);

    expect(useSimpleGenerationStore.getState().activePromptIds).toEqual(['simple-delete-failed']);
    expect(useSimpleGenerationStore.getState().cancellationBlocked).toBe(true);
    expect(apiMocks.interruptExecution).not.toHaveBeenCalled();
  });

  it('does not report cancellation success when interrupting returns an error', async () => {
    useSimpleGenerationStore.setState({ activePromptIds: ['simple-interrupt-failed'] });
    queueMocks.running = [{ prompt_id: 'simple-interrupt-failed' }];
    apiMocks.interruptExecution.mockReset().mockRejectedValue(new Error('Failed to interrupt execution'));

    await expect(useSimpleGenerationStore.getState().cancelGeneration()).resolves.toBe(false);

    expect(useSimpleGenerationStore.getState().activePromptIds).toEqual(['simple-interrupt-failed']);
    expect(useSimpleGenerationStore.getState().cancellationBlocked).toBe(true);
  });

  it('untracks only prompts confirmed in history and keeps the others', async () => {
    useSimpleGenerationStore.setState({ activePromptIds: ['simple-complete', 'simple-pending'] });
    historyMocks.history = [{
      prompt_id: 'simple-complete',
      timestamp: 1,
      outputs: { images: [] },
      prompt: {},
    }];
    queueMocks.pending = [{ prompt_id: 'simple-pending' }];

    await useSimpleGenerationStore.getState().reconcileCompletedPromptIds();

    expect(useSimpleGenerationStore.getState().activePromptIds).toEqual(['simple-pending']);
    expect(apiMocks.promptHasHistory).not.toHaveBeenCalledWith('simple-complete');
  });

  it('uses per-prompt backend history when the completed item is outside the loaded window', async () => {
    useSimpleGenerationStore.setState({ activePromptIds: ['simple-complete', 'simple-pending'] });
    apiMocks.promptHasHistory.mockImplementation(async (promptId: string) => (
      promptId === 'simple-complete'
    ));

    await useSimpleGenerationStore.getState().reconcileCompletedPromptIds();

    expect(apiMocks.promptHasHistory).toHaveBeenCalledWith('simple-complete');
    expect(apiMocks.promptHasHistory).toHaveBeenCalledWith('simple-pending');
    expect(useSimpleGenerationStore.getState().activePromptIds).toEqual(['simple-pending']);
  });

  it('keeps tracked prompts when a queue snapshot temporarily omits them', async () => {
    useSimpleGenerationStore.setState({ activePromptIds: ['simple-a', 'simple-b'] });
    queueMocks.pending = [];
    queueMocks.running = [];
    historyMocks.history = [];
    apiMocks.promptHasHistory.mockResolvedValue(false);

    await useSimpleGenerationStore.getState().reconcileCompletedPromptIds();

    expect(apiMocks.promptHasHistory).toHaveBeenCalledWith('simple-a');
    expect(apiMocks.promptHasHistory).toHaveBeenCalledWith('simple-b');
    expect(useSimpleGenerationStore.getState().activePromptIds).toEqual(['simple-a', 'simple-b']);
  });

  it('stops remaining batch enqueue work when cancellation is requested mid-batch', async () => {
    useGenerationForm.getState().patch({
      checkpoint: 'models/checkpoint.safetensors',
      seedMode: 'fixed',
      seed: 100,
      batchCount: 4,
    });
    useSimpleGenerationStore.getState().setContext({
      baseWorkflow: canonicalWorkflow,
      nodeTypes: canonicalNodeTypes,
      checkpoints: ['models/checkpoint.safetensors'],
      checkpointsStatus: 'loaded',
    });
    let resolveSecondPrompt: ((response: { prompt_id: string; number: number }) => void) | undefined;
    apiMocks.queuePrompt
      .mockReset()
      .mockResolvedValueOnce({ prompt_id: 'simple-one', number: 1 })
      .mockImplementationOnce(() => new Promise((resolve) => {
        resolveSecondPrompt = resolve;
      }))
      .mockResolvedValue({ prompt_id: 'should-not-be-queued', number: 3 });
    queueMocks.pending = [
      { prompt_id: 'simple-one' },
      { prompt_id: 'other-pending' },
    ];
    queueMocks.running = [{ prompt_id: 'other-running' }];

    const generation = useSimpleGenerationStore.getState().generate();
    await vi.waitFor(() => expect(apiMocks.queuePrompt).toHaveBeenCalledTimes(2));
    expect(useSimpleGenerationStore.getState().activePromptIds).toEqual(['simple-one']);

    await expect(useSimpleGenerationStore.getState().cancelGeneration()).resolves.toBe(true);
    expect(useSimpleGenerationStore.getState().cancelRequested).toBe(true);
    expect(useSimpleGenerationStore.getState().isCancelling).toBe(true);

    queueMocks.pending = [
      { prompt_id: 'simple-one' },
      { prompt_id: 'simple-two' },
      { prompt_id: 'other-pending' },
    ];
    resolveSecondPrompt?.({ prompt_id: 'simple-two', number: 2 });

    await expect(generation).resolves.toBe(false);
    expect(apiMocks.queuePrompt).toHaveBeenCalledTimes(2);
    expect(apiMocks.deleteQueueItem).toHaveBeenCalledTimes(2);
    expect(apiMocks.deleteQueueItem).toHaveBeenCalledWith('simple-one');
    expect(apiMocks.deleteQueueItem).toHaveBeenCalledWith('simple-two');
    expect(apiMocks.deleteQueueItem).not.toHaveBeenCalledWith('other-pending');
    expect(apiMocks.interruptExecution).not.toHaveBeenCalled();
    expect(useSimpleGenerationStore.getState().activePromptIds).toEqual([]);
    expect(useSimpleGenerationStore.getState().isGenerating).toBe(false);
    expect(useSimpleGenerationStore.getState().isCancelling).toBe(false);
  });

  it('interrupts only when an active simple-generation prompt is running', async () => {
    useSimpleGenerationStore.setState({ activePromptIds: ['simple-running'] });
    queueMocks.pending = [{ prompt_id: 'other-pending' }];
    queueMocks.running = [{ prompt_id: 'simple-running' }];

    await expect(useSimpleGenerationStore.getState().cancelGeneration()).resolves.toBe(true);

    expect(apiMocks.deleteQueueItem).not.toHaveBeenCalled();
    expect(apiMocks.interruptExecution).toHaveBeenCalledTimes(1);
    expect(useSimpleGenerationStore.getState().activePromptIds).toEqual([]);
  });

  it('does not interrupt another workflow while canceling an active pending prompt', async () => {
    useSimpleGenerationStore.setState({ activePromptIds: ['simple-pending'] });
    queueMocks.pending = [{ prompt_id: 'simple-pending' }];
    queueMocks.running = [{ prompt_id: 'other-running' }];

    await expect(useSimpleGenerationStore.getState().cancelGeneration()).resolves.toBe(true);

    expect(apiMocks.deleteQueueItem).toHaveBeenCalledWith('simple-pending');
    expect(apiMocks.interruptExecution).not.toHaveBeenCalled();
  });

  it('can queue another generation after cancellation resets the active batch', async () => {
    useGenerationForm.getState().patch({
      checkpoint: 'models/checkpoint.safetensors',
      seedMode: 'fixed',
      seed: 200,
    });
    useSimpleGenerationStore.getState().setContext({
      baseWorkflow: emptyWorkflow,
      nodeTypes: {},
      checkpoints: ['models/checkpoint.safetensors'],
      checkpointsStatus: 'loaded',
    });
    useSimpleGenerationStore.setState({ activePromptIds: ['simple-pending'] });
    queueMocks.pending = [{ prompt_id: 'simple-pending' }];

    await expect(useSimpleGenerationStore.getState().cancelGeneration()).resolves.toBe(true);

    apiMocks.queuePrompt.mockReset().mockResolvedValue({ prompt_id: 'prompt-after-cancel', number: 9 });
    await expect(useSimpleGenerationStore.getState().generate()).resolves.toBe(true);
    expect(useSimpleGenerationStore.getState().activePromptIds).toEqual(['prompt-after-cancel']);
    expect(useSimpleGenerationStore.getState().isCancelling).toBe(false);
  });
});
