# Rahat: disaster relief coordination

Coordinates relief between camps, a district control room, a warehouse, truck drivers and rescue teams during floods and landslides. Anyone can ask for help without an account; staff sign in with accounts the control room creates. It works on low-end phones, with weak signal and with no signal, and uses only free tools. See "Security model and known limits" before a live deployment.

## Who uses what

| Who | Where | Account? |
|---|---|---|
| Anyone needing help (camp leader, villager, volunteer) | `/` landing page, `/request` | **No.** The phone makes a secret key for its request; only that phone can update it or see its status. |
| Control room officer (admin) | `/admin` (Control room), `/admin/staff` (Staff accounts) | Yes. The first one is created on the server with `npm run create-admin`. |
| Warehouse, drivers, rescue teams | `/warehouse`, `/driver`, `/rescue` (each sees only their own) | Yes. Created by a control room admin on the Staff accounts page. **There is no public sign-up.** |

Each staff member sees only their own screen: a driver sees their assigned truck, a rescue team its own tasks. The server enforces this too, not just the UI: a driver cannot record a delivery for another truck, the warehouse cannot approve loads, a public phone cannot read any camp but its own. Handover codes are sent only to the camp and the control room; carriers' phones hold a hash and check against it.

New public requests show as **"New, not verified"** in the control room, with the phone number to call back. They start unticked in the allocation plan until an officer marks them verified, so a fake request cannot pull stock on its own.

## How staff sign in

There is no sign-up page. Accounts are handed out, so nobody can make themselves a control room officer.

1. **First admin (once, on the server):**
   ```bash
   npm run create-admin -- officer "Duty Officer"
   ```
   Press Enter at the password prompt and a strong password is generated and **printed once, right then**. Store it in a password manager. (Or type your own, at least 10 characters.) Passwords are never stored in plain text, never committed to git, and cannot be shown again later.
2. **Sign in:** open `https://<your-site>/admin` (or `/login`; there is deliberately no link on the public pages). The admin lands on the Control room.
3. **Everyone else:** the admin opens **Staff accounts**, enters the person's name, a username, their role (warehouse, driver with a truck, rescue team with a team) and a temporary password, then gives them the username and password in person or by phone. They sign in at their own address (`/warehouse`, `/driver`, `/rescue`, or `/login`) and see only their own screen.
4. **Forgotten password or someone leaves:** the admin uses **Reset password** (a new temporary one is shown once) or **Deactivate**. Either signs that person out everywhere.

For local development only, `server/data/dev-credentials.txt` can hold your own test login; the whole `server/data/` folder is in `.gitignore` and must never be committed.

## Run it locally

```bash
npm install
npm run create-admin -- officer "Duty Officer"   # Enter = generate a password, shown once
npm run server:dev    # API on :4124 with development sample data (SEED_DEV_DATA=1)
npm run dev           # app on :4123, proxies /api
npm test              # unit tests
```

Open `http://localhost:4123` for the public site and `http://localhost:4123/admin` to sign in as the control room. Use `npm run server` (no sample data) for a real deployment.

### Network detection (no manual switch)
The app decides "online / weak / offline" by itself from three signals: the browser's `navigator.onLine`, the Network Information API (2g, slow-2g, high round-trip time on Android Chrome), and its own sync attempts (failures and slow round trips, which catch "connected but no data"). Offline, everything is saved on the phone and the request page offers SMS and QR. To test it, use your browser's DevTools network throttling or "Offline".

### Addresses

| Path | Who | What |
|---|---|---|
| `/` | Public | Landing page |
| `/request` | Public | Ask for help, then track the request on the same phone |
| `/login` | Staff | Sign in; you are sent to your own screen |
| `/admin` | Control room | Needs, Allocate, Tracking, Alerts, Field (live map of teams and trucks) |
| `/admin/staff` | Control room | Create, deactivate and reset staff accounts |
| `/warehouse` | Warehouse | Stock, packing, receiving |
| `/driver` | Drivers | Loads assigned to their truck, delivery with code, live location |
| `/rescue` | Rescue teams | Tasks from the control room, people rescued, live location |

### Live tracking
Drivers and rescue teams share their GPS position while their screen is open: about once a minute, or sooner after moving 150 m. The control room sees each one on the map with a short trail, "last seen" time and distance to its target camp. With no signal, positions wait in the phone's outbox and arrive later as a trail. Browsers pause GPS when the screen locks, so the page asks to keep the screen on; true background tracking needs a native app.

### Place name from GPS
After "Use GPS" (or dropping a pin) the request form fills the place name using OpenStreetMap's free Nominatim service, only when the field is empty or was filled automatically. This sends the coordinates to OpenStreetMap's servers; for a real deployment, run your own Nominatim (free, open source) and point `src/lib/geocode.ts` at it.

## Deploying for real

1. **HTTPS is required** (GPS, the camera for QR scanning and secure cookies all need it). Put the server behind a reverse proxy (Caddy or nginx with Let's Encrypt, both free) that sets `X-Forwarded-Proto`.
2. Build with your numbers, then start:
   ```bash
   VITE_CONTROL_ROOM_SMS="+91XXXXXXXXXX" VITE_STATE_EOC=1070 VITE_DISTRICT_EOC=1077 npm run build
   SESSION_SECRET="<64 random chars>" SMS_GATEWAY_TOKEN="<long random token>" npm run server
   ```
3. On the control room's Android phone, install an open-source SMS gateway app and point its webhook at `POST /api/sms` with header `x-gateway-token`. Check each emergency number with your district before going live.
4. Back up `server/data/` (events, accounts, camp keys). Never commit it; it is in `.gitignore`.

| Variable | Purpose |
|---|---|
| `SESSION_SECRET` | Signs staff sessions. If unset, one is generated into `server/data/session.key`. |
| `SMS_GATEWAY_TOKEN` | Enables `/api/sms`. Without it the endpoint refuses everything. |
| `RAHAT_DATA_DIR` | Where events and accounts are stored (default `server/data`). |
| `SEED_DEV_DATA=1` | Loads sample camps for development. Never set in production. |
| `VITE_CONTROL_ROOM_SMS`, `VITE_STATE_EOC`, `VITE_DISTRICT_EOC` | Numbers shown to the public, set at build time. |

## How each requirement is met

| Requirement | How |
|---|---|
| 1. Camps report needs and **exact location** | Map pin (tap or drag), **GPS button** (GPS works with no internet), or typed coordinates. Accuracy circle shown. Stored with its source (GPS / map / typed). |
| 2. Works with no internet or no network | Phone saves first (outbox), syncs later. Same report as a **160-char SMS code** with checksum. With no network at all, a **QR code** that any driver or rescue team's phone carries out (store-and-forward). |
| 3. Fair priority when stock is short | Transparent 0-100 score, then **weighted max-min fair split** of the free stock. Officer edits and approves; edits require a written reason. |
| 4. Track warehouse to camp | Five custody steps: approved, packed, loaded (truck or team), delivered (with camp's 4-digit code), confirmed (camp's own count). |
| 5. Missing items, shortages, silent camps | Each count is compared with the previous one, so a loss is pinned to a handover. Stock vs need per item. Camps unheard for 6 h (quiet) and 12 h (silent). Duplicate camps within 300 m. Delivery without code. Unconfirmed delivery after 3 h. |
| 6. Send rescue teams | Assign from any camp, alert, or the Teams tab: reach and check, carry on foot (blocked roads), evacuate. Reaching a camp counts as hearing from it. |
| Human makes the final call | The system only suggests. Nothing is packed without an approval event, and every change carries a reason. |

## Design decisions (and why)

**Event log instead of editable records.** Every action is an immutable event with an id created on the phone. State is computed by replaying events (`src/lib/reduce.ts`). This one choice is what makes the rest work:
- Offline is natural: append locally, upload later.
- **Deduplication across channels**: the SMS code and QR carry the same id, so a report arriving by SMS and later by internet is counted once (tested).
- Full audit trail for free: who approved what, when, and why.
- Alternative considered: a normal database with update-in-place rows. Simpler queries, but conflicting offline edits need merge logic and you lose the history.

**"A new report replaces the old one" plus "subtract what is on the way".** Camp leaders report their current shortfall. The system subtracts loads already approved and not delivered, and anything delivered after the report. This is what prevents "some camps get supplies twice": a camp with a truck on the way automatically drops in the queue. The form pre-fills the last report minus deliveries, not minus in-transit stock, so nothing is subtracted twice.

**Fairness you can explain.** Score parts (shown on the overview and per camp): vulnerable people share (30), medical emergency (20), people trapped (15), hours waiting with nothing received (20), share of need still uncovered (15). Weight = 1 + score/50. Water-filling means every camp with a need gets part of the stock and higher scores get more; no camp gets more than it asked for. The plan shows **Jain's fairness index** and **"camps with a need that get nothing"** so the officer sees the effect of edits. Weights are a policy choice: they are deliberately visible so the district can argue about them and change them.

**One message format, three transports.** `src/lib/codec.ts`. Example:
`RAHAT R k3f9q2m1xa c=MLD t=mb8c3k p=210 v=46.30.4 f=420 w=160 b=90 m=6 x=MT l=30.3271,78.1374 a=12 s=g n=GIC_Maldevta *4Q`
It is short enough to read over police wireless. The 2-character checksum catches most typing mistakes (about 1 in 1,300 random errors would slip through).

**Delivery code.** The camp gets a 4-digit code with each approved load and says it only after unloading. The carrier's phone checks it locally, so it works with no signal. The camp's own count (`dispatch.receive`) is the real control; the code proves presence.

**Low-end phones.** System fonts (no font download), no animation library, large tap targets, numeric keypads for numbers, one column on phones. The service worker caches the app shell and any map tiles already viewed, so the app opens with no signal. JS is about 171 KB gzipped (mostly React and Leaflet), downloaded once.

## Free stack

React + Vite, Leaflet + OpenStreetMap tiles, `qrcode-generator`, Phosphor icons, a zero-dependency Node server. For a hosted version: Supabase or Firebase free tier for the event table and auth, and an open-source **Android SMS gateway app** on the control room phone forwarding texts to `POST /api/sms`. Check each free tier's current limits before relying on it.

## Security model and known limits

Done: per-role accounts with scrypt-hashed passwords, signed HttpOnly SameSite=Strict session cookies (12 h, one shift), sign-in rate limit, sessions revoked on password reset or deactivation, JSON-only API (blocks cross-site form posts), field-level validation of every event, per-role permission checks on the server, per-camp secret keys for public requests, handover codes hidden from carriers, security headers and a content security policy on the built app.

Still to do before a district relies on it:
- **Staff phones keep their data after sign-out** so drivers can work offline. Use device screen locks; a "wipe on sign-out" option would help on shared phones.
- **Public requests can be spammed.** Verification by call-back stops fake requests getting stock, but a rate limit per IP on `/api/public/events` is still needed.
- **4-digit codes** can be brute-forced from the hash by someone who copies a carrier's phone data. The camp's own count is the real check; a longer code or server-side check would be stronger.
- **Trucks and teams are fixed in `src/lib/config.ts`.** They should be managed from the Staff page.
- **Event times come from the phone's clock.** The server should also record arrival time.
- **Map tiles** come from OpenStreetMap's public servers (light use only). For offline maps, host a district extract yourself.
- `localStorage` holds the outbox; IndexedDB is the sturdier choice.
- The score weights, 6 h / 12 h thresholds and 300 m duplicate radius are **assumptions** to validate with the district.

## How to measure success (suggested evaluation)

Tie each "success means" line to a number you can measure in a field drill or simulation:

| Goal | Metric |
|---|---|
| Every request reaches the control room | % of reports received, and time to arrival, **by channel** (internet / SMS / relay), under simulated outages |
| No double supply while others get nothing | Count of camps receiving a second load while another camp with need has none (target 0); Jain index of coverage per round |
| Officer sees needs and what is on the way | Time for an officer to answer "what does camp X need and what is on the way" (task test with real users) |
| Silent camps detected | Time from a camp's last message to the alert, and to a team being assigned |
| Missing items detected | % of injected count discrepancies flagged, and at the correct handover |

Baseline to compare against: today's process (WhatsApp groups, phone calls, paper registers). Run the same drill both ways.

## Next steps worth doing

1. Hindi (and Garhwali/Kumaoni) labels on the camp-leader screen, tested with real users. This likely matters more than any feature above.
2. Talk to a district disaster management officer: check the score parts and thresholds against how they actually prioritise.
3. Auth + server validation (see Limitations).
4. Self-hosted offline map tiles for the district.
5. Load test the sync server with a few hundred simulated phones on flaky connections.

## Files

- `src/lib/` domain logic, no UI: `types` (events), `reduce` (state), `allocation` (fairness), `alerts`, `codec` (SMS/QR), `store` (offline outbox + sync), `seed` (development sample data)
- `src/screens/` one file per role; `src/components/` map, QR/code reader, field actions
- `server/server.ts` sync server + SMS webhook; `tests/` unit tests

Development sample data (`SEED_DEV_DATA=1`): the camps, people, trucks and teams are fictional; the localities are real places in Dehradun district.
