import type { ChangeEvent } from 'react';
import { useGenerationForm, type GenerationFormState, type LoraSlot } from '@/hooks/useGenerationForm';
import type { CheckpointLoadStatus } from '@/hooks/useCheckpoints';
import { isEmptyOrPlaceholderModelName } from '@/utils/generationFormValidation';

const inputClass = 'mt-1 w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-cyan-400';
const smallInputClass = 'mt-1 w-full rounded-lg border border-white/10 bg-slate-900 px-2.5 py-2 text-sm text-slate-100 outline-none focus:border-cyan-400';
const labelClass = 'text-xs font-medium text-slate-300';

export interface BasicSettingsProps {
  checkpoints: string[];
  checkpointsStatus: CheckpointLoadStatus;
  checkpointError: string | null;
  onReloadCheckpoints: () => void;
  onCheckpointChangedByUser: () => void;
}

function NumberField({
  label,
  value,
  onChange,
  step = '1',
  min,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  step?: string;
  min?: number;
}) {
  return (
    <label className="block">
      <span className={labelClass}>{label}</span>
      <input
        className={smallInputClass}
        type="number"
        value={Number.isFinite(value) ? value : ''}
        min={min}
        step={step}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
      />
    </label>
  );
}
function LoraCard({ index, slot }: { index: 0 | 1 | 2; slot: LoraSlot }) {
  const setLora = useGenerationForm((state) => state.setLora);
  const handleStrength = (event: ChangeEvent<HTMLInputElement>) => {
    const value = Number(event.currentTarget.value);
    setLora(index, { strengthModel: value, strengthClip: value });
  };

  return (
    <div className="rounded-xl border border-white/10 bg-slate-900/70 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-semibold text-slate-100">LoRA {index + 1}</span>
        <label className="flex items-center gap-2 text-xs text-slate-300">
          <input
            type="checkbox"
            checked={slot.enabled}
            onChange={(event) => setLora(index, { enabled: event.currentTarget.checked })}
            className="h-4 w-4 accent-cyan-400"
          />
          ON
        </label>
      </div>
      <label className="block">
        <span className={labelClass}>Model</span>
        <input
          className={smallInputClass}
          value={slot.name}
          onChange={(event) => setLora(index, { name: event.currentTarget.value })}
          placeholder="path/to/model.safetensors"
        />
      </label>
      <label className="mt-2 block">
        <span className={labelClass}>Strength</span>
        <input
          className={smallInputClass}
          type="number"
          step="0.05"
          value={Number.isFinite(slot.strengthModel) ? slot.strengthModel : ''}
          onChange={handleStrength}
          disabled={!slot.enabled}
        />
      </label>
    </div>
  );
}

export function BasicSettings({
  checkpoints,
  checkpointsStatus,
  checkpointError,
  onReloadCheckpoints,
  onCheckpointChangedByUser,
}: BasicSettingsProps) {
  const form = useGenerationForm();
  const setField = form.setField;
  const currentCheckpointIsListed = checkpoints.includes(form.checkpoint);
  const currentCheckpointIsUnlisted = Boolean(form.checkpoint) && !currentCheckpointIsListed;

  const updateNumber = <K extends keyof Omit<GenerationFormState, 'loras'>>(
    field: K,
  ) => (value: number) => setField(field, value as GenerationFormState[K]);

  return (
    <section className="space-y-3" aria-labelledby="basic-generation-settings">
      <h2 id="basic-generation-settings" className="text-sm font-semibold uppercase tracking-wide text-cyan-200">
        Basic settings
      </h2>

      <label className="block">
        <span className={labelClass}>Checkpoint</span>
        <select
          className={inputClass}
          value={form.checkpoint}
          onChange={(event) => {
            onCheckpointChangedByUser();
            setField('checkpoint', event.currentTarget.value);
          }}
          disabled={checkpointsStatus !== 'loaded'}
          aria-label="Checkpoint"
        >
          {checkpointsStatus === 'loading' && (
            <option value={form.checkpoint}>Loading checkpoints…</option>
          )}
          {checkpointsStatus === 'error' && (
            <option value={form.checkpoint}>{form.checkpoint || 'Checkpoints unavailable'}</option>
          )}
          {checkpointsStatus === 'loaded' && currentCheckpointIsUnlisted && (
            <option value={form.checkpoint}>
              {isEmptyOrPlaceholderModelName(form.checkpoint)
                ? 'Choose a checkpoint'
                : `Restored model (not detected): ${form.checkpoint}`}
            </option>
          )}
          {checkpointsStatus === 'loaded' && !form.checkpoint && checkpoints.length > 0 && (
            <option value="">Choose a checkpoint</option>
          )}
          {checkpointsStatus === 'loaded' && checkpoints.length === 0 && form.checkpoint === '' && (
            <option value="">No checkpoints found</option>
          )}
          {checkpoints.map((checkpoint) => (
            <option key={checkpoint} value={checkpoint}>{checkpoint}</option>
          ))}
        </select>
        {checkpointsStatus === 'loading' && (
          <p className="mt-1 text-xs text-slate-400">Loading checkpoints…</p>
        )}
        {checkpointsStatus === 'error' && (
          <div role="alert" className="mt-2 flex items-center gap-2 text-xs text-red-200">
            <span>{checkpointError || 'Failed to load checkpoints.'}</span>
            <button
              type="button"
              onClick={onReloadCheckpoints}
              className="min-h-9 rounded-lg border border-red-300/30 px-2.5 font-semibold text-red-100 hover:bg-red-900/40"
            >
              Reload
            </button>
          </div>
        )}
      </label>

      <label className="block">
        <span className={labelClass}>Positive Prompt</span>
        <textarea
          className={`${inputClass} min-h-24 resize-y`}
          value={form.positivePrompt}
          onChange={(event) => setField('positivePrompt', event.currentTarget.value)}
          rows={3}
        />
      </label>

      <label className="block">
        <span className={labelClass}>Negative Prompt</span>
        <textarea
          className={`${inputClass} min-h-20 resize-y`}
          value={form.negativePrompt}
          onChange={(event) => setField('negativePrompt', event.currentTarget.value)}
          rows={2}
        />
      </label>

      <div className="grid grid-cols-2 gap-2">
        <NumberField label="Width" value={form.width} min={64} onChange={updateNumber('width')} />
        <NumberField label="Height" value={form.height} min={64} onChange={updateNumber('height')} />
      </div>

      <fieldset className="rounded-xl border border-white/10 bg-slate-900/50 p-3">
        <legend className={labelClass}>Seed</legend>
        <div role="radiogroup" aria-label="Seed mode" className="mt-1 grid grid-cols-2 gap-2">
          {(['random', 'fixed'] as const).map((mode) => (
            <label
              key={mode}
              className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-white/10 bg-slate-950/70 px-3 text-sm text-slate-200 has-[:checked]:border-cyan-400/70 has-[:checked]:bg-cyan-950/40"
            >
              <input
                type="radio"
                name="generation-seed-mode"
                value={mode}
                checked={form.seedMode === mode}
                onChange={() => setField('seedMode', mode)}
                className="h-4 w-4 accent-cyan-400"
              />
              {mode === 'random' ? 'Random' : 'Fixed'}
            </label>
          ))}
        </div>
        <label className="mt-2 block">
          <span className={labelClass}>Seed value</span>
          <input
            className={`${smallInputClass} disabled:cursor-not-allowed disabled:opacity-50`}
            type="number"
            min={0}
            step="1"
            value={Number.isFinite(form.seed) ? form.seed : ''}
            onChange={(event) => {
              const value = event.currentTarget.value;
              setField('seed', value === '' ? Number.NaN : Number(value));
            }}
            disabled={form.seedMode === 'random'}
            aria-label="Seed value"
          />
        </label>
        {form.seedMode === 'random' && (
          <p className="mt-1 text-xs text-slate-400">A new seed is generated for each run.</p>
        )}
      </fieldset>

      <div className="space-y-2">
        {form.loras.map((slot, index) => (
          <LoraCard
            key={index}
            index={index as 0 | 1 | 2}
            slot={slot}
          />
        ))}
      </div>
    </section>
  );
}
