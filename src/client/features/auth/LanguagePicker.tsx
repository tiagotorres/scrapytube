import { useTranslation } from 'react-i18next';

import { LANGUAGES } from '#shared/types.ts';
import type { Language } from '#shared/types.ts';

import { SegmentedControl } from '@/components/ui/Field.tsx';
import { setLanguage } from '@/i18n/index.ts';

const SHORT_NAMES: Record<Language, string> = {
  en: 'English',
  'pt-PT': 'Português',
  fr: 'Français',
};

/** Switches the interface language before signing in. */
export function LanguagePicker({ className }: { className?: string }) {
  const { t, i18n } = useTranslation();
  return (
    <SegmentedControl
      className={className}
      label={t('settings.language')}
      value={i18n.language as Language}
      onChange={setLanguage}
      options={LANGUAGES.map(language => ({ value: language, label: SHORT_NAMES[language] }))}
    />
  );
}
