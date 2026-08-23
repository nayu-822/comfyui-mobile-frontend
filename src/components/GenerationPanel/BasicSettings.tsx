import type { ChangeEvent } from 'react';
import { useGenerationForm, type GenerationFormState, type LoraSlot } from '@/hooks/useGenerationForm';

const inputClass = 'mt-1 w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-cyan-400';
const smallInputClass = 'mt-1 w-full rounded-lg border border-white/10 bg-slate-900 px-2.5 py-2 text-sm text-slate-100 outline-none focus:border-cyan-400';
const labelClass = 'text-xs font-medium text-slate-300';

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

export function BasicSettings() {
  const form = useGenerationForm();
  const setField = form.setField;

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
        <input
          className={inputClass}
          value={form.checkpoint}
          onChange={(event) => setField('checkpoint', event.currentTarget.value)}
          placeholder="checkpoint.safetensors"
        />
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

      <NumberField label="Seed" value={form.seed} min={0} onChange={updateNumber('seed')} />

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
