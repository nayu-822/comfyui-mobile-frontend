import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export type PanelMode = 'generation' | 'workflow' | 'queue' | 'outputs';

interface NavigationState {
  currentPanel: PanelMode;
  setCurrentPanel: (panel: PanelMode) => void;
}

export const useNavigationStore = create<NavigationState>()(
  persist(
    (set) => ({
      currentPanel: 'generation',
      setCurrentPanel: (panel) => {
        set({ currentPanel: panel });
      }
    }),
    {
      name: 'navigation-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        currentPanel: state.currentPanel
      })
    }
  )
);
