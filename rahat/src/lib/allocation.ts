// Fair allocation when stock is short.
//
// 1. Each camp gets a transparent priority score (0-100) built from parts the
//    officer can read and challenge. No hidden model.
// 2. For every item, the available stock is split with weighted max-min
//    fairness ("water-filling"): every camp with a need rises together, higher
//    priority camps rise faster, and no camp gets more than it asked for.
//    So no camp is left at zero while another gets a second helping.
// 3. The result is only a suggestion. The officer edits and approves it.

import type { Item, Qty } from './types.ts';
import { ITEMS, zeroQty } from './types.ts';
import type { CampState, State } from './reduce.ts';
import { totalQty } from './reduce.ts';
import { hoursSince } from './format.ts';
import { SILENT_AFTER_H } from './config.ts';

export type ScorePart = { label: string; pts: number; max: number };
export type Score = { total: number; parts: ScorePart[] };

export function priority(c: CampState, now: number): Score {
  const r = c.report;
  const vulnShare = (r.children + r.elderly + r.injured) / Math.max(1, r.people);
  const asked = ITEMS.filter((k) => r.needs[k] > 0);
  const uncovered = asked.length ? asked.reduce((s, k) => s + c.need[k] / r.needs[k], 0) / asked.length : 0;
  const waitingH = totalQty(c.deliveredSince) === 0 ? Math.min(24, hoursSince(r.at, now)) : 0;
  const parts: ScorePart[] = [
    // Full points once half the camp is a child under 5, elderly, or injured.
    { label: 'Vulnerable people', pts: Math.round(Math.min(1, vulnShare / 0.5) * 30), max: 30 },
    { label: 'Medical emergency', pts: r.medical ? 20 : 0, max: 20 },
    { label: 'People trapped', pts: r.trapped ? 15 : 0, max: 15 },
    { label: 'Share of need still uncovered', pts: Math.round(uncovered * 15), max: 15 },
    { label: 'Waiting with nothing received', pts: Math.round((waitingH / 24) * 20), max: 20 },
  ];
  return { total: parts.reduce((s, p) => s + p.pts, 0), parts };
}

/** Score 0..100 becomes an allocation weight 1..3. */
export const weightOf = (score: number) => 1 + score / 50;

/**
 * Weighted max-min fair split of `supply` across `demand`.
 * Finds the water level L so that sum(min(d_i, L * w_i)) = supply.
 * Returns fractional shares; use roundShares for whole units.
 */
export function waterfill(demand: number[], weight: number[], supply: number): number[] {
  const out = demand.map(() => 0);
  const total = demand.reduce((s, d) => s + d, 0);
  if (supply >= total) return demand.slice();
  const order = demand
    .map((_, i) => i)
    .filter((i) => demand[i] > 0 && weight[i] > 0)
    .sort((a, b) => demand[a] / weight[a] - demand[b] / weight[b]);
  let left = supply;
  let wSum = order.reduce((s, i) => s + weight[i], 0);
  let k = 0;
  // Camps whose whole demand fits under the current water level are filled first.
  for (; k < order.length; k++) {
    const i = order[k];
    if ((demand[i] / weight[i]) * wSum <= left) {
      out[i] = demand[i];
      left -= demand[i];
      wSum -= weight[i];
    } else break;
  }
  const level = wSum > 0 ? left / wSum : 0;
  for (; k < order.length; k++) out[order[k]] = level * weight[order[k]];
  return out;
}

/** Whole units: floor everything, then hand out the leftover units by largest remainder, ties to higher weight. */
export function roundShares(frac: number[], demand: number[], weight: number[], supply: number): number[] {
  const out = frac.map((f) => Math.floor(f + 1e-9));
  let left = Math.min(Math.floor(supply), demand.reduce((s, d) => s + d, 0)) - out.reduce((s, v) => s + v, 0);
  const order = frac
    .map((_, i) => i)
    .filter((i) => out[i] < demand[i])
    .sort((a, b) => frac[b] - out[b] - (frac[a] - out[a]) || weight[b] - weight[a]);
  for (const i of order) {
    if (left <= 0) break;
    out[i] += 1;
    left -= 1;
  }
  return out;
}

/** Jain's fairness index: 1 when every camp gets the same share of its need, 1/n when one camp gets everything. */
export function jain(xs: number[]): number | null {
  if (!xs.length) return null;
  const sum = xs.reduce((s, x) => s + x, 0);
  const sq = xs.reduce((s, x) => s + x * x, 0);
  return sq === 0 ? null : (sum * sum) / (xs.length * sq);
}

export type PlanRow = {
  campId: string;
  name: string;
  score: Score;
  need: Qty;
  suggest: Qty;
  mode: 'truck' | 'foot';
  stale: boolean; // camp has gone silent; its report may be out of date
  verified: boolean; // a new public request the control room has not confirmed yet
};

export type PlanStats = {
  used: Qty;
  over: Item[]; // items where the plan uses more than is available
  fairness: number | null;
  campsWithNothing: number;
};

export function planStats(rows: { need: Qty; give: Qty }[], available: Qty): PlanStats {
  const used = zeroQty();
  const ratios: number[] = [];
  let campsWithNothing = 0;
  for (const r of rows) {
    for (const k of ITEMS) {
      used[k] += r.give[k];
      if (r.need[k] > 0) ratios.push(Math.min(1, r.give[k] / r.need[k]));
    }
    if (totalQty(r.need) > 0 && totalQty(r.give) === 0) campsWithNothing += 1;
  }
  return {
    used,
    over: ITEMS.filter((k) => used[k] > available[k]),
    fairness: jain(ratios),
    campsWithNothing,
  };
}

export function buildPlan(s: State, now: number): { rows: PlanRow[]; totalNeed: Qty; shortBy: Qty } {
  const camps = [...s.camps.values()].filter((c) => totalQty(c.need) > 0);
  const scores = camps.map((c) => priority(c, now));
  const weights = scores.map((sc) => weightOf(sc.total));
  const suggest = camps.map(() => zeroQty());
  const totalNeed = zeroQty();
  const shortBy = zeroQty();

  for (const k of ITEMS) {
    const demand = camps.map((c) => c.need[k]);
    const supply = s.available[k];
    const shares = roundShares(waterfill(demand, weights, supply), demand, weights, supply);
    shares.forEach((v, i) => (suggest[i][k] = v));
    totalNeed[k] = demand.reduce((a, b) => a + b, 0);
    shortBy[k] = Math.max(0, totalNeed[k] - supply);
  }

  const rows = camps
    .map((c, i) => ({
      campId: c.id,
      name: c.name,
      score: scores[i],
      need: c.need,
      suggest: suggest[i],
      mode: c.report.roadBlocked ? ('foot' as const) : ('truck' as const),
      stale: hoursSince(c.lastSeen, now) >= SILENT_AFTER_H,
      verified: c.verified,
    }))
    .sort((a, b) => b.score.total - a.score.total);
  return { rows, totalNeed, shortBy };
}
