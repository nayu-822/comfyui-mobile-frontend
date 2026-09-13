import { create } from 'zustand';

interface GDriveSaveState {
  lastTargetFolder: string;
  setLastTargetFolder: (targetFolder: string) => void;
}

/** Runtime-only state shared by the Latest and Outputs image viewers. */
export const useGDriveSaveStore = create<GDriveSaveState>()((set) => ({
  lastTargetFolder: '',
  setLastTargetFolder: (lastTargetFolder) => set({ lastTargetFolder }),
}));
