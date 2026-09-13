import { useRef, useState } from 'react';
import { Dialog } from '@/components/modals/Dialog';
import { useI18n } from '@/i18n';

interface SaveToGDriveDialogProps {
  onClose: () => void;
  targetFolder: string;
  onTargetFolderChange: (targetFolder: string) => void;
  onSave: (targetFolder: string) => Promise<void>;
}

const TARGET_FOLDER_PLACEHOLDER = '生成画像\\キャラ名\\シチュ名';

export function SaveToGDriveDialog({
  onClose,
  targetFolder,
  onTargetFolderChange,
  onSave,
}: SaveToGDriveDialogProps) {
  const { t } = useI18n();
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  const handleSave = async () => {
    if (savingRef.current) return;
    savingRef.current = true;
    setError(null);
    setSaving(true);
    try {
      await onSave(targetFolder);
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : '';
      setError(message || t('Google Drive save failed'));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  return (
    <Dialog
      onClose={onClose}
      title={t('Save to Google Drive')}
      description={t('Enter a destination folder relative to the Google Drive root. Backslashes and slashes can be used as folder separators. The file name will be assigned automatically.')}
      disableClose={saving}
      actions={[
        {
          label: t('Cancel'),
          onClick: onClose,
          variant: 'secondary',
          disabled: saving,
        },
        {
          label: saving ? t('Saving') : t('Save'),
          onClick: () => { void handleSave(); },
          variant: 'primary',
          disabled: saving,
        },
      ]}
    >
      <div className="mt-3 shrink-0">
        <label htmlFor="gdrive-target-folder" className="sr-only">
          {t('Google Drive destination folder')}
        </label>
        <input
          id="gdrive-target-folder"
          aria-label={t('Google Drive destination folder')}
          autoFocus
          type="text"
          value={targetFolder}
          onChange={(event) => {
            onTargetFolderChange(event.target.value);
            if (error) setError(null);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
              event.preventDefault();
              void handleSave();
            }
          }}
          placeholder={TARGET_FOLDER_PLACEHOLDER}
          disabled={saving}
          className="w-full rounded-lg border border-white/15 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-400/40 disabled:opacity-60"
        />
        {saving && (
          <div
            role="status"
            aria-label={t('Saving to Google Drive…')}
            className="mt-2 flex items-center gap-2 text-sm text-slate-300"
          >
            <span className="h-4 w-4 rounded-full border-2 border-white/25 border-t-cyan-300 animate-spin" />
            {t('Saving')}
          </div>
        )}
        {error && (
          <div role="alert" className="mt-2 text-sm text-red-300">
            {error}
          </div>
        )}
      </div>
    </Dialog>
  );
}
