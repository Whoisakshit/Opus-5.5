// One message format, three ways to travel. The same short text can go by SMS,
// inside a QR code that a driver or rescue team carries back into coverage, or
// be read out over police wireless. It keeps the event id, so if the same
// report later also arrives over the internet it is counted once.
//
//   RAHAT R k3f9q2m1xa c=MLD t=mb8c3k p=210 v=46.30.4 f=420 w=160 b=90 m=6 x=MT l=30.3297,78.1468 a=12 s=g n=GIC_Maldevta *4Q
//
// The 2-character checksum at the end catches typing mistakes in a relay.

import type { CampCheckin, CampReport, Channel, DispatchReceive, Qty } from './types.ts';

export type Encodable = CampReport | CampCheckin | DispatchReceive;
export type Decoded = { ok: true; ev: Encodable } | { ok: false; error: string };

const PREFIX = 'RAHAT';
const SRC = { gps: 'g', map: 'm', manual: 'k' } as const;
const SRC_BACK: Record<string, CampReport['locSrc']> = { g: 'gps', m: 'map', k: 'manual' };

export function checksum(body: string): string {
  let h = 0x811c9dc5; // FNV-1a
  const s = body.toUpperCase();
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return (h % 1296).toString(36).padStart(2, '0').toUpperCase();
}

const minutes36 = (ms: number) => Math.round(ms / 60_000).toString(36);
const fromMinutes36 = (s: string) => parseInt(s, 36) * 60_000;
const safeName = (n: string) =>
  n
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^\p{L}\p{N}_.,()-]/gu, '')
    .slice(0, 32);

const qtyParts = (q: Qty) => [`f=${q.food}`, `w=${q.water}`, `b=${q.blankets}`, `m=${q.medicine}`];

export function encode(e: Encodable): string {
  const p: string[] = [PREFIX];
  if (e.type === 'camp.report') {
    const flags = (e.medical ? 'M' : '') + (e.trapped ? 'T' : '') + (e.roadBlocked ? 'R' : '');
    p.push('R', e.id, `c=${e.campId}`, `t=${minutes36(e.at)}`, `p=${e.people}`);
    p.push(`v=${e.children}.${e.elderly}.${e.injured}`, ...qtyParts(e.needs));
    if (flags) p.push(`x=${flags}`);
    p.push(`l=${e.lat.toFixed(4)},${e.lng.toFixed(4)}`);
    if (e.acc) p.push(`a=${Math.round(e.acc)}`);
    p.push(`s=${SRC[e.locSrc]}`, `n=${safeName(e.name)}`);
  } else if (e.type === 'camp.checkin') {
    p.push('K', e.id, `c=${e.campId}`, `t=${minutes36(e.at)}`);
    if (e.people) p.push(`p=${e.people}`);
  } else {
    p.push('D', e.id, `c=${e.campId}`, `t=${minutes36(e.at)}`, `d=${e.dispatchId}`, ...qtyParts(e.items));
  }
  const body = p.join(' ');
  return `${body} *${checksum(body)}`;
}

/** SMS segments: 160 chars for plain text, 70 once any non-Latin character appears. */
export function smsParts(text: string): number {
  const unicode = /[^\x00-\x7F]/.test(text);
  const per = unicode ? 70 : 160;
  return text.length <= per ? 1 : Math.ceil(text.length / (unicode ? 67 : 153));
}

const MAX = 1_000_000;

function int(v: string | undefined, field: string): number {
  if (v === undefined || !/^\d+$/.test(v)) throw new Error(`"${field}" is missing or not a number`);
  const n = Number(v);
  if (n > MAX) throw new Error(`"${field}" is too large`);
  return n;
}

function qty(kv: Map<string, string>): Qty {
  return { food: int(kv.get('f'), 'f'), water: int(kv.get('w'), 'w'), blankets: int(kv.get('b'), 'b'), medicine: int(kv.get('m'), 'm') };
}

export function decode(text: string, via: Channel): Decoded {
  const clean = text.trim().replace(/\s+/g, ' ');
  const m = clean.match(/^(.*) \*([0-9A-Za-z]{2})$/);
  if (!m) return { ok: false, error: 'The code is incomplete. It must end with * and two characters.' };
  const [, body, sum] = m;
  if (checksum(body) !== sum.toUpperCase())
    return { ok: false, error: 'Checksum does not match. A character was probably mistyped.' };
  const [prefix, kind, rawId, ...rest] = body.split(' ');
  if (prefix.toUpperCase() !== PREFIX || !rawId) return { ok: false, error: 'This is not a Rahat message.' };
  const kv = new Map<string, string>();
  for (const t of rest) {
    const i = t.indexOf('=');
    if (i > 0) kv.set(t.slice(0, i).toLowerCase(), t.slice(i + 1));
  }
  const id = rawId.toLowerCase();
  const campId = kv.get('c')?.toUpperCase();
  const t = kv.get('t');
  if (!campId || !t || !/^[0-9a-z]+$/i.test(t)) return { ok: false, error: 'Camp or time is missing.' };
  const at = fromMinutes36(t.toLowerCase());
  try {
    switch (kind.toUpperCase()) {
      case 'R': {
        const [lat, lng] = (kv.get('l') ?? '').split(',').map(Number);
        if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180)
          return { ok: false, error: 'Location is missing or invalid.' };
        const [children = 0, elderly = 0, injured = 0] = (kv.get('v') ?? '0.0.0').split('.').map((v) => int(v, 'v'));
        const flags = (kv.get('x') ?? '').toUpperCase();
        const acc = kv.get('a');
        return {
          ok: true,
          ev: {
            type: 'camp.report',
            id,
            at,
            by: 'camp',
            via,
            campId,
            name: (kv.get('n') ?? campId).replace(/_/g, ' '),
            lat,
            lng,
            acc: acc ? int(acc, 'a') : undefined,
            locSrc: SRC_BACK[kv.get('s') ?? 'k'] ?? 'manual',
            people: int(kv.get('p'), 'p'),
            children,
            elderly,
            injured,
            needs: qty(kv),
            medical: flags.includes('M'),
            trapped: flags.includes('T'),
            roadBlocked: flags.includes('R'),
          },
        };
      }
      case 'K': {
        const p = kv.get('p');
        return { ok: true, ev: { type: 'camp.checkin', id, at, by: 'camp', via, campId, people: p ? int(p, 'p') : undefined } };
      }
      case 'D': {
        const dispatchId = kv.get('d')?.toUpperCase();
        if (!dispatchId) return { ok: false, error: 'Dispatch number is missing.' };
        return { ok: true, ev: { type: 'dispatch.receive', id, at, by: 'camp', via, campId, dispatchId, items: qty(kv) } };
      }
      default:
        return { ok: false, error: `Unknown message type "${kind}".` };
    }
  } catch (err) {
    return { ok: false, error: `Could not read the message: ${(err as Error).message}.` };
  }
}

export function describe(e: Encodable): string {
  if (e.type === 'camp.report')
    return `Needs report from ${e.name}: ${e.people} people, food ${e.needs.food}, water ${e.needs.water}, blankets ${e.needs.blankets}, medicine ${e.needs.medicine}`;
  if (e.type === 'camp.checkin') return `Check-in from camp ${e.campId}${e.people ? `, ${e.people} people` : ''}`;
  return `Receipt from camp ${e.campId} for dispatch ${e.dispatchId}`;
}
