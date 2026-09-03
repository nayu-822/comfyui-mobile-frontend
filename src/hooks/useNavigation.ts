import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import {
  DEFAULT_SIMPLE_GENERATION_MODE,
  type SimpleGenerationMode,
} from '@/config/simpleGenerationMode';

export type PanelMode = 'generation' | 'workflow' | 'queue' | 'outputs';

interface NavigationState {
  currentPanel: PanelMode;
  currentGenerationMode: SimpleGenerationMode;
  setCurrentPanel: (panel: PanelMode) => void;
  setCurrentGenerationMode: (mode: SimpleGenerationMode) => void;
}

export const useNavigationStore = create<NavigationState>()(
  persist(
    (set) => ({
      currentPanel: 'generation',
      currentGenerationMode: DEFAULT_SIMPLE_GENERATION_MODE,
      setCurrentPanel: (panel) => {
        set({ currentPanel: panel });
      },
      setCurrentGenerationMode: (mode) => {
        set({ currentGenerationMode: mode, currentPanel: 'generation' });
      },
    }),
    {
      name: 'navigation-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        currentPanel: state.currentPanel,
        currentGenerationMode: state.currentGenerationMode,
      })
    }
  )
);
