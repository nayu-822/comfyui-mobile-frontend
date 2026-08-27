import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const generationState = {
  canGenerate: true,
  isGenerating: false,
  status: null as string | null,
  generate: vi.fn(),
};

vi.mock('@/hooks/useSimpleGeneration', () => ({
  useSimpleGeneration: () => generationState,
}));

import { SimpleGenerationButton } from '../SimpleGenerationButton';

describe('SimpleGenerationButton', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    generationState.canGenerate = true;
    generationState.isGenerating = false;
    generationState.status = null;
    generationState.generate.mockReset();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it('renders a full-width Generate action and delegates submission', async () => {
    await act(async () => root.render(<SimpleGenerationButton />));

    const button = container.querySelector('button') as HTMLButtonElement | null;
    expect(button?.textContent).toBe('Generate');
    expect(button?.disabled).toBe(false);
    expect(button?.className).toContain('w-full');
    expect(container.querySelector('[data-testid="simple-generation-controls"]')).not.toBeNull();

    await act(async () => button?.click());
    expect(generationState.generate).toHaveBeenCalledTimes(1);
  });

  it('reflects disabled, queueing, and status state', async () => {
    generationState.canGenerate = false;
    generationState.isGenerating = true;
    generationState.status = 'Generation queued. Seed: 123';

    await act(async () => root.render(<SimpleGenerationButton />));

    const button = container.querySelector('button') as HTMLButtonElement | null;
    expect(button?.disabled).toBe(true);
    expect(button?.textContent).toBe('Queueing…');
    expect(button?.getAttribute('aria-busy')).toBe('true');
    expect(container.querySelector('[role="status"]')?.textContent)
      .toBe('Generation queued. Seed: 123');
  });
});
