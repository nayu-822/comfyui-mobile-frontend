import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GenerationSubmitBar } from '../GenerationPanel';

describe('GenerationSubmitBar', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it('keeps the Generate button in a sticky safe-area-aware container', async () => {
    await act(async () => root.render(
      <GenerationSubmitBar
        disabled={false}
        isGenerating={false}
        onGenerate={() => {}}
        status={null}
        lastUsedSeed={null}
      />,
    ));

    const bar = container.querySelector('[data-testid="generation-submit-bar"]');
    const content = bar?.firstElementChild;
    expect(bar?.className).toContain('sticky');
    expect(bar?.className).toContain('bottom-0');
    expect(container.querySelector('button')?.disabled).toBe(false);
    expect(content?.className).toContain('safe-area-inset-bottom');
  });

  it('preserves disabled state and Queueing status while generating', async () => {
    const onGenerate = vi.fn();

    await act(async () => root.render(
      <GenerationSubmitBar
        disabled
        isGenerating
        onGenerate={onGenerate}
        status="Generation queued. Seed: 123"
        lastUsedSeed={123}
      />,
    ));

    const button = container.querySelector('button') as HTMLButtonElement | null;
    expect(button?.disabled).toBe(true);
    expect(button?.textContent).toBe('Queueing…');
    expect(container.querySelector('[role="status"]')?.textContent).toBe('Generation queued. Seed: 123');
    expect(container.textContent).toContain('Last used seed: 123');
    await act(async () => button?.click());
    expect(onGenerate).not.toHaveBeenCalled();
  });
});
