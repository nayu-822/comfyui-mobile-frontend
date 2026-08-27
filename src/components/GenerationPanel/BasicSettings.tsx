import type { ChangeEvent } from 'react';
import { useGenerationForm, type GenerationFormState, type LoraSlot } from '@/hooks/useGenerationForm';
import type { CheckpointLoadStatus } from '@/hooks/useCheckpoints';
import type { LoraLoadStatus } from '@/hooks/useLoras';
import { isEmptyOrPlaceholderModelName } from '@/utils/generationFormValidation';

const inputClass = 'mt-1 w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-cyan-400 disabled:cursor-not-allowed disabled:opacity-50';
const smallInputClass = 'mt-1 w-full rounded-lg border border-white/10 bg-slate-900 px-2.5 py-2 text-sm text-slate-100 outline-none focus:border-cyan-400 disabled:cursor-not-allowed disabled:opacity-50';
const labelClass = 'text-xs font-medium text-slate-300';

export interface BasicSettingsProps {
  checkpoints: string[];
  checkpointsStatus: CheckpointLoadStatus;
  checkpointError: string | null;
  onReloadCheckpoints: () => void;
  onCheckpointChangedByUser: () => void;
  loras: string[];
  lorasStatus: LoraLoadStatus;
  loraError: string | null;
  onReloadLoras: () => void;
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
function LoraCard({
  index,
  slot,
  loras,
  lorasStatus,
  loraError,
  onReloadLoras,
}: {
  index: 0 | 1 | 2;
  slot: LoraSlot;
  loras: string[];
  lorasStatus: LoraLoadStatus;
  loraError: string | null;
  onReloadLoras: () => void;
}) {
  const setLora = useGenerationForm((state) => state.setLora);
  const currentLoraIsListed = loras.includes(slot.name);
  const currentLoraIsUnlisted = Boolean(slot.name) && !currentLoraIsListed;
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
        <select
          aria-label={`LoRA ${index + 1} model`}
          className={smallInputClass}
          value={slot.name}
          aria-busy={lorasStatus === 'loading'}
          disabled={lorasStatus === 'loading'}
          onChange={(event) => setLora(index, { name: event.currentTarget.value })}
        >
          {lorasStatus === 'loading' && (
            <option value={slot.name}>Loading LoRAs…</option>
          )}
          {lorasStatus === 'error' && (
            <option value={slot.name}>{slot.name || 'LoRAs unavailable'}</option>
          )}
          {lorasStatus === 'loaded' && currentLoraIsUnlisted && (
            <option value={slot.name}>
              {isEmptyOrPlaceholderModelName(slot.name)
                ? 'Choose a LoRA'
                : `Restored model (not detected): ${slot.name}`}
            </option>
          )}
          {lorasStatus === 'loaded' && (
            <option value="">None{loras.length === 0 ? ' (no LoRAs found)' : ''}</option>
          )}
          {loras.map((lora) => (
            <option key={lora} value={lora}>{lora}</option>
          ))}
        </select>
        {lorasStatus === 'loading' && (
          <p className="mt-1 text-xs text-slate-400">Loading LoRAs…</p>
        )}
        {lorasStatus === 'error' && (
          <div role="alert" className="mt-2 flex items-center gap-2 text-xs text-red-200">
            <span>{loraError || 'Failed to load LoRAs.'}</span>
            <button
              type="button"
              onClick={onReloadLoras}
              className="min-h-9 rounded-lg border border-red-300/30 px-2.5 font-semibold text-red-100 hover:bg-red-900/40"
            >
              Reload
            </button>
          </div>
        )}
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
  loras,
  lorasStatus,
  loraError,
  onReloadLoras,
}: BasicSettingsProps) {
  const form = useGenerationForm();
  const setField = form.setField;
  const currentCheckpointIsListed = checkpoints.includes(form.checkpoint);
  const currentCheckpointIsUnlisted = Boolean(form.checkpoint) && !currentCheckpointIsListed;
  const enabledLoraCount = form.loras.filter((slot) => slot.enabled).length;

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
        <label className="mt-1 block">
          <span className={labelClass}>Mode</span>
          <select
            aria-label="Seed mode"
            className={smallInputClass}
            value={form.seedMode}
            onChange={(event) => setField('seedMode', event.currentTarget.value as GenerationFormState['seedMode'])}
          >
            <option value="random">Random</option>
            <option value="fixed">Fixed</option>
          </select>
        </label>
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

      <details
        data-testid="lora-settings"
        className="rounded-xl border border-white/10 bg-slate-900/50"
      >
        <summary className="cursor-pointer select-none px-3 py-3 text-sm font-semibold text-slate-100">
          LoRA
          {enabledLoraCount > 0 && (
            <span className="ml-2 text-xs font-normal text-cyan-200">
              · {enabledLoraCount} enabled
            </span>
          )}
        </summary>
        <div className="space-y-2 border-t border-white/10 px-3 pb-3 pt-3">
          {form.loras.map((slot, index) => (
            <LoraCard
              key={index}
              index={index as 0 | 1 | 2}
              slot={slot}
              loras={loras}
              lorasStatus={lorasStatus}
              loraError={loraError}
              onReloadLoras={onReloadLoras}
            />
          ))}
        </div>
      </details>
    </section>
  );
}
