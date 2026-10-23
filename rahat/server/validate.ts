// Field-level checks for every event type. The server never trusts a phone.
import type { Ev } from '../src/lib/types.ts';
import { EVENT_TYPES, ITEMS } from '../src/lib/types.ts';

const TYPES = new Set<string>(EVENT_TYPES);
const EVENT_ID = /^[0-9a-z]{6,24}$/;
const ENTITY_ID = /^[A-Z0-9-]{2,24}$/;
const ROLES = new Set(['camp', 'control', 'warehouse', 'driver', 'rescue']);
const CHANNELS = new Set(['net', 'sms', 'relay']);
const DAY = 86_400_000;

type R = Record<string, unknown>;
const str = (v: unknown, max = 200) => typeof v === 'string' && v.trim().length > 0 && v.length <= max;
const optStr = (v: unknown, max = 200) => v === undefined || (typeof v === 'string' && v.length <= max);
const int = (v: unknown, max = 1_000_000) => Number.isInteger(v) && (v as number) >= 0 && (v as number) <= max;
const bool = (v: unknown) => typeof v === 'boolean';
const id = (v: unknown) => typeof v === 'string' && ENTITY_ID.test(v);
const qty = (v: unknown) => !!v && typeof v === 'object' && ITEMS.every((k) => int((v as R)[k]));

/** Returns null when valid, otherwise a short reason. */
export function invalid(e: unknown, now = Date.now()): string | null {
  if (!e || typeof e !== 'object') return 'not an object';
  const x = e as R;
  if (typeof x.id !== 'string' || !EVENT_ID.test(x.id)) return 'bad id';
  if (typeof x.type !== 'string' || !TYPES.has(x.type)) return 'unknown type';
  if (typeof x.at !== 'number' || !Number.isFinite(x.at) || x.at < now - 60 * DAY || x.at > now + DAY) return 'time out of range';
  if (!ROLES.has(x.by as string)) return 'bad role';
  if (x.via !== undefined && !CHANNELS.has(x.via as string)) return 'bad channel';
  const t = x.type as Ev['type'];
  switch (t) {
    case 'camp.report': {
      const ok =
        id(x.campId) && str(x.name, 80) && typeof x.lat === 'number' && typeof x.lng === 'number' &&
        Math.abs(x.lat) <= 90 && Math.abs(x.lng) <= 180 && (x.acc === undefined || int(x.acc, 100_000)) &&
        ['gps', 'map', 'manual'].includes(x.locSrc as string) && int(x.people, 100_000) && (x.people as number) > 0 &&
        int(x.children, 100_000) && int(x.elderly, 100_000) && int(x.injured, 100_000) && qty(x.needs) &&
        bool(x.medical) && bool(x.trapped) && bool(x.roadBlocked) && optStr(x.note, 280) && optStr(x.reporter, 80) &&
        (x.phone === undefined || (typeof x.phone === 'string' && /^\+?[0-9 ()-]{6,20}$/.test(x.phone)));
      return ok ? null : 'bad report fields';
    }
    case 'camp.checkin':
      return id(x.campId) && (x.people === undefined || int(x.people, 100_000)) ? null : 'bad check-in';
    case 'camp.verify':
      return id(x.campId) ? null : 'bad verify';
    case 'stock.in':
      return qty(x.items) && optStr(x.note, 120) ? null : 'bad stock';
    case 'dispatch.approve':
      return id(x.dispatchId) && id(x.campId) && qty(x.items) && qty(x.suggested) && ['truck', 'foot'].includes(x.mode as string) &&
        typeof x.code === 'string' && /^\d{4}$/.test(x.code) && typeof x.codeHash === 'string' && /^[0-9a-f]{64}$/.test(x.codeHash) &&
        optStr(x.reason, 500)
        ? null
        : 'bad approval';
    case 'dispatch.pack':
      return id(x.dispatchId) && qty(x.items) ? null : 'bad pack';
    case 'dispatch.load':
      return id(x.dispatchId) && id(x.carrier) && qty(x.items) ? null : 'bad load';
    case 'dispatch.blocked':
      return id(x.dispatchId) && (x.lat === undefined || typeof x.lat === 'number') && (x.lng === undefined || typeof x.lng === 'number') && optStr(x.note, 280)
        ? null
        : 'bad blocked';
    case 'dispatch.deliver':
      return id(x.dispatchId) && id(x.carrier) && bool(x.codeOk) ? null : 'bad delivery';
    case 'dispatch.receive':
      return id(x.dispatchId) && id(x.campId) && qty(x.items) ? null : 'bad receipt';
    case 'team.task':
      return id(x.taskId) && id(x.teamId) && id(x.campId) && ['reach', 'carry', 'evacuate'].includes(x.kind as string) &&
        (x.dispatchId === undefined || id(x.dispatchId)) && optStr(x.note, 280)
        ? null
        : 'bad task';
    case 'team.status':
      return id(x.teamId) && (x.taskId === undefined || id(x.taskId)) && ['en_route', 'on_site', 'done'].includes(x.status as string)
        ? null
        : 'bad status';
  }
}
