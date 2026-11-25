import { describe, expect, it } from 'vitest';

import i18n from './index.ts';
import en from './locales/en.ts';
import fr from './locales/fr.ts';
import ptPT from './locales/pt-PT.ts';

type Tree = { [key: string]: string | Tree };

function leaves(tree: Tree, prefix = ''): [string, string][] {
  return Object.entries(tree).flatMap(([key, value]) =>
    typeof value === 'string' ? [[`${prefix}${key}`, value] as [string, string]] : leaves(value, `${prefix}${key}.`),
  );
}

/** Interpolation variables that must survive translation. */
function variables(text: string): string[] {
  return [...text.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map(match => match[1]!).sort();
}

const english = new Map(leaves(en));

describe.each([
  ['pt-PT', ptPT],
  ['fr', fr],
] as const)('%s translation', (language, translation) => {
  const entries = leaves(translation);

  it('has every English key, and no others', () => {
    expect(entries.map(([key]) => key).sort()).toEqual([...english.keys()].sort());
  });

  it('keeps the interpolation variables', () => {
    const mismatches = entries.filter(([key, value]) => {
      const expected = variables(english.get(key) ?? '');
      const actual = variables(value);
      // Singular forms may spell the count out ("Move it to").
      return key.endsWith('_one')
        ? actual.some(variable => !expected.includes(variable))
        : actual.join() !== expected.join();
    });
    expect(mismatches).toEqual([]);
  });

  it('is actually translated', () => {
    const same = entries.filter(
      ([key, value]) => value === english.get(key) && !/^(common\.appName|settings\.version|system\.(ytDlp|ffmpeg))$/.test(key) && !/^[\s{}\w.()+-]*$/.test(value),
    );
    expect(same).toEqual([]);
  });

  it('picks plural forms, falling back to "other" for large numbers', () => {
    const t = i18n.getFixedT(language);
    expect(t('downloads.cleared', { count: 1 })).not.toEqual(t('downloads.cleared', { count: 2 }));
    expect(t('downloads.cleared', { count: 2 })).toContain('2');
    // Portuguese and French have a "many" category (1 000 000); "other" covers it.
    expect(t('downloads.cleared', { count: 1_000_000 })).toContain('1000000');
  });
});
