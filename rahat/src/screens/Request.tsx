import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import {
  CheckCircle,
  Clock,
  CloudSlash,
  Crosshair,
  Heartbeat,
  Keyboard,
  MapPin,
  Package,
  PaperPlaneTilt,
  PhoneCall,
  Plus,
  QrCode,
  WifiMedium,
} from '@phosphor-icons/react';
import type { CampCheckin, CampReport, DispatchReceive, Ev, Qty } from '../lib/types.ts';
import { newId, zeroQty } from '../lib/types.ts';
import type { CampState, DispatchState, State } from '../lib/reduce.ts';
import { clampQty, currentLoad, subQty, totalQty } from '../lib/reduce.ts';
import type { Encodable } from '../lib/codec.ts';
import { myCampIds, record, registerCamp, useStore } from '../lib/store.ts';
import type { NetState } from '../lib/net.ts';
import { useNetwork } from '../lib/net.ts';
import { CONTROL_ROOM_SMS, EMERGENCY, carrierLabel } from '../lib/config.ts';
import { ago, fmtCoord } from '../lib/format.ts';
import type { Picked } from '../components/Map.tsx';
import { LocationPicker } from '../components/Map.tsx';
import { SendOptions } from '../components/Codes.tsx';
import { Badge, NumberInput, Notice, QtyInputs, QtyView, qtyLine, useNow } from '../components/ui.tsx';

const SCOPE = 'public';
const ENCODABLE = new Set<Ev['type']>(['camp.report', 'camp.checkin', 'dispatch.receive']);

const STATUS: Record<DispatchState['status'], [string, 'blue' | 'green' | 'red']> = {
  approved: ['Approved', 'blue'],
  packed: ['Packed', 'blue'],
  in_transit: ['On the way', 'blue'],
  blocked: ['Road blocked', 'red'],
  delivered: ['Delivered', 'green'],
  received: ['Received', 'green'],
};

const STATUS_TEXT: Record<DispatchState['status'], string> = {
  approved: 'Approved by the control room. Being packed at the warehouse.',
  packed: 'Packed and waiting for a truck.',
  in_transit: 'On the way to you.',
  blocked: 'The road is blocked. A rescue team will carry it to you on foot.',
  delivered: 'Marked delivered. Please count it and confirm below.',
  received: 'Received.',
};

export function RequestScreen() {
  const { box, state } = useStore(SCOPE);
  const net = useNetwork(box);
  const now = useNow();
  const mine = myCampIds().filter((id) => state.camps.has(id));
  const [active, setActive] = useState<string>(() => mine.at(-1) ?? 'new');
  const camp = active === 'new' ? undefined : state.camps.get(active);

  const pending = useMemo(() => {
    const ids = new Set(box.outbox);
    return box.events.filter((e): e is Encodable => ids.has(e.id) && ENCODABLE.has(e.type));
  }, [box.events, box.outbox]);

  const deliveries = [...state.dispatches.values()]
    .filter((d) => d.campId === active && d.status !== 'received')
    .sort((a, b) => b.approvedAt - a.approvedAt);

  return (
    <div className="page">
      <div className="wrap stack">
        <div className="row-between" style={{ alignItems: 'flex-end' }}>
          <div>
            <h1 className="page-title">{camp ? camp.name : 'Request help'}</h1>
            <p className="page-sub">
              {camp
                ? 'Your request and everything on its way to you. Keep this page; it works offline.'
                : 'Tell the control room where you are and what you need. It takes about two minutes.'}
            </p>
          </div>
          {mine.length > 0 && (
            <div className="row" role="group" aria-label="Your requests">
              {mine.map((id) => (
                <button key={id} type="button" className={`btn btn-sm${active === id ? ' btn-selected' : ''}`} aria-pressed={active === id} onClick={() => setActive(id)}>
                  {state.camps.get(id)?.name}
                </button>
              ))}
              <button type="button" className={`btn btn-sm${active === 'new' ? ' btn-selected' : ''}`} aria-pressed={active === 'new'} onClick={() => setActive('new')}>
                <Plus size={16} aria-hidden /> Another place
              </button>
            </div>
          )}
        </div>

        <div className="req-grid">
          <div className="stack">
            <NetBanner net={net} pending={pending.length} />
            {camp && <StatusCard camp={camp} state={state} sent={!box.outbox.includes(camp.report.id)} now={now} />}
            {deliveries.map((d) => (
              <Delivery key={d.id} d={d} />
            ))}
            <ReportForm key={active} camp={camp} onSent={setActive} />
            {camp && <Checkin camp={camp} />}
          </div>

          <aside className="stack req-aside" aria-label="Help with sending">
            {pending.length > 0 && <Outbox events={pending} open={net !== 'online'} now={now} />}
            <SignalHelp />
            <Emergency />
          </aside>
        </div>
      </div>
    </div>
  );
}

function NetBanner({ net, pending }: { net: NetState; pending: number }) {
  if (net === 'offline')
    return (
      <div className="notice notice-amber" role="status">
        <CloudSlash size={18} weight="fill" aria-hidden />
        <div>
          <b>No connection right now.</b> Fill in the form anyway. It is saved on this phone and sends by itself when signal returns.
          {pending > 0 && ' If it is urgent, use "Send by SMS" or show the QR code.'}
        </div>
      </div>
    );
  if (net === 'weak')
    return (
      <div className="notice notice-amber" role="status">
        <WifiMedium size={18} weight="fill" aria-hidden />
        <div>
          <b>Weak connection.</b> We keep trying in the background{pending > 0 ? '. SMS is the faster option right now.' : '.'}
        </div>
      </div>
    );
  return null;
}

function StatusCard({ camp, state, sent, now }: { camp: CampState; state: State; sent: boolean; now: number }) {
  const r = camp.report;
  const task = [...state.tasks.values()].find((t) => t.campId === camp.id && t.status !== 'done');
  const team = task ? state.teams.find((t) => t.id === task.teamId) : undefined;
  return (
    <section className="card card-pad stack-sm" aria-labelledby="status-title">
      <h2 className="card-title" id="status-title">
        Your request
      </h2>
      <ul className="status-list">
        <li className={sent ? 'ok' : 'wait'}>
          {sent ? <CheckCircle size={20} weight="fill" aria-hidden /> : <Clock size={20} aria-hidden />}
          <span>{sent ? `The control room has it. Sent ${ago(r.at, now)}.` : 'Saved on this phone. It sends when there is signal.'}</span>
        </li>
        <li className={camp.verified ? 'ok' : 'wait'}>
          {camp.verified ? <CheckCircle size={20} weight="fill" aria-hidden /> : <PhoneCall size={20} aria-hidden />}
          <span>
            {camp.verified
              ? 'Confirmed by the control room.'
              : `Waiting to be confirmed.${r.phone ? ` Keep ${r.phone} switched on; they may call you.` : ''}`}
          </span>
        </li>
        {team && task && (
          <li className="ok">
            <CheckCircle size={20} weight="fill" aria-hidden />
            <span>
              {team.label} is {task.status === 'on_site' ? 'with you' : 'on the way to you'}.
            </span>
          </li>
        )}
      </ul>
      {totalQty(camp.need) > 0 && (
        <p className="small muted">Still needed after what is on the way: {qtyLine(camp.need)}.</p>
      )}
    </section>
  );
}

function Outbox({ events, open: startOpen, now }: { events: Encodable[]; open: boolean; now: number }) {
  const [open, setOpen] = useState<string | null>(startOpen ? events.at(-1)!.id : null);
  return (
    <section className="card card-pad" aria-labelledby="outbox-title">
      <div className="card-head">
        <h2 className="card-title" id="outbox-title">
          <PaperPlaneTilt size={20} aria-hidden /> Not sent yet
        </h2>
        <Badge tone="amber">{events.length}</Badge>
      </div>
      <p className="muted small" style={{ marginBottom: 12 }}>
        Safe on this phone. If it is urgent, send it another way now.
      </p>
      <div className="stack-sm">
        {events.map((e) => (
          <div key={e.id} className="subtle">
            <div className="row-between">
              <span style={{ fontWeight: 600 }}>
                {e.type === 'camp.report' ? 'Request' : e.type === 'camp.checkin' ? 'Check-in' : 'Delivery receipt'}
                <span className="muted" style={{ fontWeight: 400 }}> {ago(e.at, now)}</span>
              </span>
              <button type="button" className="btn btn-sm btn-quiet" aria-expanded={open === e.id} onClick={() => setOpen(open === e.id ? null : e.id)}>
                {open === e.id ? 'Hide' : 'Send another way'}
              </button>
            </div>
            {open === e.id && (
              <div style={{ marginTop: 12 }}>
                <SendOptions ev={e} />
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function SignalHelp() {
  return (
    <section className="card card-pad stack-sm" aria-labelledby="signal-help">
      <h2 className="card-title" id="signal-help">
        <QrCode size={20} aria-hidden /> If your request will not send
      </h2>
      <ol className="mini-steps">
        <li>Keep this page open. It retries by itself.</li>
        <li>
          With phone signal but no data, press <b>Send another way</b> then <b>Send by SMS</b>
          {CONTROL_ROOM_SMS ? ` (to ${CONTROL_ROOM_SMS})` : ''}.
        </li>
        <li>With no signal at all, show the QR code to any relief truck or rescue team.</li>
      </ol>
    </section>
  );
}

function Emergency() {
  return (
    <section className="sos sos-compact" aria-labelledby="sos-side">
      <h2 id="sos-side">Life in danger? Call now</h2>
      <ul className="sos-list">
        {EMERGENCY.map((n) => (
          <li key={n.number}>
            <a href={`tel:${n.number}`}>
              <span className="sos-num">{n.number}</span>
              <span>{n.label}</span>
              <PhoneCall size={18} aria-hidden />
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Delivery({ d }: { d: DispatchState }) {
  const [count, setCount] = useState<Qty>(currentLoad(d));
  const [confirming, setConfirming] = useState(false);
  const canConfirm = d.status === 'in_transit' || d.status === 'blocked' || d.status === 'delivered';
  const [label, tone] = STATUS[d.status];

  const confirm = () => {
    const ev: DispatchReceive = { type: 'dispatch.receive', id: newId(), at: Date.now(), by: 'camp', dispatchId: d.id, campId: d.campId, items: count };
    record(SCOPE, ev);
    setConfirming(false);
  };

  return (
    <section className="card card-pad" aria-label={`Delivery ${d.id}`}>
      <div className="card-head">
        <h2 className="card-title">
          <Package size={20} aria-hidden /> Supplies coming to you
        </h2>
        <Badge tone={tone}>{label}</Badge>
      </div>
      <div className="stack-sm">
        <QtyView q={currentLoad(d)} />
        <p className="small muted">
          {STATUS_TEXT[d.status]}
          {d.loads.length > 0 && d.status !== 'delivered' ? ` With ${carrierLabel(d.loads.at(-1)!.carrier)}.` : ''}
        </p>
        {d.code && (
          <div className="subtle row-between">
            <span>
              <span className="label">Handover code</span>
              <br />
              <span className="small muted">Say it to the driver only once the goods are with you.</span>
            </span>
            <span className="handover">{d.code}</span>
          </div>
        )}
        {canConfirm && !confirming && (
          <button type="button" className="btn btn-primary" onClick={() => setConfirming(true)}>
            <CheckCircle size={18} aria-hidden /> We received it. Count and confirm
          </button>
        )}
        {confirming && (
          <div className="stack-sm">
            <p className="label">Count what actually arrived</p>
            <QtyInputs idPrefix={`recv-${d.id}`} value={count} onChange={setCount} />
            <p className="help">If anything is short, the control room can see at which handover it went missing.</p>
            <div className="row">
              <button type="button" className="btn btn-primary" onClick={confirm}>
                Confirm receipt
              </button>
              <button type="button" className="btn" onClick={() => setConfirming(false)}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function ReportForm({ camp, onSent }: { camp?: CampState; onSent: (campId: string) => void }) {
  const r = camp?.report;
  const isNew = !camp;
  const [name, setName] = useState(r?.name ?? '');
  const [reporter, setReporter] = useState(r?.reporter ?? '');
  const [phone, setPhone] = useState(r?.phone ?? '');
  const [loc, setLoc] = useState<Picked | null>(r ? { lat: r.lat, lng: r.lng, acc: r.acc, src: r.locSrc } : null);
  const [typing, setTyping] = useState(false);
  const [gps, setGps] = useState<'idle' | 'busy' | string>('idle');
  const [people, setPeople] = useState(camp?.people ?? 0);
  const [children, setChildren] = useState(r?.children ?? 0);
  const [elderly, setElderly] = useState(r?.elderly ?? 0);
  const [injured, setInjured] = useState(r?.injured ?? 0);
  // Last reported shortfall minus what has arrived since. Not minus what is still on
  // the way: the control room subtracts that itself, so subtracting here would count it twice.
  const [needs, setNeeds] = useState<Qty>(r ? clampQty(subQty(r.needs, camp!.deliveredSince)) : zeroQty());
  const [medical, setMedical] = useState(r?.medical ?? false);
  const [trapped, setTrapped] = useState(r?.trapped ?? false);
  const [roadBlocked, setRoadBlocked] = useState(r?.roadBlocked ?? false);
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [sent, setSent] = useState(false);

  const useGps = () => {
    if (!('geolocation' in navigator)) return setGps('This phone cannot share its location. Tap the map instead.');
    setGps('busy');
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setLoc({ lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy, src: 'gps' });
        setGps('idle');
      },
      (err) =>
        setGps(
          err.code === err.PERMISSION_DENIED
            ? 'Location permission is off. Allow it in your browser, or tap the map.'
            : 'No GPS fix yet. Step outside, wait a moment and try again, or tap the map.',
        ),
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 60_000 },
    );
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const errs: string[] = [];
    if (name.trim().length < 3) errs.push('Enter the name of the place, for example the school or village.');
    if (!loc) errs.push('Set your location: press "Use GPS", tap the map, or type coordinates.');
    if (people < 1) errs.push('Enter how many people are with you.');
    if (children + elderly + injured > people) errs.push('Children, elderly and injured cannot add up to more than the total.');
    if (phone && !/^\+?[0-9 ()-]{6,20}$/.test(phone.trim())) errs.push('Check the phone number. Use digits only, with +91 if you like.');
    setErrors(errs);
    if (errs.length || !loc) {
      requestAnimationFrame(() => document.getElementById('report-errors')?.focus());
      return;
    }
    const campId = camp?.id ?? `C${newId(5).toUpperCase()}`;
    registerCamp(campId);
    const ev: CampReport = {
      type: 'camp.report',
      id: newId(),
      at: Date.now(),
      by: 'camp',
      campId,
      name: name.trim(),
      lat: loc.lat,
      lng: loc.lng,
      acc: loc.acc ? Math.round(loc.acc) : undefined,
      locSrc: loc.src,
      people,
      children,
      elderly,
      injured,
      needs,
      medical,
      trapped,
      roadBlocked,
      note: note.trim() || undefined,
      reporter: reporter.trim() || undefined,
      phone: phone.trim() || undefined,
    };
    record(SCOPE, ev);
    setSent(true);
    setNote('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    onSent(campId);
  };

  return (
    <form className="card card-pad stack" onSubmit={submit} noValidate aria-labelledby="report-title">
      <div>
        <h2 className="card-title" id="report-title">
          <MapPin size={20} aria-hidden /> {isNew ? 'Where are you, and what do you need?' : 'Update your request'}
        </h2>
        <p className="muted small" style={{ marginTop: 4 }}>
          {isNew
            ? 'One request per place. If many families are together, send one request for all of them.'
            : 'A new update replaces the last one. Give what you still need today; anything already on the way is counted for you.'}
        </p>
      </div>

      {sent && !isNew && <Notice tone="green">Update saved. It goes to the control room as soon as this phone has signal.</Notice>}

      <div className="grid-2">
        <div className="field" style={{ gridColumn: '1 / -1' }}>
          <label htmlFor="place">Name of the place</label>
          <input id="place" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Govt. Inter College, Kalsi" autoComplete="off" />
        </div>
        <div className="field">
          <label htmlFor="reporter">Your name</label>
          <input id="reporter" className="input" value={reporter} onChange={(e) => setReporter(e.target.value)} autoComplete="name" />
        </div>
        <div className="field">
          <label htmlFor="phone">Phone number for a call back</label>
          <input id="phone" className="input" type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="e.g. 98xxx xxxxx" />
        </div>
      </div>

      <fieldset className="stack-sm plain">
        <legend className="label">Exact location</legend>
        <LocationPicker value={loc} onChange={setLoc} />
        <div className="row-between">
          <span className="small num" aria-live="polite">
            {loc ? (
              <>
                {fmtCoord(loc.lat, loc.lng)}
                <span className="muted">
                  {loc.acc ? ` within ${Math.round(loc.acc)} m` : ''}, from {loc.src === 'gps' ? 'GPS' : loc.src === 'map' ? 'map pin' : 'typed numbers'}
                </span>
              </>
            ) : (
              <span className="muted">No location yet. Press "Use GPS" or tap the map.</span>
            )}
          </span>
          <div className="row">
            <button type="button" className="btn btn-sm" onClick={() => setTyping((t) => !t)} aria-expanded={typing}>
              <Keyboard size={17} aria-hidden /> Type
            </button>
            <button type="button" className="btn btn-sm btn-primary" onClick={useGps} disabled={gps === 'busy'}>
              <Crosshair size={17} aria-hidden /> {gps === 'busy' ? 'Finding you…' : 'Use GPS'}
            </button>
          </div>
        </div>
        {gps !== 'idle' && gps !== 'busy' && <p className="error-text">{gps}</p>}
        {typing && <CoordInputs loc={loc} onChange={setLoc} />}
        <p className="help">GPS works without internet. The map picture needs data, but your pin is saved either way.</p>
      </fieldset>

      <fieldset className="stack-sm plain">
        <legend className="label">People with you</legend>
        <div className="grid-4">
          {(
            [
              ['people', 'Total', people, setPeople],
              ['children', 'Children under 5', children, setChildren],
              ['elderly', 'Elderly', elderly, setElderly],
              ['injured', 'Injured or sick', injured, setInjured],
            ] as const
          ).map(([id, label, value, set]) => (
            <div className="field" key={id}>
              <label htmlFor={`p-${id}`}>{label}</label>
              <NumberInput id={`p-${id}`} value={value} onChange={set} max={100_000} />
            </div>
          ))}
        </div>
      </fieldset>

      <fieldset className="stack-sm plain">
        <legend className="label">What you still need</legend>
        <QtyInputs idPrefix="need" value={needs} onChange={setNeeds} />
      </fieldset>

      <fieldset className="stack-sm plain">
        <legend className="label">Anything urgent?</legend>
        <div className="checks">
          <label className="check">
            <input type="checkbox" checked={medical} onChange={(e) => setMedical(e.target.checked)} />
            <span>Medical emergency<span className="help">Someone needs a doctor or to be taken to hospital.</span></span>
          </label>
          <label className="check">
            <input type="checkbox" checked={trapped} onChange={(e) => setTrapped(e.target.checked)} />
            <span>People trapped<span className="help">Cut off by water or debris and cannot get out.</span></span>
          </label>
          <label className="check">
            <input type="checkbox" checked={roadBlocked} onChange={(e) => setRoadBlocked(e.target.checked)} />
            <span>Road to us is blocked<span className="help">Supplies will be carried in on foot.</span></span>
          </label>
        </div>
      </fieldset>

      <div className="field">
        <label htmlFor="note">Anything else (optional)</label>
        <textarea id="note" className="textarea" value={note} onChange={(e) => setNote(e.target.value)} maxLength={280} placeholder="e.g. Landmark: next to the temple, approach from the river side" />
        <span className="help">Sent over the internet only. It does not fit in the SMS.</span>
      </div>

      {errors.length > 0 && (
        <div id="report-errors" tabIndex={-1}>
          <Notice tone="red">
            {errors.map((e) => (
              <p key={e}>{e}</p>
            ))}
          </Notice>
        </div>
      )}

      <button type="submit" className="btn btn-primary btn-lg btn-block">
        <PaperPlaneTilt size={20} aria-hidden /> {isNew ? 'Send request' : 'Send update'}
      </button>
    </form>
  );
}

function CoordInputs({ loc, onChange }: { loc: Picked | null; onChange: (p: Picked) => void }) {
  const [lat, setLat] = useState(loc ? loc.lat.toFixed(5) : '');
  const [lng, setLng] = useState(loc ? loc.lng.toFixed(5) : '');
  const la = Number(lat);
  const ln = Number(lng);
  const ok = lat !== '' && lng !== '' && Number.isFinite(la) && Number.isFinite(ln) && Math.abs(la) <= 90 && Math.abs(ln) <= 180;
  return (
    <div className="subtle stack-sm">
      <div className="grid-2">
        <div className="field">
          <label htmlFor="lat">Latitude</label>
          <input id="lat" className="input" inputMode="decimal" value={lat} onChange={(e) => setLat(e.target.value)} placeholder="30.32710" />
        </div>
        <div className="field">
          <label htmlFor="lng">Longitude</label>
          <input id="lng" className="input" inputMode="decimal" value={lng} onChange={(e) => setLng(e.target.value)} placeholder="78.13740" />
        </div>
      </div>
      <button type="button" className="btn btn-sm" disabled={!ok} onClick={() => onChange({ lat: la, lng: ln, src: 'manual' })}>
        Place pin here
      </button>
    </div>
  );
}

function Checkin({ camp }: { camp: CampState }) {
  const [people, setPeople] = useState(camp.people);
  const [done, setDone] = useState(false);
  const send = () => {
    const ev: CampCheckin = { type: 'camp.checkin', id: newId(), at: Date.now(), by: 'camp', campId: camp.id, people };
    record(SCOPE, ev);
    setDone(true);
  };
  return (
    <section className="card card-pad stack-sm" aria-labelledby="checkin-title">
      <h2 className="card-title" id="checkin-title">
        <Heartbeat size={20} aria-hidden /> All OK check-in
      </h2>
      <p className="muted small">
        Send this every few hours, even when you need nothing new. If a camp goes quiet, the control room sends a team to check.
      </p>
      <div className="row" style={{ alignItems: 'flex-end' }}>
        <div className="field" style={{ width: 140 }}>
          <label htmlFor="ck-people">People now</label>
          <NumberInput id="ck-people" value={people} onChange={setPeople} max={100_000} />
        </div>
        <button type="button" className="btn" onClick={send}>
          Send check-in
        </button>
      </div>
      {done && <p className="small" style={{ color: 'var(--green)' }}>Check-in saved. Your last request still stands.</p>}
    </section>
  );
}
