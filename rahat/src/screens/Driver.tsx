import { useState } from 'react';
import { Barricade, Truck } from '@phosphor-icons/react';
import type { DispatchBlocked } from '../lib/types.ts';
import { newId } from '../lib/types.ts';
import type { DispatchState, State } from '../lib/reduce.ts';
import { currentLoad } from '../lib/reduce.ts';
import { record, useStore } from '../lib/store.ts';
import { TRUCKS, WAREHOUSE } from '../lib/config.ts';
import { ago, distanceM, km } from '../lib/format.ts';
import type { MapPoint } from '../components/Dashboard.tsx';
import { DashStats, FocusMap, NewAlert, useNewItems } from '../components/Dashboard.tsx';
import { DeliverBox, Directions, LiveLocation, TakeLoad } from '../components/Field.tsx';
import { Badge, Empty, Notice, QtyView, qtyLine, useNow } from '../components/ui.tsx';

const ROLE = 'driver';

export function DriverScreen({ unit, asAdmin }: { unit?: string; asAdmin?: boolean }) {
  const { state } = useStore('staff');
  const now = useNow();
  const list = [...state.dispatches.values()];
  // Loads the officer assigned to this truck come first; unassigned ones any truck may take.
  const pickups = list
    .filter((d) => d.status === 'packed' && d.mode === 'truck' && (!d.truck || d.truck === unit))
    .sort((a, b) => Number(!!b.truck) - Number(!!a.truck));
  const { fresh, markSeen } = useNewItems(`${asAdmin ? 'admin:' : ''}load:${unit}`, pickups.map((d) => d.id));
  const truck = TRUCKS.find((t) => t.id === unit);
  if (!truck)
    return (
      <div className="page wrap narrow">
        <Notice tone="amber">Your account has no truck assigned. Ask the control room to set one in Staff accounts.</Notice>
      </div>
    );
  const onTruck = list.filter((d) => (d.status === 'in_transit' || d.status === 'blocked') && d.loads.at(-1)?.carrier === truck.id);
  const delivered = list
    .filter((d) => d.delivered?.carrier === truck.id)
    .sort((a, b) => b.delivered!.at - a.delivered!.at);
  const raw = state.units.get(truck.id);
  const live = raw && now - raw.at < 30 * 60_000 ? raw : undefined;
  const stops = onTruck.flatMap((d) => {
    const c = state.camps.get(d.campId);
    return c ? [{ id: d.id, lat: c.lat, lng: c.lng, label: c.name, tone: d.status === 'blocked' ? ('red' as const) : ('blue' as const) }] : [];
  });
  const points: MapPoint[] = stops.length
    ? stops
    : pickups.length
      ? [{ id: 'wh', lat: WAREHOUSE.lat, lng: WAREHOUSE.lng, label: `${WAREHOUSE.name}: ${pickups.length} to collect`, tone: 'green' }]
      : [];
  const next = stops[0];

  return (
    <div className="page">
      <div className="wrap stack">
        <NewAlert
          count={fresh.length}
          title={fresh.length === 1 ? 'A load is ready for you at the warehouse' : `${fresh.length} loads are ready for you at the warehouse`}
          onSeen={markSeen}
        >
          {fresh.map((id) => state.camps.get(state.dispatches.get(id)?.campId ?? '')?.name).filter(Boolean).join(', ')}.
        </NewAlert>

        <div>
          <h1 className="page-title">{truck.label}</h1>
          <p className="page-sub">
            {truck.driver}. Loads the control room assigns to you appear here.
          </p>
        </div>

        <DashStats
          items={[
            { value: pickups.length, label: 'Ready to collect', dot: fresh.length > 0 },
            { value: onTruck.length, label: 'On your truck' },
            { value: delivered.length, label: 'Delivered' },
            { value: next && live ? km(distanceM(live.lat, live.lng, next.lat, next.lng)) : '-', label: next ? `To ${next.label}` : 'No stop yet' },
          ]}
        />

        <div className="dash">
          <div className="stack">
            <section className="stack-sm" aria-labelledby="on-truck">
              <h2 className="card-title" id="on-truck">
                <Truck size={20} aria-hidden /> On your truck
              </h2>
              {onTruck.length === 0 && <Empty title="Truck is empty">Collect a packed load from the warehouse below.</Empty>}
              {onTruck.map((d) => (
                <Trip key={d.id} d={d} state={state} truckId={truck.id} now={now} />
              ))}
            </section>

            <section className="stack-sm" aria-labelledby="pickup">
              <h2 className="card-title" id="pickup">Ready at the warehouse</h2>
              {pickups.length === 0 && <Empty title="Nothing ready yet" />}
              {pickups.map((d) => (
                <div className={`card card-pad stack-sm${fresh.includes(d.id) ? ' is-new' : ''}`} key={d.id}>
                  <div className="row-between">
                    <span className="item-title">{state.camps.get(d.campId)?.name ?? d.campId}</span>
                    {d.truck ? <Badge tone="blue">Assigned to you</Badge> : <span className="mono small muted">{d.id}</span>}
                  </div>
                  <TakeLoad role={ROLE} d={d} carrier={truck.id} label={`Load onto ${truck.label}`} />
                </div>
              ))}
            </section>
          </div>

          <div className="stack dash-side">
            <section className="card map-card" aria-label="Where to go">
              <FocusMap points={points} me={live} />
            </section>
            {!asAdmin && <LiveLocation role="driver" unit={truck.id} />}
            {delivered.length > 0 && (
              <section className="stack-sm" aria-labelledby="done">
                <h2 className="card-title" id="done">Delivered</h2>
                {delivered.slice(0, 4).map((d) => (
                  <div className="card card-pad" key={d.id}>
                    <div className="row-between">
                      <span className="item-title">{state.camps.get(d.campId)?.name ?? d.campId}</span>
                      <Badge tone={d.received ? 'green' : 'amber'}>{d.received ? 'Camp confirmed' : 'Awaiting camp count'}</Badge>
                    </div>
                    <p className="small muted" style={{ marginTop: 4 }}>
                      {qtyLine(currentLoad(d))}. {ago(d.delivered!.at, now)}.
                    </p>
                  </div>
                ))}
              </section>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Trip({ d, state, truckId, now }: { d: DispatchState; state: State; truckId: string; now: number }) {
  const camp = state.camps.get(d.campId);
  const [locating, setLocating] = useState(false);

  const reportBlocked = () => {
    const save = (lat?: number, lng?: number) => {
      const ev: DispatchBlocked = { type: 'dispatch.blocked', id: newId(), at: Date.now(), by: ROLE, dispatchId: d.id, lat, lng };
      record('staff', ev);
      setLocating(false);
    };
    if (!('geolocation' in navigator)) return save();
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => save(p.coords.latitude, p.coords.longitude),
      () => save(),
      { enableHighAccuracy: true, timeout: 8_000, maximumAge: 120_000 },
    );
  };

  return (
    <div className="card card-pad stack-sm">
      <div className="row-between">
        <span className="item-title">{camp?.name ?? d.campId}</span>
        <Badge tone={d.status === 'blocked' ? 'red' : 'blue'}>{d.status === 'blocked' ? 'Road blocked' : 'On the way'}</Badge>
      </div>
      <p className="small muted">Loaded {ago(d.loads.at(-1)!.at, now)}.</p>
      <QtyView q={currentLoad(d)} />
      {camp && (
        <div className="row">
          <Directions camp={camp} />
        </div>
      )}
      {d.status === 'blocked' ? (
        <Notice tone="amber">You reported the road blocked. Stay with the load; a rescue team will come and take it on foot.</Notice>
      ) : (
        <>
          <DeliverBox role={ROLE} d={d} carrier={truckId} />
          <button type="button" className="btn btn-danger" onClick={reportBlocked} disabled={locating}>
            <Barricade size={18} aria-hidden /> {locating ? 'Getting location…' : 'Road blocked'}
          </button>
        </>
      )}
    </div>
  );
}
