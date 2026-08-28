import {
  BATCH_COUNT_OPTIONS,
  BATCH_SIZE_OPTIONS,
  useGenerationForm,
} from '@/hooks/useGenerationForm';
import { useSimpleGeneration } from '@/hooks/useSimpleGeneration';

const selectClass = 'mt-1 w-full rounded-lg border border-white/10 bg-slate-900 px-2.5 py-2 text-sm text-slate-100 outline-none focus:border-cyan-400 disabled:cursor-not-allowed disabled:opacity-50';
const labelClass = 'text-xs font-medium text-slate-300';

/** Controls the number of images per prompt and prompts submitted as one batch. */
export function BatchSettings() {
  const form = useGenerationForm();
  const {
    activePromptIds,
    isGenerating,
    isCancelling,
    cancelGeneration,
  } = useSimpleGeneration();
  const totalImages = Number.isFinite(form.batchSize) && Number.isFinite(form.batchCount)
    ? form.batchSize * form.batchCount
    : 0;

  return (
    <section className="space-y-2" aria-labelledby="batch-generation-settings" data-testid="batch-settings">
      <h2 id="batch-generation-settings" className="text-sm font-semibold uppercase tracking-wide text-cyan-200">
        Batch
      </h2>

      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className={labelClass}>Batch size</span>
          <select
            aria-label="Batch size"
            className={selectClass}
            value={form.batchSize}
            onChange={(event) => form.setField('batchSize', Number(event.currentTarget.value))}
          >
            {BATCH_SIZE_OPTIONS.map((value) => (
              <option key={value} value={value}>{value}</option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className={labelClass}>Batch count</span>
          <select
            aria-label="Batch count"
            className={selectClass}
            value={form.batchCount}
            onChange={(event) => form.setField('batchCount', Number(event.currentTarget.value))}
          >
            {BATCH_COUNT_OPTIONS.map((value) => (
              <option key={value} value={value}>{value}</option>
            ))}
          </select>
        </label>
      </div>

      <p data-testid="total-images" className="text-sm text-slate-300">
        Total images: <span className="font-semibold text-slate-100">{totalImages}</span>
      </p>

      {(activePromptIds.length > 0 || isGenerating) && (
        <button
          type="button"
          data-testid="cancel-generation-button"
          onClick={() => void cancelGeneration()}
          disabled={isCancelling}
          aria-busy={isCancelling}
          className="min-h-14 w-full rounded-xl border border-red-300/40 bg-red-950/40 px-4 py-3 text-sm font-semibold text-red-100 transition-colors hover:bg-red-900/50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isCancelling ? 'Cancelling…' : 'Cancel generation'}
        </button>
      )}
    </section>
  );
}
