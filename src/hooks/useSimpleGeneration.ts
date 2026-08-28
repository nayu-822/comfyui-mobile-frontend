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
  cancelRequested: boolean;
  // A failed stop must keep Generate disabled while the tracked prompts may
  // still exist in the backend queue. A successful cancellation clears it.
  cancellationBlocked: boolean;
  // Keep these ids until a new submit or a successful cancel. A queue snapshot
  // can be stale while the backend is still accepting the just-submitted job.
  activePromptIds: string[];
  error: string | null;
  setContext: (context: SimpleGenerationContext) => void;
  setError: (error: string | null) => void;
  generate: () => Promise<boolean>;
  cancelGeneration: () => Promise<boolean>;
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

const CANCEL_POLL_INTERVAL_MS = 250;
const CANCEL_POLL_TIMEOUT_MS = 5_000;
const CANCELLATION_TIMEOUT_MESSAGE = 'Generation is still stopping. Please wait and try again.';

function waitForCancellationPoll(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, CANCEL_POLL_INTERVAL_MS);
  });
}

function trackedQueueIds(activePromptIds: ReadonlySet<string>): Set<string> {
  const queueState = useQueueStore.getState();
  return new Set([
    ...queueState.pending.map((item) => item.prompt_id),
    ...queueState.running.map((item) => item.prompt_id),
  ].filter((promptId) => activePromptIds.has(promptId)));
}

async function cancelTrackedPromptIds(activePromptIds: readonly string[]): Promise<void> {
  const queue = useQueueStore.getState();
  if (activePromptIds.length === 0) return;

  const activePromptIdSet = new Set(activePromptIds);
  if (!(await queue.fetchQueue())) throw new Error('Failed to refresh the queue before cancelling.');

  const pendingIds = [...new Set(
    useQueueStore.getState().pending
      .map((item) => item.prompt_id)
      .filter((promptId) => activePromptIdSet.has(promptId)),
  )];
  const deleteResults = await Promise.allSettled(
    pendingIds.map((promptId) => api.deleteQueueItem(promptId)),
  );
  const deleteFailure = deleteResults.find((result) => result.status === 'rejected');
  if (deleteFailure?.status === 'rejected') {
    const failureIndex = deleteResults.indexOf(deleteFailure);
    const promptId = pendingIds[failureIndex] ?? 'pending prompt';
    throw new Error(`${promptId}: ${errorMessage(deleteFailure.reason, 'Failed to cancel queued generation.')}`);
  }

  // A successful DELETE/interrupt response is only a request acknowledgement.
  // Keep refreshing until the backend no longer reports any of our prompts.
  // This prevents a stale queue snapshot from clearing the Cancel action while
  // a just-submitted prompt is still pending or has started running.
  const deadline = Date.now() + CANCEL_POLL_TIMEOUT_MS;
  const interruptedRunningIds = new Set<string>();
  let firstPoll = true;
  while (true) {
    if (!firstPoll && Date.now() >= deadline) {
      throw new Error(CANCELLATION_TIMEOUT_MESSAGE);
    }
    firstPoll = false;

    if (!(await queue.fetchQueue())) {
      throw new Error('Failed to refresh the queue while cancelling generation.');
    }

    const livePromptIds = trackedQueueIds(activePromptIdSet);
    if (livePromptIds.size === 0) return;

    const runningPromptIds = [...new Set(
      useQueueStore.getState().running
        .map((item) => item.prompt_id)
        .filter((promptId) => activePromptIdSet.has(promptId)),
    )];
    for (const promptId of runningPromptIds) {
      if (interruptedRunningIds.has(promptId)) continue;
      // ComfyUI's interrupt endpoint is global, so call it only after this
      // snapshot proves that the currently running prompt belongs to us.
      await api.interruptExecution();
      interruptedRunningIds.add(promptId);
    }

    if (Date.now() >= deadline) {
      throw new Error(CANCELLATION_TIMEOUT_MESSAGE);
    }
    await waitForCancellationPoll();
  }
}

/** Shared state for the Simple Generation form and its BottomBar action. */
export const useSimpleGenerationStore = create<SimpleGenerationState>((set, get) => ({
  ...initialContext,
  isGenerating: false,
  isCancelling: false,
  cancelRequested: false,
  cancellationBlocked: false,
  activePromptIds: [],
  error: null,
  setContext: (context) => set(context),
  setError: (error) => set({ error }),
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
    if (state.isGenerating || state.isCancelling || state.cancellationBlocked) return false;

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

    set({
      isGenerating: true,
      isCancelling: false,
      cancelRequested: false,
      cancellationBlocked: false,
      activePromptIds: [],
      error: null,
    });
    try {
      const queue = useQueueStore.getState();
      const batchCount = boundedBatchCount(form.batchCount);
      for (let batchIndex = 0; batchIndex < batchCount; batchIndex += 1) {
        if (get().cancelRequested) break;

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

        if (get().cancelRequested) break;
      }

      if (get().cancelRequested) {
        await cancelTrackedPromptIds(get().activePromptIds);
        set({
          activePromptIds: [],
          isCancelling: false,
          cancelRequested: false,
        });
        return false;
      }

      const refreshedQueue = await queue.fetchQueue();
      if (get().cancelRequested) {
        await cancelTrackedPromptIds(get().activePromptIds);
        set({
          activePromptIds: [],
          isCancelling: false,
          cancelRequested: false,
        });
        return false;
      }

      if (!refreshedQueue) {
        throw new Error('Failed to refresh the queue after queuing generation.');
      }
      return true;
    } catch (error: unknown) {
      set({
        error: errorMessage(error, 'Failed to queue generation.'),
        isCancelling: false,
        cancelRequested: false,
        cancellationBlocked: get().activePromptIds.length > 0,
      });
      return false;
    } finally {
      set({ isGenerating: false });
    }
  },
  cancelGeneration: async () => {
    const state = get();
    if (state.isCancelling) return false;

    if (state.isGenerating) {
      set({ cancelRequested: true, isCancelling: true, error: null });
      return true;
    }

    if (state.activePromptIds.length === 0) {
      return false;
    }

    const activePromptIds = [...state.activePromptIds];
    set({ isCancelling: true, error: null });
    try {
      await cancelTrackedPromptIds(activePromptIds);
      set({
        activePromptIds: [],
        isCancelling: false,
        cancelRequested: false,
        cancellationBlocked: false,
      });
      return true;
    } catch (error: unknown) {
      set({
        isCancelling: false,
        cancelRequested: false,
        cancellationBlocked: true,
        error: errorMessage(error, 'Failed to cancel generation.'),
      });
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
  const cancelRequested = useSimpleGenerationStore((state) => state.cancelRequested);
  const cancellationBlocked = useSimpleGenerationStore((state) => state.cancellationBlocked);
  const activePromptIds = useSimpleGenerationStore((state) => state.activePromptIds);
  const error = useSimpleGenerationStore((state) => state.error);
  const generate = useSimpleGenerationStore((state) => state.generate);
  const cancelGeneration = useSimpleGenerationStore((state) => state.cancelGeneration);
  const openLatestImage = useSimpleGenerationStore((state) => state.openLatestImage);
  const history = useHistoryStore((state) => state.history);

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
      && !cancellationBlocked
      && validationErrors.length === 0,
  );
  const hasLatestImage = history.some((entry) => entry.outputs.images.length > 0);

  return {
    canGenerate,
    isGenerating,
    isCancelling,
    cancelRequested,
    cancellationBlocked,
    activePromptIds,
    error,
    hasLatestImage,
    validationErrors,
    generate,
    cancelGeneration,
    openLatestImage,
  };
}
