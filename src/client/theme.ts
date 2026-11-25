export type ThemePreference = 'auto' | 'light' | 'dark';

const THEME_COLORS = { light: '#f4f4f7', dark: '#0f0f14' };

/**
 * "auto" follows the system through CSS alone; "light" and "dark" force a
 * theme with the data-theme attribute.
 */
export function applyTheme(preference: ThemePreference) {
  const root = document.documentElement;
  if (preference === 'auto') delete root.dataset.theme;
  else root.dataset.theme = preference;

  for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
    const scheme = meta.media.includes('dark') ? 'dark' : 'light';
    meta.content = THEME_COLORS[preference === 'auto' ? scheme : preference];
  }
}
