import { useEffect, useSyncExternalStore } from 'react';
import type { MouseEvent } from 'react';
import type { Icon } from '@phosphor-icons/react';
import { ArrowsClockwise, Broadcast, CloudCheck, CloudSlash, PersonSimpleHike, SignOut, Truck, UsersThree, Warehouse, WifiMedium } from '@phosphor-icons/react';
import type { StaffRole } from './lib/types.ts';
import { HOME, loadSession, signOut, useAuth } from './lib/auth.ts';
import { claimStaff, myCampIds, staffUnsent, sync, syncAll, useStore } from './lib/store.ts';
import { useNetwork } from './lib/net.ts';
import { ago } from './lib/format.ts';
import { useNow } from './components/ui.tsx';
import { Brand } from './components/Brand.tsx';
import { Landing } from './screens/Landing.tsx';
import { RequestScreen } from './screens/Request.tsx';
import { StaffLogin } from './screens/StaffLogin.tsx';
import { StaffAccounts } from './screens/StaffAccounts.tsx';
import { ControlScreen } from './screens/Control.tsx';
import { WarehouseScreen } from './screens/WarehouseScreen.tsx';
import { DriverScreen } from './screens/Driver.tsx';
import { RescueScreen } from './screens/Rescue.tsx';

type StaffPage = 'control' | 'accounts' | 'warehouse' | 'driver' | 'rescue';
const STAFF_PAGES: StaffPage[] = ['control', 'accounts', 'warehouse', 'driver', 'rescue'];

const STAFF_NAV: Record<StaffRole, { page: StaffPage; label: string; icon: Icon }[]> = {
  control: [
    { page: 'control', label: 'Control room', icon: Broadcast },
    { page: 'accounts', label: 'Staff accounts', icon: UsersThree },
  ],
  warehouse: [{ page: 'warehouse', label: 'Warehouse', icon: Warehouse }],
  driver: [{ page: 'driver', label: 'My truck', icon: Truck }],
  rescue: [{ page: 'rescue', label: 'My team', icon: PersonSimpleHike }],
};

const SECTIONS = ['how'];

function useHash() {
  return useSyncExternalStore(
    (cb) => {
      window.addEventListener('hashchange', cb);
      return () => window.removeEventListener('hashchange', cb);
    },
    () => window.location.hash,
  );
}

function parse(hash: string): { area: 'landing' } | { area: 'request' } | { area: 'staff'; page?: StaffPage } {
  const parts = hash.replace(/^#\/?/, '').split('/');
  if (parts[0] === 'request') return { area: 'request' };
  if (parts[0] === 'staff') return { area: 'staff', page: STAFF_PAGES.find((p) => p === parts[1]) };
  return { area: 'landing' };
}


function PublicHeader({ onRequestPage }: { onRequestPage: boolean }) {
  const hasRequest = myCampIds().length > 0;
  const jump = (id: string) => (e: MouseEvent) => {
    e.preventDefault();
    if (onRequestPage) window.location.hash = '#/';
    setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' }), onRequestPage ? 60 : 0);
  };
  return (
    <header className="topbar">
      <div className="wrap topbar-in">
        <Brand />
        <nav className="links" aria-label="On this page">
          <a href="#how" onClick={jump('how')}>How it works</a>
        </nav>
        {!onRequestPage && (
          <a className="btn btn-primary" href="#/request">
            {hasRequest ? 'My request' : 'Request help'}
          </a>
        )}
      </div>
    </header>
  );
}

function SyncPill() {
  const { box } = useStore('staff');
  const net = useNetwork(box);
  const now = useNow(10_000);
  const pending = box.outbox.length;
  const [I, text, tone] =
    net === 'offline'
      ? [CloudSlash, pending ? `Offline, ${pending} to send` : 'Offline', 'amber']
      : pending
        ? [ArrowsClockwise, `Sending ${pending}`, 'blue']
        : net === 'weak'
          ? [WifiMedium, 'Weak signal', 'amber']
          : [CloudCheck, box.lastSync ? `Synced ${ago(box.lastSync, now)}` : 'Connecting', 'green'];
  return (
    <span className={`badge badge-${tone}`} role="status" aria-live="polite" title={box.lastError}>
      <I size={14} aria-hidden /> {text}
    </span>
  );
}

function StaffHeader({ role, name, page }: { role: StaffRole; name: string; page?: StaffPage }) {
  return (
    <header className="topbar">
      <div className="wrap topbar-in">
        <Brand href={HOME[role]} />
        <span className="badge">Staff</span>
        <nav className="nav" aria-label="Staff pages">
          {STAFF_NAV[role].map(({ page: p, label, icon: I }) => (
            <a key={p} href={`#/staff/${p}`} aria-current={page === p ? 'page' : undefined}>
              <I size={17} aria-hidden /> {label}
            </a>
          ))}
        </nav>
        <div className="row staff-tools">
          <SyncPill />
          <span className="small muted staff-name">{name}</span>
          <button
            type="button"
            className="btn btn-sm btn-quiet"
            onClick={async () => {
              if (staffUnsent()) await sync('staff'); // try to send first
              if (staffUnsent() && !window.confirm('Some of your updates have not been sent yet. Sign out anyway? They stay on this phone.')) return;
              void signOut();
            }}
          >
            <SignOut size={16} aria-hidden /> Sign out
          </button>
        </div>
      </div>
    </header>
  );
}

function Staff({ page }: { page?: StaffPage }) {
  const auth = useAuth();
  const user = auth.user;
  const allowed = user ? STAFF_NAV[user.role].map((n) => n.page) : [];
  const misplaced = !!user && (!page || !allowed.includes(page));

  useEffect(() => {
    if (user) claimStaff(user.id);
  }, [user]);
  useEffect(() => {
    if (user && misplaced) window.location.replace(HOME[user.role]);
  }, [user, misplaced]);

  if (auth.status === 'loading') return <div className="page wrap" aria-busy="true" />;
  if (auth.status === 'out' || !user) return <StaffLogin />;
  if (misplaced) return null;
  return (
    <>
      <StaffHeader role={user.role} name={user.name} page={page} />
      <main id="main" tabIndex={-1}>
        {page === 'control' && <ControlScreen />}
        {page === 'accounts' && <StaffAccounts me={user.id} />}
        {page === 'warehouse' && <WarehouseScreen />}
        {page === 'driver' && <DriverScreen unit={user.unit} />}
        {page === 'rescue' && <RescueScreen unit={user.unit} />}
      </main>
    </>
  );
}

export function App() {
  const hash = useHash();
  const route = parse(hash);
  const key = route.area === 'staff' ? `staff/${route.page ?? ''}` : route.area;

  useEffect(() => {
    void loadSession().then(syncAll);
    const t = setInterval(syncAll, 5_000);
    window.addEventListener('online', syncAll);
    return () => {
      clearInterval(t);
      window.removeEventListener('online', syncAll);
    };
  }, []);

  useEffect(() => {
    if (!SECTIONS.includes(window.location.hash.slice(1))) window.scrollTo(0, 0);
    document.title = key === 'request' ? 'Request help | Rahat' : key.startsWith('staff') ? 'Staff | Rahat' : 'Rahat: relief for flood and landslide camps';
  }, [key]);

  return (
    <>
      <a
        href="#main"
        className="skip"
        onClick={(e) => {
          e.preventDefault();
          document.getElementById('main')?.focus();
        }}
      >
        Skip to content
      </a>
      {route.area === 'staff' ? (
        <Staff page={route.page} />
      ) : (
        <>
          <PublicHeader onRequestPage={route.area === 'request'} />
          <main id="main" tabIndex={-1}>
            {route.area === 'landing' ? <Landing /> : <RequestScreen />}
          </main>
        </>
      )}
    </>
  );
}
