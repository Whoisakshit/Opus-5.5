import { useState } from 'react';
import { Barricade, Truck } from '@phosphor-icons/react';
import type { DispatchBlocked } from '../lib/types.ts';
import { newId } from '../lib/types.ts';
import type { DispatchState, State } from '../lib/reduce.ts';
import { currentLoad } from '../lib/reduce.ts';
import { record, useStore } from '../lib/store.ts';
import { TRUCKS } from '../lib/config.ts';
import { ago } from '../lib/format.ts';
import { DeliverBox, Directions, RelayCard, TakeLoad } from '../components/Field.tsx';
import { Badge, Empty, Notice, QtyView, qtyLine, useNow } from '../components/ui.tsx';

const ROLE = 'driver';

export function DriverScreen({ unit }: { unit?: string }) {
  const { state } = useStore('staff');
  const now = useNow();
  const truck = TRUCKS.find((t) => t.id === unit);
  if (!truck)
    return (
      <div className="page wrap narrow">
        <Notice tone="amber">Your account has no truck assigned. Ask the control room to set one in Staff accounts.</Notice>
      </div>
    );
  const list = [...state.dispatches.values()];
  const pickups = list.filter((d) => d.status === 'packed' && d.mode === 'truck');
  const onTruck = list.filter((d) => (d.status === 'in_transit' || d.status === 'blocked') && d.loads.at(-1)?.carrier === truck.id);
  const delivered = list
    .filter((d) => d.delivered?.carrier === truck.id)
    .sort((a, b) => b.delivered!.at - a.delivered!.at)
    .slice(0, 4);

  return (
    <div className="page">
      <div className="wrap narrow stack">
        <div className="row-between" style={{ alignItems: 'flex-end' }}>
          <div>
            <h1 className="page-title">{truck.label}</h1>
            <p className="page-sub">Your loads, deliveries, and messages to carry for camps without signal.</p>
          </div>
        </div>

        <section className="stack-sm" aria-labelledby="on-truck">
          <h2 className="card-title" id="on-truck">
            <Truck size={20} aria-hidden /> On your truck
          </h2>
          {onTruck.length === 0 && <Empty title="Truck is empty">Pick up a packed load from the warehouse below.</Empty>}
          {onTruck.map((d) => (
            <Trip key={d.id} d={d} state={state} truckId={truck.id} now={now} />
          ))}
        </section>

        <section className="stack-sm" aria-labelledby="pickup">
          <h2 className="card-title" id="pickup">Ready at the warehouse</h2>
          {pickups.length === 0 && <Empty title="Nothing packed yet" />}
          {pickups.map((d) => (
            <div className="card card-pad stack-sm" key={d.id}>
              <div className="row-between">
                <span className="item-title">{state.camps.get(d.campId)?.name ?? d.campId}</span>
                <span className="mono small muted">{d.id}</span>
              </div>
              <TakeLoad role={ROLE} d={d} carrier={truck.id} label={`Load onto ${truck.label}`} />
            </div>
          ))}
        </section>

        <RelayCard role={ROLE} state={state} />

        {delivered.length > 0 && (
          <section className="stack-sm" aria-labelledby="done">
            <h2 className="card-title" id="done">Delivered</h2>
            {delivered.map((d) => (
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
