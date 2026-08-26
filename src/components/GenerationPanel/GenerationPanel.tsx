import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import type { Workflow } from '@/api/types';
import * as api from '@/api/client';
import { useGenerationForm } from '@/hooks/useGenerationForm';
import { useCheckpoints } from '@/hooks/useCheckpoints';
import { useLoras } from '@/hooks/useLoras';
import { useWorkflowStore } from '@/hooks/useWorkflow';
import defaultWorkflowAsset from '@/workflows/mobile_sdxl_default.json';
import { useQueueStore } from '@/hooks/useQueue';
import { buildPromptFromWorkflow } from '@/utils/buildPromptFromWorkflow';
import { applyGenerationFormToWorkflow } from '@/utils/applyGenerationFormToWorkflow';
import { generationParamsFromWorkflow } from '@/utils/generationParamsFromWorkflow';
import { validateGenerationForm } from '@/utils/generationFormValidation';
import { resolveGenerationSeed } from '@/utils/generationSeed';
import { getCheckpointAutoSelection } from '@/utils/checkpointSelection';
import { extractWorkflowFromImageFile } from '@/utils/imageWorkflowMetadata';
import { QUEUE_WORKFLOW_LABEL_EXTRA_DATA_KEY } from '@/utils/queueWorkflowLabel';
import { BasicSettings } from './BasicSettings';
import { FeatureToggles } from './FeatureToggles';
import { AdvancedSettings } from './AdvancedSettings';

function isWorkflow(value: unknown): value is Workflow {
  return Boolean(value) && typeof value === 'object' && Array.isArray((value as { nodes?: unknown }).nodes);
}

function cloneWorkflow(workflow: Workflow): Workflow {
  if (typeof structuredClone === 'function') return structuredClone(workflow);
  return JSON.parse(JSON.stringify(workflow)) as Workflow;
}

export interface GenerationSubmitBarProps {
  disabled: boolean;
  isGenerating: boolean;
  onGenerate: () => void;
  status: string | null;
}

export function GenerationSubmitBar({
  disabled,
  isGenerating,
  onGenerate,
  status,
}: GenerationSubmitBarProps) {
  return (
    <div
      data-testid="generation-submit-bar"
      className="fixed bottom-0 left-0 right-0 z-30 border-t border-white/10 bg-slate-950/95 backdrop-blur"
    >
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-2 px-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-3">
        <button
          type="button"
          onClick={onGenerate}
          disabled={disabled}
          className="min-h-14 w-full rounded-xl bg-cyan-400 px-4 py-3 text-lg font-bold text-slate-950 transition-colors hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isGenerating ? 'Queueing…' : 'Generate'}
        </button>
        {status && <p role="status" className="text-center text-xs text-slate-400">{status}</p>}
      </div>
    </div>
  );
}

export function GenerationPanel({ visible }: { visible: boolean }) {
  const form = useGenerationForm();
  const {
    checkpoints,
    status: checkpointsStatus,
    error: checkpointError,
    reload: reloadCheckpoints,
  } = useCheckpoints();
  const {
    loras: loraModels,
    status: lorasStatus,
    error: loraError,
    reload: reloadLoras,
  } = useLoras();
  const nodeTypes = useWorkflowStore((state) => state.nodeTypes);
  const baseWorkflow = useMemo(() => {
    if (!isWorkflow(defaultWorkflowAsset)) return null;
    return cloneWorkflow(defaultWorkflowAsset as unknown as Workflow);
  }, []);
  const loadError = baseWorkflow ? null : 'The bundled mobile generation workflow is malformed.';
  const [status, setStatus] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const restoreInputRef = useRef<HTMLInputElement>(null);
  const [restoredCheckpointValue, setRestoredCheckpointValue] = useState<string | null>(null);
  const checkpoint = form.checkpoint;
  const setField = form.setField;
  useEffect(() => {
    if (checkpointsStatus !== 'loaded') return;
    const nextCheckpoint = getCheckpointAutoSelection({
      currentCheckpoint: checkpoint,
      restoredCheckpointValue,
      checkpoints,
    });
    if (nextCheckpoint === undefined) return;
    setField('checkpoint', nextCheckpoint);
  }, [checkpoint, checkpoints, checkpointsStatus, restoredCheckpointValue, setField]);

  const validationErrors = validateGenerationForm(
    form,
    checkpointsStatus === 'loaded' ? checkpoints : undefined,
  );
  const generateDisabled =
    !baseWorkflow
    || !nodeTypes
    || checkpointsStatus !== 'loaded'
    || isGenerating
    || validationErrors.length > 0;

  const handleGenerate = async () => {
    if (validationErrors.length > 0) {
      setStatus(validationErrors[0] ?? 'Fix the form errors before generating.');
      return;
    }
    if (!baseWorkflow) {
      setStatus('The bundled mobile workflow is unavailable.');
      return;
    }
    if (!nodeTypes) {
      setStatus('Node definitions are still loading. Try again in a moment.');
      return;
    }

    setIsGenerating(true);
    setStatus(null);
    try {
      const resolvedSeed = resolveGenerationSeed(form);
      const executionWorkflow = applyGenerationFormToWorkflow(form, baseWorkflow, resolvedSeed);
      const prompt = buildPromptFromWorkflow(executionWorkflow, nodeTypes);
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
      setStatus(`Generation queued. Seed: ${resolvedSeed}`);
    } catch (error: unknown) {
      setStatus(error instanceof Error ? error.message : 'Failed to queue generation.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRestoreImage = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;
    try {
      const workflow = await extractWorkflowFromImageFile(file);
      if (!workflow) {
        setStatus('No embedded ComfyUI workflow was found in that image.');
        return;
      }
      const patch = generationParamsFromWorkflow(workflow);
      if (patch.checkpoint !== undefined) setRestoredCheckpointValue(patch.checkpoint);
      form.patch(patch);
      setStatus('Generation parameters restored from the image.');
    } catch (error: unknown) {
      setStatus(error instanceof Error ? error.message : 'Failed to read image metadata.');
    }
  };

  if (!visible) return null;

  return (
    <div className="min-h-full bg-slate-950 px-3 pb-36 pt-4 text-slate-100">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-5">
        <div className="rounded-xl border border-cyan-400/20 bg-cyan-950/20 px-3 py-3 text-sm text-slate-300">
          <div className="font-semibold text-cyan-200">Simple image generation</div>
          <div className="mt-1 text-xs text-slate-400">
            Uses <code className="text-cyan-100">mobile_sdxl_default.json</code> while keeping the normal Workflow panel unchanged.
          </div>
        </div>

        {loadError && (
          <div role="alert" className="rounded-xl border border-red-400/30 bg-red-950/40 px-3 py-2 text-sm text-red-200">
            {loadError}
          </div>
        )}

        {validationErrors.length > 0 && (
          <div role="alert" className="rounded-xl border border-amber-400/30 bg-amber-950/30 px-3 py-2 text-sm text-amber-100">
            <ul className="list-disc space-y-1 pl-5">
              {validationErrors.map((error) => <li key={error}>{error}</li>)}
            </ul>
          </div>
        )}

        <BasicSettings
          checkpoints={checkpoints}
          checkpointsStatus={checkpointsStatus}
          checkpointError={checkpointError}
          onReloadCheckpoints={reloadCheckpoints}
          onCheckpointChangedByUser={() => setRestoredCheckpointValue(null)}
          loras={loraModels}
          lorasStatus={lorasStatus}
          loraError={loraError}
          onReloadLoras={reloadLoras}
        />
        <FeatureToggles />

        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => restoreInputRef.current?.click()}
            className="min-h-11 w-full rounded-xl border border-white/15 bg-slate-900 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-800"
          >
            Restore parameters from image
          </button>
          <input
            ref={restoreInputRef}
            type="file"
            accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={handleRestoreImage}
          />
        </div>

        <AdvancedSettings nodeTypes={nodeTypes} />
      </div>
      <GenerationSubmitBar
        disabled={generateDisabled}
        isGenerating={isGenerating}
        onGenerate={() => void handleGenerate()}
        status={status}
      />
    </div>
  );
}
