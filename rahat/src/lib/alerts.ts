import type { Qty } from './types.ts';
import { ITEMS, ITEM_META } from './types.ts';
import type { State, DispatchState } from './reduce.ts';
import { DUPLICATE_RADIUS_M, QUIET_AFTER_H, SILENT_AFTER_H, carrierLabel } from './config.ts';
import { distanceM, hoursSince, km } from './format.ts';

export type Alert = {
  id: string;
  level: 'red' | 'amber';
  kind: 'unverified' | 'silent' | 'quiet' | 'urgent' | 'blocked' | 'missing' | 'code' | 'unconfirmed' | 'shortage' | 'duplicate';
  title: string;
  detail: string;
  campId?: string;
  dispatchId?: string;
  action?: 'send_team' | 'carry';
};

const UNCONFIRMED_AFTER_H = 3;

function diffText(before: Qty, after: Qty): string | null {
  const lost = ITEMS.filter((k) => after[k] < before[k]).map(
    (k) => `${before[k] - after[k]} ${ITEM_META[k].label.toLowerCase()}`,
  );
  return lost.length ? lost.join(', ') : null;
}

/** Compare each custody count with the one before it. Any drop is reported with the stage it happened at. */
function missingAlerts(d: DispatchState, campName: string): Alert[] {
  const out: Alert[] = [];
  if (d.packed) {
    const short = diffText(d.items, d.packed);
    if (short)
      out.push({
        id: `short-${d.id}`,
        level: 'amber',
        kind: 'missing',
        title: `Packed short for ${campName}`,
        detail: `Warehouse packed ${short} less than approved.`,
        dispatchId: d.id,
        campId: d.campId,
      });
  }
  let prev = d.packed;
  let prevLabel = 'warehouse';
  for (const l of d.loads) {
    const lost = prev ? diffText(prev, l.items) : null;
    if (lost)
      out.push({
        id: `lost-${d.id}-${l.at}`,
        level: 'red',
        kind: 'missing',
        title: `Missing at handover to ${carrierLabel(l.carrier)}`,
        detail: `${lost} fewer than counted by ${prevLabel}. Dispatch ${d.id} to ${campName}.`,
        dispatchId: d.id,
        campId: d.campId,
      });
    prev = l.items;
    prevLabel = carrierLabel(l.carrier);
  }
  if (d.received && prev) {
    const lost = diffText(prev, d.received);
    if (lost)
      out.push({
        id: `recv-${d.id}`,
        level: 'red',
        kind: 'missing',
        title: `Items missing at ${campName}`,
        detail: `Camp counted ${lost} fewer than ${prevLabel} loaded. Dispatch ${d.id}.`,
        dispatchId: d.id,
        campId: d.campId,
      });
  }
  return out;
}

export function buildAlerts(s: State, now: number): Alert[] {
  const out: Alert[] = [];
  const activeTasks = [...s.tasks.values()].filter((t) => t.status !== 'done');
  const teamFor = (campId: string) => activeTasks.find((t) => t.campId === campId);
  const camps = [...s.camps.values()];

  for (const c of camps) {
    const h = hoursSince(c.lastSeen, now);
    const task = teamFor(c.id);
    const teamName = task ? s.teams.find((t) => t.id === task.teamId)?.label : undefined;
    if (h >= QUIET_AFTER_H) {
      const silent = h >= SILENT_AFTER_H;
      out.push({
        id: `seen-${c.id}`,
        level: silent && !task ? 'red' : 'amber',
        kind: silent ? 'silent' : 'quiet',
        title: `${c.name} ${silent ? 'has gone silent' : 'is quiet'}`,
        detail: task
          ? `No word for ${Math.floor(h)} h. ${teamName} is assigned.`
          : `No word for ${Math.floor(h)} h. Last report said ${c.people} people.`,
        campId: c.id,
        action: task ? undefined : 'send_team',
      });
    }
    if (!c.verified)
      out.push({
        id: `new-${c.id}`,
        level: c.report.medical || c.report.trapped ? 'red' : 'amber',
        kind: 'unverified',
        title: `New request: ${c.name}`,
        detail: c.report.phone
          ? `Call ${c.report.phone}${c.report.reporter ? ` (${c.report.reporter})` : ''} to confirm, then mark it verified.`
          : 'No phone number given. Confirm through a team or a known contact before sending.',
        campId: c.id,
      });
    const flags = [c.report.medical && 'medical emergency', c.report.trapped && 'people trapped'].filter(Boolean);
    if (flags.length && !task)
      out.push({
        id: `urgent-${c.id}`,
        level: 'red',
        kind: 'urgent',
        title: `${c.name}: ${flags.join(', ')}`,
        detail: 'No rescue team assigned yet.',
        campId: c.id,
        action: 'send_team',
      });
  }

  for (const d of s.dispatches.values()) {
    const camp = s.camps.get(d.campId);
    const name = camp?.name ?? d.campId;
    const carryTask = activeTasks.find((t) => t.dispatchId === d.id);
    if (d.status === 'blocked' && !carryTask)
      out.push({
        id: `blocked-${d.id}`,
        level: 'red',
        kind: 'blocked',
        title: `Road blocked on the way to ${name}`,
        detail: `${carrierLabel(d.loads.at(-1)?.carrier)} is stuck with the load. Assign a team to carry it on foot.`,
        dispatchId: d.id,
        campId: d.campId,
        action: 'carry',
      });
    if (d.mode === 'foot' && d.status === 'packed' && !carryTask)
      out.push({
        id: `foot-${d.id}`,
        level: 'amber',
        kind: 'blocked',
        title: `Packed load for ${name} needs a team`,
        detail: 'Road is blocked, so this goes on foot.',
        dispatchId: d.id,
        campId: d.campId,
        action: 'carry',
      });
    out.push(...missingAlerts(d, name));
    if (d.delivered && !d.delivered.codeOk)
      out.push({
        id: `code-${d.id}`,
        level: 'red',
        kind: 'code',
        title: `Delivery to ${name} without the camp's code`,
        detail: `${carrierLabel(d.delivered.carrier)} marked it delivered but could not enter the handover code.`,
        dispatchId: d.id,
        campId: d.campId,
      });
    if (d.delivered && !d.received && hoursSince(d.delivered.at, now) >= UNCONFIRMED_AFTER_H)
      out.push({
        id: `unconf-${d.id}`,
        level: 'amber',
        kind: 'unconfirmed',
        title: `${name} has not confirmed a delivery`,
        detail: `Delivered ${Math.floor(hoursSince(d.delivered.at, now))} h ago. Waiting for the camp's count.`,
        dispatchId: d.id,
        campId: d.campId,
      });
  }

  const need = camps.reduce((acc, c) => {
    for (const k of ITEMS) acc[k] += c.need[k];
    return acc;
  }, { food: 0, water: 0, blankets: 0, medicine: 0 } as Qty);
  for (const k of ITEMS) {
    if (need[k] > s.available[k])
      out.push({
        id: `stock-${k}`,
        level: s.available[k] === 0 ? 'red' : 'amber',
        kind: 'shortage',
        title: `Short of ${ITEM_META[k].label.toLowerCase()}`,
        detail: `${need[k].toLocaleString('en-IN')} ${ITEM_META[k].unit} needed, ${s.available[k].toLocaleString('en-IN')} available.`,
      });
  }

  for (let i = 0; i < camps.length; i++)
    for (let j = i + 1; j < camps.length; j++) {
      const a = camps[i];
      const b = camps[j];
      const d = distanceM(a.lat, a.lng, b.lat, b.lng);
      if (d < DUPLICATE_RADIUS_M)
        out.push({
          id: `dup-${a.id}-${b.id}`,
          level: 'amber',
          kind: 'duplicate',
          title: 'Possible duplicate camp',
          detail: `${a.name} and ${b.name} are ${km(d)} apart. Check before sending to both.`,
          campId: b.id,
        });
    }

  const rank = { red: 0, amber: 1 };
  return out.sort((a, b) => rank[a.level] - rank[b.level]);
}
