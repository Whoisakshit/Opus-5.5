// One-time move from the development JSON files (server/data) into Postgres.
//   DATABASE_URL=... npm run db:import
// Safe to run twice: events, accounts and camp keys that already exist are skipped.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Ev } from '../src/lib/types.ts';
import type { User } from './auth.ts';
import { DATA_DIR } from './auth.ts';
import { openStorage } from './storage.ts';

if (!process.env.DATABASE_URL) {
  console.error('Set DATABASE_URL to the Postgres database to import into.');
  process.exit(1);
}
const read = <T>(f: string, fallback: T): T => {
  try {
    return JSON.parse(readFileSync(join(DATA_DIR, f), 'utf8'));
  } catch {
    return fallback;
  }
};
const { events } = read<{ events: Ev[] }>('events.json', { events: [] });
const users = read<User[]>('users.json', []);
const camps = read<Record<string, string>>('camps.json', {});

const store = openStorage();
await store.load(); // creates the tables
for (let i = 0; i < events.length; i += 500) await store.appendEvents(events.slice(i, i + 500));
const existing = new Set((await store.loadUsers()).map((u) => u.username));
for (const u of users) if (!existing.has(u.username)) await store.saveUser(u);
for (const [campId, hash] of Object.entries(camps)) await store.setCampKey(campId, hash);
const after = await store.load();
console.log(`Postgres now holds ${after.events.length} events, ${after.users.length} staff accounts, ${Object.keys(after.campKeys).length} camp keys.`);
await store.close();
