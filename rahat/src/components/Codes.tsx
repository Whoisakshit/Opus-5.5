import { useEffect, useMemo, useRef, useState } from 'react';
import qrcode from 'qrcode-generator';
import { ChatText, Copy, QrCode, Scan, ShareNetwork, Stop } from '@phosphor-icons/react';
import type { Channel } from '../lib/types.ts';
import type { Encodable } from '../lib/codec.ts';
import { decode, describe, encode, smsParts } from '../lib/codec.ts';
import { CONTROL_ROOM_SMS } from '../lib/config.ts';
import { Notice } from './ui.tsx';

export function QR({ text, size = 220 }: { text: string; size?: number }) {
  const { path, n } = useMemo(() => {
    const qr = qrcode(0, 'M');
    // The library maps one char to one byte, so hand it UTF-8 bytes for non-Latin names.
    qr.addData(String.fromCharCode(...new TextEncoder().encode(text)), 'Byte');
    qr.make();
    const count = qr.getModuleCount();
    let d = '';
    for (let r = 0; r < count; r++) for (let c = 0; c < count; c++) if (qr.isDark(r, c)) d += `M${c + 2} ${r + 2}h1v1h-1z`;
    return { path: d, n: count + 4 };
  }, [text]);
  return (
    <div className="qr">
      <svg viewBox={`0 0 ${n} ${n}`} width={size} height={size} role="img" aria-label="QR code with the same message as the SMS" shapeRendering="crispEdges">
        <rect width={n} height={n} fill="#fff" />
        <path d={path} fill="#0e1a2b" />
      </svg>
    </div>
  );
}

/** Fallbacks for one saved event: SMS when there is a phone signal, QR when there is none. */
export function SendOptions({ ev }: { ev: Encodable }) {
  const code = useMemo(() => encode(ev), [ev]);
  const [showQr, setShowQr] = useState(false);
  const [copied, setCopied] = useState(false);
  const parts = smsParts(code);
  const smsHref = `sms:${CONTROL_ROOM_SMS}?body=${encodeURIComponent(code)}`;

  return (
    <div className="stack-sm">
      <div className="code" aria-label="Message code">{code}</div>
      <p className="help">
        {code.length} characters, {parts === 1 ? 'fits in one SMS' : `${parts} SMS parts`}. Works on any phone with a basic signal.
      </p>
      <div className="row">
        <a className="btn btn-sm btn-primary" href={smsHref}>
          <ChatText size={18} aria-hidden /> Send by SMS
        </a>
        <button
          type="button"
          className="btn btn-sm"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(code);
              setCopied(true);
              setTimeout(() => setCopied(false), 1800);
            } catch {
              setCopied(false);
            }
          }}
        >
          <Copy size={18} aria-hidden /> {copied ? 'Copied' : 'Copy'}
        </button>
        {'share' in navigator && (
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => navigator.share({ title: 'Rahat request', text: code }).catch(() => {})}
            title="Send to a nearby phone. On Android, Quick Share works with no internet."
          >
            <ShareNetwork size={18} aria-hidden /> Share nearby
          </button>
        )}
        <button type="button" className="btn btn-sm" aria-expanded={showQr} onClick={() => setShowQr((v) => !v)}>
          <QrCode size={18} aria-hidden /> {showQr ? 'Hide QR' : 'Show QR'}
        </button>
      </div>
      {showQr && (
        <div className="stack-sm">
          <QR text={code} />
          <p className="help" style={{ textAlign: 'center' }}>
            No signal at all? Show this to any truck driver or rescue team. Their phone carries it to the control room.
          </p>
        </div>
      )}
    </div>
  );
}

type Detector = { detect(src: HTMLVideoElement): Promise<{ rawValue: string }[]> };
type DetectorCtor = new (o: { formats: string[] }) => Detector;

/** Paste, type, or scan a Rahat code. Used by the SMS inbox and by drivers and teams relaying for cut-off camps. */
export function CodeReader({
  via,
  onAccept,
  isKnown,
  cta,
}: {
  via: Channel;
  onAccept: (ev: Encodable) => void;
  isKnown: (id: string) => boolean;
  cta: string;
}) {
  const [text, setText] = useState('');
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState('');
  const [done, setDone] = useState('');
  const video = useRef<HTMLVideoElement>(null);
  const Ctor = (window as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector;
  const result = text.trim() ? decode(text, via) : null;
  const known = result?.ok ? isKnown(result.ev.id) : false;

  useEffect(() => {
    if (!scanning || !Ctor) return;
    let stream: MediaStream | null = null;
    let timer = 0;
    let stopped = false;
    const detector = new Ctor({ formats: ['qr_code'] });
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'environment' } })
      .then((s) => {
        if (stopped) return s.getTracks().forEach((t) => t.stop());
        stream = s;
        const v = video.current!;
        v.srcObject = s;
        void v.play();
        const tick = async () => {
          try {
            const found = await detector.detect(v);
            if (found[0]?.rawValue) {
              setText(found[0].rawValue);
              setScanning(false);
              return;
            }
          } catch {
            /* frame not ready yet */
          }
          if (!stopped) timer = window.setTimeout(tick, 300);
        };
        void tick();
      })
      .catch(() => {
        setScanError('Camera is not available. Type or paste the code instead.');
        setScanning(false);
      });
    return () => {
      stopped = true;
      clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [scanning, Ctor]);

  return (
    <div className="stack-sm">
      <div className="field">
        <label htmlFor={`code-${via}`}>Message code</label>
        <textarea
          id={`code-${via}`}
          className="textarea mono"
          style={{ fontSize: 13 }}
          placeholder="RAHAT R ... *4Q"
          value={text}
          spellCheck={false}
          autoCapitalize="off"
          onChange={(e) => {
            setText(e.target.value);
            setDone('');
          }}
        />
      </div>
      {Ctor && (
        <div className="row">
          <button type="button" className="btn btn-sm" onClick={() => setScanning((s) => !s)}>
            {scanning ? <Stop size={18} aria-hidden /> : <Scan size={18} aria-hidden />} {scanning ? 'Stop camera' : 'Scan QR'}
          </button>
        </div>
      )}
      {scanning && <video ref={video} muted playsInline style={{ width: '100%', borderRadius: 10, background: '#0e1a2b' }} />}
      {scanError && <p className="error-text">{scanError}</p>}
      {result && !result.ok && <p className="error-text">{result.error}</p>}
      {result?.ok && (
        <Notice tone={known ? 'amber' : undefined}>
          <p>{describe(result.ev)}</p>
          {known ? (
            <p className="small muted">Already in the system. It will not be counted twice.</p>
          ) : (
            <button
              type="button"
              className="btn btn-sm btn-primary"
              style={{ marginTop: 8 }}
              onClick={() => {
                onAccept(result.ev);
                setDone(describe(result.ev));
                setText('');
              }}
            >
              {cta}
            </button>
          )}
        </Notice>
      )}
      {done && !text && <Notice tone="green">Saved: {done}</Notice>}
    </div>
  );
}
