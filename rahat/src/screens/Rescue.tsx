import { useState } from 'react';
import { MapTrifold, PersonSimpleHike } from '@phosphor-icons/react';
import type { CampCheckin, TaskKind, TeamStatus } from '../lib/types.ts';
import { newId } from '../lib/types.ts';
import type { State, TaskState } from '../lib/reduce.ts';
import { currentLoad, isArrived } from '../lib/reduce.ts';
import { record, useStore } from '../lib/store.ts';
import { carrierLabel } from '../lib/config.ts';
import { ago, distanceM, km } from '../lib/format.ts';
import type { MapPoint } from '../components/Dashboard.tsx';
import { DashStats, FocusMap, NewAlert, useNewItems } from '../components/Dashboard.tsx';
import { DeliverBox, LiveLocation, RelayCard, TakeLoad } from '../components/Field.tsx';
import { Badge, Empty, Notice, NumberInput, QtyView, useNow } from '../components/ui.tsx';

const ROLE = 'rescue';

const KIND: Record<TaskKind, string> = {
  reach: 'Reach the camp and check on it',
  carry: 'Carry supplies in on foot',
  evacuate: 'Evacuate people who need care',
};

export function RescueScreen({ unit, asAdmin }: { unit?: string; asAdmin?: boolean }) {
  const { state } = useStore('staff');
  const now = useNow();
  const tasks = [...state.tasks.values()].filter((t) => t.teamId === unit).sort((a, b) => b.createdAt - a.createdAt);
  const active = tasks.filter((t) => t.status !== 'done');
  // Tasks the officer sent since this phone last looked. The admin looking in does not clear them.
  const { fresh, markSeen } = useNewItems(`${asAdmin ? 'admin:' : ''}task:${unit}`, active.map((t) => t.id));
  const team = state.teams.find((t) => t.id === unit);
  if (!team)
    return (
      <div className="page wrap narrow">
        <Notice tone="amber">Your account is not linked to a team. Ask the control room to set one in Staff accounts.</Notice>
      </div>
    );
  const past = tasks.filter((t) => t.status === 'done').slice(0, 4);
  const next = active[active.length - 1] ? state.camps.get(active[active.length - 1].campId) : undefined;
  const live = team.live && now - team.live.at < 30 * 60_000 ? team.live : undefined;
  const points: MapPoint[] = active.flatMap((t) => {
    const c = state.camps.get(t.campId);
    return c ? [{ id: t.id, lat: c.lat, lng: c.lng, label: c.name, tone: c.report.medical || c.report.trapped ? ('red' as const) : ('blue' as const) }] : [];
  });

  return (
    <div className="page">
      <div className="wrap stack">
        <NewAlert
          count={fresh.length}
          title={fresh.length === 1 ? 'New task from the district control room' : `${fresh.length} new tasks from the district control room`}
          onSeen={markSeen}
        >
          {fresh
            .map((id) => state.tasks.get(id))
            .map((t) => t && `${KIND[t.kind]} at ${state.camps.get(t.campId)?.name ?? t.campId}`)
            .filter(Boolean)
            .join('. ')}
          .
        </NewAlert>

        <div>
          <h1 className="page-title">{team.label}</h1>
          <p className="page-sub">{team.lead}. Tasks from the district control room appear here as soon as they are sent.</p>
        </div>

        <DashStats
          items={[
            { value: active.length, label: 'Active tasks', dot: fresh.length > 0 },
            { value: team.rescued, label: 'People rescued', tone: team.rescued ? 'green' : undefined },
            { value: tasks.length - active.length, label: 'Tasks done' },
            { value: next && live ? km(distanceM(live.lat, live.lng, next.lat, next.lng)) : '-', label: next ? `To ${next.name}` : 'No destination' },
          ]}
        />

        <div className="dash">
          <div className="stack">
            <section className="stack-sm" aria-labelledby="tasks-title">
              <h2 className="card-title" id="tasks-title">
                <PersonSimpleHike size={20} aria-hidden /> Your tasks
              </h2>
              {active.length === 0 && <Empty title="No task right now">The control room will send one here. Stay ready at base.</Empty>}
              {active.map((t) => (
                <TaskCard key={t.id} task={t} state={state} now={now} isNew={fresh.includes(t.id)} />
              ))}
            </section>
            {past.length > 0 && (
              <section className="stack-sm" aria-labelledby="past-title">
                <h2 className="card-title" id="past-title">Finished</h2>
                {past.map((t) => (
                  <div className="card card-pad" key={t.id}>
                    <span className="item-title">{state.camps.get(t.campId)?.name ?? t.campId}</span>
                    <p className="small muted">
                      {KIND[t.kind]}. Done {ago(t.updatedAt, now)}.{t.rescued ? ` ${t.rescued} people rescued or evacuated.` : ''}
                    </p>
                  </div>
                ))}
              </section>
            )}
          </div>
          <div className="stack dash-side">
            <section className="card map-card" aria-label="Where to go">
              <FocusMap points={points} me={live} />
            </section>
            {!asAdmin && <LiveLocation role="rescue" unit={team.id} />}
            <RelayCard role={ROLE} state={state} />
          </div>
        </div>
      </div>
    </div>
  );
}

function TaskCard({ task, state, now, isNew }: { task: TaskState; state: State; now: number; isNew?: boolean }) {
  const camp = state.camps.get(task.campId);
  const d = task.dispatchId ? state.dispatches.get(task.dispatchId) : undefined;
  const holding = d?.loads.at(-1)?.carrier === task.teamId;
  const [rescued, setRescued] = useState(0);

  const status = (s: TeamStatus['status']) => {
    const ev: TeamStatus = {
      type: 'team.status',
      id: newId(),
      at: Date.now(),
      by: ROLE,
      teamId: task.teamId,
      taskId: task.id,
      status: s,
      rescued: s === 'done' && rescued > 0 ? rescued : undefined,
    };
    record('staff', ev);
    if (s === 'on_site') {
      // Reaching the camp counts as hearing from it, even if its own phone is dead.
      const ck: CampCheckin = { type: 'camp.checkin', id: newId(), at: Date.now(), by: ROLE, via: 'relay', campId: task.campId };
      record('staff', ck);
    }
  };

  return (
    <div className={`card card-pad stack-sm${isNew ? ' is-new' : ''}`}>
      <div className="row-between">
        <span className="item-title">{camp?.name ?? task.campId}</span>
        <span className="row" style={{ gap: 6 }}>
          {isNew && (
            <Badge tone="red">
              <span className="blink-dot inline" aria-hidden /> New
            </Badge>
          )}
          <Badge tone={task.status === 'on_site' ? 'green' : 'blue'}>{task.status.replace('_', ' ')}</Badge>
        </span>
      </div>
      <p>{KIND[task.kind]}.</p>
      {task.note && <Notice>{task.note}</Notice>}
      {camp && (
        <p className="small muted">
          {camp.people} people at last report. {camp.report.medical ? 'Medical emergency reported. ' : ''}
          {camp.report.trapped ? 'People trapped nearby. ' : ''}Assigned {ago(task.createdAt, now)}.
        </p>
      )}

      {d && !isArrived(d) && (
        <div className="subtle stack-sm">
          <p className="label">Load {d.id}</p>
          <QtyView q={currentLoad(d)} />
          {holding ? (
            <DeliverBox role={ROLE} d={d} carrier={task.teamId} />
          ) : d.status === 'packed' || d.status === 'blocked' ? (
            <TakeLoad
              role={ROLE}
              d={d}
              carrier={task.teamId}
              label={d.status === 'blocked' ? `Take the load from ${carrierLabel(d.loads.at(-1)?.carrier)}` : 'Take the load from the warehouse'}
            />
          ) : (
            <p className="small muted">Waiting for the warehouse to pack it.</p>
          )}
        </div>
      )}

      {task.status === 'on_site' && (
        <div className="field" style={{ maxWidth: 260 }}>
          <label htmlFor={`rescued-${task.id}`}>People rescued or evacuated</label>
          <NumberInput id={`rescued-${task.id}`} value={rescued} onChange={setRescued} max={10_000} />
          <span className="help">Leave 0 if this task was only a check or a delivery.</span>
        </div>
      )}

      <div className="row">
        {task.status === 'assigned' && (
          <button type="button" className="btn btn-primary" onClick={() => status('en_route')}>
            Start moving
          </button>
        )}
        {task.status === 'en_route' && (
          <button type="button" className="btn btn-primary" onClick={() => status('on_site')}>
            We reached the camp
          </button>
        )}
        {task.status === 'on_site' && (
          <button type="button" className="btn btn-primary" onClick={() => status('done')} disabled={!!d && !isArrived(d)}>
            Task done
          </button>
        )}
        {camp && (
          <a className="btn btn-quiet" href={`https://www.openstreetmap.org/?mlat=${camp.lat}&mlon=${camp.lng}#map=15/${camp.lat}/${camp.lng}`} target="_blank" rel="noreferrer">
            <MapTrifold size={17} aria-hidden /> Map
          </a>
        )}
      </div>
    </div>
  );
}
