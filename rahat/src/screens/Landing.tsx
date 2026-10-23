import { useEffect } from 'react';
import type { Icon } from '@phosphor-icons/react';
import { ArrowDown, ArrowRight, BatteryHigh, ChatText, CloudArrowUp, Drop, Mountains, WifiHigh } from '@phosphor-icons/react';
import { useT } from '../lib/i18n.ts';
import { myCampIds } from '../lib/store.ts';

const CHANNEL_LOOK: { icon: Icon; bars: number }[] = [
  { icon: WifiHigh, bars: 4 },
  { icon: ChatText, bars: 1 },
  { icon: CloudArrowUp, bars: 0 },
];
const GUIDE_ICONS: Icon[] = [Drop, Mountains, BatteryHigh];

/** Fades sections in as they scroll into view. IntersectionObserver, not a scroll listener. */
function useReveal(dep: unknown) {
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
  }, [dep]);
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
  const t = useT();
  const cta = myCampIds().length > 0 ? t.myRequest : t.requestHelp;
  useReveal(t.lang);

  return (
    <>
      <div className="hero-bg">
        <span className="glow glow-a" aria-hidden />
        <span className="glow glow-b" aria-hidden />
        <section className="hero wrap">
          <span className="pill rise">
            <i className="pill-dot" aria-hidden /> {t.pill}
          </span>
          <h1 className="rise" style={stagger(1)}>
            {t.h1a}
            <br /> {t.h1b}
          </h1>
          <p className="hero-sub rise" style={stagger(2)}>
            {t.heroSub(t.district)}
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
              {t.seeHow} <ArrowDown size={17} aria-hidden />
            </a>
          </div>
        </section>
      </div>

      <section className="wrap" aria-label={t.facts.map((f) => f[0]).join(', ')}>
        <div className="facts">
          {t.facts.map(([value, label], i) => (
            <div className="fact rise" key={i} style={stagger(4 + i)}>
              <b>{value}</b>
              <span>{label}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="section wrap" id="how" aria-labelledby="how-title">
        <div data-reveal>
          <p className="eyebrow">{t.howEyebrow}</p>
          <h2 className="section-title" id="how-title">
            {t.howTitle[0]}
            <em>{t.howTitle[1]}</em>
          </h2>
        </div>
        <ol className="steps-cards">
          {t.steps.map(([title, text], i) => (
            <li key={i} data-reveal style={stagger(i)}>
              <span className="step-num">{String(i + 1).padStart(2, '0')}</span>
              <h3>{title}</h3>
              <p>{text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="section signal wrap" aria-labelledby="signal-title">
        <div data-reveal>
          <p className="eyebrow">{t.signalEyebrow}</p>
          <h2 className="section-title" id="signal-title">
            {t.signalTitle[0]}
            <em>{t.signalTitle[1]}</em>
          </h2>
          <p className="section-sub">{t.signalSub}</p>
        </div>
        <div className="channels">
          <span className="channel-track" aria-hidden>
            <span className="channel-runner">
              <i />
            </span>
          </span>
          {t.channels.map(([title, text], i) => {
            const { icon: I, bars } = CHANNEL_LOOK[i];
            return (
              <div className="channel" key={i} data-reveal style={stagger(i)}>
                <div className="channel-top">
                  <span className="channel-icon">
                    <I size={22} aria-hidden />
                  </span>
                  <SignalBars on={bars} />
                </div>
                <h3>{title}</h3>
                <p>{text}</p>
              </div>
            );
          })}
        </div>
        <div className="signal-cta" data-reveal>
          <a className="btn btn-primary btn-lg btn-go" href="/request">
            {cta} <ArrowRight size={18} aria-hidden />
          </a>
        </div>
      </section>

      <section className="section wrap" id="safety" aria-labelledby="safety-title">
        <div data-reveal>
          <p className="eyebrow">{t.safetyEyebrow}</p>
          <h2 className="section-title" id="safety-title">
            {t.safetyTitle[0]}
            <em>{t.safetyTitle[1]}</em>
          </h2>
        </div>
        <div className="guides">
          {t.guides.map(({ title, points }, i) => {
            const I = GUIDE_ICONS[i];
            return (
              <div className="guide" key={i} data-reveal style={stagger(i)}>
                <div className="guide-head">
                  <span className="channel-icon">
                    <I size={22} aria-hidden />
                  </span>
                  <h3>{title}</h3>
                </div>
                <ul>
                  {points.map((p, j) => (
                    <li key={j}>{p}</li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
        <p className="help" style={{ marginTop: 18 }} data-reveal>
          {t.safetyNote[0]}
          <a href="https://ndma.gov.in/" target="_blank" rel="noreferrer">
            {t.safetyNote[1]}
          </a>
          {t.safetyNote[2]}
          <a href="tel:112">112</a>
          {t.stop}
        </p>
      </section>

      <footer className="footer">
        <div className="wrap">
          <p>{t.footer(t.district)}</p>
        </div>
      </footer>
    </>
  );
}
