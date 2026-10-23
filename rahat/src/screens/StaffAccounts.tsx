import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { ArrowsClockwise, UserPlus } from '@phosphor-icons/react';
import type { StaffRole } from '../lib/types.ts';
import type { StaffUser } from '../lib/auth.ts';
import { TEAMS, TRUCKS, carrierLabel } from '../lib/config.ts';
import { Badge, Notice } from '../components/ui.tsx';

const ROLE_LABEL: Record<StaffRole, string> = {
  control: 'Control room (admin)',
  warehouse: 'Warehouse',
  driver: 'Driver',
  rescue: 'Rescue team',
};

async function api(path: string, body?: unknown) {
  const r = await fetch(path, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : undefined);
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error ?? `Server error (${r.status})`);
  return data;
}

/** A readable temporary password: 12 characters, no look-alike letters. */
function tempPassword() {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  return Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => chars[b % chars.length]).join('');
}

export function StaffAccounts({ me }: { me: string }) {
  const [users, setUsers] = useState<StaffUser[] | null>(null);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    try {
      setUsers((await api('/api/staff')).users);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load accounts. Managing staff needs a connection.');
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <div className="page">
      <div className="wrap stack">
        <div>
          <h1 className="page-title">Staff accounts</h1>
          <p className="page-sub">
            Everyone who works in the system gets their own account from here. Each person sees only their own screen: drivers their truck,
            teams their tasks.
          </p>
        </div>
        {error && <Notice tone="red">{error}</Notice>}
        <div className="req-grid">
          <section className="card" aria-labelledby="list-title">
            <div className="card-pad row-between" style={{ paddingBottom: 8 }}>
              <h2 className="card-title" id="list-title">
                People
              </h2>
              <button type="button" className="btn btn-sm btn-quiet" onClick={refresh}>
                <ArrowsClockwise size={16} aria-hidden /> Refresh
              </button>
            </div>
            {users === null && !error && <p className="item muted">Loading…</p>}
            <div className="divide">
              {users?.map((u) => (
                <UserRow key={u.id} u={u} isMe={u.id === me} onChange={refresh} />
              ))}
            </div>
          </section>
          <AddUser onAdded={refresh} />
        </div>
      </div>
    </div>
  );
}

function UserRow({ u, isMe, onChange }: { u: StaffUser; isMe: boolean; onChange: () => void }) {
  const [reset, setReset] = useState<string | null>(null);
  const [error, setError] = useState('');
  const act = async (body: unknown) => {
    try {
      await api(`/api/staff/${u.id}`, body);
      setError('');
      onChange();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    }
  };
  return (
    <div className="item stack-sm" style={{ opacity: u.active ? 1 : 0.6 }}>
      <div className="row-between">
        <span>
          <span className="item-title">{u.name}</span> <span className="small muted mono">{u.username}</span>
        </span>
        <span className="row" style={{ gap: 6 }}>
          <Badge tone={u.role === 'control' ? 'blue' : undefined}>{ROLE_LABEL[u.role]}</Badge>
          {u.unit && <Badge>{carrierLabel(u.unit)}</Badge>}
          {!u.active && <Badge tone="red">Deactivated</Badge>}
          {isMe && <Badge tone="green">You</Badge>}
        </span>
      </div>
      {!isMe && (
        <div className="row">
          <button type="button" className={`btn btn-sm${u.active ? ' btn-danger' : ''}`} onClick={() => act({ active: !u.active })}>
            {u.active ? 'Deactivate' : 'Reactivate'}
          </button>
          <button
            type="button"
            className="btn btn-sm"
            onClick={async () => {
              const p = tempPassword();
              await act({ password: p });
              setReset(p);
            }}
          >
            Reset password
          </button>
        </div>
      )}
      {reset && (
        <Notice tone="amber">
          New temporary password: <span className="mono" style={{ fontWeight: 700 }}>{reset}</span>. Give it to {u.name} in person or by phone. Their old
          sessions are signed out.
        </Notice>
      )}
      {error && <p className="error-text">{error}</p>}
    </div>
  );
}

function AddUser({ onAdded }: { onAdded: () => void }) {
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [role, setRole] = useState<StaffRole>('driver');
  const [unit, setUnit] = useState(TRUCKS[0].id);
  const [password, setPassword] = useState(tempPassword);
  const [error, setError] = useState('');
  const [created, setCreated] = useState<{ name: string; username: string; password: string } | null>(null);
  const units = role === 'driver' ? TRUCKS : role === 'rescue' ? TEAMS : [];

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await api('/api/staff', { name, username, role, unit: units.length ? unit : undefined, password });
      setCreated({ name, username: username.trim().toLowerCase(), password });
      setName('');
      setUsername('');
      setPassword(tempPassword());
      setError('');
      onAdded();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    }
  };

  return (
    <form className="card card-pad stack" onSubmit={submit} aria-labelledby="add-title">
      <h2 className="card-title" id="add-title">
        <UserPlus size={20} aria-hidden /> Add a person
      </h2>
      <div className="field">
        <label htmlFor="new-name">Full name</label>
        <input id="new-name" className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" required />
      </div>
      <div className="field">
        <label htmlFor="new-username">Username</label>
        <input
          id="new-username"
          className="input"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="e.g. harish.rawat"
          required
        />
      </div>
      <div className="grid-2">
        <div className="field">
          <label htmlFor="new-role">Role</label>
          <select
            id="new-role"
            className="select"
            value={role}
            onChange={(e) => {
              const r = e.target.value as StaffRole;
              setRole(r);
              setUnit(r === 'rescue' ? TEAMS[0].id : TRUCKS[0].id);
            }}
          >
            {(Object.keys(ROLE_LABEL) as StaffRole[]).map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
        </div>
        {units.length > 0 && (
          <div className="field">
            <label htmlFor="new-unit">{role === 'driver' ? 'Truck' : 'Team'}</label>
            <select id="new-unit" className="select" value={unit} onChange={(e) => setUnit(e.target.value)}>
              {units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.label}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
      <div className="field">
        <label htmlFor="new-password">Temporary password</label>
        <div className="row" style={{ flexWrap: 'nowrap' }}>
          <input id="new-password" className="input mono" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" spellCheck={false} />
          <button type="button" className="btn btn-sm" onClick={() => setPassword(tempPassword())} aria-label="Make a new temporary password">
            <ArrowsClockwise size={16} aria-hidden />
          </button>
        </div>
        <span className="help">At least 10 characters. Give it to them in person or by phone, never in a group chat.</span>
      </div>
      {role === 'control' && <Notice tone="amber">Control room accounts can approve loads and manage every account. Give this role only to duty officers.</Notice>}
      {error && <p className="error-text" role="alert">{error}</p>}
      <button type="submit" className="btn btn-primary">
        Create account
      </button>
      {created && (
        <Notice tone="green">
          Created <b>{created.name}</b>. Username <span className="mono">{created.username}</span>, temporary password{' '}
          <span className="mono">{created.password}</span>. They sign in at <span className="mono">{location.origin}/login</span>.
        </Notice>
      )}
    </form>
  );
}
