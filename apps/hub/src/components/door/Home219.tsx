import { PATH_ROOT } from '@citizens/ecosystem';
import { HOME_219 } from '../../lib/content';
import { DoorFooter, DoorHead, DoorSkip } from './DoorChrome';

/** The 219 homepage. It stays light, and its only door into the ecosystem is Citizens. */
export function Home219() {
  return (
    <div className="door door-219 surface home">
      <DoorHead title={HOME_219.title} description={HOME_219.description} canonicalPath="/" />
      <DoorSkip />
      <header className="home-nav glass">
        {/* This page ships no client runtime, so it uses a plain anchor rather than the Next router. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a className="logo219" href="/">
          219<span>.</span>
        </a>
        <nav className="home-links" aria-label="219">
          <a href="#heart219">About</a>
          <a href="#approach219">Our approach</a>
          <a href={PATH_ROOT}>Citizens</a>
        </nav>
      </header>
      <main id="main" className="home-pad">
        <div className="hero219">
          <div>
            <p className="kicker">{HOME_219.kicker}</p>
            <h1>
              {HOME_219.headline[0]}
              <br />
              {HOME_219.headline[1]}
              <br />
              <span className="accent-green">{HOME_219.headline[2]}</span>
            </h1>
            <p className="lead-copy">{HOME_219.lead}</p>
            <p className="aside-copy">{HOME_219.aside}</p>
            <div className="action-row">
              <a className="paint-button dark-button" href="#heart219">
                {HOME_219.heartCta}
              </a>
              <a className="paint-button outline-button" href={PATH_ROOT}>
                {HOME_219.citizensCta}
              </a>
            </div>
          </div>
          <div>
            <SharedLifeArt />
            <p className="art-line">{HOME_219.artLine}</p>
          </div>
        </div>
        <section id="heart219" className="heart219" aria-labelledby="heart-title">
          <p className="kicker">{HOME_219.heartKicker}</p>
          <h2 id="heart-title">{HOME_219.heartQuote}</h2>
          <div className="two-reading">
            <p>{HOME_219.heartLeft}</p>
            <p>{HOME_219.heartRight}</p>
          </div>
        </section>
        <section id="approach219" className="principles219" aria-label="Our approach">
          {HOME_219.principles.map((item) => (
            <div key={item.title}>
              <p className="kicker">{item.kicker}</p>
              <h3>{item.title}</h3>
              <p>{item.text}</p>
            </div>
          ))}
        </section>
        <section className="citizens-door" aria-labelledby="door-title">
          <div>
            <p className="kicker">{HOME_219.doorKicker}</p>
            <h2 id="door-title">
              {HOME_219.doorTitle.split(', ')[0]},
              <br />
              {HOME_219.doorTitle.split(', ')[1]}
            </h2>
            <p>{HOME_219.doorBody}</p>
          </div>
          <a className="paint-button dark-button" href={PATH_ROOT}>
            {HOME_219.enterCta}
          </a>
        </section>
      </main>
      <DoorFooter mark={HOME_219.footerMark} note={HOME_219.footerNote} />
    </div>
  );
}

function SharedLifeArt() {
  return (
    <svg viewBox="0 0 480 470" role="img" aria-hidden="true">
      <title>Distinct parts gathering into shared life</title>
      <rect x="3" y="3" width="474" height="464" rx="36" className="art-ground" />
      <circle cx="255" cy="213" r="147" fill="none" className="art-ring art-ring-green" />
      <circle cx="255" cy="213" r="109" fill="none" className="art-ring art-ring-gold" />
      <path
        d="M107 153L255 214L363 112M255 214L349 324M255 214L130 339"
        fill="none"
        className="art-links"
      />
      <rect x="53" y="97" width="114" height="114" rx="28" className="art-pane art-green" />
      <rect x="287" y="61" width="124" height="111" rx="28" className="art-pane art-blue" />
      <rect x="184" y="160" width="132" height="132" rx="32" className="art-pane art-gold" />
      <rect x="76" y="287" width="111" height="95" rx="26" className="art-pane art-blue" />
      <rect x="300" y="277" width="105" height="113" rx="26" className="art-pane art-green" />
    </svg>
  );
}
