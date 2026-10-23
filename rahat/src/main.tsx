import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { IconContext } from '@phosphor-icons/react';
import { App } from './App.tsx';
import { interceptLinks, upgradeHashRoute } from './lib/router.ts';

upgradeHashRoute();
interceptLinks();
import '@fontsource-variable/inter';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <IconContext.Provider value={{ size: 18, weight: 'regular' }}>
      <App />
    </IconContext.Provider>
  </StrictMode>,
);

// The service worker caches the app so it opens with no signal. Dev builds skip it
// so it never serves stale code while you edit.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => void navigator.serviceWorker.register('/sw.js'));
}
