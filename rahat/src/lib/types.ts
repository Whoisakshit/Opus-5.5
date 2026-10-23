// Domain model. Everything that happens is an immutable event with an id made on
// the device that created it. State is derived by replaying events (see reduce.ts),
// so the same report arriving by internet, SMS and QR relay is counted once.

export type Item = 'food' | 'water' | 'blankets' | 'medicine';
export const ITEMS: Item[] = ['food', 'water', 'blankets', 'medicine'];

export const ITEM_META: Record<Item, { label: string; unit: string }> = {
  food: { label: 'Food', unit: 'packs' },
  water: { label: 'Water', unit: 'cans' },
  blankets: { label: 'Blankets', unit: 'pcs' },
  medicine: { label: 'Medicine', unit: 'kits' },
};

export type Qty = Record<Item, number>;
export const zeroQty = (): Qty => ({ food: 0, water: 0, blankets: 0, medicine: 0 });

/** How an event reached the system: internet sync, SMS, or carried by another phone. */
export type Channel = 'net' | 'sms' | 'relay';

export type Role = 'camp' | 'control' | 'warehouse' | 'driver' | 'rescue';
export type StaffRole = Exclude<Role, 'camp'>;

type Base = {
  id: string;
  at: number; // when it happened on the device (ms), not when it arrived
  by: Role;
  via?: Channel;
  actor?: string; // staff user id, stamped by the server
};

export type CampReport = Base & {
  type: 'camp.report';
  campId: string;
  name: string;
  lat: number;
  lng: number;
  acc?: number; // GPS accuracy in metres
  locSrc: 'gps' | 'map' | 'manual';
  people: number;
  children: number; // under 5
  elderly: number;
  injured: number; // injured or sick
  needs: Qty; // current shortfall, not counting anything already received
  medical: boolean;
  trapped: boolean;
  roadBlocked: boolean;
  note?: string;
  reporter?: string; // name of the person asking
  phone?: string; // so the control room can call back to confirm
};

/** "We are OK" heartbeat. Cheap enough to send by SMS every few hours. */
export type CampCheckin = Base & { type: 'camp.checkin'; campId: string; people?: number };

export type StockIn = Base & { type: 'stock.in'; items: Qty; note?: string };

/** The officer's decision. Nothing leaves the warehouse without one. */
export type DispatchApprove = Base & {
  type: 'dispatch.approve';
  dispatchId: string;
  campId: string;
  items: Qty;
  suggested: Qty;
  mode: 'truck' | 'foot';
  code?: string; // 4-digit handover code; the server only sends it to the camp and the control room
  codeHash: string; // what carriers check the code against
  reason?: string; // required when the officer changes the suggestion
};

export type DispatchPack = Base & { type: 'dispatch.pack'; dispatchId: string; items: Qty };

/** Custody transfer to a truck or (for blocked roads) a rescue team. */
export type DispatchLoad = Base & { type: 'dispatch.load'; dispatchId: string; carrier: string; items: Qty };

export type DispatchBlocked = Base & {
  type: 'dispatch.blocked';
  dispatchId: string;
  lat?: number;
  lng?: number;
  note?: string;
};

export type DispatchDeliver = Base & { type: 'dispatch.deliver'; dispatchId: string; carrier: string; codeOk: boolean };

/** The camp's own count of what arrived. Compared against what was loaded. */
export type DispatchReceive = Base & { type: 'dispatch.receive'; dispatchId: string; campId: string; items: Qty };

/** The control room confirmed a new request is genuine (usually by calling back). */
export type CampVerify = Base & { type: 'camp.verify'; campId: string };

export type TaskKind = 'reach' | 'carry' | 'evacuate';

export type TeamTask = Base & {
  type: 'team.task';
  taskId: string;
  teamId: string;
  campId: string;
  kind: TaskKind;
  dispatchId?: string;
  note?: string;
};

export type TeamStatus = Base & {
  type: 'team.status';
  teamId: string;
  taskId?: string;
  status: 'en_route' | 'on_site' | 'done';
};

export type Ev =
  | CampReport
  | CampCheckin
  | CampVerify
  | StockIn
  | DispatchApprove
  | DispatchPack
  | DispatchLoad
  | DispatchBlocked
  | DispatchDeliver
  | DispatchReceive
  | TeamTask
  | TeamStatus;

export const EVENT_TYPES: Ev['type'][] = [
  'camp.report',
  'camp.checkin',
  'camp.verify',
  'stock.in',
  'dispatch.approve',
  'dispatch.pack',
  'dispatch.load',
  'dispatch.blocked',
  'dispatch.deliver',
  'dispatch.receive',
  'team.task',
  'team.status',
];

export function newId(len = 10): string {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  let out = '';
  for (const b of bytes) out += (b % 36).toString(36);
  return out;
}
