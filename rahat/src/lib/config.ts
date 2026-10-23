// District setup. Trucks and teams are fixed here for now; moving them into the
// staff admin screen is a planned next step. Phone numbers come from the build
// environment (VITE_*), so each district deploys with its own.

export const DISTRICT = {
  name: 'Dehradun',
  center: [30.33, 78.02] as [number, number],
  zoom: 10,
};

export const WAREHOUSE = { id: 'WH', name: 'District relief warehouse', lat: 30.3165, lng: 78.0322 };

export const TRUCKS = [
  { id: 'T1', label: 'Truck 1', driver: 'Harish Rawat' },
  { id: 'T2', label: 'Truck 2', driver: 'Mohan Bisht' },
];

export const TEAMS = [
  { id: 'SDRF-A', label: 'SDRF Alpha', lead: 'Insp. Kavita Bhandari', lat: 30.3255, lng: 78.0437 },
  { id: 'SDRF-B', label: 'SDRF Bravo', lead: 'SI Deepa Joshi', lat: 30.452, lng: 77.802 },
  { id: 'NDRF-C', label: 'NDRF Charlie', lead: 'Insp. Arvind Panwar', lat: 30.205, lng: 78.096 },
];

const env = ((import.meta as { env?: Record<string, string | undefined> }).env ?? {}) as Record<string, string | undefined>;

/** The control room phone that runs the SMS gateway. Set VITE_CONTROL_ROOM_SMS when building. */
export const CONTROL_ROOM_SMS = env.VITE_CONTROL_ROOM_SMS ?? '';

/** National emergency number, state and district disaster control rooms (toll free in India). */
export const EMERGENCY = [
  { number: '112', label: 'Police, fire, ambulance' },
  { number: env.VITE_STATE_EOC ?? '1070', label: 'State disaster control room' },
  { number: env.VITE_DISTRICT_EOC ?? '1077', label: 'District disaster control room' },
];

/** A camp that has not been heard from in this many hours is flagged. */
export const QUIET_AFTER_H = 6;
export const SILENT_AFTER_H = 12;

/** Two camps reported closer than this are probably the same place. */
export const DUPLICATE_RADIUS_M = 300;

export function carrierLabel(id: string | undefined): string {
  if (!id) return 'Unassigned';
  return TRUCKS.find((t) => t.id === id)?.label ?? TEAMS.find((t) => t.id === id)?.label ?? id;
}
