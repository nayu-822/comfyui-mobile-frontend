import { useSimpleGeneration } from '@/hooks/useSimpleGeneration';

/** The generation-only action rendered inside the shared application BottomBar. */
export function SimpleGenerationButton() {
  const {
    canGenerate,
    isGenerating,
    status,
    generate,
  } = useSimpleGeneration();

  return (
    <div data-testid="simple-generation-controls" className="min-w-0 flex-1">
      <button
        type="button"
        onClick={() => void generate()}
        disabled={!canGenerate}
        aria-busy={isGenerating}
        className="min-h-14 w-full rounded-xl bg-cyan-400 px-4 py-3 text-lg font-bold text-slate-950 transition-colors hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isGenerating ? 'Queueing…' : 'Generate'}
      </button>
      {status && (
        <p
          role="status"
          aria-live="polite"
          className="mt-1 truncate text-center text-[11px] leading-4 text-slate-400"
        >
          {status}
        </p>
      )}
    </div>
  );
}
