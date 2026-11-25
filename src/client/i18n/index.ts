import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import type { Language } from '#shared/types.ts';

import { getLocalSetting, setLocalSetting } from '@/lib/local-settings.ts';

import en from './locales/en.ts';
import fr from './locales/fr.ts';
import ptPT from './locales/pt-PT.ts';

/** Each language's own name, shown in language pickers. */
export const LANGUAGE_NAMES: Record<Language, string> = {
  en: 'English',
  'pt-PT': 'Português (Portugal)',
  fr: 'Français',
};

/** The saved preference, else the browser's language, else English. */
export function resolveLanguage(preferred?: string | null): Language {
  const candidates = [preferred, ...(navigator.languages ?? [])].filter(Boolean) as string[];
  for (const candidate of candidates) {
    const lower = candidate.toLowerCase();
    if (lower.startsWith('pt')) return 'pt-PT';
    if (lower.startsWith('fr')) return 'fr';
    if (lower.startsWith('en')) return 'en';
  }
  return 'en';
}

/** Locale for numbers and dates in the interface. */
export function uiLocale(language: string = i18n.language): string {
  switch (language) {
    case 'pt-PT':
      return 'pt-PT';
    case 'fr':
      return 'fr-FR';
    default:
      return 'en-GB';
  }
}

void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    'pt-PT': { translation: ptPT },
    fr: { translation: fr },
  },
  lng: resolveLanguage(getLocalSetting<string | null>('language', null)),
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
  returnNull: false,
});
document.documentElement.lang = i18n.language;

/** Switches the interface language and remembers it on this device. */
export function setLanguage(language: Language) {
  setLocalSetting('language', language);
  if (i18n.language !== language) void i18n.changeLanguage(language);
  document.documentElement.lang = language;
}

export default i18n;
