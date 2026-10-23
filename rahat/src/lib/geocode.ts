// Turns GPS coordinates into a readable place name, e.g. "Govt. Inter College, Kalsi".
// Uses OpenStreetMap's free Nominatim service (max 1 request per second, attribution
// required). For a real deployment, run your own Nominatim so people's coordinates
// stay on district servers. Needs internet; offline, the person types the name.

let lastCall = 0;

type Address = Partial<Record<string, string>>;

export async function placeName(lat: number, lng: number): Promise<string | null> {
  if (!navigator.onLine || Date.now() - lastCall < 1100) return null;
  lastCall = Date.now();
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=17&addressdetails=1&accept-language=en&lat=${lat.toFixed(5)}&lon=${lng.toFixed(5)}`;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!r.ok) return null;
    const j: { name?: string; address?: Address } = await r.json();
    const a = j.address ?? {};
    const spot = j.name || a.amenity || a.school || a.building || a.hamlet || a.neighbourhood || a.suburb;
    const area = a.village || a.town || a.city || a.municipality || a.county || a.state_district;
    const parts = [spot, area].filter((p, i, all): p is string => !!p && all.indexOf(p) === i);
    return parts.length ? parts.join(', ').slice(0, 80) : null;
  } catch {
    return null;
  }
}
