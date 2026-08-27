import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Workflow } from '@/api/types';
import { useGenerationForm } from '../useGenerationForm';

const apiMocks = vi.hoisted(() => ({
  clientId: 'test-client',
  queuePrompt: vi.fn(),
  upsertQueuePromptMetadata: vi.fn(),
  getImageUrl: vi.fn((filename: string) => `/view/${filename}`),
  getImagePreviewUrl: vi.fn((filename: string) => `/preview/${filename}`),
}));

const queueMocks = vi.hoisted(() => ({
  registerLocalPrompt: vi.fn(),
  recordQueuedPrompt: vi.fn(),
  fetchQueue: vi.fn(),
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

describe('useSimpleGeneration shared submit state', () => {
  beforeEach(() => {
    useGenerationForm.getState().reset();
    useSimpleGenerationStore.setState({
      baseWorkflow: null,
      nodeTypes: null,
      checkpoints: [],
      checkpointsStatus: 'loading',
      isGenerating: false,
      error: null,
    });
    historyMocks.history.length = 0;
    imageViewerMocks.setViewerState.mockReset();
    workflowMocks.setFollowQueue.mockReset();
    apiMocks.queuePrompt.mockReset().mockResolvedValue({ prompt_id: 'prompt-1', number: 7 });
    apiMocks.upsertQueuePromptMetadata.mockReset().mockResolvedValue(undefined);
    queueMocks.registerLocalPrompt.mockReset();
    queueMocks.recordQueuedPrompt.mockReset();
    queueMocks.fetchQueue.mockReset();
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
    expect(useSimpleGenerationStore.getState().error).toBeNull();
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
});
