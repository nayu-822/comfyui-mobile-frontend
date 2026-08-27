import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NodeTypes, Workflow } from '@/api/types';
import mobileSdxlWorkflowAsset from '@/workflows/mobile_sdxl_default.json';
import { useGenerationForm } from '../useGenerationForm';

const apiMocks = vi.hoisted(() => ({
  clientId: 'test-client',
  queuePrompt: vi.fn(),
  upsertQueuePromptMetadata: vi.fn(),
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
  useQueueStore: { getState: () => queueMocks },
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

import { useSimpleGenerationStore } from '../useSimpleGeneration';

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
    useSimpleGenerationStore.setState({
      baseWorkflow: null,
      nodeTypes: null,
      checkpoints: [],
      checkpointsStatus: 'loading',
      isGenerating: false,
      isCancelling: false,
      activePromptIds: [],
      error: null,
    });
    historyMocks.history.length = 0;
    imageViewerMocks.setViewerState.mockReset();
    workflowMocks.setFollowQueue.mockReset();
    apiMocks.queuePrompt.mockReset().mockResolvedValue({ prompt_id: 'prompt-1', number: 7 });
    apiMocks.upsertQueuePromptMetadata.mockReset().mockResolvedValue(undefined);
    apiMocks.deleteQueueItem.mockReset().mockResolvedValue(undefined);
    apiMocks.interruptExecution.mockReset().mockResolvedValue(undefined);
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
