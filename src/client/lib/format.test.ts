import { describe, expect, it } from 'vitest';

import { calendarDaysBetween, fieldNumber, formatBytes, formatDuration, formatFixed, parseNumber } from './format.ts';

describe('numbers', () => {
  it('follows the language', () => {
    expect(formatFixed(8.5, 2, 'en-GB')).toBe('8.50');
    expect(formatFixed(8.5, 2, 'fr-FR')).toBe('8,50');
    expect(fieldNumber(5.5, 'pt-PT')).toBe('5,5');
    expect(fieldNumber(null)).toBe('');
  });

  it('reads numbers typed with a comma or a dot', () => {
    expect(parseNumber('5,5')).toBe(5.5);
    expect(parseNumber(' 18 ')).toBe(18);
    expect(parseNumber('.5')).toBe(0.5);
    expect(parseNumber('-1,25')).toBe(-1.25);
    expect(parseNumber('')).toBeNull();
    expect(parseNumber('abc')).toBeNull();
    expect(parseNumber('1.2.3')).toBeNull();
  });

  it('shows sizes in bytes, kilobytes, megabytes…', () => {
    expect(formatBytes(512, 'en-GB')).toBe('512 B');
    expect(formatBytes(245_300_000, 'en-GB')).toBe('245 MB');
    expect(formatBytes(1_234_000_000, 'pt-PT')).toBe('1,2 GB');
  });

  it('shows durations like a player', () => {
    expect(formatDuration(19)).toBe('0:19');
    expect(formatDuration(212)).toBe('3:32');
    expect(formatDuration(3725)).toBe('1:02:05');
  });
});

describe('dates', () => {
  it('counts calendar days', () => {
    const evening = new Date(2026, 9, 25, 23).getTime();
    const morning = new Date(2026, 9, 26, 7).getTime();
    expect(calendarDaysBetween(evening, morning)).toBe(1);
    expect(calendarDaysBetween(morning, morning)).toBe(0);
  });
});
