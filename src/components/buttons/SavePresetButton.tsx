import { SaveDiskIcon } from '@/components/icons';
import { OverlayCircleButton } from './OverlayCircleButton';
import { useI18n } from '@/i18n';

interface SavePresetButtonProps {
  onClick: () => void | Promise<void>;
  loading?: boolean;
}

export function SavePresetButton({ onClick, loading = false }: SavePresetButtonProps) {
  const { t } = useI18n();
  return (
    <OverlayCircleButton
      onClick={onClick}
      ariaLabel={loading ? t('Saving preset…') : t('Save preset')}
      disabled={loading}
      className="text-white"
      icon={
        loading ? (
          <div className="w-5 h-5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
        ) : (
          <SaveDiskIcon className="w-5 h-5" />
        )
      }
    />
  );
}
