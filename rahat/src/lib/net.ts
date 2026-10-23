// Works out the connection quality by itself. Three signals, cheapest first:
//   1. navigator.onLine           the phone says it has no network at all
//   2. Network Information API    2g / slow-2g / data saver (Chrome on Android)
//   3. our own sync attempts      failures and slow round trips (catches "connected but no data")

import { useEffect, useState } from 'react';
import type { Box } from './store.ts';

export type NetState = 'online' | 'weak' | 'offline';

type Conn = { effectiveType?: string; saveData?: boolean; rtt?: number; addEventListener?: (t: string, f: () => void) => void; removeEventListener?: (t: string, f: () => void) => void };
const conn = () => (navigator as unknown as { connection?: Conn }).connection;

export function netState(box: Box): NetState {
  if (!navigator.onLine) return 'offline';
  if (box.failures >= 3) return 'offline';
  const c = conn();
  const slowType = c?.effectiveType === '2g' || c?.effectiveType === 'slow-2g';
  if (box.failures > 0 || slowType || (box.rtt ?? 0) > 3000 || (c?.rtt ?? 0) > 1500) return 'weak';
  return 'online';
}

/** Re-renders when the browser's own online/offline or connection type changes. */
export function useNetwork(box: Box): NetState {
  const [, bump] = useState(0);
  useEffect(() => {
    const f = () => bump((n) => n + 1);
    window.addEventListener('online', f);
    window.addEventListener('offline', f);
    conn()?.addEventListener?.('change', f);
    return () => {
      window.removeEventListener('online', f);
      window.removeEventListener('offline', f);
      conn()?.removeEventListener?.('change', f);
    };
  }, []);
  return netState(box);
}
