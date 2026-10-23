import { MapTrifold, PersonSimpleHike } from '@phosphor-icons/react';
import type { CampCheckin, TaskKind, TeamStatus } from '../lib/types.ts';
import { newId } from '../lib/types.ts';
import type { State, TaskState } from '../lib/reduce.ts';
import { currentLoad, isArrived } from '../lib/reduce.ts';
import { record, useStore } from '../lib/store.ts';
import { carrierLabel } from '../lib/config.ts';
import { ago } from '../lib/format.ts';
import { DeliverBox, RelayCard, TakeLoad } from '../components/Field.tsx';
import { Badge, Empty, Notice, QtyView, useNow } from '../components/ui.tsx';

const ROLE = 'rescue';

const KIND: Record<TaskKind, string> = {
  reach: 'Reach the camp and check on it',
  carry: 'Carry supplies in on foot',
  evacuate: 'Evacuate people who need care',
};

export function RescueScreen({ unit }: { unit?: string }) {
  const { state } = useStore('staff');
  const now = useNow();
  const team = state.teams.find((t) => t.id === unit);
  if (!team)
    return (
      <div className="page wrap narrow">
        <Notice tone="amber">Your account is not linked to a team. Ask the control room to set one in Staff accounts.</Notice>
      </div>
    );
  const tasks = [...state.tasks.values()].filter((t) => t.teamId === team.id).sort((a, b) => b.createdAt - a.createdAt);
  const active = tasks.filter((t) => t.status !== 'done');
  const past = tasks.filter((t) => t.status === 'done').slice(0, 3);

  return (
    <div className="page">
      <div className="wrap narrow stack">
        <div className="row-between" style={{ alignItems: 'flex-end' }}>
          <div>
            <h1 className="page-title">{team.label}</h1>
            <p className="page-sub">{team.lead}</p>
          </div>
        </div>

        <section className="stack-sm" aria-labelledby="tasks-title">
          <h2 className="card-title" id="tasks-title">
            <PersonSimpleHike size={20} aria-hidden /> Your task
          </h2>
          {active.length === 0 && <Empty title="No task right now">The control room will assign one. Stay ready at base.</Empty>}
          {active.map((t) => (
            <TaskCard key={t.id} task={t} state={state} now={now} />
          ))}
        </section>

        <RelayCard role={ROLE} state={state} />

        {past.length > 0 && (
          <section className="stack-sm" aria-labelledby="past-title">
            <h2 className="card-title" id="past-title">Finished</h2>
            {past.map((t) => (
              <div className="card card-pad" key={t.id}>
                <span className="item-title">{state.camps.get(t.campId)?.name ?? t.campId}</span>
                <p className="small muted">
                  {KIND[t.kind]}. Done {ago(t.updatedAt, now)}.
                </p>
              </div>
            ))}
          </section>
        )}
      </div>
    </div>
  );
}

function TaskCard({ task, state, now }: { task: TaskState; state: State; now: number }) {
  const camp = state.camps.get(task.campId);
  const d = task.dispatchId ? state.dispatches.get(task.dispatchId) : undefined;
  const holding = d?.loads.at(-1)?.carrier === task.teamId;

  const status = (s: TeamStatus['status']) => {
    const ev: TeamStatus = { type: 'team.status', id: newId(), at: Date.now(), by: ROLE, teamId: task.teamId, taskId: task.id, status: s };
    record('staff', ev);
    if (s === 'on_site') {
      // Reaching the camp counts as hearing from it, even if its own phone is dead.
      const ck: CampCheckin = { type: 'camp.checkin', id: newId(), at: Date.now(), by: ROLE, via: 'relay', campId: task.campId };
      record('staff', ck);
    }
  };

  return (
    <div className="card card-pad stack-sm">
      <div className="row-between">
        <span className="item-title">{camp?.name ?? task.campId}</span>
        <Badge tone={task.status === 'on_site' ? 'green' : 'blue'}>{task.status.replace('_', ' ')}</Badge>
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
