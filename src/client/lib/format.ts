import { uiLocale } from '@/i18n/index.ts';

// Numbers and dates follow the interface language: "8,53" in Portuguese and
// French, "8.53" in English.

const cache = new Map<string, Intl.NumberFormat | Intl.DateTimeFormat | Intl.RelativeTimeFormat>();

function cached<T extends Intl.NumberFormat | Intl.DateTimeFormat | Intl.RelativeTimeFormat>(key: string, create: () => T): T {
  let format = cache.get(key) as T | undefined;
  if (!format) {
    format = create();
    cache.set(key, format);
  }
  return format;
}

/** A number with at most `digits` decimals: "18", "5,5". */
export function formatNumber(value: number, digits = 2, locale = uiLocale()): string {
  return cached(`n:${locale}:${digits}`, () => new Intl.NumberFormat(locale, { maximumFractionDigits: digits })).format(
    value,
  );
}

/** Exactly `digits` decimals: an average arrow, "8.50". */
export function formatFixed(value: number, digits = 2, locale = uiLocale()): string {
  return cached(
    `f:${locale}:${digits}`,
    () => new Intl.NumberFormat(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits }),
  ).format(value);
}

/** "42 %". */
export function formatPercent(share: number, locale = uiLocale()): string {
  return cached(`p:${locale}`, () => new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 0 })).format(
    share,
  );
}

/** A number as typed in a field: no grouping, a comma in French and Portuguese ("5,5"). */
export function fieldNumber(value: number | null, locale = uiLocale()): string {
  if (value === null) return '';
  return cached(`i:${locale}`, () => new Intl.NumberFormat(locale, { maximumFractionDigits: 3, useGrouping: false })).format(
    value,
  );
}

/** Reads a number typed with a comma or a dot; null if it isn't one. */
export function parseNumber(text: string): number | null {
  const clean = text.trim().replace(/\s/g, '').replace(',', '.');
  if (!/^-?(\d+\.?\d*|\.\d+)$/.test(clean)) return null;
  const value = Number(clean);
  return Number.isFinite(value) ? value : null;
}

/** "Sun 26 Oct", with the year when it isn't this year. */
export function formatDay(time: number, locale = uiLocale()): string {
  const date = new Date(time);
  const withYear = date.getFullYear() !== new Date().getFullYear();
  return cached(
    `d:${locale}:${withYear}`,
    () =>
      new Intl.DateTimeFormat(locale, {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        year: withYear ? 'numeric' : undefined,
      }),
  ).format(date);
}

/** "26 Oct" (chart axes). */
export function formatShortDay(time: number, locale = uiLocale()): string {
  return cached(`sd:${locale}`, () => new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' })).format(
    new Date(time),
  );
}

/** "Sunday 26 October" (headings), with the year when it isn't this year. */
export function formatLongDay(time: number, locale = uiLocale()): string {
  const date = new Date(time);
  const withYear = date.getFullYear() !== new Date().getFullYear();
  return cached(
    `ld:${locale}:${withYear}`,
    () =>
      new Intl.DateTimeFormat(locale, {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: withYear ? 'numeric' : undefined,
      }),
  ).format(date);
}

/** "October 2026" (list sections). */
export function formatMonth(time: number, locale = uiLocale()): string {
  return cached(`m:${locale}`, () => new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' })).format(
    new Date(time),
  );
}

/** "10:42". */
export function formatTime(time: number, locale = uiLocale()): string {
  return cached(`t:${locale}`, () => new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' })).format(
    new Date(time),
  );
}

/** `auto` says "today", "yesterday"; `always` says "1 month ago" rather than "last month". */
function relativeFormat(locale: string, numeric: 'auto' | 'always' = 'auto') {
  return cached(`r:${locale}:${numeric}`, () => new Intl.RelativeTimeFormat(locale, { numeric }));
}

/** "today", "yesterday", "3 days ago", "2 weeks ago", "3 months ago". */
export function relativeSpan(days: number, locale = uiLocale()): string {
  const size = Math.abs(days);
  if (size < 7) return relativeFormat(locale).format(days, 'day');
  const format = relativeFormat(locale, 'always');
  if (size < 30) return format.format(Math.trunc(days / 7), 'week');
  if (size < 365) return format.format(Math.trunc(days / 30), 'month');
  return format.format(Math.trunc(days / 365), 'year');
}

/** Whole days from one time to another, by the calendar (not 24-hour spans). */
export function calendarDaysBetween(from: number, to: number): number {
  const day = (time: number) => {
    const date = new Date(time);
    return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  };
  return Math.round((day(to) - day(from)) / 86_400_000);
}

/** "3 min ago" style, for the last sync: seconds, minutes, hours, then days. */
export function relativeTime(time: number, now = Date.now(), locale = uiLocale()): string {
  const seconds = Math.round((time - now) / 1000);
  const format = relativeFormat(locale);
  if (Math.abs(seconds) < 60) return format.format(0, 'second');
  const minutes = Math.round(seconds / 60);
  if (Math.abs(minutes) < 60) return format.format(minutes, 'minute');
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return format.format(hours, 'hour');
  return relativeSpan(calendarDaysBetween(now, time), locale);
}

/** A size in bytes: "245 MB", "1,2 GB". */
export function formatBytes(bytes: number, locale = uiLocale()): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000;
    unit++;
  }
  return `${formatNumber(value, value < 10 && unit > 0 ? 1 : 0, locale)} ${units[unit]}`;
}

/** A length of time in seconds: "3:32", "1:02:05". */
export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = String(total % 60).padStart(2, '0');
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${rest}` : `${minutes}:${rest}`;
}

/** "Sun" (the day of the week, short). */
export function formatWeekday(time: number, locale = uiLocale()): string {
  return cached(`w:${locale}`, () => new Intl.DateTimeFormat(locale, { weekday: 'short' })).format(new Date(time));
}

/** "YYYY-MM-DD" and "HH:MM" of a time, in local time, for date and time fields. */
export function toFieldDateTime(time: number): { date: string; time: string } {
  const date = new Date(time);
  const pad = (value: number) => String(value).padStart(2, '0');
  return {
    date: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    time: `${pad(date.getHours())}:${pad(date.getMinutes())}`,
  };
}

/** The time a date field and a time field say, in local time; null if they aren't valid. */
export function fromFieldDateTime(date: string, time: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const clock = /^(\d{2}):(\d{2})/.exec(time || '00:00');
  if (!match || !clock) return null;
  const value = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(clock[1]), Number(clock[2]));
  return Number.isNaN(value.getTime()) ? null : value.getTime();
}
