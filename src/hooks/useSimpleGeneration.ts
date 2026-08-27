import { useEffect } from 'react';
import { create } from 'zustand';
import type { NodeTypes, Workflow } from '@/api/types';
import * as api from '@/api/client';
import {
  MAX_BATCH_COUNT,
  MIN_BATCH_COUNT,
  useGenerationForm,
  type GenerationFormState,
} from '@/hooks/useGenerationForm';
import type { CheckpointLoadStatus } from '@/hooks/useCheckpoints';
import { useHistoryStore } from '@/hooks/useHistory';
import { useImageViewerStore } from '@/hooks/useImageViewer';
import { useQueueStore } from '@/hooks/useQueue';
import { useWorkflowStore } from '@/hooks/useWorkflow';
import { buildPromptFromWorkflow } from '@/utils/buildPromptFromWorkflow';
import { applyGenerationFormToWorkflow } from '@/utils/applyGenerationFormToWorkflow';
import { validateGenerationForm } from '@/utils/generationFormValidation';
import { MAX_GENERATION_SEED, resolveGenerationSeed } from '@/utils/generationSeed';
import { QUEUE_WORKFLOW_LABEL_EXTRA_DATA_KEY } from '@/utils/queueWorkflowLabel';
import { buildOutputPreferredViewerImages } from '@/utils/viewerImages';

export interface SimpleGenerationContext {
  baseWorkflow: Workflow | null;
  nodeTypes: NodeTypes | null;
  checkpoints: string[];
  checkpointsStatus: CheckpointLoadStatus;
}

interface SimpleGenerationState extends SimpleGenerationContext {
  isGenerating: boolean;
  isCancelling: boolean;
  activePromptIds: string[];
  error: string | null;
  setContext: (context: SimpleGenerationContext) => void;
  setError: (error: string | null) => void;
  generate: () => Promise<boolean>;
  cancelGeneration: () => Promise<boolean>;
  clearFinishedPromptIds: (promptIds: string[]) => void;
  openLatestImage: () => boolean;
}

const initialContext: SimpleGenerationContext = {
  baseWorkflow: null,
  nodeTypes: null,
  checkpoints: [],
  checkpointsStatus: 'loading',
};

function boundedBatchCount(value: number): number {
  if (!Number.isFinite(value)) return MIN_BATCH_COUNT;
  return Math.max(MIN_BATCH_COUNT, Math.min(MAX_BATCH_COUNT, Math.round(value)));
}

function resolveBatchSeed(
  form: Pick<GenerationFormState, 'seedMode' | 'seed'>,
  batchIndex: number,
): number {
  if (form.seedMode === 'fixed') {
    const baseSeed = Number.isFinite(form.seed)
      ? Math.max(0, Math.min(MAX_GENERATION_SEED, Math.round(form.seed)))
      : 0;
    return Math.min(MAX_GENERATION_SEED, baseSeed + batchIndex);
  }
  return resolveGenerationSeed(form);
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

/** Shared state for the Simple Generation form and its BottomBar action. */
export const useSimpleGenerationStore = create<SimpleGenerationState>((set, get) => ({
  ...initialContext,
  isGenerating: false,
  isCancelling: false,
  activePromptIds: [],
  error: null,
  setContext: (context) => set(context),
  setError: (error) => set({ error }),
  clearFinishedPromptIds: (promptIds) => set({ activePromptIds: [...new Set(promptIds)] }),
  openLatestImage: () => {
    const images = buildOutputPreferredViewerImages(
      useHistoryStore.getState().history,
      { alt: 'Generation' },
    );
    if (images.length === 0) return false;

    // Keep the user on the Generation panel while opening the same full-screen
    // viewer used by History/Outputs. The history list is newest-first, so the
    // first image is the most recent generated image.
    useWorkflowStore.getState().setFollowQueue(false);
    useImageViewerStore.getState().setViewerState({
      viewerImages: images,
      viewerIndex: 0,
      viewerScale: 1,
      viewerTranslate: { x: 0, y: 0 },
      viewerIdle: false,
      viewerOpen: true,
    });
    return true;
  },
  generate: async () => {
    const state = get();
    if (state.isGenerating || state.isCancelling) return false;

    const form = useGenerationForm.getState();
    const validationErrors = validateGenerationForm(
      form,
      state.checkpointsStatus === 'loaded' ? state.checkpoints : undefined,
    );
    if (validationErrors.length > 0) {
      set({ error: validationErrors[0] ?? 'Fix the form errors before generating.' });
      return false;
    }
    if (!state.baseWorkflow) {
      set({ error: 'The bundled mobile workflow is unavailable.' });
      return false;
    }
    if (!state.nodeTypes) {
      set({ error: 'Node definitions are still loading. Try again in a moment.' });
      return false;
    }
    if (state.checkpointsStatus !== 'loaded') {
      set({ error: 'Checkpoints are still loading. Try again in a moment.' });
      return false;
    }

    set({ isGenerating: true, error: null });
    try {
      const queue = useQueueStore.getState();
      const batchCount = boundedBatchCount(form.batchCount);
      for (let batchIndex = 0; batchIndex < batchCount; batchIndex += 1) {
        const resolvedSeed = resolveBatchSeed(form, batchIndex);
        const executionWorkflow = applyGenerationFormToWorkflow(
          form,
          state.baseWorkflow,
          resolvedSeed,
        );
        const prompt = buildPromptFromWorkflow(executionWorkflow, state.nodeTypes);
        const request: api.PromptQueueRequest = {
          prompt,
          client_id: api.clientId,
          extra_data: {
            [QUEUE_WORKFLOW_LABEL_EXTRA_DATA_KEY]: 'Simple generation',
            extra_pnginfo: { workflow: executionWorkflow },
          },
        };
        const response = await api.queuePrompt(request);
        if (!response.prompt_id) throw new Error('ComfyUI did not return a prompt id.');

        queue.registerLocalPrompt(response.prompt_id);
        queue.recordQueuedPrompt(response.prompt_id, request, { number: response.number });
        set((current) => ({
          activePromptIds: current.activePromptIds.includes(response.prompt_id as string)
            ? current.activePromptIds
            : [...current.activePromptIds, response.prompt_id as string],
        }));
        void api.upsertQueuePromptMetadata({
          promptId: response.prompt_id,
          workflowLabel: 'Simple generation',
          clientId: api.clientId,
        }).catch(() => {});
        form.patch({ seed: resolvedSeed });
      }
      void queue.fetchQueue();
      return true;
    } catch (error: unknown) {
      set({ error: errorMessage(error, 'Failed to queue generation.') });
      return false;
    } finally {
      set({ isGenerating: false });
    }
  },
  cancelGeneration: async () => {
    const state = get();
    if (state.isGenerating || state.isCancelling || state.activePromptIds.length === 0) {
      return false;
    }

    const activePromptIds = [...state.activePromptIds];
    set({ isCancelling: true, error: null });
    const queue = useQueueStore.getState();
    try {
      if (!(await queue.fetchQueue())) {
        throw new Error('Failed to refresh the queue before cancelling.');
      }

      const pendingIds = new Set(
        useQueueStore.getState().pending
          .map((item) => item.prompt_id)
          .filter((promptId) => activePromptIds.includes(promptId)),
      );
      const failures: string[] = [];
      const deleteResults = await Promise.allSettled(
        [...pendingIds].map((promptId) => api.deleteQueueItem(promptId)),
      );
      deleteResults.forEach((result, index) => {
        if (result.status === 'rejected') {
          const promptId = [...pendingIds][index] ?? 'pending prompt';
          failures.push(`${promptId}: ${errorMessage(result.reason, 'Failed to cancel queued generation.')}`);
        }
      });

      // Refresh after pending deletions: a prompt can move from pending to
      // running while the delete requests are in flight. Only interrupt when
      // the latest queue snapshot still contains one of our prompt IDs.
      const refreshedAfterDeletes = await queue.fetchQueue();
      if (!refreshedAfterDeletes) {
        failures.push('Failed to refresh the queue before interrupting.');
      } else {
        const hasActiveRunningPrompt = useQueueStore.getState().running.some((item) =>
          activePromptIds.includes(item.prompt_id));
        if (hasActiveRunningPrompt) {
          try {
            await api.interruptExecution();
          } catch (error: unknown) {
            failures.push(errorMessage(error, 'Failed to interrupt running generation.'));
          }
        }
      }

      if (!(await queue.fetchQueue())) {
        failures.push('Failed to refresh the queue after cancelling.');
      }
      if (failures.length > 0) {
        throw new Error(failures.join(' '));
      }

      set({ activePromptIds: [], isCancelling: false });
      return true;
    } catch (error: unknown) {
      set({ isCancelling: false, error: errorMessage(error, 'Failed to cancel generation.') });
      return false;
    }
  },
}));

/** Read the shared submit state and derive the current form's disabled status. */
export function useSimpleGeneration() {
  const form = useGenerationForm();
  const baseWorkflow = useSimpleGenerationStore((state) => state.baseWorkflow);
  const nodeTypes = useSimpleGenerationStore((state) => state.nodeTypes);
  const checkpoints = useSimpleGenerationStore((state) => state.checkpoints);
  const checkpointsStatus = useSimpleGenerationStore((state) => state.checkpointsStatus);
  const isGenerating = useSimpleGenerationStore((state) => state.isGenerating);
  const isCancelling = useSimpleGenerationStore((state) => state.isCancelling);
  const activePromptIds = useSimpleGenerationStore((state) => state.activePromptIds);
  const error = useSimpleGenerationStore((state) => state.error);
  const generate = useSimpleGenerationStore((state) => state.generate);
  const cancelGeneration = useSimpleGenerationStore((state) => state.cancelGeneration);
  const clearFinishedPromptIds = useSimpleGenerationStore((state) => state.clearFinishedPromptIds);
  const openLatestImage = useSimpleGenerationStore((state) => state.openLatestImage);
  const history = useHistoryStore((state) => state.history);
  const pending = useQueueStore((state) => state.pending);
  const running = useQueueStore((state) => state.running);
  const isQueueLoading = useQueueStore((state) => state.isLoading);

  useEffect(() => {
    if (activePromptIds.length === 0 || isGenerating || isCancelling || isQueueLoading) return;
    const livePromptIds = new Set([
      ...pending.map((item) => item.prompt_id),
      ...running.map((item) => item.prompt_id),
    ]);
    const unfinishedPromptIds = activePromptIds.filter((promptId) => livePromptIds.has(promptId));
    if (unfinishedPromptIds.length !== activePromptIds.length) {
      clearFinishedPromptIds(unfinishedPromptIds);
    }
  }, [
    activePromptIds,
    clearFinishedPromptIds,
    isCancelling,
    isGenerating,
    isQueueLoading,
    pending,
    running,
  ]);

  const validationErrors = validateGenerationForm(
    form,
    checkpointsStatus === 'loaded' ? checkpoints : undefined,
  );
  const canGenerate = Boolean(
    baseWorkflow
      && nodeTypes
      && checkpointsStatus === 'loaded'
      && !isGenerating
      && !isCancelling
      && validationErrors.length === 0,
  );
  const hasLatestImage = history.some((entry) => entry.outputs.images.length > 0);

  return {
    canGenerate,
    isGenerating,
    isCancelling,
    activePromptIds,
    error,
    hasLatestImage,
    validationErrors,
    generate,
    cancelGeneration,
    openLatestImage,
  };
}
