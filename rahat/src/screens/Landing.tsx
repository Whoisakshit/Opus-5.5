import { ArrowDown } from '@phosphor-icons/react';
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
    text: 'Pin your location, count the people with you and list what you need. No signal? It is saved and sent later, or goes as one SMS.',
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

export function Landing() {
  const cta = myCampIds().length > 0 ? 'My request' : 'Request help';

  return (
    <>
      <section className="hero wrap">
        <span className="pill rise">
          <i className="pill-dot" aria-hidden /> Flood and landslide relief
        </span>
        <h1 className="rise" style={{ ['--i' as string]: 1 }}>
          Help reaches your camp,
          <br /> even without signal.
        </h1>
        <p className="hero-sub rise" style={{ ['--i' as string]: 2 }}>
          Tell the {DISTRICT.name} district control room where you are and what your camp needs. Works on any phone, with or without
          internet.
        </p>
        <div className="hero-cta rise" style={{ ['--i' as string]: 3 }}>
          <a className="btn btn-primary btn-lg" href="#/request">
            {cta}
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

      <section className="wrap" aria-label="Key facts">
        <div className="facts">
          {FACTS.map((f, i) => (
            <div className="fact rise" key={f.value} style={{ ['--i' as string]: 4 + i }}>
              <b>{f.value}</b>
              <span>{f.label}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="section wrap" id="how" aria-labelledby="how-title">
        <p className="eyebrow">How it works</p>
        <h2 className="section-title" id="how-title">
          From request to relief, in <em>three steps.</em>
        </h2>
        <ol className="steps-cards">
          {STEPS.map((s, i) => (
            <li key={s.title}>
              <span className="step-num">{String(i + 1).padStart(2, '0')}</span>
              <h3>{s.title}</h3>
              <p>{s.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <footer className="footer">
        <div className="wrap">
          <p>Rahat. Relief coordination for the {DISTRICT.name} district control room.</p>
        </div>
      </footer>
    </>
  );
}
