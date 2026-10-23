const H = 3_600_000;

export const hoursSince = (at: number, now: number) => (now - at) / H;

export function ago(at: number, now: number): string {
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h ${m % 60 ? `${m % 60} min ` : ''}ago`;
  const d = Math.floor(h / 24);
  return `${d} d ${h % 24} h ago`;
}

export function clock(at: number): string {
  return new Date(at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

export function distanceM(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function km(m: number): string {
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`;
}

export const fmtCoord = (lat: number, lng: number) => `${lat.toFixed(5)}, ${lng.toFixed(5)}`;

export const VIA_LABEL = { net: 'internet', sms: 'SMS', relay: 'a team carrying it' } as const;
