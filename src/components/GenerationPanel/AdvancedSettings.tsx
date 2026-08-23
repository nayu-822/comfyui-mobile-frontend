import type { ReactNode } from 'react';
import { useGenerationForm } from '@/hooks/useGenerationForm';

const inputClass = 'mt-1 w-full rounded-lg border border-white/10 bg-slate-900 px-2.5 py-2 text-sm text-slate-100 outline-none focus:border-cyan-400 disabled:cursor-not-allowed disabled:opacity-50';
const labelClass = 'text-xs font-medium text-slate-300';

function NumberSetting({
  label,
  value,
  onChange,
  step = '1',
  min,
  max,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  step?: string;
  min?: number;
  max?: number;
}) {
  return (
    <label className="block">
      <span className={labelClass}>{label}</span>
      <input
        className={inputClass}
        type="number"
        value={Number.isFinite(value) ? value : ''}
        min={min}
        max={max}
        step={step}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
      />
    </label>
  );
}

function TextSetting({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className={labelClass}>{label}</span>
      <input className={inputClass} value={value} onChange={(event) => onChange(event.currentTarget.value)} />
    </label>
  );
}

function Section({
  title,
  disabled = false,
  children,
}: {
  title: string;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <details className="rounded-xl border border-white/10 bg-slate-900/50" open={!disabled}>
      <summary className="cursor-pointer select-none px-3 py-3 text-sm font-semibold text-slate-100">
        {title}
        {disabled && <span className="ml-2 text-xs font-normal text-slate-500">OFF</span>}
      </summary>
      <fieldset disabled={disabled} className="space-y-3 border-t border-white/10 px-3 pb-3 pt-3 disabled:opacity-50">
        {children}
      </fieldset>
    </details>
  );
}

export function AdvancedSettings() {
  const form = useGenerationForm();
  const set = form.setField;

  return (
    <section className="space-y-2" aria-labelledby="advanced-generation-settings">
      <h2 id="advanced-generation-settings" className="text-sm font-semibold uppercase tracking-wide text-cyan-200">
        Advanced settings
      </h2>

      <Section title="Sampling">
        <div className="grid grid-cols-2 gap-2">
          <NumberSetting label="Steps" value={form.steps} min={1} onChange={(value) => set('steps', value)} />
          <NumberSetting label="CFG" value={form.cfg} min={0} step="0.1" onChange={(value) => set('cfg', value)} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <TextSetting label="Sampler" value={form.sampler} onChange={(value) => set('sampler', value)} />
          <TextSetting label="Scheduler" value={form.scheduler} onChange={(value) => set('scheduler', value)} />
        </div>
      </Section>

      <Section title="Hires.fix" disabled={!form.hiresEnabled}>
        <div className="grid grid-cols-2 gap-2">
          <NumberSetting label="Scale" value={form.hiresScale} min={1} step="0.05" onChange={(value) => set('hiresScale', value)} />
          <NumberSetting label="Steps" value={form.hiresSteps} min={1} onChange={(value) => set('hiresSteps', value)} />
          <NumberSetting label="CFG" value={form.hiresCfg} min={0} step="0.1" onChange={(value) => set('hiresCfg', value)} />
          <NumberSetting label="Denoise" value={form.hiresDenoise} min={0} max={1} step="0.01" onChange={(value) => set('hiresDenoise', value)} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <TextSetting label="Sampler" value={form.hiresSampler} onChange={(value) => set('hiresSampler', value)} />
          <TextSetting label="Scheduler" value={form.hiresScheduler} onChange={(value) => set('hiresScheduler', value)} />
        </div>
      </Section>

      <Section title="FaceDetailer" disabled={!form.faceDetailerEnabled}>
        <div className="grid grid-cols-2 gap-2">
          <NumberSetting label="Guide Size" value={form.faceGuideSize} min={1} onChange={(value) => set('faceGuideSize', value)} />
          <NumberSetting label="Max Size" value={form.faceMaxSize} min={1} onChange={(value) => set('faceMaxSize', value)} />
          <NumberSetting label="Steps" value={form.faceSteps} min={1} onChange={(value) => set('faceSteps', value)} />
          <NumberSetting label="CFG" value={form.faceCfg} min={0} step="0.1" onChange={(value) => set('faceCfg', value)} />
          <NumberSetting label="Denoise" value={form.faceDenoise} min={0} max={1} step="0.01" onChange={(value) => set('faceDenoise', value)} />
          <NumberSetting label="BBox Threshold" value={form.faceBBoxThreshold} min={0} max={1} step="0.01" onChange={(value) => set('faceBBoxThreshold', value)} />
        </div>
      </Section>

      <Section title="Upscaler" disabled={!form.upscaleEnabled}>
        <TextSetting label="Upscale Model" value={form.upscaleModel} onChange={(value) => set('upscaleModel', value)} />
      </Section>
    </section>
  );
}
