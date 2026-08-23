import type { PanelMode } from '@/hooks/useNavigation';
import { t } from '@/i18n';

export interface TopBarPanelNavigationItem {
  panel: PanelMode;
  label: string;
  direction: 'left' | 'right';
  jumps: 1 | 2;
}

export interface TopBarPanelNavigationConfig {
  left: TopBarPanelNavigationItem[];
  right: TopBarPanelNavigationItem[];
}

function getPanelLabel(panel: PanelMode): string {
  switch (panel) {
    case 'outputs':
      return t('Outputs');
    case 'generation':
      return 'Simple Generation';
    case 'workflow':
      return t('Workflow');
    case 'queue':
      return t('Queue');
  }
}

// Keep the established navigation geometry for the existing three panels.
// The simple-generation page is an additive entry point and points back to
// Workflow without changing the old panel's left/right jump semantics.
const panelOrder: PanelMode[] = ['outputs', 'workflow', 'queue'];

export function getTopBarPanelNavigation(mode: PanelMode): TopBarPanelNavigationConfig {
  if (mode === 'generation') {
    return {
      left: [],
      right: [{ panel: 'workflow', label: getPanelLabel('workflow'), direction: 'right', jumps: 1 }],
    };
  }
  const currentIndex = panelOrder.indexOf(mode);
  const itemFor = (panel: PanelMode): TopBarPanelNavigationItem => {
    const targetIndex = panelOrder.indexOf(panel);
    return {
      panel,
      label: getPanelLabel(panel),
      direction: targetIndex < currentIndex ? 'left' : 'right',
      jumps: Math.abs(targetIndex - currentIndex) as 1 | 2,
    };
  };

  return {
    left: panelOrder.slice(0, currentIndex).map(itemFor),
    right: panelOrder.slice(currentIndex + 1).map(itemFor),
  };
}
