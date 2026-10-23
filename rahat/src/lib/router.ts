// A tiny history router: real paths (/admin, /rescue, ...) without a library.
// The server and Vite both answer unknown paths with index.html, so a reload or
// a pasted link lands on the right screen.

import { useSyncExternalStore } from 'react';

const EVT = 'rahat:navigate';

export function navigate(to: string, replace = false) {
  if (to === location.pathname + location.search) return;
  history[replace ? 'replaceState' : 'pushState'](null, '', to);
  window.dispatchEvent(new Event(EVT));
}

export function usePath(): string {
  return useSyncExternalStore(
    (cb) => {
      window.addEventListener('popstate', cb);
      window.addEventListener(EVT, cb);
      return () => {
        window.removeEventListener('popstate', cb);
        window.removeEventListener(EVT, cb);
      };
    },
    () => location.pathname.replace(/\/+$/, '') || '/',
  );
}

/** Plain <a href="/..."> links move within the app instead of reloading it. */
export function interceptLinks() {
  document.addEventListener('click', (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = (e.target as Element | null)?.closest?.('a');
    if (!a || a.target || a.hasAttribute('download')) return;
    const url = new URL(a.href, location.href);
    if (url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
    if (url.hash && url.pathname === location.pathname) return; // in-page anchor
    e.preventDefault();
    navigate(url.pathname + url.search);
  });
}

/** Links from before the switch to real paths (#/staff/driver, #/request) still work. */
export function upgradeHashRoute() {
  const old = location.hash.match(/^#\/(.*)$/)?.[1];
  if (old === undefined) return;
  const map: Record<string, string> = {
    '': '/',
    request: '/request',
    staff: '/login',
    'staff/control': '/admin',
    'staff/accounts': '/admin/staff',
    'staff/warehouse': '/warehouse',
    'staff/driver': '/driver',
    'staff/rescue': '/rescue',
  };
  history.replaceState(null, '', map[old] ?? '/');
}
