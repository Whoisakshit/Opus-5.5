// Staff session on the client. The session itself is an HttpOnly cookie the
// page cannot read; we keep only the user's name and role so a driver whose
// phone loses signal mid-shift can keep working offline.

import { useSyncExternalStore } from 'react';
import type { StaffRole } from './types.ts';

export type StaffUser = { id: string; username: string; name: string; role: StaffRole; unit?: string; active: boolean };
type Auth = { status: 'loading' | 'out' | 'in'; user?: StaffUser; offline?: boolean };

const CACHE = 'rahat:v2:me';
let auth: Auth = { status: 'loading' };
const listeners = new Set<() => void>();
const set = (a: Auth) => {
  auth = a;
  listeners.forEach((l) => l());
};

function cached(): StaffUser | undefined {
  try {
    return JSON.parse(localStorage.getItem(CACHE) ?? 'null') ?? undefined;
  } catch {
    return undefined;
  }
}
function remember(u?: StaffUser) {
  try {
    if (u) localStorage.setItem(CACHE, JSON.stringify(u));
    else localStorage.removeItem(CACHE);
  } catch {
    /* storage unavailable */
  }
}

export async function loadSession() {
  try {
    const r = await fetch('/api/auth/me', { credentials: 'same-origin' });
    if (r.status === 401) {
      remember();
      return set({ status: 'out' });
    }
    if (!r.ok) throw new Error();
    const { user } = await r.json();
    remember(user);
    set({ status: 'in', user });
  } catch {
    // No connection: trust the last known session until the server can say otherwise.
    const u = cached();
    set(u ? { status: 'in', user: u, offline: true } : { status: 'out' });
  }
}

export async function signIn(username: string, password: string): Promise<string | null> {
  try {
    const r = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) return body.error ?? 'Could not sign in.';
    remember(body.user);
    set({ status: 'in', user: body.user });
    return null;
  } catch {
    return 'No connection to the server. Signing in needs signal once; after that the app works offline.';
  }
}

export async function signOut() {
  remember();
  set({ status: 'out' });
  await fetch('/api/auth/logout', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }).catch(() => {});
}

/** Called by sync when the server rejects the session (expired, deactivated, password changed). */
export function sessionExpired() {
  remember();
  set({ status: 'out' });
}

export const getAuth = () => auth;

export function useAuth(): Auth {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => auth,
  );
}

export const HOME: Record<StaffRole, string> = {
  control: '/admin',
  warehouse: '/warehouse',
  driver: '/driver',
  rescue: '/rescue',
};
