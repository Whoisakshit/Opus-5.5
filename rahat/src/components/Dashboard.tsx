// Building blocks for the role dashboards (warehouse, trucks, rescue teams).
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { BellRinging } from '@phosphor-icons/react';
import { DISTRICT } from '../lib/config.ts';

/**
 * Remembers which items this person has already seen (per phone). Anything new
 * the control room sends shows as an alert, buzzes the phone once and puts a
 * count in the tab title, until they press "Got it".
 */
export function useNewItems(key: string, ids: string[]) {
  const storeKey = `rahat:v2:seen:${key}`;
  const [seen, setSeen] = useState<Set<string>>(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem(storeKey) ?? '[]'));
    } catch {
      return new Set();
    }
  });
  const fresh = ids.filter((id) => !seen.has(id));
  const buzzed = useRef(new Set<string>());

  useEffect(() => {
    const unbuzzed = fresh.filter((id) => !buzzed.current.has(id));
    if (unbuzzed.length) {
      unbuzzed.forEach((id) => buzzed.current.add(id));
      navigator.vibrate?.([200, 100, 200]);
    }
    const base = document.title.replace(/^\(\d+\) /, '');
    document.title = fresh.length ? `(${fresh.length}) ${base}` : base;
  });

  const markSeen = () => {
    const next = new Set([...seen, ...ids]);
    setSeen(next);
    try {
      localStorage.setItem(storeKey, JSON.stringify([...next].slice(-500)));
    } catch {
      /* storage unavailable */
    }
  };
  return { fresh, markSeen };
}

export function NewAlert({ count, title, children, onSeen }: { count: number; title: string; children?: ReactNode; onSeen: () => void }) {
  if (!count) return null;
  return (
    <div className="new-alert" role="alert">
      <span className="blink-dot" aria-hidden />
      <BellRinging size={22} weight="fill" aria-hidden />
      <div className="new-alert-body">
        <b>{title}</b>
        {children && <div className="small">{children}</div>}
      </div>
      <button type="button" className="btn btn-sm" onClick={onSeen}>
        Got it
      </button>
    </div>
  );
}

export function DashStats({ items }: { items: { value: ReactNode; label: string; tone?: 'red' | 'green'; dot?: boolean }[] }) {
  return (
    <div className="stats" style={{ ['--cols' as string]: items.length }}>
      {items.map((s) => (
        <div className="card stat" key={s.label}>
          <div className={`stat-value${s.tone ? ` ${s.tone}` : ''}`}>
            {s.value}
            {s.dot && <span className="blink-dot inline" aria-label="new" />}
          </div>
          <div className="stat-label">{s.label}</div>
        </div>
      ))}
    </div>
  );
}

export type MapPoint = { id: string; lat: number; lng: number; label: string; tone: 'red' | 'blue' | 'green' };

/** Only what this person needs: where to go, and where they are. Names are inserted as text, never HTML. */
export function FocusMap({ points, me }: { points: MapPoint[]; me?: { lat: number; lng: number } }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    const m = L.map(el.current!, { center: DISTRICT.center, zoom: DISTRICT.zoom });
    m.attributionControl.setPrefix(false);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      className: 'tiles',
    }).addTo(m);
    layer.current = L.layerGroup().addTo(m);
    map.current = m;
    const ro = new ResizeObserver(() => m.invalidateSize());
    ro.observe(el.current!);
    return () => {
      ro.disconnect();
      m.remove();
    };
  }, []);

  const key = JSON.stringify([points, me]);
  useEffect(() => {
    const m = map.current;
    const g = layer.current;
    if (!m || !g) return;
    g.clearLayers();
    const all: [number, number][] = [];
    for (const p of points) {
      const label = document.createElement('span');
      label.textContent = p.label;
      L.marker([p.lat, p.lng], { icon: L.divIcon({ className: '', html: `<span class="pin pin-${p.tone}"></span>`, iconSize: [16, 16] }) })
        .bindTooltip(label, { direction: 'top', offset: [0, -10], permanent: points.length <= 3 })
        .addTo(g);
      all.push([p.lat, p.lng]);
      if (me) L.polyline([[me.lat, me.lng], [p.lat, p.lng]], { color: '#1f6fdf', weight: 2, dashArray: '4 7', interactive: false }).addTo(g);
    }
    if (me) {
      L.marker([me.lat, me.lng], { icon: L.divIcon({ className: '', html: '<span class="pin-me"></span>', iconSize: [22, 22] }) })
        .bindTooltip('You')
        .addTo(g);
      all.push([me.lat, me.lng]);
    }
    if (all.length === 1) m.setView(all[0], 13);
    else if (all.length > 1) m.fitBounds(L.latLngBounds(all), { padding: [36, 36], maxZoom: 14 });
    // key captures the points; Leaflet objects are rebuilt only when they change
  }, [key]);

  return <div ref={el} className="map map-focus" role="region" aria-label="Map of where you need to go" />;
}
