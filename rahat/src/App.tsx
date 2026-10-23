import { useEffect, useState } from 'react';
import type { MouseEvent } from 'react';
import type { Icon } from '@phosphor-icons/react';
import { ArrowsClockwise, Broadcast, CloudCheck, CloudSlash, PersonSimpleHike, SignOut, Truck, UsersThree, Warehouse, WifiMedium } from '@phosphor-icons/react';
import type { StaffRole } from './lib/types.ts';
import { TEAMS, TRUCKS } from './lib/config.ts';
import { HOME, loadSession, signOut, useAuth } from './lib/auth.ts';
import { claimStaff, myCampIds, staffUnsent, sync, syncAll, useStore } from './lib/store.ts';
import { useNetwork } from './lib/net.ts';
import { ago } from './lib/format.ts';
import { useNow } from './components/ui.tsx';
import { navigate, usePath } from './lib/router.ts';
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
  // The district officer can open every screen; everyone else only their own.
  control: [
    { page: 'control', label: 'Control room', icon: Broadcast },
    { page: 'warehouse', label: 'Warehouse', icon: Warehouse },
    { page: 'driver', label: 'Trucks', icon: Truck },
    { page: 'rescue', label: 'Rescue teams', icon: PersonSimpleHike },
    { page: 'accounts', label: 'Staff', icon: UsersThree },
  ],
  warehouse: [{ page: 'warehouse', label: 'Warehouse', icon: Warehouse }],
  driver: [{ page: 'driver', label: 'My truck', icon: Truck }],
  rescue: [{ page: 'rescue', label: 'My team', icon: PersonSimpleHike }],
};

/** Every staff screen has its own address. /login works for everyone. */
export const PAGE_PATH: Record<StaffPage, string> = {
  control: '/admin',
  accounts: '/admin/staff',
  warehouse: '/warehouse',
  driver: '/driver',
  rescue: '/rescue',
};

type Route = { area: 'landing' } | { area: 'request' } | { area: 'staff'; page?: StaffPage };

function parse(path: string): Route {
  if (path === '/request') return { area: 'request' };
  if (path === '/login') return { area: 'staff' };
  const page = STAFF_PAGES.find((p) => PAGE_PATH[p] === path);
  if (page) return { area: 'staff', page };
  return { area: 'landing' };
}


function PublicHeader({ onRequestPage }: { onRequestPage: boolean }) {
  const hasRequest = myCampIds().length > 0;
  // Transparent at the top of the page, solid once the top marker scrolls out of view.
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const marker = document.getElementById('top-marker');
    if (!marker || !('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver(([e]) => setScrolled(!e.isIntersecting));
    io.observe(marker);
    return () => io.disconnect();
  }, []);
  const jump = (id: string) => (e: MouseEvent) => {
    e.preventDefault();
    if (onRequestPage) navigate('/');
    setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' }), onRequestPage ? 60 : 0);
  };
  return (
    <header className={`topbar topbar-public${scrolled ? ' is-scrolled' : ''}`}>
      <div className="wrap topbar-in">
        <Brand />
        <nav className="links" aria-label="On this page">
          <a href="#how" onClick={jump('how')}>How it works</a>
        </nav>
        {!onRequestPage && (
          <a className="btn btn-primary" href="/request">
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
            <a key={p} href={PAGE_PATH[p]} aria-current={page === p ? 'page' : undefined}>
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

/** The officer looks at any truck's or team's screen, and can act for them if a phone is lost. */
function AdminView({ kind }: { kind: 'driver' | 'rescue' }) {
  const units = kind === 'driver' ? TRUCKS : TEAMS;
  const [unit, setUnit] = useState(units[0].id);
  return (
    <>
      <div className="wrap narrow" style={{ paddingTop: 24 }}>
        <div className="notice">
          <div className="row-between" style={{ width: '100%' }}>
            <label htmlFor="admin-unit" style={{ fontWeight: 600 }}>
              Viewing as the control room. {kind === 'driver' ? 'Truck' : 'Team'}:
            </label>
            <select id="admin-unit" className="select select-sm" value={unit} onChange={(e) => setUnit(e.target.value)}>
              {units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
      {kind === 'driver' ? <DriverScreen key={unit} unit={unit} asAdmin /> : <RescueScreen key={unit} unit={unit} asAdmin />}
    </>
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
    if (user && misplaced) navigate(HOME[user.role], true);
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
        {page === 'driver' && (user.role === 'control' ? <AdminView kind="driver" /> : <DriverScreen unit={user.unit} />)}
        {page === 'rescue' && (user.role === 'control' ? <AdminView kind="rescue" /> : <RescueScreen unit={user.unit} />)}
      </main>
    </>
  );
}

export function App() {
  const path = usePath();
  const route = parse(path);
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
    if (!window.location.hash) window.scrollTo(0, 0);
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
          <div id="top-marker" aria-hidden />
          <PublicHeader onRequestPage={route.area === 'request'} />
          <main id="main" tabIndex={-1}>
            {route.area === 'landing' ? <Landing /> : <RequestScreen />}
          </main>
        </>
      )}
    </>
  );
}
