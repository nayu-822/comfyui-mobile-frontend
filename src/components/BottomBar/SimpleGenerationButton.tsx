import { useSimpleGeneration } from '@/hooks/useSimpleGeneration';
import { useNavigationStore } from '@/hooks/useNavigation';

/** The generation-only action rendered inside the shared application BottomBar. */
export function SimpleGenerationButton() {
  const {
    canGenerate,
    isGenerating,
    error,
    hasLatestImage,
    generate,
    openLatestImage,
  } = useSimpleGeneration();
  const setCurrentPanel = useNavigationStore((state) => state.setCurrentPanel);

  return (
    <div data-testid="simple-generation-controls" className="flex min-w-0 flex-1 items-start gap-2">
      <button
        type="button"
        onClick={() => {
          openLatestImage();
        }}
        disabled={!hasLatestImage}
        aria-label="View latest generated image"
        title="View latest generated image"
        className="min-h-14 shrink-0 rounded-xl border border-cyan-300/40 bg-slate-900 px-3 py-3 text-sm font-semibold text-cyan-100 transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
        data-testid="latest-image-button"
      >
        Latest
      </button>
      <button
        type="button"
        onClick={() => setCurrentPanel('outputs')}
        aria-label="Open outputs"
        title="Open outputs"
        className="min-h-14 shrink-0 rounded-xl border border-cyan-300/40 bg-slate-900 px-3 py-3 text-sm font-semibold text-cyan-100 transition-colors hover:bg-slate-800"
        data-testid="outputs-button"
      >
        Outputs
      </button>
      <div className="min-w-0 flex-1">
        <button
          type="button"
          onClick={() => void generate()}
          disabled={!canGenerate}
          aria-busy={isGenerating}
          className="min-h-14 w-full rounded-xl bg-cyan-400 px-4 py-3 text-lg font-bold text-slate-950 transition-colors hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
          data-testid="simple-generation-button"
        >
          {isGenerating ? 'Queueing…' : 'Generate'}
        </button>
        {error && (
          <p
            role="alert"
            aria-live="assertive"
            className="mt-1 truncate text-center text-[11px] leading-4 text-red-200"
          >
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
