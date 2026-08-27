import { create } from 'zustand';
import type { NodeTypes, Workflow } from '@/api/types';
import * as api from '@/api/client';
import { useGenerationForm } from '@/hooks/useGenerationForm';
import type { CheckpointLoadStatus } from '@/hooks/useCheckpoints';
import { useHistoryStore } from '@/hooks/useHistory';
import { useImageViewerStore } from '@/hooks/useImageViewer';
import { useQueueStore } from '@/hooks/useQueue';
import { useWorkflowStore } from '@/hooks/useWorkflow';
import { buildPromptFromWorkflow } from '@/utils/buildPromptFromWorkflow';
import { applyGenerationFormToWorkflow } from '@/utils/applyGenerationFormToWorkflow';
import { validateGenerationForm } from '@/utils/generationFormValidation';
import { resolveGenerationSeed } from '@/utils/generationSeed';
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
  error: string | null;
  setContext: (context: SimpleGenerationContext) => void;
  setError: (error: string | null) => void;
  generate: () => Promise<boolean>;
  openLatestImage: () => boolean;
}

const initialContext: SimpleGenerationContext = {
  baseWorkflow: null,
  nodeTypes: null,
  checkpoints: [],
  checkpointsStatus: 'loading',
};

/** Shared state for the Simple Generation form and its BottomBar action. */
export const useSimpleGenerationStore = create<SimpleGenerationState>((set, get) => ({
  ...initialContext,
  isGenerating: false,
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
    if (state.isGenerating) return false;

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
      const resolvedSeed = resolveGenerationSeed(form);
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

      const queue = useQueueStore.getState();
      queue.registerLocalPrompt(response.prompt_id);
      queue.recordQueuedPrompt(response.prompt_id, request, { number: response.number });
      void queue.fetchQueue();
      void api.upsertQueuePromptMetadata({
        promptId: response.prompt_id,
        workflowLabel: 'Simple generation',
        clientId: api.clientId,
      }).catch(() => {});
      form.patch({ seed: resolvedSeed });
      return true;
    } catch (error: unknown) {
      set({ error: error instanceof Error ? error.message : 'Failed to queue generation.' });
      return false;
    } finally {
      set({ isGenerating: false });
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
  const error = useSimpleGenerationStore((state) => state.error);
  const generate = useSimpleGenerationStore((state) => state.generate);
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
      && validationErrors.length === 0,
  );
  const hasLatestImage = history.some((entry) => entry.outputs.images.length > 0);

  return {
    canGenerate,
    isGenerating,
    error,
    hasLatestImage,
    validationErrors,
    generate,
    openLatestImage,
  };
}
