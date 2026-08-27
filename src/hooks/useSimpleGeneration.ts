import { create } from 'zustand';
import type { NodeTypes, Workflow } from '@/api/types';
import * as api from '@/api/client';
import { useGenerationForm } from '@/hooks/useGenerationForm';
import type { CheckpointLoadStatus } from '@/hooks/useCheckpoints';
import { useQueueStore } from '@/hooks/useQueue';
import { buildPromptFromWorkflow } from '@/utils/buildPromptFromWorkflow';
import { applyGenerationFormToWorkflow } from '@/utils/applyGenerationFormToWorkflow';
import { validateGenerationForm } from '@/utils/generationFormValidation';
import { resolveGenerationSeed } from '@/utils/generationSeed';
import { QUEUE_WORKFLOW_LABEL_EXTRA_DATA_KEY } from '@/utils/queueWorkflowLabel';

export interface SimpleGenerationContext {
  baseWorkflow: Workflow | null;
  nodeTypes: NodeTypes | null;
  checkpoints: string[];
  checkpointsStatus: CheckpointLoadStatus;
}

interface SimpleGenerationState extends SimpleGenerationContext {
  isGenerating: boolean;
  status: string | null;
  setContext: (context: SimpleGenerationContext) => void;
  setStatus: (status: string | null) => void;
  generate: () => Promise<boolean>;
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
  status: null,
  setContext: (context) => set(context),
  setStatus: (status) => set({ status }),
  generate: async () => {
    const state = get();
    if (state.isGenerating) return false;

    const form = useGenerationForm.getState();
    const validationErrors = validateGenerationForm(
      form,
      state.checkpointsStatus === 'loaded' ? state.checkpoints : undefined,
    );
    if (validationErrors.length > 0) {
      set({ status: validationErrors[0] ?? 'Fix the form errors before generating.' });
      return false;
    }
    if (!state.baseWorkflow) {
      set({ status: 'The bundled mobile workflow is unavailable.' });
      return false;
    }
    if (!state.nodeTypes) {
      set({ status: 'Node definitions are still loading. Try again in a moment.' });
      return false;
    }
    if (state.checkpointsStatus !== 'loaded') {
      set({ status: 'Checkpoints are still loading. Try again in a moment.' });
      return false;
    }

    set({ isGenerating: true, status: null });
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
      set({ status: `Generation queued. Seed: ${resolvedSeed}` });
      return true;
    } catch (error: unknown) {
      set({ status: error instanceof Error ? error.message : 'Failed to queue generation.' });
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
  const status = useSimpleGenerationStore((state) => state.status);
  const generate = useSimpleGenerationStore((state) => state.generate);

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

  return {
    canGenerate,
    isGenerating,
    status,
    validationErrors,
    generate,
  };
}
