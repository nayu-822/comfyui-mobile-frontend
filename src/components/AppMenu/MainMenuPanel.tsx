import type { Workflow } from '@/api/types';
import type { SystemStats } from '@/api/client';
import { MenuErrorNotice } from './MenuErrorNotice';
import { MenuServerSection } from './MenuServerSection';
import { MenuLoadSection } from './MenuLoadSection';
import { MenuSaveSection } from './MenuSaveSection';
import { MenuAboutSection } from './MenuAboutSection';
import { MenuLanguageSection } from './MenuLanguageSection';

interface MenuSectionsOpen {
  load: boolean;
  save: boolean;
  server: boolean;
  info: boolean;
}

interface MainMenuPanelProps {
  error: string | null;
  workflow: Workflow | null;
  currentFilename: string | null;
  isDirty: boolean;
  loading: boolean;
  restartingServer: boolean;
  systemStats: SystemStats | null;
  cpuPercent: number | null;
  menuSectionsOpen: MenuSectionsOpen;
  loadSectionRef: React.RefObject<HTMLElement | null>;
  saveSectionRef: React.RefObject<HTMLElement | null>;
  serverSectionRef: React.RefObject<HTMLElement | null>;
  infoSectionRef: React.RefObject<HTMLElement | null>;
  onDismissError: () => void;
  onLoadFromFile: () => void;
  onToggleSection: (section: keyof MenuSectionsOpen) => void;
  onOpenRecent: () => void;
  onOpenUserWorkflows: () => void;
  onOpenTemplates: () => void;
  onOpenPasteJson: () => void;
  onSave: () => void;
  onOpenSaveAs: () => void;
  onOpenLegend: () => void;
  onRestartServer: () => void;
  onOpenGenerationSettings: () => void;
  onOpenSimpleGeneration: () => void;
  onOpenCustomNodes: () => void;
}

export function MainMenuPanel({
  error,
  workflow,
  currentFilename,
  isDirty,
  loading,
  restartingServer,
  systemStats,
  cpuPercent,
  menuSectionsOpen,
  loadSectionRef,
  saveSectionRef,
  serverSectionRef,
  infoSectionRef,
  onDismissError,
  onLoadFromFile,
  onToggleSection,
  onOpenRecent,
  onOpenUserWorkflows,
  onOpenTemplates,
  onOpenPasteJson,
  onSave,
  onOpenSaveAs,
  onOpenLegend,
  onRestartServer,
  onOpenGenerationSettings,
  onOpenSimpleGeneration,
  onOpenCustomNodes,
}: MainMenuPanelProps) {
  return (
    <div className="pb-8">
      <MenuErrorNotice error={error} onDismiss={onDismissError} />

      <button
        type="button"
        onClick={onOpenSimpleGeneration}
        className="mx-3 mb-3 flex min-h-12 w-[calc(100%-1.5rem)] items-center rounded-xl border border-cyan-400/30 bg-cyan-950/30 px-4 text-left text-sm font-semibold text-cyan-100 hover:bg-cyan-900/40"
      >
        Simple Generation
      </button>

      <MenuServerSection
        open={menuSectionsOpen.server}
        systemStats={systemStats}
        cpuPercent={cpuPercent}
        restartingServer={restartingServer}
        sectionRef={serverSectionRef}
        onToggle={() => onToggleSection('server')}
        onRestartServer={onRestartServer}
        onOpenGenerationSettings={onOpenGenerationSettings}
        onOpenCustomNodes={onOpenCustomNodes}
      />

      <MenuLoadSection
        open={menuSectionsOpen.load}
        sectionRef={loadSectionRef}
        onToggle={() => onToggleSection('load')}
        onLoadFromFile={onLoadFromFile}
        onOpenRecent={onOpenRecent}
        onOpenUserWorkflows={onOpenUserWorkflows}
        onOpenTemplates={onOpenTemplates}
        onOpenPasteJson={onOpenPasteJson}
      />

      <MenuSaveSection
        open={menuSectionsOpen.save}
        workflow={workflow}
        currentFilename={currentFilename}
        isDirty={isDirty}
        loading={loading}
        sectionRef={saveSectionRef}
        onToggle={() => onToggleSection('save')}
        onSave={onSave}
        onOpenSaveAs={onOpenSaveAs}
      />

      <MenuLanguageSection />

      <MenuAboutSection
        open={menuSectionsOpen.info}
        sectionRef={infoSectionRef}
        systemStats={systemStats}
        workflow={workflow}
        onToggle={() => onToggleSection('info')}
        onOpenLegend={onOpenLegend}
      />
    </div>
  );
}
