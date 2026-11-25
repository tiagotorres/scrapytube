import { describe, expect, it } from 'vitest';

import { USERNAME_PATTERN, suggestUsername } from './validation.ts';

describe('suggestUsername', () => {
  it('uses the first name, without accents or capitals', () => {
    expect(suggestUsername('Ana Maria')).toBe('ana');
    expect(suggestUsername('  João Silva ')).toBe('joao');
    expect(suggestUsername('Zoë')).toBe('zoe');
  });

  it('gives something the server accepts', () => {
    expect(USERNAME_PATTERN.test(suggestUsername('Tiago'))).toBe(true);
    expect(USERNAME_PATTERN.test(suggestUsername(''))).toBe(false);
  });
});
