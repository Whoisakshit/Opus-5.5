import { useEffect, useRef, useState } from 'react';
import { CheckCircle, MapPinLine, NavigationArrow } from '@phosphor-icons/react';
import type { DispatchDeliver, DispatchLoad, Qty, Role, UnitLocation } from '../lib/types.ts';
import { ITEMS, newId } from '../lib/types.ts';
import type { CampState, DispatchState, State } from '../lib/reduce.ts';
import { currentLoad } from '../lib/reduce.ts';
import { record } from '../lib/store.ts';
import { codeHash } from '../lib/hash.ts';
import { WAREHOUSE } from '../lib/config.ts';
import { ago, distanceM, km } from '../lib/format.ts';
import { CodeReader } from './Codes.tsx';
import { QtyInputs, useNow } from './ui.tsx';

/**
 * Proof of delivery. The camp leader holds a 4-digit code and says it only once
 * the goods are in hand. The carrier's phone checks it locally, so this works
 * with no signal at the camp.
 */
export function DeliverBox({ role, d, carrier }: { role: Role; d: DispatchState; carrier: string }) {
  const [code, setCode] = useState('');
  const [wrong, setWrong] = useState(0);

  const deliver = (codeOk: boolean) => {
    const ev: DispatchDeliver = { type: 'dispatch.deliver', id: newId(), at: Date.now(), by: role, dispatchId: d.id, carrier, codeOk };
    record('staff', ev);
  };

  return (
    <div className="subtle stack-sm">
      <div className="field">
        <label htmlFor={`code-${d.id}`}>Camp's delivery code</label>
        <div className="row" style={{ flexWrap: 'nowrap' }}>
          <input
            id={`code-${d.id}`}
            className="input mono"
            style={{ maxWidth: 140, fontSize: 20, letterSpacing: '0.2em', textAlign: 'center' }}
            inputMode="numeric"
            autoComplete="off"
            maxLength={4}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
          />
          <button
            type="button"
            className="btn btn-primary"
            disabled={code.length !== 4}
            onClick={async () => ((await codeHash(d.id, code)) === d.codeHash ? deliver(true) : setWrong((w) => w + 1))}
          >
            <CheckCircle size={18} aria-hidden /> Confirm delivery
          </button>
        </div>
        <span className="help">Ask the camp leader for it after unloading. Your phone checks it, no signal needed.</span>
      </div>
      {wrong > 0 && <p className="error-text">That code does not match. Ask the camp leader to read it again.</p>}
      {wrong > 1 && (
        <button type="button" className="btn btn-sm btn-danger" onClick={() => deliver(false)}>
          Deliver without the code (control room is alerted)
        </button>
      )}
    </div>
  );
}

/** Custody handover: count what you are taking. Any difference from the last count is flagged. */
export function TakeLoad({ role, d, carrier, label }: { role: Role; d: DispatchState; carrier: string; label: string }) {
  const [count, setCount] = useState<Qty>(currentLoad(d));
  const prev = currentLoad(d);
  const short = ITEMS.some((k) => count[k] < prev[k]);
  return (
    <div className="stack-sm">
      <p className="label">Count what you are taking</p>
      <QtyInputs idPrefix={`take-${d.id}`} value={count} of={prev} onChange={setCount} />
      {short && <p className="help" style={{ color: 'var(--amber)' }}>Less than the last count. The control room will see the gap at this handover.</p>}
      <button
        type="button"
        className="btn btn-primary"
        onClick={() => {
          const ev: DispatchLoad = { type: 'dispatch.load', id: newId(), at: Date.now(), by: role, dispatchId: d.id, carrier, items: count };
          record('staff', ev);
        }}
      >
        {label}
      </button>
    </div>
  );
}

export function Directions({ camp }: { camp: CampState }) {
  const href = `https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=${WAREHOUSE.lat}%2C${WAREHOUSE.lng}%3B${camp.lat}%2C${camp.lng}`;
  return (
    <a className="btn btn-sm" href={href} target="_blank" rel="noreferrer">
      <NavigationArrow size={17} aria-hidden /> Directions ({km(distanceM(WAREHOUSE.lat, WAREHOUSE.lng, camp.lat, camp.lng))} straight line)
    </a>
  );
}

/** Drivers and teams pass through cut-off areas. Their phones carry camp messages out. */
export function RelayCard({ role, state }: { role: Role; state: State }) {
  const ids = new Set(state.events.map((e) => e.id));
  return (
    <section className="card card-pad stack-sm" aria-labelledby={`relay-${role}`}>
      <h2 className="card-title" id={`relay-${role}`}>Carry a message from a camp</h2>
      <p className="small muted">
        Passing a camp with no signal? Scan or type its code. Your phone sends it when you are back in range.
      </p>
      <CodeReader via="relay" cta="Carry this message" isKnown={(id) => ids.has(id)} onAccept={(ev) => record('staff', ev)} />
    </section>
  );
}

/**
 * Live location for a truck or rescue team. While this screen is open the phone
 * sends its GPS position about once a minute, or sooner after moving 150 m.
 * With no signal the positions wait in the outbox and arrive later as a trail.
 * Browsers pause GPS when the screen locks, so we ask to keep the screen on.
 */
export function LiveLocation({ role, unit }: { role: 'driver' | 'rescue'; unit: string }) {
  const key = `rahat:v2:share:${unit}`;
  const [on, setOn] = useState(() => {
    try {
      return localStorage.getItem(key) !== 'off';
    } catch {
      return true;
    }
  });
  const [last, setLast] = useState<{ at: number; acc: number } | null>(null);
  const [error, setError] = useState('');
  const sent = useRef<{ lat: number; lng: number; at: number } | null>(null);
  const now = useNow(15_000);

  useEffect(() => {
    try {
      localStorage.setItem(key, on ? 'on' : 'off');
    } catch {
      /* storage unavailable */
    }
    if (!on) return;
    if (!('geolocation' in navigator)) {
      setError('This phone cannot share its location.');
      return;
    }
    let lock: WakeLockSentinel | undefined;
    navigator.wakeLock?.request('screen').then((l) => (lock = l)).catch(() => {});
    const onFix = (p: GeolocationPosition) => {
      const { latitude: lat, longitude: lng, accuracy } = p.coords;
      const at = Date.now();
      const prev = sent.current;
      if (prev && at - prev.at < 60_000 && distanceM(prev.lat, prev.lng, lat, lng) < 150) return;
      const ev: UnitLocation = { type: 'unit.location', id: newId(), at, by: role, unit, lat, lng, acc: Math.round(accuracy) };
      record('staff', ev);
      sent.current = { lat, lng, at };
      setLast({ at, acc: Math.round(accuracy) });
      setError('');
    };
    const onError = (e: GeolocationPositionError) =>
      setError(e.code === e.PERMISSION_DENIED ? 'Location permission is off. Allow it in the browser settings to share your position.' : 'Waiting for a GPS fix…');
    const opts = { enableHighAccuracy: true, maximumAge: 30_000, timeout: 60_000 };
    const watch = navigator.geolocation.watchPosition(onFix, onError, opts);
    // watchPosition only fires on movement; this keeps a once-a-minute heartbeat while standing still.
    const beat = setInterval(() => navigator.geolocation.getCurrentPosition(onFix, () => {}, opts), 60_000);
    return () => {
      navigator.geolocation.clearWatch(watch);
      clearInterval(beat);
      void lock?.release().catch(() => {});
    };
  }, [on, unit, role, key]);

  return (
    <section className="card card-pad stack-sm" aria-labelledby={`live-${unit}`}>
      <div className="row-between">
        <h2 className="card-title" id={`live-${unit}`}>
          <MapPinLine size={20} aria-hidden /> Live location
        </h2>
        <button type="button" className={`btn btn-sm${on ? '' : ' btn-primary'}`} onClick={() => setOn((v) => !v)} aria-pressed={on}>
          {on ? 'Stop sharing' : 'Share my location'}
        </button>
      </div>
      <p className="small muted">
        {on
          ? last
            ? `Shared with the control room ${ago(last.at, now)}, accurate to about ${last.acc} m. Keep this screen open.`
            : 'Getting your position…'
          : 'Off. The control room cannot see where you are.'}
      </p>
      {on && error && <p className="error-text">{error}</p>}
    </section>
  );
}
