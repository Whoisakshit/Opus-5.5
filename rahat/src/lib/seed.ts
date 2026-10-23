// Development data for Dehradun district, loaded only when the server runs with
// SEED_DEV_DATA=1. Written relative to "now" so silent and quiet camps stay that way.
// The camps and people are fictional; the localities are real places in the district.

import type { Channel, Ev, Qty } from './types.ts';
import { newId } from './types.ts';
import { codeHash } from './hash.ts';

const q = (food: number, water: number, blankets: number, medicine: number): Qty => ({ food, water, blankets, medicine });

export async function seedEvents(now = Date.now()): Promise<Ev[]> {
  const ago = (h: number) => Math.round(now - h * 3_600_000);
  const ev: Ev[] = [];

  const report = (
    campId: string,
    name: string,
    lat: number,
    lng: number,
    hoursAgo: number,
    people: number,
    [children, elderly, injured]: [number, number, number],
    needs: Qty,
    flags: { medical?: boolean; trapped?: boolean; roadBlocked?: boolean },
    via: Channel,
  ) =>
    ev.push({
      type: 'camp.report',
      id: newId(),
      at: ago(hoursAgo),
      by: 'camp',
      via,
      campId,
      name,
      lat,
      lng,
      acc: via === 'net' ? 9 : undefined,
      locSrc: via === 'net' ? 'gps' : 'map',
      people,
      children,
      elderly,
      injured,
      needs,
      medical: !!flags.medical,
      trapped: !!flags.trapped,
      roadBlocked: !!flags.roadBlocked,
    });

  const checkin = (campId: string, hoursAgo: number, people?: number) =>
    ev.push({ type: 'camp.checkin', id: newId(), at: ago(hoursAgo), by: 'camp', via: 'net', campId, people });

  ev.push({ type: 'stock.in', id: newId(), at: ago(30), by: 'warehouse', via: 'net', items: q(1400, 520, 360, 30), note: 'State depot consignment' });

  report('MLD', 'GIC Maldevta', 30.3271, 78.1374, 5, 210, [46, 30, 4], q(420, 160, 90, 6), {}, 'net');
  report('SHD', 'Sahastradhara Primary School', 30.3862, 78.1316, 3, 140, [30, 22, 9], q(280, 120, 70, 10), { medical: true, roadBlocked: true }, 'sms');
  report('RPR', 'Raipur Community Hall', 30.3109, 78.0915, 9, 95, [14, 12, 2], q(190, 60, 40, 3), {}, 'net');
  checkin('RPR', 4);
  report('RPS', 'Raipur Sports Ground', 30.3125, 78.0935, 2, 60, [10, 6, 1], q(120, 40, 30, 2), {}, 'net');
  report('DWL', 'Doiwala Panchayat Bhawan', 30.1766, 78.1155, 6, 180, [35, 28, 6], q(360, 140, 80, 5), {}, 'net');
  checkin('DWL', 1);
  report('RSK', 'Rishikesh Dharamshala', 30.094, 78.269, 26, 120, [20, 25, 3], q(240, 90, 60, 4), {}, 'net');
  checkin('RSK', 2, 126);
  report('VKN', 'Vikasnagar Inter College', 30.4687, 77.774, 7, 160, [28, 20, 3], q(320, 110, 50, 4), {}, 'net');
  report('KLS', 'Kalsi Relief Camp', 30.5376, 77.8473, 8, 75, [12, 15, 1], q(150, 60, 40, 2), {}, 'sms');
  report('CKR', 'Chakrata Govt School', 30.702, 77.8686, 15, 110, [18, 24, 5], q(220, 80, 90, 5), { trapped: true }, 'relay');

  // Every seeded camp has been confirmed by phone.
  for (const campId of ['MLD', 'SHD', 'RPR', 'RPS', 'DWL', 'RSK', 'VKN', 'KLS', 'CKR'])
    ev.push({ type: 'camp.verify', id: newId(), at: ago(0.5), by: 'control', via: 'net', campId });

  // Doiwala: on the road now.
  const dwl = q(300, 100, 80, 5);
  ev.push({ type: 'dispatch.approve', id: newId(), at: ago(4), by: 'control', via: 'net', dispatchId: 'D-DWL01', campId: 'DWL', items: dwl, suggested: dwl, mode: 'truck', code: '4821', codeHash: await codeHash('D-DWL01', '4821') });
  ev.push({ type: 'dispatch.pack', id: newId(), at: ago(3), by: 'warehouse', via: 'net', dispatchId: 'D-DWL01', items: dwl });
  ev.push({ type: 'dispatch.load', id: newId(), at: ago(1.5), by: 'driver', via: 'net', dispatchId: 'D-DWL01', carrier: 'T1', items: dwl });

  // Rishikesh: delivered yesterday, camp counted 8 blankets fewer than were loaded.
  const rsk = q(240, 90, 60, 4);
  ev.push({ type: 'dispatch.approve', id: newId(), at: ago(22), by: 'control', via: 'net', dispatchId: 'D-RSK01', campId: 'RSK', items: rsk, suggested: rsk, mode: 'truck', code: '1937', codeHash: await codeHash('D-RSK01', '1937') });
  ev.push({ type: 'dispatch.pack', id: newId(), at: ago(21), by: 'warehouse', via: 'net', dispatchId: 'D-RSK01', items: rsk });
  ev.push({ type: 'dispatch.load', id: newId(), at: ago(20), by: 'driver', via: 'net', dispatchId: 'D-RSK01', carrier: 'T2', items: rsk });
  ev.push({ type: 'dispatch.deliver', id: newId(), at: ago(18), by: 'driver', via: 'net', dispatchId: 'D-RSK01', carrier: 'T2', codeOk: true });
  ev.push({ type: 'dispatch.receive', id: newId(), at: ago(17.5), by: 'camp', via: 'net', dispatchId: 'D-RSK01', campId: 'RSK', items: q(240, 90, 52, 4) });

  // Vikasnagar: approved an hour ago, waiting to be packed.
  ev.push({ type: 'dispatch.approve', id: newId(), at: ago(1), by: 'control', via: 'net', dispatchId: 'D-VKN01', campId: 'VKN', items: q(200, 80, 50, 4), suggested: q(200, 80, 50, 4), mode: 'truck', code: '6054', codeHash: await codeHash('D-VKN01', '6054') });

  // Chakrata went silent; SDRF Bravo is on the way.
  ev.push({ type: 'team.task', id: newId(), at: ago(1.2), by: 'control', via: 'net', taskId: 'K-CKR01', teamId: 'SDRF-B', campId: 'CKR', kind: 'reach', note: 'Silent since morning. Road status unknown past Sahiya.' });
  ev.push({ type: 'team.status', id: newId(), at: ago(0.9), by: 'rescue', via: 'net', teamId: 'SDRF-B', taskId: 'K-CKR01', status: 'en_route' });

  return ev;
}
