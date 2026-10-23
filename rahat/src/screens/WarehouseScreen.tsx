import { useState } from 'react';
import { Package, Plus } from '@phosphor-icons/react';
import type { DispatchPack, Qty, StockIn } from '../lib/types.ts';
import { ITEMS, ITEM_META, newId, zeroQty } from '../lib/types.ts';
import type { DispatchState, State } from '../lib/reduce.ts';
import { totalQty } from '../lib/reduce.ts';
import { record, useStore } from '../lib/store.ts';
import { ago } from '../lib/format.ts';
import { Badge, Empty, Notice, QtyInputs, QtyView, qtyLine, useNow } from '../components/ui.tsx';

const ROLE = 'warehouse';

export function WarehouseScreen() {
  const { state } = useStore('staff');
  const now = useNow();
  const need = [...state.camps.values()].reduce((acc, c) => {
    for (const k of ITEMS) acc[k] += c.need[k];
    return acc;
  }, zeroQty());
  const list = [...state.dispatches.values()].sort((a, b) => a.approvedAt - b.approvedAt);
  const toPack = list.filter((d) => d.status === 'approved');
  const waiting = list.filter((d) => d.status === 'packed');

  return (
    <div className="page">
      <div className="wrap mid stack">
        <div>
          <h1 className="page-title">Warehouse</h1>
          <p className="page-sub">Pack only what the control room approved, and count every handover.</p>
        </div>

        <section className="card" aria-labelledby="stock-title">
          <div className="card-pad" style={{ paddingBottom: 8 }}>
            <h2 className="card-title" id="stock-title">Stock</h2>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Item</th>
                  <th scope="col">In store</th>
                  <th scope="col">Held for approved loads</th>
                  <th scope="col">Free</th>
                  <th scope="col">Open camp need</th>
                </tr>
              </thead>
              <tbody>
                {ITEMS.map((k) => (
                  <tr key={k}>
                    <th scope="row">
                      {ITEM_META[k].label} <span className="muted">({ITEM_META[k].unit})</span>
                    </th>
                    <td>{state.stock[k].toLocaleString('en-IN')}</td>
                    <td>{state.reserved[k].toLocaleString('en-IN')}</td>
                    <td style={{ fontWeight: 650 }}>{state.available[k].toLocaleString('en-IN')}</td>
                    <td style={need[k] > state.available[k] ? { color: 'var(--red)', fontWeight: 600 } : undefined}>
                      {need[k].toLocaleString('en-IN')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="stack-sm" aria-labelledby="pack-title">
          <h2 className="card-title" id="pack-title">
            <Package size={20} aria-hidden /> To pack <Badge tone={toPack.length ? 'blue' : undefined}>{toPack.length}</Badge>
          </h2>
          {toPack.length === 0 && <Empty title="Nothing to pack">Loads appear here once the control room approves them.</Empty>}
          {toPack.map((d) => (
            <PackCard key={d.id} d={d} state={state} now={now} />
          ))}
        </section>

        <section className="stack-sm" aria-labelledby="wait-title">
          <h2 className="card-title" id="wait-title">Waiting for pickup</h2>
          {waiting.length === 0 && <Empty title="No packed loads waiting" />}
          {waiting.map((d) => (
            <div className="card card-pad" key={d.id}>
              <div className="row-between">
                <span className="item-title">{state.camps.get(d.campId)?.name ?? d.campId}</span>
                <Badge tone={d.mode === 'foot' ? 'amber' : undefined}>{d.mode === 'foot' ? 'Rescue team, on foot' : 'Truck'}</Badge>
              </div>
              <p className="small muted" style={{ marginTop: 4 }}>
                {qtyLine(d.packed!)}. Packed {ago(d.packedAt!, now)}.
              </p>
            </div>
          ))}
        </section>

        <ReceiveStock />
      </div>
    </div>
  );
}

function PackCard({ d, state, now }: { d: DispatchState; state: State; now: number }) {
  const [count, setCount] = useState<Qty>(() => {
    const q = { ...d.items };
    for (const k of ITEMS) q[k] = Math.min(q[k], Math.max(0, state.stock[k]));
    return q;
  });
  const over = ITEMS.filter((k) => count[k] > state.stock[k]);
  const short = ITEMS.some((k) => count[k] < d.items[k]);
  const camp = state.camps.get(d.campId);

  return (
    <div className="card card-pad stack-sm">
      <div className="row-between">
        <span className="item-title">{camp?.name ?? d.campId}</span>
        <span className="mono small muted">{d.id}</span>
      </div>
      <p className="small muted">
        Approved {ago(d.approvedAt, now)}. {d.mode === 'foot' ? 'Road is blocked: a rescue team carries this on foot, so pack in loads people can carry.' : 'Goes by truck.'}
      </p>
      <p className="label">Approved</p>
      <QtyView q={d.items} />
      <p className="label">Packed</p>
      <QtyInputs idPrefix={`pack-${d.id}`} value={count} of={d.items} onChange={setCount} />
      {over.length > 0 && <Notice tone="red">Not enough {over.map((k) => ITEM_META[k].label.toLowerCase()).join(', ')} in store.</Notice>}
      {short && !over.length && <p className="help" style={{ color: 'var(--amber)' }}>Packing less than approved. The control room will see the difference.</p>}
      <button
        type="button"
        className="btn btn-primary"
        disabled={over.length > 0 || totalQty(count) === 0}
        onClick={() => {
          const ev: DispatchPack = { type: 'dispatch.pack', id: newId(), at: Date.now(), by: ROLE, dispatchId: d.id, items: count };
          record('staff', ev);
        }}
      >
        Mark packed
      </button>
    </div>
  );
}

function ReceiveStock() {
  const [q, setQ] = useState<Qty>(zeroQty());
  const [note, setNote] = useState('');
  const [done, setDone] = useState('');
  return (
    <section className="card card-pad stack-sm" aria-labelledby="recv-title">
      <h2 className="card-title" id="recv-title">
        <Plus size={20} aria-hidden /> Receive stock
      </h2>
      <QtyInputs idPrefix="stock" value={q} onChange={setQ} />
      <div className="field">
        <label htmlFor="stock-note">From</label>
        <input id="stock-note" className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. State depot, NGO donation" />
      </div>
      <button
        type="button"
        className="btn"
        disabled={totalQty(q) === 0}
        onClick={() => {
          const ev: StockIn = { type: 'stock.in', id: newId(), at: Date.now(), by: ROLE, items: q, note: note.trim() || undefined };
          record('staff', ev);
          setDone(`Added ${qtyLine(q)}.`);
          setQ(zeroQty());
          setNote('');
        }}
      >
        Add to stock
      </button>
      {done && <p className="small" style={{ color: 'var(--green)' }}>{done}</p>}
    </section>
  );
}
