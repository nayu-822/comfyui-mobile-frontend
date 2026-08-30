import { useEffect, useRef, useState, type ChangeEvent } from 'react';

function formatValue(value: number): string {
  return Number.isFinite(value) ? String(value) : '';
}

export interface EditableNumberInputProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  className: string;
  labelClass: string;
  step?: string;
  min?: number;
  max?: number;
  defaultValue?: number;
  disabled?: boolean;
  ariaLabel?: string;
  wrapperClassName?: string;
}

/** A number input that keeps an empty/intermediate value while the user edits. */
export function EditableNumberInput({
  label,
  value,
  onChange,
  className,
  labelClass,
  step = '1',
  min,
  max,
  defaultValue,
  disabled = false,
  ariaLabel,
  wrapperClassName = 'block',
}: EditableNumberInputProps) {
  const [draft, setDraft] = useState(() => formatValue(value));
  const draftRef = useRef(draft);
  const isFocusedRef = useRef(false);
  const isDirtyRef = useRef(false);

  useEffect(() => {
    if (!isFocusedRef.current || !isDirtyRef.current) {
      const nextDraft = formatValue(value);
      if (!isFocusedRef.current) isDirtyRef.current = false;
      draftRef.current = nextDraft;
      // External restore/session updates must refresh the visible draft when
      // the user is not actively editing this field.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDraft(nextDraft);
    }
  }, [value]);

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const raw = event.currentTarget.value;
    isDirtyRef.current = true;
    draftRef.current = raw;
    setDraft(raw);

    if (raw !== '') {
      const parsed = Number(raw);
      if (Number.isFinite(parsed)) onChange(parsed);
    }
  };

  const handleBlur = () => {
    isFocusedRef.current = false;
    isDirtyRef.current = false;

    if (draftRef.current.trim() !== '') return;

    const fallback = min ?? defaultValue ?? 0;
    draftRef.current = String(fallback);
    setDraft(String(fallback));
    onChange(fallback);
  };

  return (
    <label className={wrapperClassName}>
      <span className={labelClass}>{label}</span>
      <input
        aria-label={ariaLabel ?? label}
        className={className}
        type="number"
        value={draft}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onFocus={() => { isFocusedRef.current = true; }}
        onChange={handleChange}
        onBlur={handleBlur}
      />
    </label>
  );
}
