import { useEffect } from 'react';
import type { Icon } from '@phosphor-icons/react';
import { ArrowDown, ArrowRight, ChatText, QrCode, WifiHigh } from '@phosphor-icons/react';
import { DISTRICT } from '../lib/config.ts';
import { myCampIds } from '../lib/store.ts';

const FACTS = [
  { value: 'Free', label: 'No account, no app to install' },
  { value: 'Offline', label: 'Saved on your phone until signal returns' },
  { value: '1 SMS', label: 'Is enough to reach the control room' },
  { value: 'GPS', label: 'Exact location, even without internet' },
];

const STEPS = [
  {
    title: 'Send your request',
    text: 'Pin your location, count the people with you and list what you need. It takes about two minutes.',
  },
  {
    title: 'Control room confirms',
    text: 'An officer calls you back to confirm, then shares the stock fairly, so no camp gets supplies twice while another waits.',
  },
  {
    title: 'Supplies reach you',
    text: 'By truck, or on foot if the road is blocked. Give the driver your 4-digit code once the goods are with you.',
  },
];

const CHANNELS: { icon: Icon; bars: number; title: string; text: string }[] = [
  { icon: WifiHigh, bars: 4, title: 'Internet', text: 'Sent straight away. If the network drops halfway, it is kept and sent again.' },
  { icon: ChatText, bars: 1, title: 'Phone signal only', text: 'One short text message carries your whole request to the control room.' },
  { icon: QrCode, bars: 0, title: 'No signal at all', text: 'Show a QR code to any relief truck or rescue team. Their phone carries it out.' },
];

/** Fades sections in as they scroll into view. IntersectionObserver, not a scroll listener. */
function useReveal() {
  useEffect(() => {
    const els = document.querySelectorAll<HTMLElement>('[data-reveal]:not(.in)');
    if (!('IntersectionObserver' in window)) {
      els.forEach((el) => el.classList.add('in'));
      return;
    }
    const io = new IntersectionObserver(
      (entries) =>
        entries.forEach((en) => {
          if (en.isIntersecting) {
            en.target.classList.add('in');
            io.unobserve(en.target);
          }
        }),
      { rootMargin: '0px 0px -8% 0px', threshold: 0.12 },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
}

const stagger = (i: number) => ({ ['--i' as string]: i });

function SignalBars({ on }: { on: number }) {
  return (
    <span className="bars" role="img" aria-label={on ? `${on} of 4 signal bars` : 'No signal'}>
      {[1, 2, 3, 4].map((b) => (
        <i key={b} className={b <= on ? 'on' : undefined} />
      ))}
    </span>
  );
}

export function Landing() {
  const cta = myCampIds().length > 0 ? 'My request' : 'Request help';
  useReveal();

  return (
    <>
      <div className="hero-bg">
        <span className="glow glow-a" aria-hidden />
        <span className="glow glow-b" aria-hidden />
        <section className="hero wrap">
          <span className="pill rise">
            <i className="pill-dot" aria-hidden /> Flood and landslide relief
          </span>
          <h1 className="rise" style={stagger(1)}>
            Help reaches your camp,
            <br /> even without signal.
          </h1>
          <p className="hero-sub rise" style={stagger(2)}>
            Tell the {DISTRICT.name} district control room where you are and what your camp needs. Works on any phone, with or without
            internet.
          </p>
          <div className="hero-cta rise" style={stagger(3)}>
            <a className="btn btn-primary btn-lg btn-go" href="/request">
              {cta} <ArrowRight size={18} aria-hidden />
            </a>
            <a
              className="btn btn-lg"
              href="#how"
              onClick={(e) => {
                e.preventDefault();
                document.getElementById('how')?.scrollIntoView({ behavior: 'smooth' });
              }}
            >
              See how it works <ArrowDown size={17} aria-hidden />
            </a>
          </div>
        </section>
      </div>

      <section className="wrap" aria-label="Key facts">
        <div className="facts">
          {FACTS.map((f, i) => (
            <div className="fact rise" key={f.value} style={stagger(4 + i)}>
              <b>{f.value}</b>
              <span>{f.label}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="section wrap" id="how" aria-labelledby="how-title">
        <div data-reveal>
          <p className="eyebrow">How it works</p>
          <h2 className="section-title" id="how-title">
            From request to relief, in <em>three steps.</em>
          </h2>
        </div>
        <ol className="steps-cards">
          {STEPS.map((s, i) => (
            <li key={s.title} data-reveal style={stagger(i)}>
              <span className="step-num">{String(i + 1).padStart(2, '0')}</span>
              <h3>{s.title}</h3>
              <p>{s.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="section signal wrap" aria-labelledby="signal-title">
        <div data-reveal>
          <p className="eyebrow">Any signal</p>
          <h2 className="section-title" id="signal-title">
            Your request gets through, <em>whatever the network.</em>
          </h2>
          <p className="section-sub">The page notices your connection by itself and uses whichever way works.</p>
        </div>
        <div className="channels">
          <span className="channel-track" aria-hidden>
            <span className="channel-runner">
              <i />
            </span>
          </span>
          {CHANNELS.map(({ icon: I, bars, title, text }, i) => (
            <div className="channel" key={title} data-reveal style={stagger(i)}>
              <div className="channel-top">
                <span className="channel-icon">
                  <I size={22} aria-hidden />
                </span>
                <SignalBars on={bars} />
              </div>
              <h3>{title}</h3>
              <p>{text}</p>
            </div>
          ))}
        </div>
        <div className="signal-cta" data-reveal>
          <a className="btn btn-primary btn-lg btn-go" href="/request">
            {cta} <ArrowRight size={18} aria-hidden />
          </a>
        </div>
      </section>

      <footer className="footer">
        <div className="wrap">
          <p>Rahat. Relief coordination for the {DISTRICT.name} district control room.</p>
        </div>
      </footer>
    </>
  );
}
