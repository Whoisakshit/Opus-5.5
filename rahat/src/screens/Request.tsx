import { useMemo, useRef, useState } from 'react';
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
  ChatText,
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
import { ITEMS } from '../lib/types.ts';
import { fmtCoord } from '../lib/format.ts';
import { agoIn, useT } from '../lib/i18n.ts';
import type { Strings } from '../lib/i18n.ts';
import { placeName } from '../lib/geocode.ts';
import type { Picked } from '../components/Map.tsx';
import { LocationPicker } from '../components/Map.tsx';
import { SendOptions } from '../components/Codes.tsx';
import { Badge, NumberInput, Notice, QtyInputs, QtyView, useNow } from '../components/ui.tsx';

const SCOPE = 'public';
const ENCODABLE = new Set<Ev['type']>(['camp.report', 'camp.checkin', 'dispatch.receive']);

const TONE: Record<DispatchState['status'], 'blue' | 'green' | 'red'> = {
  approved: 'blue',
  packed: 'blue',
  in_transit: 'blue',
  blocked: 'red',
  delivered: 'green',
  received: 'green',
};

/** "120 food, 40 water" in the chosen language. */
const needList = (t: Strings, q: Qty) => t.list(ITEMS.filter((k) => q[k] > 0).map((k) => `${q[k].toLocaleString('en-IN')} ${t.itemsLower[k]}`));

export function RequestScreen() {
  const { box, state } = useStore(SCOPE);
  const t = useT();
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
            <h1 className="page-title">{camp ? camp.name : t.requestHelp}</h1>
            <p className="page-sub">{camp ? t.subExisting : t.subNew}</p>
          </div>
          {mine.length > 0 && (
            <div className="row" role="group" aria-label={t.yourRequests}>
              {mine.map((id) => (
                <button key={id} type="button" className={`btn btn-sm${active === id ? ' btn-selected' : ''}`} aria-pressed={active === id} onClick={() => setActive(id)}>
                  {state.camps.get(id)?.name}
                </button>
              ))}
              <button type="button" className={`btn btn-sm${active === 'new' ? ' btn-selected' : ''}`} aria-pressed={active === 'new'} onClick={() => setActive('new')}>
                <Plus size={16} aria-hidden /> {t.anotherPlace}
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

          <aside className="stack req-aside" aria-label={t.helpTitle}>
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
  const t = useT();
  if (net === 'offline')
    return (
      <div className="notice notice-amber" role="status">
        <CloudSlash size={18} weight="fill" aria-hidden />
        <div>
          <b>{t.offlineBold}</b> {t.offlineText}
          {pending > 0 && t.offlineUrgent}
        </div>
      </div>
    );
  if (net === 'weak')
    return (
      <div className="notice notice-amber" role="status">
        <WifiMedium size={18} weight="fill" aria-hidden />
        <div>
          <b>{t.weakBold}</b>
          {t.weakText}
          {pending > 0 ? t.weakSms : t.stop}
        </div>
      </div>
    );
  return null;
}

function StatusCard({ camp, state, sent, now }: { camp: CampState; state: State; sent: boolean; now: number }) {
  const r = camp.report;
  const task = [...state.tasks.values()].find((t) => t.campId === camp.id && t.status !== 'done');
  const team = task ? state.teams.find((t) => t.id === task.teamId) : undefined;
  const t = useT();
  return (
    <section className="card card-pad stack-sm" aria-labelledby="status-title">
      <h2 className="card-title" id="status-title">
        {t.statusTitle}
      </h2>
      <ul className="status-list">
        <li className={sent ? 'ok' : 'wait'}>
          {sent ? <CheckCircle size={20} weight="fill" aria-hidden /> : <Clock size={20} aria-hidden />}
          <span>{sent ? t.sent(agoIn(t.lang, r.at, now)) : t.notSent}</span>
        </li>
        <li className={camp.verified ? 'ok' : 'wait'}>
          {camp.verified ? <CheckCircle size={20} weight="fill" aria-hidden /> : <PhoneCall size={20} aria-hidden />}
          <span>
            {camp.verified ? t.verified : t.waitingVerify(r.phone)}
          </span>
        </li>
        {team && task && (
          <li className="ok">
            <CheckCircle size={20} weight="fill" aria-hidden />
            <span>{t.teamComing(team.label, task.status === 'on_site')}</span>
          </li>
        )}
      </ul>
      {totalQty(camp.need) > 0 && (
        <p className="small muted">{t.stillNeeded(needList(t, camp.need))}</p>
      )}
    </section>
  );
}

function Outbox({ events, open: startOpen, now }: { events: Encodable[]; open: boolean; now: number }) {
  const [open, setOpen] = useState<string | null>(startOpen ? events.at(-1)!.id : null);
  const t = useT();
  return (
    <section className="card card-pad" aria-labelledby="outbox-title">
      <div className="card-head">
        <h2 className="card-title" id="outbox-title">
          <PaperPlaneTilt size={20} aria-hidden /> {t.outboxTitle}
        </h2>
        <Badge tone="amber">{events.length}</Badge>
      </div>
      <p className="muted small" style={{ marginBottom: 12 }}>
        {t.outboxText}
      </p>
      <div className="stack-sm">
        {events.map((e) => (
          <div key={e.id} className="subtle">
            <div className="row-between">
              <span style={{ fontWeight: 600 }}>
                {e.type === 'camp.report' ? t.kindReport : e.type === 'camp.checkin' ? t.kindCheckin : t.kindReceipt}
                <span className="muted" style={{ fontWeight: 400 }}> {agoIn(t.lang, e.at, now)}</span>
              </span>
              <button type="button" className="btn btn-sm btn-quiet" aria-expanded={open === e.id} onClick={() => setOpen(open === e.id ? null : e.id)}>
                {open === e.id ? t.hide : t.sendAnother}
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
  const t = useT();
  return (
    <section className="card card-pad stack-sm" aria-labelledby="signal-help">
      <h2 className="card-title" id="signal-help">
        <ChatText size={20} aria-hidden /> {t.helpTitle}
      </h2>
      <ol className="mini-steps">
        <li>{t.help1}</li>
        <li>
          {t.help2[0]}
          <b>{t.help2[1]}</b>
          {t.help2[2]}
          <b>{t.help2[3]}</b>
          {CONTROL_ROOM_SMS ? t.help2To(CONTROL_ROOM_SMS) : ''}
          {t.help2[4]}
        </li>
        <li>{t.help3}</li>
      </ol>
    </section>
  );
}

function Emergency() {
  const t = useT();
  const labels = [t.sosLabels['112'], t.sosLabels.state, t.sosLabels.district];
  return (
    <section className="sos sos-compact" aria-labelledby="sos-side">
      <h2 id="sos-side">{t.sosTitle}</h2>
      <ul className="sos-list">
        {EMERGENCY.map((n, i) => (
          <li key={n.number}>
            <a href={`tel:${n.number}`}>
              <span className="sos-num">{n.number}</span>
              <span>{labels[i] ?? n.label}</span>
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
  const t = useT();
  const tone = TONE[d.status];

  const confirm = () => {
    const ev: DispatchReceive = { type: 'dispatch.receive', id: newId(), at: Date.now(), by: 'camp', dispatchId: d.id, campId: d.campId, items: count };
    record(SCOPE, ev);
    setConfirming(false);
  };

  return (
    <section className="card card-pad" aria-label={`Delivery ${d.id}`}>
      <div className="card-head">
        <h2 className="card-title">
          <Package size={20} aria-hidden /> {t.coming}
        </h2>
        <Badge tone={tone}>{t.status[d.status]}</Badge>
      </div>
      <div className="stack-sm">
        <QtyView q={currentLoad(d)} names={t.items} />
        <p className="small muted">
          {t.statusText[d.status]}
          {d.loads.length > 0 && d.status !== 'delivered' ? t.withCarrier(carrierLabel(d.loads.at(-1)!.carrier)) : ''}
        </p>
        {d.code && (
          <div className="subtle row-between">
            <span>
              <span className="label">{t.handover}</span>
              <br />
              <span className="small muted">{t.handoverHelp}</span>
            </span>
            <span className="handover">{d.code}</span>
          </div>
        )}
        {canConfirm && !confirming && (
          <button type="button" className="btn btn-primary" onClick={() => setConfirming(true)}>
            <CheckCircle size={18} aria-hidden /> {t.gotIt}
          </button>
        )}
        {confirming && (
          <div className="stack-sm">
            <p className="label">{t.countLabel}</p>
            <QtyInputs idPrefix={`recv-${d.id}`} value={count} onChange={setCount} names={t.items} units={t.units} />
            <p className="help">{t.countHelp}</p>
            <div className="row">
              <button type="button" className="btn btn-primary" onClick={confirm}>
                {t.confirmReceipt}
              </button>
              <button type="button" className="btn" onClick={() => setConfirming(false)}>
                {t.cancel}
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

type GpsState = 'idle' | 'busy' | 'none' | 'denied' | 'nofix';
type FormError = 'errName' | 'errLoc' | 'errPeople' | 'errSum' | 'errPhone';

function ReportForm({ camp, onSent }: { camp?: CampState; onSent: (campId: string) => void }) {
  const t = useT();
  const r = camp?.report;
  const isNew = !camp;
  const [name, setName] = useState(r?.name ?? '');
  const [reporter, setReporter] = useState(r?.reporter ?? '');
  const [phone, setPhone] = useState(r?.phone ?? '');
  const [loc, setLocState] = useState<Picked | null>(r ? { lat: r.lat, lng: r.lng, acc: r.acc, src: r.locSrc } : null);
  // The name we filled in ourselves. We only replace the field while it is empty or still holds that.
  const autoName = useRef<string | null>(null);
  const [named, setNamed] = useState(false);
  const setLoc = (p: Picked) => {
    setLocState(p);
    if (p.src === 'manual') return;
    void placeName(p.lat, p.lng).then((found) => {
      if (!found) return;
      setName((current) => {
        if (current.trim() && current !== autoName.current) return current;
        autoName.current = found;
        setNamed(true);
        return found;
      });
    });
  };
  const [typing, setTyping] = useState(false);
  const [gps, setGps] = useState<GpsState>('idle');
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
  const [errors, setErrors] = useState<FormError[]>([]);
  const [sent, setSent] = useState(false);

  const useGps = () => {
    if (!('geolocation' in navigator)) return setGps('none');
    setGps('busy');
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setLoc({ lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy, src: 'gps' });
        setGps('idle');
      },
      (err) => setGps(err.code === err.PERMISSION_DENIED ? 'denied' : 'nofix'),
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 60_000 },
    );
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const errs: FormError[] = [];
    if (name.trim().length < 3) errs.push('errName');
    if (!loc) errs.push('errLoc');
    if (people < 1) errs.push('errPeople');
    if (children + elderly + injured > people) errs.push('errSum');
    if (phone && !/^\+?[0-9 ()-]{6,20}$/.test(phone.trim())) errs.push('errPhone');
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
          <MapPin size={20} aria-hidden /> {isNew ? t.formNew : t.formUpdate}
        </h2>
        <p className="muted small" style={{ marginTop: 4 }}>
          {isNew ? t.formNewText : t.formUpdateText}
        </p>
      </div>

      {sent && !isNew && <Notice tone="green">{t.updateSaved}</Notice>}

      <div className="grid-2">
        <div className="field" style={{ gridColumn: '1 / -1' }}>
          <label htmlFor="place">{t.place}</label>
          <input
            id="place"
            className="input"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setNamed(false);
            }}
            placeholder={t.placePh}
            autoComplete="off"
          />
          <span className="help">
            {named ? t.placeAuto : t.placeHint}
          </span>
        </div>
        <div className="field">
          <label htmlFor="reporter">{t.yourName}</label>
          <input id="reporter" className="input" value={reporter} onChange={(e) => setReporter(e.target.value)} autoComplete="name" />
        </div>
        <div className="field">
          <label htmlFor="phone">{t.phone}</label>
          <input id="phone" className="input" type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder={t.phonePh} />
        </div>
      </div>

      <fieldset className="stack-sm plain">
        <legend className="label">{t.location}</legend>
        <LocationPicker value={loc} onChange={setLoc} label={t.mapLabel} />
        <div className="row-between">
          <span className="small num" aria-live="polite">
            {loc ? (
              <>
                {fmtCoord(loc.lat, loc.lng)}
                <span className="muted">
                  {loc.acc ? t.within(Math.round(loc.acc)) : ''}
                  {loc.src === 'gps' ? t.fromGps : loc.src === 'map' ? t.fromMap : t.fromTyped}
                </span>
              </>
            ) : (
              <span className="muted">{t.noLoc}</span>
            )}
          </span>
          <div className="row">
            <button type="button" className="btn btn-sm" onClick={() => setTyping((v) => !v)} aria-expanded={typing}>
              <Keyboard size={17} aria-hidden /> {t.type}
            </button>
            <button type="button" className="btn btn-sm btn-primary" onClick={useGps} disabled={gps === 'busy'}>
              <Crosshair size={17} aria-hidden /> {gps === 'busy' ? t.finding : t.useGps}
            </button>
          </div>
        </div>
        {gps !== 'idle' && gps !== 'busy' && <p className="error-text">{gps === 'none' ? t.gpsNone : gps === 'denied' ? t.gpsDenied : t.gpsNoFix}</p>}
        {typing && <CoordInputs loc={loc} onChange={setLoc} />}
        <p className="help">{t.gpsHelp}</p>
      </fieldset>

      <fieldset className="stack-sm plain">
        <legend className="label">{t.peopleTitle}</legend>
        <div className="grid-4">
          {(
            [
              ['people', t.total, people, setPeople],
              ['children', t.children, children, setChildren],
              ['elderly', t.elderly, elderly, setElderly],
              ['injured', t.injured, injured, setInjured],
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
        <legend className="label">{t.needTitle}</legend>
        <QtyInputs idPrefix="need" value={needs} onChange={setNeeds} names={t.items} units={t.units} />
      </fieldset>

      <fieldset className="stack-sm plain">
        <legend className="label">{t.urgentTitle}</legend>
        <div className="checks">
          <label className="check">
            <input type="checkbox" checked={medical} onChange={(e) => setMedical(e.target.checked)} />
            <span>
              {t.medical[0]}
              <span className="help">{t.medical[1]}</span>
            </span>
          </label>
          <label className="check">
            <input type="checkbox" checked={trapped} onChange={(e) => setTrapped(e.target.checked)} />
            <span>
              {t.trapped[0]}
              <span className="help">{t.trapped[1]}</span>
            </span>
          </label>
          <label className="check">
            <input type="checkbox" checked={roadBlocked} onChange={(e) => setRoadBlocked(e.target.checked)} />
            <span>
              {t.road[0]}
              <span className="help">{t.road[1]}</span>
            </span>
          </label>
        </div>
      </fieldset>

      <div className="field">
        <label htmlFor="note">{t.note}</label>
        <textarea id="note" className="textarea" value={note} onChange={(e) => setNote(e.target.value)} maxLength={280} placeholder={t.notePh} />
        <span className="help">{t.noteHelp}</span>
      </div>

      {errors.length > 0 && (
        <div id="report-errors" tabIndex={-1}>
          <Notice tone="red">
            {errors.map((e) => (
              <p key={e}>{t[e]}</p>
            ))}
          </Notice>
        </div>
      )}

      <button type="submit" className="btn btn-primary btn-lg btn-block">
        <PaperPlaneTilt size={20} aria-hidden /> {isNew ? t.sendRequest : t.sendUpdate}
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
  const t = useT();
  return (
    <div className="subtle stack-sm">
      <div className="grid-2">
        <div className="field">
          <label htmlFor="lat">{t.lat}</label>
          <input id="lat" className="input" inputMode="decimal" value={lat} onChange={(e) => setLat(e.target.value)} placeholder="30.32710" />
        </div>
        <div className="field">
          <label htmlFor="lng">{t.lng}</label>
          <input id="lng" className="input" inputMode="decimal" value={lng} onChange={(e) => setLng(e.target.value)} placeholder="78.13740" />
        </div>
      </div>
      <button type="button" className="btn btn-sm" disabled={!ok} onClick={() => onChange({ lat: la, lng: ln, src: 'manual' })}>
        {t.placePin}
      </button>
    </div>
  );
}

function Checkin({ camp }: { camp: CampState }) {
  const [people, setPeople] = useState(camp.people);
  const [done, setDone] = useState(false);
  const t = useT();
  const send = () => {
    const ev: CampCheckin = { type: 'camp.checkin', id: newId(), at: Date.now(), by: 'camp', campId: camp.id, people };
    record(SCOPE, ev);
    setDone(true);
  };
  return (
    <section className="card card-pad stack-sm" aria-labelledby="checkin-title">
      <h2 className="card-title" id="checkin-title">
        <Heartbeat size={20} aria-hidden /> {t.checkinTitle}
      </h2>
      <p className="muted small">
        {t.checkinText}
      </p>
      <div className="row" style={{ alignItems: 'flex-end' }}>
        <div className="field" style={{ width: 140 }}>
          <label htmlFor="ck-people">{t.peopleNow}</label>
          <NumberInput id="ck-people" value={people} onChange={setPeople} max={100_000} />
        </div>
        <button type="button" className="btn" onClick={send}>
          {t.sendCheckin}
        </button>
      </div>
      {done && <p className="small" style={{ color: 'var(--green)' }}>{t.checkinDone}</p>}
    </section>
  );
}
