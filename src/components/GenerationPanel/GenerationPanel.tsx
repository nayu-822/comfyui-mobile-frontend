import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import type { Workflow } from '@/api/types';
import { useGenerationForm } from '@/hooks/useGenerationForm';
import { useCheckpoints } from '@/hooks/useCheckpoints';
import { useLoras } from '@/hooks/useLoras';
import { useWorkflowStore } from '@/hooks/useWorkflow';
import { useSimpleGenerationStore } from '@/hooks/useSimpleGeneration';
import defaultWorkflowAsset from '@/workflows/mobile_sdxl_default.json';
import { generationParamsFromWorkflow } from '@/utils/generationParamsFromWorkflow';
import { validateGenerationForm } from '@/utils/generationFormValidation';
import { getCheckpointAutoSelection } from '@/utils/checkpointSelection';
import { extractWorkflowFromImageFile } from '@/utils/imageWorkflowMetadata';
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
  const setStatus = useSimpleGenerationStore((state) => state.setStatus);
  const setGenerationContext = useSimpleGenerationStore((state) => state.setContext);
  const restoreInputRef = useRef<HTMLInputElement>(null);
  const [restoredCheckpointValue, setRestoredCheckpointValue] = useState<string | null>(null);
  const checkpoint = form.checkpoint;
  const setField = form.setField;

  useEffect(() => {
    setGenerationContext({
      baseWorkflow,
      nodeTypes,
      checkpoints,
      checkpointsStatus,
    });
  }, [baseWorkflow, checkpoints, checkpointsStatus, nodeTypes, setGenerationContext]);

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
    <div
      data-testid="generation-panel"
      className="min-h-full bg-slate-950 px-3 pt-4 text-slate-100"
      style={{
        // BottomBar owns the only fixed generation control now; reserve its
        // measured height plus a small breathing room below the last setting.
        paddingBottom: 'calc(var(--bottom-bar-offset, 80px) + 1rem)',
      }}
    >
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
    </div>
  );
}
