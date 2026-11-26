import { forwardRef, useId, useState } from 'react';
import type { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from 'react';
import { useTranslation } from 'react-i18next';

import clsx from 'clsx';
import { Check, Eye, EyeOff, X } from 'lucide-react';

import styles from './Field.module.css';

type FieldShellProps = {
  id: string;
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  className?: string;
  children: ReactNode;
};

function FieldShell({ id, label, hint, error, className, children }: FieldShellProps) {
  return (
    <div className={clsx(styles.field, className)}>
      {label && (
        <label htmlFor={id} className={styles.label}>
          {label}
        </label>
      )}
      {children}
      {error ? (
        <p id={`${id}-message`} className={styles.error} role="alert">
          {error}
        </p>
      ) : (
        hint && (
          <p id={`${id}-message`} className={styles.hint}>
            {hint}
          </p>
        )
      )}
    </div>
  );
}

export type TextFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange'> & {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  onChange: (value: string) => void;
  /** Shows a button that empties the field. */
  clearable?: boolean;
  icon?: ReactNode;
  fieldClassName?: string;
};

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, hint, error, onChange, clearable, icon, fieldClassName, className, id: idProp, value, ...rest },
  ref,
) {
  const { t } = useTranslation();
  const autoId = useId();
  const id = idProp ?? autoId;
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} className={fieldClassName}>
      <div className={clsx(styles.control, error && styles.invalid)}>
        {icon && <span className={styles.icon}>{icon}</span>}
        <input
          ref={ref}
          id={id}
          className={clsx(styles.input, className)}
          value={value}
          onChange={event => onChange(event.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error || hint ? `${id}-message` : undefined}
          {...rest}
        />
        {clearable && value !== '' && (
          <button
            type="button"
            className={styles.inlineButton}
            aria-label={t('common.clear')}
            onClick={() => onChange('')}
          >
            <X size={18} />
          </button>
        )}
      </div>
    </FieldShell>
  );
});

export const PasswordField = forwardRef<HTMLInputElement, Omit<TextFieldProps, 'type' | 'clearable'>>(
  function PasswordField({ label, hint, error, onChange, id: idProp, value, ...rest }, ref) {
    const { t } = useTranslation();
    const autoId = useId();
    const id = idProp ?? autoId;
    const [visible, setVisible] = useState(false);
    return (
      <FieldShell id={id} label={label} hint={hint} error={error}>
        <div className={clsx(styles.control, error && styles.invalid)}>
          <input
            ref={ref}
            id={id}
            type={visible ? 'text' : 'password'}
            className={styles.input}
            value={value}
            onChange={event => onChange(event.target.value)}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            aria-invalid={error ? true : undefined}
            aria-describedby={error || hint ? `${id}-message` : undefined}
            {...rest}
          />
          <button
            type="button"
            className={styles.inlineButton}
            aria-label={visible ? t('auth.hidePassword') : t('auth.showPassword')}
            aria-pressed={visible}
            onClick={() => setVisible(v => !v)}
          >
            {visible ? <EyeOff size={20} /> : <Eye size={20} />}
          </button>
        </div>
      </FieldShell>
    );
  },
);

export type TextAreaFieldProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'onChange'> & {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  onChange: (value: string) => void;
};

export function TextAreaField({ label, hint, error, onChange, id: idProp, ...rest }: TextAreaFieldProps) {
  const autoId = useId();
  const id = idProp ?? autoId;
  return (
    <FieldShell id={id} label={label} hint={hint} error={error}>
      <div className={clsx(styles.control, styles.multiline, error && styles.invalid)}>
        <textarea
          id={id}
          className={clsx(styles.input, styles.textarea)}
          onChange={event => onChange(event.target.value)}
          rows={2}
          {...rest}
        />
      </div>
    </FieldShell>
  );
}

export type DateFieldProps = {
  label: ReactNode;
  value: string | null;
  onChange: (value: string | null) => void;
  /** Allows emptying the field (optional dates). */
  clearable?: boolean;
  hint?: ReactNode;
  max?: string;
  autoFocus?: boolean;
};

/** The phone's own date picker. Values are YYYY-MM-DD. */
export function DateField({ label, value, onChange, clearable, hint, max, autoFocus }: DateFieldProps) {
  const { t } = useTranslation();
  const id = useId();
  return (
    <FieldShell id={id} label={label} hint={hint}>
      <div className={styles.control}>
        <input
          id={id}
          type="date"
          className={clsx(styles.input, styles.date, !value && styles.empty)}
          value={value ?? ''}
          max={max}
          autoFocus={autoFocus}
          onChange={event => onChange(event.target.value || null)}
        />
        {clearable && value && (
          <button
            type="button"
            className={styles.inlineButton}
            aria-label={t('common.clear')}
            onClick={() => onChange(null)}
          >
            <X size={18} />
          </button>
        )}
      </div>
    </FieldShell>
  );
}

export type SegmentedControlProps<T extends string> = {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: ReactNode }[];
  label: string;
  className?: string;
  disabled?: boolean;
};

/** A row of mutually exclusive choices. */
export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  label,
  className,
  disabled,
}: SegmentedControlProps<T>) {
  return (
    <div
      className={clsx(styles.segmented, className)}
      role="radiogroup"
      aria-label={label}
      aria-disabled={disabled || undefined}
    >
      {options.map(option => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          className={styles.segment}
          disabled={disabled}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export type ToggleFieldProps = {
  label: ReactNode;
  hint?: ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
};

/** An on/off switch with its label, and a hint under it. */
export function ToggleField({ label, hint, checked, onChange, disabled }: ToggleFieldProps) {
  const id = useId();
  return (
    <label htmlFor={id} className={clsx(styles.toggle, disabled && styles.toggleDisabled)}>
      <span className={styles.toggleText}>
        <span className={styles.toggleLabel}>{label}</span>
        {hint && <span className={styles.toggleHint}>{hint}</span>}
      </span>
      <input
        id={id}
        type="checkbox"
        role="switch"
        className={styles.toggleInput}
        checked={checked}
        disabled={disabled}
        onChange={event => onChange(event.target.checked)}
      />
      <span className={styles.toggleTrack} aria-hidden />
    </label>
  );
}

export type CheckboxFieldProps = {
  label: ReactNode;
  hint?: ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
};

/** A checkbox with its label, and a hint under it. */
export function CheckboxField({ label, hint, checked, onChange }: CheckboxFieldProps) {
  const id = useId();
  return (
    <label htmlFor={id} className={styles.toggle}>
      <input
        id={id}
        type="checkbox"
        className={styles.toggleInput}
        checked={checked}
        onChange={event => onChange(event.target.checked)}
      />
      <span className={styles.checkbox} aria-hidden>
        <Check size={16} strokeWidth={3} />
      </span>
      <span className={styles.toggleText}>
        <span className={styles.toggleLabel}>{label}</span>
        {hint && <span className={styles.toggleHint}>{hint}</span>}
      </span>
    </label>
  );
}
