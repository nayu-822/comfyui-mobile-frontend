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

  it('places the fixed Generate bar above the measured bottom navigation', async () => {
    await act(async () => root.render(
      <GenerationSubmitBar
        disabled={false}
        isGenerating={false}
        onGenerate={() => {}}
        status={null}
      />,
    ));

    const bar = container.querySelector('[data-testid="generation-submit-bar"]');
    const content = bar?.firstElementChild;
    expect(bar?.className).toContain('fixed');
    expect(bar?.className).not.toContain('bottom-0');
    expect(bar?.className).toContain('left-0');
    expect(bar?.className).toContain('right-0');
    expect((bar as HTMLElement | null)?.style.bottom).toBe('var(--bottom-bar-offset, 80px)');
    expect(container.querySelector('button')?.disabled).toBe(false);
    expect(content?.className).toContain('max-w-2xl');
    expect(content?.className).toContain('px-3');
    // BottomBar's measured offset already includes its safe-area padding; the
    // Generate bar must not add the same inset a second time.
    expect(content?.className).not.toContain('safe-area-inset-bottom');
  });

  it('preserves disabled state and Queueing status while generating', async () => {
    const onGenerate = vi.fn();

    await act(async () => root.render(
      <GenerationSubmitBar
        disabled
        isGenerating
        onGenerate={onGenerate}
        status="Generation queued. Seed: 123"
      />,
    ));

    const button = container.querySelector('button') as HTMLButtonElement | null;
    expect(button?.disabled).toBe(true);
    expect(button?.textContent).toBe('Queueing…');
    expect(container.querySelector('[role="status"]')?.textContent).toBe('Generation queued. Seed: 123');
    expect(container.textContent).not.toContain('Last used seed');
    await act(async () => button?.click());
    expect(onGenerate).not.toHaveBeenCalled();
  });
});
