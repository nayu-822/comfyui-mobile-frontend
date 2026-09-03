import { useGenerationFormForMode } from '@/hooks/useGenerationForm';
import type { SimpleGenerationMode } from '@/config/simpleGenerationMode';

function FeatureToggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex min-h-12 items-center justify-between rounded-xl border border-white/10 bg-slate-900/70 px-3 py-2 text-sm text-slate-100">
      <span>{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.currentTarget.checked)}
        className="h-5 w-5 accent-cyan-400"
      />
    </label>
  );
}
export function FeatureToggles({ mode = 'sdxl' }: { mode?: SimpleGenerationMode }) {
  const form = useGenerationFormForMode(mode);
  return (
    <section className="space-y-2" aria-labelledby="generation-features">
      <h2 id="generation-features" className="text-sm font-semibold uppercase tracking-wide text-cyan-200">
        Features
      </h2>
      <FeatureToggle
        label="Hires.fix"
        checked={form.hiresEnabled}
        onChange={(value) => form.setField('hiresEnabled', value)}
      />
      <FeatureToggle
        label="FaceDetailer"
        checked={form.faceDetailerEnabled}
        onChange={(value) => form.setField('faceDetailerEnabled', value)}
      />
      <FeatureToggle
        label="x4 Upscale"
        checked={form.upscaleEnabled}
        onChange={(value) => form.setField('upscaleEnabled', value)}
      />
    </section>
  );
}
