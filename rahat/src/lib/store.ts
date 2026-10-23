// Offline-first store.
//
// Two scopes live in one browser:
//   public  the requests this phone made for its camp(s), proven by a secret key per camp
//   staff   the signed-in staff member's full view
// Every action is written to the phone first (outbox) and sent when the network
// allows. Events keep the id they were born with, so retries and the SMS
// fallback never double count.

import { useSyncExternalStore } from 'react';
import type { Ev } from './types.ts';
import { newId } from './types.ts';
import type { State } from './reduce.ts';
import { reduce } from './reduce.ts';
import { getAuth, sessionExpired } from './auth.ts';

export type Scope = 'public' | 'staff';

export type Box = {
  events: Ev[];
  outbox: string[];
  cursor: number;
  epoch?: string;
  owner?: string; // staff user id the data belongs to
  lastSync?: number;
  lastError?: string;
  failures: number; // consecutive failed syncs
  rtt?: number; // last round trip, ms
};

const KEY = { public: 'rahat:v2:public', staff: 'rahat:v2:staff' } as const;
const KEYS = 'rahat:v2:camp-keys';

const blank = (): Box => ({ events: [], outbox: [], cursor: 0, failures: 0 });

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}
function persist(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota or private mode: keep working in memory */
  }
}

const boxes: Record<Scope, Box> = { public: load(KEY.public, blank()), staff: load(KEY.staff, blank()) };
const known: Record<Scope, Set<string>> = {
  public: new Set(boxes.public.events.map((e) => e.id)),
  staff: new Set(boxes.staff.events.map((e) => e.id)),
};
/** campId -> secret key. Only this phone (and the server, as a hash) knows it. */
let campKeys: Record<string, string> = load(KEYS, {});

let version = 0;
const listeners = new Set<() => void>();
function emit() {
  version += 1;
  listeners.forEach((l) => l());
}
const save = (scope: Scope) => persist(KEY[scope], boxes[scope]);

const cache = new Map<Scope, { events: Ev[]; state: State }>();
export function getState(scope: Scope): State {
  const hit = cache.get(scope);
  if (hit && hit.events === boxes[scope].events) return hit.state;
  const state = reduce(boxes[scope].events);
  cache.set(scope, { events: boxes[scope].events, state });
  return state;
}

export function useStore(scope: Scope) {
  useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => version,
  );
  return { box: boxes[scope], state: getState(scope) };
}

export const myCampIds = () => Object.keys(campKeys);

/** A new camp gets a long random key the first time this phone reports for it. */
export function registerCamp(campId: string) {
  if (!campKeys[campId]) {
    campKeys = { ...campKeys, [campId]: newId(32) };
    persist(KEYS, campKeys);
  }
}

export function record(scope: Scope, ev: Ev): boolean {
  const b = boxes[scope];
  if (known[scope].has(ev.id)) return false;
  b.events = [...b.events, ev];
  b.outbox = [...b.outbox, ev.id];
  known[scope].add(ev.id);
  save(scope);
  emit();
  void sync(scope);
  return true;
}

/** Staff data belongs to one account. A different person signing in on this phone starts clean. */
export function claimStaff(userId: string) {
  const b = boxes.staff;
  if (b.owner === userId) return;
  if (b.owner && b.outbox.length) return; // never silently drop someone's unsent work
  boxes.staff = { ...blank(), owner: userId };
  known.staff.clear();
  save('staff');
  emit();
}
export const staffUnsent = () => boxes.staff.outbox.length;

// ---------------------------------------------------------------- sync

type Result = { accepted: string[]; rejected: { id: string; error: string }[] };

async function call(url: string, init?: RequestInit) {
  const r = await fetch(url, {
    credentials: 'same-origin',
    ...init,
    headers: init?.body ? { 'content-type': 'application/json' } : undefined,
    signal: AbortSignal.timeout(15_000),
  });
  if (r.status === 401) {
    sessionExpired();
    throw new Error('Signed out. Sign in again to send.');
  }
  if (!r.ok) throw new Error(`Server error (${r.status})`);
  return r.json();
}

function settle(b: Box, sent: Ev[], res: Result) {
  // Rejected events are dropped too: retrying a refused event can never succeed.
  const done = new Set([...res.accepted, ...res.rejected.map((r) => r.id)]);
  b.outbox = b.outbox.filter((id) => !done.has(id) || !sent.some((e) => e.id === id));
  if (res.rejected.length) b.lastError = `The server refused ${res.rejected.length} update(s): ${res.rejected[0].error}`;
}

function merge(scope: Scope, events: Ev[]) {
  const b = boxes[scope];
  const fresh = events.filter((e) => !known[scope].has(e.id));
  if (fresh.length) {
    b.events = [...b.events, ...fresh];
    fresh.forEach((e) => known[scope].add(e.id));
  }
}

const busy = new Set<Scope>();

export async function sync(scope: Scope) {
  const b = boxes[scope];
  if (busy.has(scope)) return;
  if (!navigator.onLine) {
    b.lastError = 'offline';
    emit();
    return;
  }
  if (scope === 'public' && !myCampIds().length) return;
  if (scope === 'staff' && getAuth().status !== 'in') return;
  busy.add(scope);
  const t0 = performance.now();
  try {
    const pending = b.outbox.map((id) => b.events.find((e) => e.id === id)).filter((e): e is Ev => !!e);
    if (scope === 'public') {
      if (pending.length)
        settle(b, pending, await call('/api/public/events', { method: 'POST', body: JSON.stringify({ events: pending, keys: campKeys }) }));
      const { events } = await call('/api/public/pull', { method: 'POST', body: JSON.stringify({ keys: campKeys }) });
      merge(scope, events);
    } else {
      if (pending.length) settle(b, pending, await call('/api/events', { method: 'POST', body: JSON.stringify({ events: pending }) }));
      let pull = await call(`/api/events?since=${b.epoch ? b.cursor : 0}`);
      if (b.epoch && pull.epoch !== b.epoch) {
        // The server's data was replaced (restore from backup). Start this copy over.
        b.events = b.events.filter((e) => b.outbox.includes(e.id));
        known.staff = new Set(b.events.map((e) => e.id));
        pull = await call('/api/events?since=0');
      }
      merge(scope, pull.events);
      b.cursor = pull.cursor;
      b.epoch = pull.epoch;
    }
    b.rtt = performance.now() - t0;
    b.failures = 0;
    b.lastSync = Date.now();
    if (!b.lastError?.startsWith('The server refused')) b.lastError = undefined;
  } catch (err) {
    b.failures += 1;
    b.lastError = err instanceof Error && err.name !== 'TimeoutError' && err.name !== 'TypeError' ? err.message : 'no connection';
  } finally {
    busy.delete(scope);
    save(scope);
    emit();
  }
}

export function syncAll() {
  void sync('public');
  void sync('staff');
}
