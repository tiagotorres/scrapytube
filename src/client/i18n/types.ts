import type en from './locales/en.ts';

type DeepStringRecord<T> = {
  [K in keyof T]: T[K] extends string ? string : DeepStringRecord<T[K]>;
};

/**
 * Shape every translation must follow. The Portuguese and French files are
 * typed with it, so a missing key is a compile error.
 */
export type Translation = DeepStringRecord<typeof en>;

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation';
    resources: { translation: typeof en };
    returnNull: false;
  }
}
