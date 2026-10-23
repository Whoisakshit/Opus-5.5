import { test } from 'node:test';
import assert from 'node:assert/strict';
import { waterfill, roundShares, jain, buildPlan, planStats } from '../src/lib/allocation.ts';
import { decode, encode, checksum } from '../src/lib/codec.ts';
import { reduce } from '../src/lib/reduce.ts';
import { buildAlerts } from '../src/lib/alerts.ts';
import { seedEvents } from '../src/lib/seed.ts';
import type { CampReport, Ev } from '../src/lib/types.ts';
import { ITEMS } from '../src/lib/types.ts';

test('waterfill never exceeds supply or any demand, and equal weights split equally', () => {
  const a = waterfill([100, 100, 100], [1, 1, 1], 150);
  assert.deepEqual(a, [50, 50, 50]);
  const b = waterfill([10, 200, 200], [1, 1, 1], 150);
  assert.equal(b[0], 10); // small demand is filled completely
  assert.equal(b[1], 70);
  assert.equal(b[2], 70);
  assert.deepEqual(waterfill([5, 5], [1, 3], 100), [5, 5]); // plenty of stock: everyone gets all they asked
});

test('higher weight rises faster, but every camp with need gets something', () => {
  const a = waterfill([100, 100], [1, 3], 80);
  assert.ok(a[1] > a[0]);
  assert.ok(a[0] > 0);
  assert.ok(Math.abs(a[0] + a[1] - 80) < 1e-9);
});

test('rounding keeps the total within supply and each share within demand', () => {
  for (let trial = 0; trial < 200; trial++) {
    const n = 2 + (trial % 7);
    const demand = Array.from({ length: n }, (_, i) => (i * 37 + trial * 11) % 90);
    const weight = Array.from({ length: n }, (_, i) => 1 + ((i * 13 + trial) % 100) / 50);
    const supply = (trial * 29) % 300;
    const shares = roundShares(waterfill(demand, weight, supply), demand, weight, supply);
    const sum = shares.reduce((s, v) => s + v, 0);
    assert.ok(sum <= supply, 'over supply');
    assert.equal(sum, Math.min(supply, demand.reduce((s, d) => s + d, 0)), 'stock left unused');
    shares.forEach((v, i) => assert.ok(v >= 0 && v <= demand[i] && Number.isInteger(v)));
  }
});

test('jain index is 1 for equal shares and 1/n when one camp gets everything', () => {
  assert.equal(jain([0.5, 0.5, 0.5]), 1);
  assert.equal(jain([1, 0, 0, 0]), 0.25);
});

const report = (over: Partial<CampReport> = {}): CampReport => ({
  type: 'camp.report',
  id: 'abc123def0',
  at: Date.UTC(2026, 9, 23, 6, 30),
  by: 'camp',
  campId: 'MLD',
  name: 'GIC Maldevta',
  lat: 30.32711,
  lng: 78.13744,
  acc: 9,
  locSrc: 'gps',
  people: 210,
  children: 46,
  elderly: 30,
  injured: 4,
  needs: { food: 420, water: 160, blankets: 90, medicine: 6 },
  medical: true,
  trapped: false,
  roadBlocked: true,
  ...over,
});

test('report survives the SMS round trip and fits in one SMS', () => {
  const code = encode(report());
  assert.ok(code.length <= 160, `too long: ${code.length}`);
  const back = decode(code, 'sms');
  assert.ok(back.ok);
  if (!back.ok || back.ev.type !== 'camp.report') return;
  assert.equal(back.ev.id, 'abc123def0');
  assert.equal(back.ev.campId, 'MLD');
  assert.equal(back.ev.at, Date.UTC(2026, 9, 23, 6, 30));
  assert.deepEqual(back.ev.needs, report().needs);
  assert.equal(back.ev.medical, true);
  assert.equal(back.ev.roadBlocked, true);
  assert.equal(back.ev.trapped, false);
  assert.equal(back.ev.lat, 30.3271);
  assert.equal(back.ev.via, 'sms');
});

test('a single mistyped character is caught by the checksum', () => {
  const code = encode(report());
  const typo = code.replace('f=420', 'f=920');
  const r = decode(typo, 'relay');
  assert.equal(r.ok, false);
  assert.equal(checksum('RAHAT K x'), checksum('rahat k X')); // case does not matter
});

test('same report through SMS and internet is counted once', () => {
  const r = report();
  const sms = decode(encode(r), 'sms');
  assert.ok(sms.ok);
  if (!sms.ok) return;
  const s = reduce([r, sms.ev as Ev]);
  assert.equal(s.camps.size, 1);
  assert.equal(s.camps.get('MLD')!.reports, 1);
});

test('need subtracts what is on the way, so a camp is not sent the same thing twice', () => {
  const r = report({ needs: { food: 100, water: 0, blankets: 0, medicine: 0 } });
  const approve: Ev = {
    type: 'dispatch.approve',
    id: 'aaaaaaaaaa',
    at: r.at + 1000,
    by: 'control',
    dispatchId: 'D-1',
    campId: 'MLD',
    items: { food: 60, water: 0, blankets: 0, medicine: 0 },
    suggested: { food: 60, water: 0, blankets: 0, medicine: 0 },
    mode: 'truck',
    code: '1234',
    codeHash: '0'.repeat(64),
  };
  const s = reduce([r, approve]);
  assert.equal(s.camps.get('MLD')!.need.food, 40);
  assert.equal(s.camps.get('MLD')!.onTheWay.food, 60);
});

test('seed data: plan uses only available stock and leaves no camp with nothing', async () => {
  const now = Date.now();
  const s = reduce(await seedEvents(now));
  const plan = buildPlan(s, now);
  const stats = planStats(plan.rows.map((r) => ({ need: r.need, give: r.suggest })), s.available);
  assert.deepEqual(stats.over, []);
  for (const k of ITEMS) assert.equal(stats.used[k], Math.min(s.available[k], plan.totalNeed[k]));
  assert.equal(stats.campsWithNothing, 0);
});

test('seed data raises the alerts the control room relies on', async () => {
  const now = Date.now();
  const kinds = new Set(buildAlerts(reduce(await seedEvents(now)), now).map((a) => a.kind));
  for (const k of ['silent', 'quiet', 'urgent', 'missing', 'shortage', 'duplicate'] as const) assert.ok(kinds.has(k), k);
});

test('live positions keep the latest point and a short trail; rescued counts add up per team', () => {
  const base = Date.UTC(2026, 9, 23, 6, 0);
  const evs: Ev[] = [];
  for (let i = 0; i < 40; i++)
    evs.push({ type: 'unit.location', id: `loc${String(i).padStart(4, '0')}x`, at: base + i * 60_000, by: 'rescue', unit: 'SDRF-A', lat: 30 + i / 1000, lng: 78 });
  evs.push({ type: 'team.task', id: 'taskaaaaaa', at: base, by: 'control', taskId: 'K-1', teamId: 'SDRF-A', campId: 'MLD', kind: 'evacuate' });
  evs.push({ type: 'team.status', id: 'statusaaaa', at: base + 3_600_000, by: 'rescue', teamId: 'SDRF-A', taskId: 'K-1', status: 'done', rescued: 23 });
  const s = reduce(evs);
  const live = s.units.get('SDRF-A')!;
  assert.equal(live.lat, 30.039);
  assert.equal(live.trail.length, 30); // capped
  const team = s.teams.find((t) => t.id === 'SDRF-A')!;
  assert.equal(team.rescued, 23);
  assert.equal(team.status, 'available'); // task done frees the team
  assert.equal(team.live?.at, base + 39 * 60_000);
});
