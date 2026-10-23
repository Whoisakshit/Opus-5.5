// Where events, staff accounts and camp keys are kept.
//   DATABASE_URL set  -> Postgres (production; see docker-compose.yml)
//   not set           -> JSON files in server/data (quick local development only)
// The server still keeps the event log in memory for fast reads; storage is the
// durable copy, written before any request is answered.

import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';
import type { Ev } from '../src/lib/types.ts';
import type { User } from './auth.ts';
import { DATA_DIR } from './auth.ts';

export type Snapshot = { epoch: string; events: Ev[]; users: User[]; campKeys: Record<string, string> };

export interface Storage {
  kind: 'postgres' | 'file';
  load(): Promise<Snapshot>;
  appendEvents(events: Ev[]): Promise<void>;
  saveUser(user: User): Promise<void>;
  loadUsers(): Promise<User[]>;
  setCampKey(campId: string, keyHash: string): Promise<void>;
  close(): Promise<void>;
}

// ---------------------------------------------------------------- Postgres

const SCHEMA = `
create table if not exists events (
  seq bigserial primary key,
  id text unique not null,
  body jsonb not null,
  received_at timestamptz not null default now()
);
create table if not exists users (
  id uuid primary key,
  username text unique not null,
  body jsonb not null
);
create table if not exists camp_keys (
  camp_id text primary key,
  key_hash text not null
);
create table if not exists meta (
  key text primary key,
  value text not null
);`;

function postgres(url: string): Storage {
  const pool = new pg.Pool({ connectionString: url, max: 5 });
  let ready: Promise<void> | null = null;
  const init = () => (ready ??= pool.query(SCHEMA).then(() => undefined));

  return {
    kind: 'postgres',
    async load() {
      await init();
      let epoch = (await pool.query("select value from meta where key = 'epoch'")).rows[0]?.value as string | undefined;
      if (!epoch) {
        epoch = randomUUID();
        await pool.query("insert into meta (key, value) values ('epoch', $1) on conflict do nothing", [epoch]);
      }
      const events = (await pool.query('select body from events order by seq')).rows.map((r) => r.body as Ev);
      const users = await this.loadUsers();
      const campKeys = Object.fromEntries((await pool.query('select camp_id, key_hash from camp_keys')).rows.map((r) => [r.camp_id, r.key_hash]));
      return { epoch, events, users, campKeys };
    },
    async appendEvents(events) {
      if (!events.length) return;
      await init();
      // One statement, one transaction: either all of this batch is stored or none of it.
      const values: string[] = [];
      const params: unknown[] = [];
      events.forEach((e, i) => {
        values.push(`($${i * 2 + 1}, $${i * 2 + 2})`);
        params.push(e.id, JSON.stringify(e));
      });
      await pool.query(`insert into events (id, body) values ${values.join(', ')} on conflict (id) do nothing`, params);
    },
    async saveUser(u) {
      await init();
      await pool.query(
        'insert into users (id, username, body) values ($1, $2, $3) on conflict (id) do update set username = excluded.username, body = excluded.body',
        [u.id, u.username, JSON.stringify(u)],
      );
    },
    async loadUsers() {
      await init();
      return (await pool.query('select body from users order by username')).rows.map((r) => r.body as User);
    },
    async setCampKey(campId, keyHash) {
      await init();
      await pool.query('insert into camp_keys (camp_id, key_hash) values ($1, $2) on conflict do nothing', [campId, keyHash]);
    },
    close: () => pool.end(),
  };
}

// ---------------------------------------------------------------- JSON files (development fallback)

function files(): Storage {
  const EVENTS = join(DATA_DIR, 'events.json');
  const USERS = join(DATA_DIR, 'users.json');
  const CAMPS = join(DATA_DIR, 'camps.json');
  const read = <T>(f: string, fallback: T): T => {
    try {
      return JSON.parse(readFileSync(f, 'utf8'));
    } catch {
      return fallback;
    }
  };
  const write = (f: string, data: unknown) => {
    mkdirSync(DATA_DIR, { recursive: true });
    writeFileSync(f, JSON.stringify(data, null, f === USERS ? 2 : 0), { mode: 0o600 });
  };
  let box: { epoch: string; events: Ev[] } = read(EVENTS, { epoch: randomUUID(), events: [] });

  return {
    kind: 'file',
    async load() {
      box = read(EVENTS, box);
      write(EVENTS, box);
      return { epoch: box.epoch, events: box.events, users: read(USERS, [] as User[]), campKeys: read(CAMPS, {}) };
    },
    async appendEvents(events) {
      if (!events.length) return;
      box.events = [...box.events, ...events];
      write(EVENTS, box);
    },
    async saveUser(u) {
      const users = read(USERS, [] as User[]).filter((x) => x.id !== u.id);
      write(USERS, [...users, u]);
    },
    async loadUsers() {
      return read(USERS, [] as User[]);
    },
    async setCampKey(campId, keyHash) {
      write(CAMPS, { ...read(CAMPS, {} as Record<string, string>), [campId]: keyHash });
    },
    async close() {},
  };
}

export function openStorage(): Storage {
  return process.env.DATABASE_URL ? postgres(process.env.DATABASE_URL) : files();
}
