import { SaveDiskIcon } from '@/components/icons';
import { OverlayCircleButton } from './OverlayCircleButton';
import { useI18n } from '@/i18n';

interface SaveToGDriveButtonProps {
  onClick: () => void;
}

export function SaveToGDriveButton({ onClick }: SaveToGDriveButtonProps) {
  const { t } = useI18n();
  return (
    <OverlayCircleButton
      onClick={onClick}
      ariaLabel={t('Save to GDrive')}
      className="text-white"
      icon={<SaveDiskIcon className="w-5 h-5" />}
    />
  );
}
