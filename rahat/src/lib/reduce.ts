import type { CampReport, Channel, DispatchApprove, Ev, Qty, TaskKind } from './types.ts';
import { ITEMS, zeroQty } from './types.ts';
import { TEAMS } from './config.ts';

export type CampState = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  acc?: number;
  locSrc: CampReport['locSrc'];
  report: CampReport; // latest report; it replaces earlier ones, never adds to them
  reports: number;
  verified: boolean;
  lastSeen: number;
  lastSeenVia?: Channel;
  people: number;
  onTheWay: Qty; // approved for this camp and not yet delivered
  deliveredSince: Qty; // delivered after the latest report was made
  need: Qty; // what is still uncovered: report - on the way - delivered since
};

export type DispatchStatus = 'approved' | 'packed' | 'in_transit' | 'blocked' | 'delivered' | 'received';

export type DispatchState = {
  id: string;
  campId: string;
  mode: DispatchApprove['mode'];
  truck?: string;
  code?: string;
  codeHash: string;
  items: Qty;
  suggested: Qty;
  reason?: string;
  approvedAt: number;
  packed?: Qty;
  packedAt?: number;
  loads: { carrier: string; items: Qty; at: number }[];
  blocked?: { at: number; lat?: number; lng?: number; note?: string };
  delivered?: { at: number; carrier: string; codeOk: boolean };
  received?: Qty;
  receivedAt?: number;
  status: DispatchStatus;
};

export type TaskState = {
  id: string;
  teamId: string;
  campId: string;
  kind: TaskKind;
  dispatchId?: string;
  note?: string;
  createdAt: number;
  updatedAt: number;
  status: 'assigned' | 'en_route' | 'on_site' | 'done';
  rescued: number;
};

/** Latest shared position of a truck or team, with a short trail. */
export type UnitLive = { lat: number; lng: number; acc?: number; at: number; trail: [number, number][] };

export type TeamState = {
  id: string;
  label: string;
  lead: string;
  lat: number;
  lng: number;
  task?: TaskState;
  status: 'available' | TaskState['status'];
  live?: UnitLive;
  rescued: number; // total over all its tasks
};

export type State = {
  camps: Map<string, CampState>;
  dispatches: Map<string, DispatchState>;
  tasks: Map<string, TaskState>;
  teams: TeamState[];
  units: Map<string, UnitLive>; // live positions by truck or team id
  smsInbox: { id: string; at: number; from?: string; text: string }[]; // plain texts not yet handled
  stock: Qty; // physically in the warehouse
  reserved: Qty; // approved but not packed yet
  available: Qty; // what the officer can still allocate
  events: Ev[];
};

export const addQty = (a: Qty, b: Qty): Qty => {
  const out = { ...a };
  for (const k of ITEMS) out[k] += b[k];
  return out;
};
export const subQty = (a: Qty, b: Qty): Qty => {
  const out = { ...a };
  for (const k of ITEMS) out[k] -= b[k];
  return out;
};
export const clampQty = (a: Qty): Qty => {
  const out = { ...a };
  for (const k of ITEMS) out[k] = Math.max(0, out[k]);
  return out;
};
export const totalQty = (a: Qty) => ITEMS.reduce((s, k) => s + a[k], 0);

/** The quantity a dispatch is carrying right now (the last custody count). */
export function currentLoad(d: DispatchState): Qty {
  return d.loads.at(-1)?.items ?? d.packed ?? d.items;
}

/** What actually arrived: the camp's count if it has confirmed, else the carrier's. */
export function arrivedQty(d: DispatchState): Qty {
  return d.received ?? currentLoad(d);
}

export function isArrived(d: DispatchState) {
  return d.status === 'delivered' || d.status === 'received';
}

function statusOf(d: DispatchState): DispatchStatus {
  if (d.received) return 'received';
  if (d.delivered) return 'delivered';
  const lastLoad = d.loads.at(-1);
  if (d.blocked && (!lastLoad || lastLoad.at <= d.blocked.at)) return 'blocked';
  if (lastLoad) return 'in_transit';
  if (d.packed) return 'packed';
  return 'approved';
}

/** Time order, one copy per id (the first copy to arrive wins). */
export function sortEvents(events: Ev[]): Ev[] {
  const seen = new Set<string>();
  const unique = events.filter((e) => !seen.has(e.id) && !!seen.add(e.id));
  return unique.sort((a, b) => a.at - b.at || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

export function reduce(events: Ev[]): State {
  const evs = sortEvents(events);
  const camps = new Map<string, CampState>();
  const units = new Map<string, UnitLive>();
  const smsAll = new Map<string, { id: string; at: number; from?: string; text: string }>();
  const smsDone = new Set<string>();
  const dispatches = new Map<string, DispatchState>();
  const tasks = new Map<string, TaskState>();
  let stockIn = zeroQty();
  let packedOut = zeroQty();

  // Pass 1: create dispatches and tasks first, so a pack or status event whose
  // device clock ran slightly early still finds its parent.
  for (const e of evs) {
    if (e.type === 'dispatch.approve') {
      dispatches.set(e.dispatchId, {
        id: e.dispatchId,
        campId: e.campId,
        mode: e.mode,
        truck: e.truck,
        code: e.code,
        codeHash: e.codeHash,
        items: e.items,
        suggested: e.suggested,
        reason: e.reason,
        approvedAt: e.at,
        loads: [],
        status: 'approved',
      });
    } else if (e.type === 'team.task') {
      tasks.set(e.taskId, {
        id: e.taskId,
        teamId: e.teamId,
        campId: e.campId,
        kind: e.kind,
        dispatchId: e.dispatchId,
        note: e.note,
        createdAt: e.at,
        updatedAt: e.at,
        status: 'assigned',
        rescued: 0,
      });
    }
  }

  const touch = (campId: string, at: number, via?: Channel) => {
    const c = camps.get(campId);
    if (c && at >= c.lastSeen) {
      c.lastSeen = at;
      c.lastSeenVia = via;
    }
  };

  const verified = new Set(evs.filter((e) => e.type === 'camp.verify').map((e) => (e as { campId: string }).campId));

  // Pass 2: everything else, in the order it happened.
  for (const e of evs) {
    switch (e.type) {
      case 'camp.report': {
        const prev = camps.get(e.campId);
        camps.set(e.campId, {
          id: e.campId,
          name: e.name,
          lat: e.lat,
          lng: e.lng,
          acc: e.acc,
          locSrc: e.locSrc,
          report: e,
          reports: (prev?.reports ?? 0) + 1,
          verified: verified.has(e.campId),
          lastSeen: Math.max(prev?.lastSeen ?? 0, e.at),
          lastSeenVia: e.via,
          people: e.people,
          onTheWay: zeroQty(),
          deliveredSince: zeroQty(),
          need: zeroQty(),
        });
        break;
      }
      case 'camp.checkin': {
        const c = camps.get(e.campId);
        touch(e.campId, e.at, e.via);
        if (c && e.people && e.at > c.report.at) c.people = e.people;
        break;
      }
      case 'stock.in':
        stockIn = addQty(stockIn, e.items);
        break;
      case 'dispatch.pack': {
        const d = dispatches.get(e.dispatchId);
        if (d && !d.packed) {
          d.packed = e.items;
          d.packedAt = e.at;
          packedOut = addQty(packedOut, e.items);
        }
        break;
      }
      case 'dispatch.load': {
        dispatches.get(e.dispatchId)?.loads.push({ carrier: e.carrier, items: e.items, at: e.at });
        break;
      }
      case 'dispatch.blocked': {
        const d = dispatches.get(e.dispatchId);
        if (d) d.blocked = { at: e.at, lat: e.lat, lng: e.lng, note: e.note };
        break;
      }
      case 'dispatch.deliver': {
        const d = dispatches.get(e.dispatchId);
        if (d && !d.delivered) d.delivered = { at: e.at, carrier: e.carrier, codeOk: e.codeOk };
        break;
      }
      case 'dispatch.receive': {
        const d = dispatches.get(e.dispatchId);
        if (d && !d.received) {
          d.received = e.items;
          d.receivedAt = e.at;
        }
        touch(e.campId, e.at, e.via);
        break;
      }
      case 'team.status': {
        const t = e.taskId ? tasks.get(e.taskId) : undefined;
        if (t && e.at >= t.updatedAt) {
          t.status = e.status;
          t.updatedAt = e.at;
          if (e.rescued) t.rescued = e.rescued;
        }
        break;
      }
      case 'sms.text':
        smsAll.set(e.id, { id: e.id, at: e.at, from: e.from, text: e.text });
        break;
      case 'sms.handled':
        smsDone.add(e.smsId);
        break;
      case 'unit.location': {
        const prev = units.get(e.unit);
        const trail = [...(prev?.trail ?? []), [e.lat, e.lng] as [number, number]].slice(-30);
        units.set(e.unit, { lat: e.lat, lng: e.lng, acc: e.acc, at: e.at, trail });
        break;
      }
    }
  }

  let reserved = zeroQty();
  for (const d of dispatches.values()) {
    d.status = statusOf(d);
    if (!d.packed) reserved = addQty(reserved, d.items);
  }

  // Net need per camp. A new report is the camp's current shortfall, so it
  // replaces the old one. Anything still on the way, or delivered after the
  // report was made, is subtracted. This is what stops double sending.
  for (const c of camps.values()) {
    let onTheWay = zeroQty();
    let deliveredSince = zeroQty();
    for (const d of dispatches.values()) {
      if (d.campId !== c.id) continue;
      if (!isArrived(d)) onTheWay = addQty(onTheWay, currentLoad(d));
      else {
        const arrivedAt = Math.min(d.delivered?.at ?? Infinity, d.receivedAt ?? Infinity);
        if (arrivedAt > c.report.at) deliveredSince = addQty(deliveredSince, arrivedQty(d));
      }
    }
    c.onTheWay = onTheWay;
    c.deliveredSince = deliveredSince;
    c.need = clampQty(subQty(subQty(c.report.needs, onTheWay), deliveredSince));
  }

  const teams: TeamState[] = TEAMS.map((t) => {
    const active = [...tasks.values()]
      .filter((k) => k.teamId === t.id && k.status !== 'done')
      .sort((a, b) => b.createdAt - a.createdAt)[0];
    const rescued = [...tasks.values()].filter((k) => k.teamId === t.id).reduce((s, k) => s + k.rescued, 0);
    const live = units.get(t.id);
    return { ...t, task: active, status: active ? active.status : 'available', live, rescued };
  });

  const stock = subQty(stockIn, packedOut);
  return {
    camps,
    dispatches,
    tasks,
    teams,
    units,
    smsInbox: [...smsAll.values()].filter((m) => !smsDone.has(m.id)).sort((a, b) => b.at - a.at),
    stock,
    reserved,
    available: clampQty(subQty(stock, reserved)),
    events: evs,
  };
}
