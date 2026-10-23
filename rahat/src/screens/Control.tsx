import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle, MapTrifold, Scales, SealCheck, Warning, WarningCircle, X } from '@phosphor-icons/react';
import { codeHash, newCode } from '../lib/hash.ts';
import type { DispatchApprove, Qty, TaskKind, TeamTask } from '../lib/types.ts';
import { ITEMS, ITEM_META, newId, zeroQty } from '../lib/types.ts';
import type { CampState, DispatchState, State } from '../lib/reduce.ts';
import { currentLoad, isArrived, totalQty } from '../lib/reduce.ts';
import type { Score } from '../lib/allocation.ts';
import { buildPlan, planStats, priority } from '../lib/allocation.ts';
import type { Alert } from '../lib/alerts.ts';
import { buildAlerts } from '../lib/alerts.ts';
import { QUIET_AFTER_H, SILENT_AFTER_H, TRUCKS, carrierLabel } from '../lib/config.ts';
import { record, useStore } from '../lib/store.ts';
import { ago, distanceM, fmtCoord, hoursSince, km, VIA_LABEL } from '../lib/format.ts';
import { MapLegend, OpsMap } from '../components/Map.tsx';
import { Badge, Empty, Notice, QtyInputs, QtyView, qtyLine, useNow } from '../components/ui.tsx';

type Tab = 'needs' | 'allocate' | 'tracking' | 'alerts' | 'teams';

export function ControlScreen() {
  const { state } = useStore('staff');
  const now = useNow();
  const [tab, setTab] = useState<Tab>('needs');
  const [selected, setSelected] = useState<string | undefined>();
  const alerts = useMemo(() => buildAlerts(state, now), [state, now]);
  const red = alerts.filter((a) => a.level === 'red').length;

  const select = useCallback((id?: string) => setSelected(id), []);
  const selectedCamp = selected ? state.camps.get(selected) : undefined;

  const camps = [...state.camps.values()];
  const needTotal = camps.reduce((acc, c) => {
    for (const k of ITEMS) acc[k] += c.need[k];
    return acc;
  }, zeroQty());
  const covers = ITEMS.filter((k) => needTotal[k] > 0).map((k) => ({ k, pct: Math.min(100, Math.round((state.available[k] / needTotal[k]) * 100)) }));
  const lowest = covers.sort((a, b) => a.pct - b.pct)[0];
  const silent = camps.filter((c) => hoursSince(c.lastSeen, now) >= SILENT_AFTER_H).length;

  const stats = [
    { value: camps.reduce((s, c) => s + c.people, 0).toLocaleString('en-IN'), label: 'People in camps' },
    { value: camps.filter((c) => totalQty(c.need) > 0).length, label: 'Camps waiting' },
    { value: [...state.dispatches.values()].filter((d) => !isArrived(d)).length, label: 'Loads moving' },
    { value: silent, label: 'Silent camps', red: silent > 0 },
    { value: state.teams.reduce((n, t) => n + t.rescued, 0), label: 'People rescued' },
    { value: lowest ? `${lowest.pct}%` : '100%', label: lowest ? `Stock covers ${ITEM_META[lowest.k].label.toLowerCase()} need` : 'Stock covers all needs', red: !!lowest && lowest.pct < 50 },
  ];

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: 'needs', label: 'Needs' },
    { id: 'allocate', label: 'Allocate' },
    { id: 'tracking', label: 'Tracking' },
    { id: 'alerts', label: 'Alerts', count: red },
    { id: 'teams', label: 'Field' },
  ];

  return (
    <div className="page">
      <div className="wrap stack">
        <div className="row-between">
          <div>
            <h1 className="page-title">Control room</h1>
            <p className="page-sub">What each camp needs, what is on the way, and who is out there.</p>
          </div>
          <div className="row">
            <a className="btn btn-sm btn-quiet" href="/warehouse">Warehouse screen</a>
            <a className="btn btn-sm btn-quiet" href="/driver">Truck screens</a>
            <a className="btn btn-sm btn-quiet" href="/rescue">Rescue team screens</a>
          </div>
        </div>

        <div className="stats" style={{ ['--cols' as string]: 6 }}>
          {stats.map((s) => (
            <div className="card stat" key={s.label}>
              <div className={`stat-value${s.red ? ' red' : ''}`}>{s.value}</div>
              <div className="stat-label">{s.label}</div>
            </div>
          ))}
        </div>

        <section className="card map-card" aria-label="Map">
          <OpsMap state={state} now={now} selected={selected} onSelect={select} className="map-wide" />
          <MapLegend />
        </section>

        <section className="card" aria-label="Control panel">
            <div className="tabs" role="tablist" aria-label="Control room views">
              {tabs.map((t) => (
                <button
                  key={t.id}
                  role="tab"
                  id={`tab-${t.id}`}
                  aria-selected={tab === t.id}
                  aria-controls={`panel-${t.id}`}
                  onClick={() => setTab(t.id)}
                >
                  {t.label}
                  {!!t.count && <span className="tab-count" aria-label={`${t.count} urgent`}>{t.count}</span>}
                </button>
              ))}
            </div>
            <div className="panel-body" role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
              {tab === 'needs' && <NeedsTab state={state} now={now} onSelect={select} />}
              {tab === 'allocate' && <AllocateTab state={state} now={now} />}
              {tab === 'tracking' && <TrackingTab state={state} now={now} />}
              {tab === 'alerts' && <AlertsTab state={state} alerts={alerts} onSelect={select} />}
              {tab === 'teams' && <TeamsTab state={state} now={now} />}
            </div>
        </section>
      </div>
      {selectedCamp && <CampDrawer c={selectedCamp} state={state} now={now} onClose={() => setSelected(undefined)} />}
    </div>
  );
}

// ---------------------------------------------------------------- needs

function NeedsTab({ state, now, onSelect }: { state: State; now: number; onSelect: (id?: string) => void }) {
  const rows = useMemo(
    () =>
      [...state.camps.values()]
        .map((c) => ({ c, score: priority(c, now), open: totalQty(c.need) > 0 }))
        .sort((a, b) => Number(b.open) - Number(a.open) || b.score.total - a.score.total),
    [state, now],
  );
  if (!rows.length) return <div className="tiles"><Empty title="No camps yet">Requests appear here as soon as they arrive.</Empty></div>;
  return (
    <>
      <p className="panel-intro">Most urgent first. Priority is a score out of 100. Click a camp to see why, and to verify it or send a team.</p>
      <div className="tiles">
        {rows.map(({ c, score, open }) => (
          <CampCard key={c.id} c={c} score={score} open={open} now={now} onOpen={() => onSelect(c.id)} />
        ))}
      </div>
    </>
  );
}

function CampCard({ c, score, open, now, onOpen }: { c: CampState; score: Score; open: boolean; now: number; onOpen: () => void }) {
  const h = hoursSince(c.lastSeen, now);
  return (
    <button type="button" className="tile camp-card" onClick={onOpen}>
      <div className="row-between" style={{ alignItems: 'flex-start', flexWrap: 'nowrap' }}>
        <span className="item-title">{c.name}</span>
        {open ? (
          <span className={`prio${score.total >= 60 ? ' hi' : ''}`}>
            Priority <b>{score.total}</b>
          </span>
        ) : (
          <Badge tone="green">Covered</Badge>
        )}
      </div>
      <div className="row" style={{ gap: 6 }}>
        {!c.verified && <Badge tone="amber">New, not verified</Badge>}
        {h >= SILENT_AFTER_H && <Badge tone="red">No news for {Math.floor(h)} h</Badge>}
        {h >= QUIET_AFTER_H && h < SILENT_AFTER_H && <Badge tone="amber">Quiet {Math.floor(h)} h</Badge>}
        {c.report.medical && <Badge tone="red">Medical</Badge>}
        {c.report.trapped && <Badge tone="red">People trapped</Badge>}
        {c.report.roadBlocked && <Badge tone="amber">Road blocked</Badge>}
        {totalQty(c.onTheWay) > 0 && <Badge tone="blue">Supplies on the way</Badge>}
      </div>
      <p className="small muted">
        {c.people} people. Last message {ago(c.lastSeen, now)}
        {c.lastSeenVia ? ` by ${VIA_LABEL[c.lastSeenVia]}` : ''}.
      </p>
      {open ? (
        <div className="needs-chips" aria-label="Still needed">
          {ITEMS.filter((k) => c.need[k] > 0).map((k) => (
            <span key={k}>
              <b>{c.need[k].toLocaleString('en-IN')}</b> {ITEM_META[k].label.toLowerCase()}
            </span>
          ))}
        </div>
      ) : (
        <p className="small" style={{ color: 'var(--green)' }}>Everything they asked for is on the way or delivered.</p>
      )}
    </button>
  );
}

function CampDrawer({ c, state, now, onClose }: { c: CampState; state: State; now: number; onClose: () => void }) {
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    close.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="drawer-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="drawer" role="dialog" aria-modal="true" aria-labelledby="drawer-title">
        <div className="drawer-head">
          <h2 className="card-title" id="drawer-title">
            {c.name}
          </h2>
          <button ref={close} type="button" className="btn btn-sm btn-quiet" onClick={onClose} aria-label="Close">
            <X size={18} aria-hidden />
          </button>
        </div>
        <CampDetail key={c.id} c={c} score={priority(c, now)} state={state} now={now} />
      </aside>
    </div>
  );
}

function CampDetail({ c, score, state, now }: { c: CampState; score: Score; state: State; now: number }) {
  const [assigning, setAssigning] = useState(false);
  const r = c.report;
  const task = [...state.tasks.values()].find((t) => t.campId === c.id && t.status !== 'done');
  return (
    <div className="stack" style={{ padding: 20 }}>
      <div className="stack-sm">
        <p className="label">Why the priority is {score.total} out of 100</p>
        {score.parts.map((p) => (
          <div className="row-between small" key={p.label}>
            <span>{p.label}</span>
            <span className="num" style={{ fontWeight: 600 }}>
              {p.pts} <span className="muted">/ {p.max}</span>
            </span>
          </div>
        ))}
      </div>
      <div className="stack-sm">
        <p className="label">Reported {ago(r.at, now)}</p>
        <QtyView q={r.needs} />
        <p className="label">On the way</p>
        <QtyView q={c.onTheWay} />
        {totalQty(c.deliveredSince) > 0 && (
          <>
            <p className="label">Delivered since the report</p>
            <QtyView q={c.deliveredSince} />
          </>
        )}
        <p className="label">Still needed</p>
        <QtyView q={c.need} />
      </div>
      <dl className="kv">
        {(r.reporter || r.phone) && (
          <>
            <dt>Contact</dt>
            <dd>
              {r.reporter}
              {r.reporter && r.phone ? ', ' : ''}
              {r.phone && <a href={`tel:${r.phone.replace(/[^+0-9]/g, '')}`}>{r.phone}</a>}
            </dd>
          </>
        )}
        <dt>People</dt>
        <dd>
          {c.people}: {r.children} children under 5, {r.elderly} elderly, {r.injured} injured or sick
        </dd>
        <dt>Location</dt>
        <dd className="num">
          {fmtCoord(c.lat, c.lng)}{' '}
          <span className="muted">
            ({c.locSrc === 'gps' ? `GPS${c.acc ? `, within ${c.acc} m` : ''}` : c.locSrc === 'map' ? 'map pin' : 'typed'})
          </span>
        </dd>
        <dt>Reports</dt>
        <dd>
          {c.reports}, latest by {r.via ? VIA_LABEL[r.via] : 'Internet'}
        </dd>
        {r.note && (
          <>
            <dt>Note</dt>
            <dd>{r.note}</dd>
          </>
        )}
        {task && (
          <>
            <dt>Team</dt>
            <dd>
              {state.teams.find((t) => t.id === task.teamId)?.label}, {task.status.replace('_', ' ')}
            </dd>
          </>
        )}
      </dl>
      <div className="row">
        {!c.verified && (
          <button
            type="button"
            className="btn btn-sm btn-primary"
            onClick={() => record('staff', { type: 'camp.verify', id: newId(), at: Date.now(), by: 'control', campId: c.id })}
          >
            <SealCheck size={17} aria-hidden /> Mark verified
          </button>
        )}
        {!task && (
          <button type="button" className="btn btn-sm" onClick={() => setAssigning((v) => !v)} aria-expanded={assigning}>
            Send rescue team
          </button>
        )}
        <a className="btn btn-sm btn-quiet" href={`https://www.openstreetmap.org/?mlat=${c.lat}&mlon=${c.lng}#map=15/${c.lat}/${c.lng}`} target="_blank" rel="noreferrer">
          <MapTrifold size={17} aria-hidden /> Open in OpenStreetMap
        </a>
      </div>
      {assigning && (
        <AssignTeam state={state} campId={c.id} defaultKind={r.medical ? 'evacuate' : 'reach'} onDone={() => setAssigning(false)} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------- allocate

const sameQty = (a: Qty, b: Qty) => ITEMS.every((k) => a[k] === b[k]);

function AllocateTab({ state, now }: { state: State; now: number }) {
  const plan = useMemo(() => buildPlan(state, now), [state, now]);
  const [edits, setEdits] = useState<Record<string, Qty>>({});
  const [skip, setSkip] = useState<Record<string, boolean>>({});
  const [reason, setReason] = useState('');
  const [trucks, setTrucks] = useState<Record<string, string>>({}); // campId -> chosen truck ('' = any)
  const [done, setDone] = useState('');

  // Unconfirmed public requests start unticked: the officer includes them once verified.
  const rows = plan.rows.map((r) => ({ ...r, include: skip[r.campId] === undefined ? r.verified : !skip[r.campId], give: edits[r.campId] ?? r.suggest }));
  const final = rows.map((r) => ({ need: r.need, give: r.include ? r.give : zeroQty() }));
  const stats = planStats(final, state.available);
  const changed = rows.some((r) => (r.verified && !r.include) || (r.include && !sameQty(r.give, r.suggest)));
  const loads = rows.filter((r) => r.include && totalQty(r.give) > 0);
  const blocked = stats.over.length > 0 || (changed && reason.trim().length < 5) || loads.length === 0;

  const approve = async () => {
    const at = Date.now();
    for (const r of loads) {
      const dispatchId = `D-${newId(5).toUpperCase()}`;
      const code = newCode();
      const ev: DispatchApprove = {
        type: 'dispatch.approve',
        id: newId(),
        at,
        by: 'control',
        dispatchId,
        campId: r.campId,
        items: r.give,
        suggested: r.suggest,
        mode: r.mode,
        code,
        codeHash: await codeHash(dispatchId, code),
        reason: changed ? reason.trim() : undefined,
        truck: r.mode === 'truck' && trucks[r.campId] ? trucks[r.campId] : undefined,
      };
      record('staff', ev);
    }
    setDone(`Approved ${loads.length} load${loads.length === 1 ? '' : 's'}. The warehouse can start packing.`);
    setEdits({});
    setSkip({});
    setReason('');
  };

  if (!plan.rows.length)
    return (
      <div className="item stack-sm">
        {done && <Notice tone="green">{done}</Notice>}
        <Empty title="Nothing to allocate">Every camp's reported need is covered or already on the way.</Empty>
      </div>
    );

  return (
    <div className="stack" style={{ padding: 20 }}>
      {done && <Notice tone="green">{done}</Notice>}
      <div className="subtle stack-sm">
        <p className="label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Scales size={17} aria-hidden /> Stock against need
        </p>
        {ITEMS.map((k) => (
          <div className="row-between small" key={k}>
            <span>{ITEM_META[k].label}</span>
            <span className="num">
              {plan.totalNeed[k].toLocaleString('en-IN')} needed, {state.available[k].toLocaleString('en-IN')} free
              {plan.shortBy[k] > 0 && <b style={{ color: 'var(--red)' }}> (short {plan.shortBy[k].toLocaleString('en-IN')})</b>}
            </span>
          </div>
        ))}
      </div>
      <p className="small muted">
        Suggested shares follow the priority score: every camp with a need gets part of the stock, higher scores get more. Change any
        number before approving. Nothing leaves the warehouse until you approve.
      </p>

      <div className="tiles" style={{ padding: 0 }}>
      {rows.map((r) => (
        <div key={r.campId} className="tile stack-sm" style={{ opacity: r.include ? 1 : 0.6 }}>
          <div className="row-between">
            <label className="row" style={{ fontWeight: 650, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={r.include}
                onChange={(e) => setSkip((s) => ({ ...s, [r.campId]: !e.target.checked }))}
                style={{ width: 18, height: 18, accentColor: 'var(--accent)' }}
              />
              {r.name}
            </label>
            <span className="row" style={{ gap: 6 }}>
              {!r.verified && <Badge tone="amber">Not verified</Badge>}
              {r.stale && <Badge tone="amber">Silent: report may be old</Badge>}
              {r.mode === 'foot' ? (
                <Badge tone="amber">On foot</Badge>
              ) : (
                <select
                  className="select select-sm"
                  aria-label={`Truck for ${r.name}`}
                  value={trucks[r.campId] ?? ''}
                  onChange={(e) => setTrucks((t) => ({ ...t, [r.campId]: e.target.value }))}
                >
                  <option value="">Any truck</option>
                  {TRUCKS.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </select>
              )}
              <span className={`prio${r.score.total >= 60 ? ' hi' : ''}`}>
                Priority <b>{r.score.total}</b>
              </span>
            </span>
          </div>
          {r.include && (
            <>
              <QtyInputs idPrefix={`alloc-${r.campId}`} value={r.give} of={r.need} onChange={(q) => setEdits((e) => ({ ...e, [r.campId]: q }))} />
              {!sameQty(r.give, r.suggest) && (
                <button type="button" className="btn btn-sm btn-quiet" style={{ justifySelf: 'start' }} onClick={() =>
                    setEdits((e) => {
                      const next = { ...e };
                      delete next[r.campId];
                      return next;
                    })
                  }
                >
                  Back to suggestion ({qtyLine(r.suggest)})
                </button>
              )}
            </>
          )}
        </div>
      ))}
      </div>

      <div className="subtle stack-sm">
        <div className="row-between small">
          <span>Fairness (Jain index, 1.00 means equal share of need)</span>
          <b className="num">{stats.fairness === null ? 'n/a' : stats.fairness.toFixed(2)}</b>
        </div>
        <div className="row-between small">
          <span>Camps with a need that get nothing</span>
          <b className="num" style={{ color: stats.campsWithNothing ? 'var(--red)' : 'var(--green)' }}>{stats.campsWithNothing}</b>
        </div>
        <div className="row-between small">
          <span>This plan sends</span>
          <b>{qtyLine(stats.used)}</b>
        </div>
      </div>

      {stats.over.length > 0 && (
        <Notice tone="red">
          More {stats.over.map((k) => ITEM_META[k].label.toLowerCase()).join(' and ')} than the warehouse has free. Lower those numbers.
        </Notice>
      )}
      {changed && (
        <div className="field">
          <label htmlFor="reason">Why are you changing the suggestion?</label>
          <textarea id="reason" className="textarea" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Kalsi confirmed by phone that 40 more people arrived" />
          <span className="help">Saved with each load, so every decision can be explained later.</span>
        </div>
      )}
      <button type="button" className="btn btn-primary btn-lg" disabled={blocked} onClick={() => void approve()}>
        <CheckCircle size={20} aria-hidden /> Approve {loads.length} load{loads.length === 1 ? '' : 's'}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------- tracking

const STAGES = ['Approved', 'Packed', 'On the way', 'Delivered', 'Confirmed'];

export function Stepper({ d }: { d: DispatchState }) {
  const lastLoad = d.loads.at(-1)?.items;
  const done = [true, !!d.packed, d.loads.length > 0, !!d.delivered || !!d.received, !!d.received];
  const bad = [
    false,
    !!d.packed && ITEMS.some((k) => d.packed![k] < d.items[k]),
    d.status === 'blocked',
    !!d.delivered && !d.delivered.codeOk,
    !!d.received && !!lastLoad && ITEMS.some((k) => d.received![k] < lastLoad[k]),
  ];
  return (
    <div className="steps" aria-label={`Progress: ${STAGES.filter((_, i) => done[i]).at(-1)}`}>
      {STAGES.map((s, i) => (
        <span key={s} className={`step${bad[i] ? ' bad' : done[i] ? ' done' : ''}`}>
          <i />
          {s}
        </span>
      ))}
    </div>
  );
}

function TrackingTab({ state, now }: { state: State; now: number }) {
  const list = [...state.dispatches.values()].sort((a, b) => b.approvedAt - a.approvedAt);
  if (!list.length) return <div className="tiles"><Empty title="No loads yet">Approve loads in the Allocate tab.</Empty></div>;
  return (
    <>
    <p className="panel-intro">Every load, newest first. A red step means something went wrong at that stage.</p>
    <div className="tiles">
      {list.map((d) => {
        const camp = state.camps.get(d.campId);
        return (
          <div className="tile" key={d.id}>
            <div className="row-between">
              <span className="item-title">{camp?.name ?? d.campId}</span>
              <span className="mono small muted">{d.id}</span>
            </div>
            <p className="small muted" style={{ marginTop: 4 }}>
              {qtyLine(currentLoad(d))}. Approved {ago(d.approvedAt, now)}.{' '}
              {d.loads.length > 0
                ? `With ${carrierLabel(d.loads.at(-1)!.carrier)}.`
                : d.mode === 'foot'
                  ? 'Goes on foot.'
                  : d.truck
                    ? `Assigned to ${carrierLabel(d.truck)}.`
                    : 'Any truck.'}
              {d.reason ? ` Officer note: ${d.reason}` : ''}
            </p>
            <Stepper d={d} />
          </div>
        );
      })}
    </div>
    </>
  );
}

// ---------------------------------------------------------------- alerts

function AlertsTab({ state, alerts, onSelect }: { state: State; alerts: Alert[]; onSelect: (id?: string) => void }) {
  const [open, setOpen] = useState<string | null>(null);
  if (!alerts.length) return <div className="tiles"><Empty title="No alerts">Silent camps, shortages and missing items show up here.</Empty></div>;
  return (
    <div className="tiles">
      {alerts.map((a) => (
        <div className={`tile stack-sm alert-${a.level}`} key={a.id}>
          <div className="row" style={{ alignItems: 'flex-start', flexWrap: 'nowrap' }}>
            {a.level === 'red' ? (
              <WarningCircle size={20} weight="fill" color="var(--red)" aria-label="Urgent" style={{ flex: 'none', marginTop: 1 }} />
            ) : (
              <Warning size={20} weight="fill" color="var(--amber)" aria-label="Warning" style={{ flex: 'none', marginTop: 1 }} />
            )}
            <div style={{ minWidth: 0 }}>
              <p style={{ fontWeight: 650 }}>{a.title}</p>
              <p className="small muted">{a.detail}</p>
            </div>
          </div>
          {(a.action || a.campId) && (
            <div className="row" style={{ paddingLeft: 28 }}>
              {a.action === 'sms_done' && (
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => record('staff', { type: 'sms.handled', id: newId(), at: Date.now(), by: 'control', smsId: a.smsId! })}
                >
                  Mark handled
                </button>
              )}
              {(a.action === 'carry' || a.action === 'send_team') && (
                <button type="button" className="btn btn-sm" aria-expanded={open === a.id} onClick={() => setOpen(open === a.id ? null : a.id)}>
                  {a.action === 'carry' ? 'Assign a team to carry it' : 'Send rescue team'}
                </button>
              )}
              {a.campId && (
                <button type="button" className="btn btn-sm btn-quiet" onClick={() => onSelect(a.campId)}>
                  Show camp
                </button>
              )}
            </div>
          )}
          {open === a.id && a.campId && (
            <div style={{ paddingLeft: 28 }}>
              <AssignTeam
                state={state}
                campId={a.campId}
                dispatchId={a.action === 'carry' ? a.dispatchId : undefined}
                defaultKind={a.kind === 'urgent' ? 'evacuate' : 'reach'}
                onDone={() => setOpen(null)}
              />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- teams

const KIND_LABEL: Record<TaskKind, string> = { reach: 'Reach and check', carry: 'Carry supplies on foot', evacuate: 'Evacuate people' };

/** Where every team and truck is, from the positions their phones share. */
function liveText(live: { lat: number; lng: number; at: number } | undefined, now: number, target?: CampState) {
  if (!live) return 'Not sharing location.';
  const dist = target ? `, ${km(distanceM(live.lat, live.lng, target.lat, target.lng))} from ${target.name}` : '';
  return `Last seen ${ago(live.at, now)}${dist}.`;
}

function TeamsTab({ state, now }: { state: State; now: number }) {
  const trucks = TRUCKS.map((t) => {
    const load = [...state.dispatches.values()].find((d) => (d.status === 'in_transit' || d.status === 'blocked') && d.loads.at(-1)?.carrier === t.id);
    return { ...t, live: state.units.get(t.id), load, camp: load ? state.camps.get(load.campId) : undefined };
  });
  return (
    <div>
      <div className="two-col">
      <div>
      <p className="item label" style={{ paddingBottom: 0 }}>Rescue teams</p>
      <div className="divide">
        {state.teams.map((t) => {
          const camp = t.task ? state.camps.get(t.task.campId) : undefined;
          const stale = !t.live || now - t.live.at > 15 * 60_000;
          return (
            <div className="item" key={t.id}>
              <div className="row-between">
                <span className="item-title">{t.label}</span>
                <span className="row" style={{ gap: 6 }}>
                  {t.rescued > 0 && <Badge tone="green">{t.rescued} rescued</Badge>}
                  <Badge tone={t.status === 'available' ? 'green' : 'blue'}>{t.status === 'available' ? 'Available' : t.status.replace('_', ' ')}</Badge>
                </span>
              </div>
              <p className="small muted" style={{ marginTop: 4 }}>
                {t.lead}. {t.task && camp ? `${KIND_LABEL[t.task.kind]} at ${camp.name}, assigned ${ago(t.task.createdAt, now)}.` : 'At base.'}
              </p>
              <p className="small" style={{ marginTop: 2, color: stale ? 'var(--amber)' : 'var(--green)' }}>{liveText(t.live, now, camp)}</p>
            </div>
          );
        })}
      </div>
      </div>
      <div>
      <p className="item label" style={{ paddingBottom: 0 }}>Trucks</p>
      <div className="divide">
        {trucks.map((t) => (
          <div className="item" key={t.id}>
            <div className="row-between">
              <span className="item-title">{t.label}</span>
              <Badge tone={t.load ? (t.load.status === 'blocked' ? 'red' : 'blue') : 'green'}>
                {t.load ? (t.load.status === 'blocked' ? 'Road blocked' : 'On the way') : 'Free'}
              </Badge>
            </div>
            <p className="small muted" style={{ marginTop: 4 }}>
              {t.driver}. {t.camp ? `Carrying ${qtyLine(currentLoad(t.load!))} to ${t.camp.name}.` : 'No load on board.'}
            </p>
            <p className="small" style={{ marginTop: 2, color: !t.live || now - t.live.at > 15 * 60_000 ? 'var(--amber)' : 'var(--green)' }}>
              {liveText(t.live, now, t.camp)}
            </p>
          </div>
        ))}
      </div>
      </div>
      </div>
      <div className="item" style={{ borderTop: '1px solid var(--line)' }}>
        <p className="label" style={{ marginBottom: 10 }}>Send a team</p>
        <AssignTeam state={state} />
      </div>
    </div>
  );
}

function AssignTeam({
  state,
  campId: fixedCamp,
  dispatchId,
  defaultKind = 'reach',
  onDone,
}: {
  state: State;
  campId?: string;
  dispatchId?: string;
  defaultKind?: TaskKind;
  onDone?: () => void;
}) {
  const free = state.teams.filter((t) => t.status === 'available');
  const camps = [...state.camps.values()].sort((a, b) => a.name.localeCompare(b.name));
  const [teamId, setTeamId] = useState(free[0]?.id ?? '');
  const [campId, setCampId] = useState(fixedCamp ?? camps[0]?.id ?? '');
  const [kind, setKind] = useState<TaskKind>(dispatchId ? 'carry' : defaultKind);
  const [note, setNote] = useState('');
  const [sent, setSent] = useState('');

  if (!free.length)
    return <Notice tone="amber">All teams are on tasks. A team becomes available when it marks its task done.</Notice>;

  const submit = () => {
    const team = free.find((t) => t.id === teamId) ?? free[0];
    const ev: TeamTask = {
      type: 'team.task',
      id: newId(),
      at: Date.now(),
      by: 'control',
      taskId: `K-${newId(5).toUpperCase()}`,
      teamId: team.id,
      campId,
      kind,
      dispatchId: kind === 'carry' ? dispatchId : undefined,
      note: note.trim() || undefined,
    };
    record('staff', ev);
    setSent(`${team.label} assigned.`);
    setNote('');
    onDone?.();
  };

  return (
    <div className="stack-sm">
      <div className="grid-2">
        <div className="field">
          <label htmlFor={`team-${fixedCamp ?? 'any'}`}>Team</label>
          <select id={`team-${fixedCamp ?? 'any'}`} className="select" value={teamId} onChange={(e) => setTeamId(e.target.value)}>
            {free.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor={`kind-${fixedCamp ?? 'any'}`}>Task</label>
          <select id={`kind-${fixedCamp ?? 'any'}`} className="select" value={kind} onChange={(e) => setKind(e.target.value as TaskKind)} disabled={!!dispatchId}>
            {(Object.keys(KIND_LABEL) as TaskKind[]).map((k) => (
              <option key={k} value={k} disabled={k === 'carry' && !dispatchId}>
                {KIND_LABEL[k]}
              </option>
            ))}
          </select>
        </div>
      </div>
      {!fixedCamp && (
        <div className="field">
          <label htmlFor="assign-camp">Camp</label>
          <select id="assign-camp" className="select" value={campId} onChange={(e) => setCampId(e.target.value)}>
            {camps.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="field">
        <label htmlFor={`note-${fixedCamp ?? 'any'}`}>Instructions (optional)</label>
        <input id={`note-${fixedCamp ?? 'any'}`} className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Approach from Sahiya side, bridge is out" />
      </div>
      <button type="button" className="btn btn-primary" onClick={submit} disabled={!campId}>
        Assign team
      </button>
      {sent && <p className="small" style={{ color: 'var(--green)' }}>{sent}</p>}
    </div>
  );
}
