import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { CampState, State } from '../lib/reduce.ts';
import { totalQty } from '../lib/reduce.ts';
import { DISTRICT, SILENT_AFTER_H, TRUCKS, WAREHOUSE } from '../lib/config.ts';
import { ago, hoursSince } from '../lib/format.ts';

// OpenStreetMap's own tiles: free with attribution, for light use. For a real
// deployment, host tiles yourself (e.g. a PMTiles file for the district) so the
// map also works offline; OSM's tile policy does not allow bulk pre-downloading.
const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

function createMap(el: HTMLElement, center: L.LatLngExpression, zoom: number) {
  const map = L.map(el, { center, zoom, zoomControl: true });
  map.attributionControl.setPrefix(false);
  L.tileLayer(TILE_URL, { maxZoom: 18, attribution: ATTRIBUTION, className: 'tiles' }).addTo(map);
  return map;
}

/** Names come from camp phones and SMS, so they are inserted as text, never as HTML. */
function text(s: string) {
  const el = document.createElement('span');
  el.textContent = s;
  return el;
}

const icon = (html: string, size: number) => L.divIcon({ className: '', html, iconSize: [size, size] });

export type CampTone = 'red' | 'blue' | 'green' | 'gray';

export function campTone(c: CampState, now: number): CampTone {
  if (hoursSince(c.lastSeen, now) >= SILENT_AFTER_H) return 'gray';
  if (c.report.medical || c.report.trapped) return 'red';
  if (totalQty(c.need) > 0) return 'blue';
  return 'green';
}

export function OpsMap({
  state,
  now,
  selected,
  onSelect,
  className = 'map-ops',
}: {
  state: State;
  now: number;
  selected?: string;
  onSelect?: (campId: string) => void;
  className?: string;
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const fitted = useRef(false);
  const select = useRef(onSelect);
  select.current = onSelect;

  useEffect(() => {
    const m = createMap(el.current!, DISTRICT.center, DISTRICT.zoom);
    layer.current = L.layerGroup().addTo(m);
    map.current = m;
    const ro = new ResizeObserver(() => m.invalidateSize());
    ro.observe(el.current!);
    return () => {
      ro.disconnect();
      m.stop(); // end any pan or zoom still running, or Leaflet throws on removal
      m.remove();
      map.current = null;
      fitted.current = false;
    };
  }, []);

  useEffect(() => {
    const m = map.current;
    const g = layer.current;
    if (!m || !g) return;
    g.clearLayers();

    L.marker([WAREHOUSE.lat, WAREHOUSE.lng], { icon: icon('<span class="pin-wh">W</span>', 22), keyboard: false })
      .bindTooltip(text(WAREHOUSE.name))
      .addTo(g);

    for (const d of state.dispatches.values()) {
      const c = state.camps.get(d.campId);
      if (!c || d.status === 'delivered' || d.status === 'received') continue;
      const blocked = d.status === 'blocked';
      L.polyline(
        [
          [WAREHOUSE.lat, WAREHOUSE.lng],
          [c.lat, c.lng],
        ],
        { color: blocked ? '#bb3127' : '#4d93ff', weight: 2.5, dashArray: '6 7', opacity: 0.75, interactive: false },
      ).addTo(g);
      if (blocked) {
        const lat = d.blocked?.lat ?? (WAREHOUSE.lat + c.lat) / 2;
        const lng = d.blocked?.lng ?? (WAREHOUSE.lng + c.lng) / 2;
        L.marker([lat, lng], { icon: icon('<span class="pin-block">!</span>', 20), keyboard: false })
          .bindTooltip(text(`Road blocked: load for ${c.name}`))
          .addTo(g);
      }
    }

    for (const t of state.teams) {
      const camp = t.task ? state.camps.get(t.task.campId) : undefined;
      if (camp && t.task?.status !== 'assigned')
        L.polyline(
          [
            [t.lat, t.lng],
            [camp.lat, camp.lng],
          ],
          { color: '#1f6fdf', weight: 2, dashArray: '1 6', lineCap: 'round', interactive: false },
        ).addTo(g);
      // A live position shared in the last 30 minutes beats the team's base or its target camp.
      const live = t.live && now - t.live.at < 30 * 60_000 ? t.live : undefined;
      const where: [number, number] = live
        ? [live.lat, live.lng]
        : t.status === 'on_site' && camp
          ? [camp.lat, camp.lng]
          : [t.lat, t.lng];
      if (live && live.trail.length > 1)
        L.polyline(live.trail, { color: '#1f6fdf', weight: 2, opacity: 0.45, interactive: false }).addTo(g);
      const label = `${t.task && camp ? `${t.label}: ${t.status.replace('_', ' ')} to ${camp.name}` : `${t.label}: available`}${live ? `, live ${ago(live.at, now)}` : ''}`;
      L.marker(where, { icon: icon(`<span class="pin-team${live ? ' is-live' : ''}"></span>`, 14), keyboard: false }).bindTooltip(text(label)).addTo(g);
    }

    for (const tr of TRUCKS) {
      const live = state.units.get(tr.id);
      if (!live || now - live.at > 30 * 60_000) continue;
      if (live.trail.length > 1) L.polyline(live.trail, { color: '#1f6fdf', weight: 2, opacity: 0.45, interactive: false }).addTo(g);
      L.marker([live.lat, live.lng], { icon: icon(`<span class="pin-truck">${tr.id}</span>`, 24), keyboard: false })
        .bindTooltip(text(`${tr.label} (${tr.driver}), live ${ago(live.at, now)}`))
        .addTo(g);
    }

    for (const c of state.camps.values()) {
      const tone = campTone(c, now);
      const isSel = c.id === selected;
      const mk = L.marker([c.lat, c.lng], {
        icon: icon(`<span class="pin pin-${tone}${isSel ? ' is-selected' : ''}"></span>`, 16),
        title: c.name,
        alt: c.name,
        riseOnHover: true,
        zIndexOffset: isSel ? 1000 : 0,
      });
      mk.bindTooltip(text(c.name), { direction: 'top', offset: [0, -10] });
      mk.on('click', () => select.current?.(c.id));
      mk.addTo(g);
    }

    if (!fitted.current && state.camps.size) {
      const pts = [...state.camps.values()].map((c) => [c.lat, c.lng] as [number, number]);
      pts.push([WAREHOUSE.lat, WAREHOUSE.lng]);
      m.fitBounds(L.latLngBounds(pts), { padding: [28, 28] });
      fitted.current = true;
    }
  }, [state, now, selected]);

  useEffect(() => {
    const c = selected ? state.camps.get(selected) : undefined;
    if (c && map.current) map.current.panTo([c.lat, c.lng]);
    // Pan only when the selection changes, not on every sync.
  }, [selected]);

  return <div ref={el} className={`map ${className}`} role="region" aria-label="Map of camps, warehouse and rescue teams" />;
}

export function MapLegend() {
  return (
    <div className="legend" aria-label="Map legend">
      <span><i className="pin pin-red" style={{ width: 12, height: 12, borderWidth: 2 }} /> Urgent</span>
      <span><i className="pin" style={{ width: 12, height: 12, borderWidth: 2 }} /> Needs supplies</span>
      <span><i className="pin pin-green" style={{ width: 12, height: 12, borderWidth: 2 }} /> Covered</span>
      <span><i className="pin pin-gray" style={{ width: 12, height: 12, borderWidth: 2 }} /> Silent</span>
      <span><i className="pin-team" style={{ display: 'inline-block', width: 10, height: 10, borderWidth: 2 }} /> Rescue team</span>
      <span><i className="pin-truck" style={{ display: 'inline-block', width: 18, height: 14, fontSize: 8, lineHeight: '10px' }}>T</i> Truck (live)</span>
    </div>
  );
}

export type Picked = { lat: number; lng: number; acc?: number; src: 'gps' | 'map' | 'manual' };

/** Tap the map or drag the pin. GPS and typed coordinates flow in through `value`. */
export function LocationPicker({ value, onChange, label = 'Map. Tap to place your camp, or drag the pin.' }: { value: Picked | null; onChange: (p: Picked) => void; label?: string }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const marker = useRef<L.Marker | null>(null);
  const circle = useRef<L.Circle | null>(null);
  const change = useRef(onChange);
  change.current = onChange;

  useEffect(() => {
    const start: L.LatLngExpression = value ? [value.lat, value.lng] : DISTRICT.center;
    const m = createMap(el.current!, start, value ? 15 : DISTRICT.zoom);
    m.on('click', (e: L.LeafletMouseEvent) => change.current({ lat: e.latlng.lat, lng: e.latlng.lng, src: 'map' }));
    map.current = m;
    const ro = new ResizeObserver(() => m.invalidateSize());
    ro.observe(el.current!);
    return () => {
      ro.disconnect();
      m.stop(); // end any pan or zoom still running, or Leaflet throws on removal
      m.remove();
      map.current = null;
      marker.current = null;
      circle.current = null;
    };
    // The map is created once; later values are applied by the effect below.
  }, []);

  useEffect(() => {
    const m = map.current;
    if (!m || !value) return;
    const at: L.LatLngExpression = [value.lat, value.lng];
    if (!marker.current) {
      marker.current = L.marker(at, { draggable: true, icon: icon('<span class="pin-me"></span>', 22), alt: 'Camp location' }).addTo(m);
      marker.current.on('dragend', () => {
        const p = marker.current!.getLatLng();
        change.current({ lat: p.lat, lng: p.lng, src: 'map' });
      });
    } else marker.current.setLatLng(at);

    circle.current?.remove();
    circle.current = value.acc
      ? L.circle(at, { radius: value.acc, color: '#4d93ff', weight: 1, fillOpacity: 0.08, interactive: false }).addTo(m)
      : null;

    // No animation: the form can unmount this map right after (e.g. once a request is sent).
    if (value.src !== 'map') m.setView(at, Math.max(m.getZoom(), 15), { animate: false });
  }, [value]);

  return <div ref={el} className="map map-pick" role="application" aria-label={label} />;
}
