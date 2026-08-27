import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Workflow } from '@/api/types';
import { useGenerationForm } from '../useGenerationForm';

const apiMocks = vi.hoisted(() => ({
  clientId: 'test-client',
  queuePrompt: vi.fn(),
  upsertQueuePromptMetadata: vi.fn(),
}));

const queueMocks = vi.hoisted(() => ({
  registerLocalPrompt: vi.fn(),
  recordQueuedPrompt: vi.fn(),
  fetchQueue: vi.fn(),
}));

vi.mock('@/api/client', () => apiMocks);
vi.mock('@/hooks/useQueue', () => ({
  useQueueStore: { getState: () => queueMocks },
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
      status: null,
    });
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
    expect(useSimpleGenerationStore.getState().status).toBe('Generation queued. Seed: 42');
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
    expect(useSimpleGenerationStore.getState().status).toBe('Choose a checkpoint before generating.');
  });
});
