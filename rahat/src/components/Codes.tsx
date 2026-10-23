import { useMemo, useState } from 'react';
import { ChatText, Copy } from '@phosphor-icons/react';
import type { Encodable } from '../lib/codec.ts';
import { encode, smsParts } from '../lib/codec.ts';
import { CONTROL_ROOM_SMS } from '../lib/config.ts';
import { useT } from '../lib/i18n.ts';

/** For a request stuck on the phone: send it as one SMS, which needs only basic phone signal. */
export function SendOptions({ ev }: { ev: Encodable }) {
  const code = useMemo(() => encode(ev), [ev]);
  const [copied, setCopied] = useState(false);
  const t = useT();
  const parts = smsParts(code);
  const smsHref = `sms:${CONTROL_ROOM_SMS}?body=${encodeURIComponent(code)}`;

  return (
    <div className="stack-sm">
      <div className="code" aria-label="Message code">{code}</div>
      <p className="help">
        {t.smsInfo(code.length, parts)}
      </p>
      <div className="row">
        <a className="btn btn-sm btn-primary" href={smsHref}>
          <ChatText size={18} aria-hidden /> {t.sendSms}
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
          <Copy size={18} aria-hidden /> {copied ? t.copied : t.copy}
        </button>
      </div>
    </div>
  );
}
