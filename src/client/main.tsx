import './styles/global.css';
import './i18n/index.ts';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App.tsx';
import { getLocalSetting } from './lib/local-settings.ts';
import { registerServiceWorker } from './offline/register-sw.ts';
import { applyTheme } from './theme.ts';
import type { ThemePreference } from './theme.ts';

applyTheme(getLocalSetting<ThemePreference>('theme', 'auto'));
registerServiceWorker();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
