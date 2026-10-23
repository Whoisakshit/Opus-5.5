import { useState } from 'react';
import type { FormEvent } from 'react';
import { LockKey } from '@phosphor-icons/react';
import { signIn } from '../lib/auth.ts';
import { Brand } from '../components/Brand.tsx';

export function StaffLogin() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError((await signIn(username, password)) ?? '');
    setBusy(false);
  };

  return (
    <main id="main" tabIndex={-1} className="login">
      <div className="login-box stack">
        <Brand />
        <form className="card card-pad stack" onSubmit={submit} aria-labelledby="login-title">
          <div>
            <h1 className="card-title" id="login-title">
              <LockKey size={20} aria-hidden /> Staff sign in
            </h1>
            <p className="small muted" style={{ marginTop: 4 }}>
              For the control room, warehouse, drivers and rescue teams. Accounts are created by the district control room; there is
              no public sign-up.
            </p>
          </div>
          <div className="field">
            <label htmlFor="username">Username</label>
            <input
              id="username"
              className="input"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              className="input"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {error && (
            <p className="error-text" role="alert">
              {error}
            </p>
          )}
          <button type="submit" className="btn btn-primary btn-lg" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        <p className="small muted" style={{ textAlign: 'center' }}>
          Need help for your camp? <a href="/request">Request help here</a>, no account needed.
        </p>
      </div>
    </main>
  );
}
