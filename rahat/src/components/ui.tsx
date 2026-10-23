import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { CheckCircle, Info, WarningCircle, Warning } from '@phosphor-icons/react';
import type { Item, Qty } from '../lib/types.ts';
import { ITEMS, ITEM_META } from '../lib/types.ts';

export function useNow(ms = 15_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

type Tone = 'blue' | 'red' | 'amber' | 'green';

export function Badge({ tone, children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`badge${tone ? ` badge-${tone}` : ''}`}>{children}</span>;
}

export function Notice({ tone, children }: { tone?: Exclude<Tone, 'blue'>; children: ReactNode }) {
  const Icon = tone === 'red' ? WarningCircle : tone === 'amber' ? Warning : tone === 'green' ? CheckCircle : Info;
  return (
    <div className={`notice${tone ? ` notice-${tone}` : ''}`} role={tone === 'red' ? 'alert' : 'status'}>
      <Icon size={18} weight="fill" aria-hidden />
      <div>{children}</div>
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="subtle" style={{ textAlign: 'center', padding: '22px 16px' }}>
      <p style={{ fontWeight: 600 }}>{title}</p>
      {children && <p className="muted small" style={{ marginTop: 4 }}>{children}</p>}
    </div>
  );
}

type Names = { names?: Record<Item, string> };

export function QtyView({ q, compare, names }: { q: Qty; compare?: Qty } & Names) {
  return (
    <div className="qty">
      {ITEMS.map((k) => {
        const short = compare && q[k] < compare[k];
        return (
          <div className="qty-cell" key={k} style={short ? { background: 'var(--red-soft)' } : undefined}>
            <b style={short ? { color: 'var(--red)' } : undefined}>{q[k].toLocaleString('en-IN')}</b>
            <span>{names?.[k] ?? ITEM_META[k].label}</span>
          </div>
        );
      })}
    </div>
  );
}

export function NumberInput({
  id,
  value,
  onChange,
  max = 1_000_000,
  label,
}: {
  id: string;
  value: number;
  onChange: (n: number) => void;
  max?: number;
  label?: string;
}) {
  return (
    <input
      id={id}
      aria-label={label}
      className="input num"
      inputMode="numeric"
      pattern="[0-9]*"
      autoComplete="off"
      value={String(value)}
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => {
        const digits = e.target.value.replace(/\D/g, '');
        onChange(digits === '' ? 0 : Math.min(max, parseInt(digits, 10)));
      }}
    />
  );
}

export function QtyInputs({
  idPrefix,
  value,
  onChange,
  of,
  names,
  units,
}: {
  idPrefix: string;
  value: Qty;
  onChange: (q: Qty) => void;
  of?: Qty; // shows "of N" under each field
  units?: Record<Item, string>;
} & Names) {
  return (
    <div className="grid-4">
      {ITEMS.map((k) => (
        <div className="field" key={k}>
          <label htmlFor={`${idPrefix}-${k}`}>
            {names?.[k] ?? ITEM_META[k].label} <span className="muted">({units?.[k] ?? ITEM_META[k].unit})</span>
          </label>
          <NumberInput id={`${idPrefix}-${k}`} value={value[k]} onChange={(n) => onChange({ ...value, [k]: n })} />
          {of && <span className="help num">of {of[k].toLocaleString('en-IN')}</span>}
        </div>
      ))}
    </div>
  );
}

export function qtyLine(q: Qty): string {
  const parts = ITEMS.filter((k) => q[k] > 0).map((k) => `${q[k].toLocaleString('en-IN')} ${ITEM_META[k].label.toLowerCase()}`);
  return parts.length ? parts.join(', ') : 'nothing';
}
