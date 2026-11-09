import { PATH_ROOT } from '@citizens/ecosystem';
import type { AppCard } from '../../lib/content';
import { CONNECT, IMPACT_PROGRESSION } from '../../lib/content';
import { APP_ICON } from '../../lib/feed';
import { DoorIcon } from './Icon';

const PINS = ['worship', 'care', 'culture', 'learn', 'community', 'business'] as const;

/** A look inside an app, drawn in the small window. The arrow outside this block is the live app. */
export function AppPeek({ card }: { card: AppCard }) {
  if (card.slug === 'connect') return <ConnectPeek />;
  if (card.slug === 'wear') return <WearPeek />;
  if (card.slug === 'vision') return <VisionPeek />;
  return <SoonPeek card={card} />;
}

function ConnectPeek() {
  return (
    <div className="peek-content connect-peek">
      <p className="kicker">Citizens Connect</p>
      <p className="peek-title">
        Discover. Participate.
        <br />
        Belong.
      </p>
      <div className="cpk-tabs">
        <a id="cpk-map" href="#cpk-map">
          Map
        </a>
        <a id="cpk-near" href="#cpk-near">
          Near you
        </a>
        <a id="cpk-lets" href="#cpk-lets">
          Let’s…
        </a>
      </div>
      <div className="cpk-panels">
        <div className="cpk-panel cpk-panel-map">
          <div className="cpk-map glass">
            <div className="cpk-land" aria-hidden="true" />
            {PINS.map((name, index) => (
              <span key={name} className={`cpk-pin pin-${name} pin-at-${index}`} />
            ))}
            <div className="cpk-card glass">
              <p className="kicker">Tonight · Brooklyn</p>
              <b>A table with room for more</b>
              <span>An evening of shared food and conversation.</span>
            </div>
          </div>
        </div>
        <div className="cpk-panel cpk-panel-near">
          <ul className="cpk-list">
            <li className="cpk-row pin-culture">
              <i />
              <span>
                <b>A table with room for more</b>
                <small>Culture and fun · Tonight · Brooklyn</small>
              </span>
            </li>
            <li className="cpk-row pin-worship">
              <i />
              <span>
                <b>Friday worship, live from the studio</b>
                <small>Churches and worship · Fri 19:00 · Hatfield</small>
              </span>
            </li>
            <li className="cpk-row pin-care">
              <i />
              <span>
                <b>Saturday soup kitchen</b>
                <small>Serve and care · Sat 09:00 · Mamelodi</small>
              </span>
            </li>
          </ul>
        </div>
        <div className="cpk-panel cpk-panel-lets">
          <div className="cpk-lets">
            {['share a meal', 'walk and pray', 'meet for coffee', 'play together'].map((item) => (
              <span key={item} className="glass">
                Let’s {item}
              </span>
            ))}
          </div>
        </div>
      </div>
      <p className="cpk-note">A small preview. The arrow opens Connect in full.</p>
    </div>
  );
}

function WearPeek() {
  const tiles = [
    ['Expression', 'Kingdom-aligned brands'],
    ['Create', 'Propose a design Concept'],
    ['Collaborate', 'Support community initiatives'],
  ] as const;
  return (
    <div className="peek-content wear-peek">
      <p className="kicker">Citizens Wear</p>
      <p className="peek-title">
        Express. Create.
        <br />
        Collaborate.
      </p>
      <div className="peek-tabs">
        <span>Marketplace</span>
        <span>Brands</span>
        <span>Concepts</span>
      </div>
      <div className="wear-grid">
        {tiles.map(([name, text], index) => (
          <a className="wear-tile glass" href={`${PATH_ROOT}/wear`} key={name}>
            <span className={`garment garment-${index}`} aria-hidden="true">
              <DoorIcon kind="Wear" />
            </span>
            <span className="kicker">{`${name} `}</span>
            <p>{text}</p>
          </a>
        ))}
      </div>
      <div className="peek-feature glass">
        <span className="inline-icon">
          <DoorIcon kind="Wear" />
        </span>
        <div>
          <h3>Beyond fashion</h3>
          <p>
            A collaborative marketplace connecting Kingdom-aligned clothing brands, designers and
            customers.
          </p>
          <a className="feed-link" href={`${PATH_ROOT}/wear`}>
            Follow brands, posts and stories
          </a>
        </div>
      </div>
    </div>
  );
}

function VisionPeek() {
  const rows = [
    ['Understand activities', 'wide'],
    ['Coordinate initiatives', 'mid'],
    ['Measure impact', 'full'],
  ] as const;
  return (
    <div className="peek-content vision-peek">
      <p className="kicker">Citizens Vision</p>
      <p className="peek-title">
        Understand.
        <br />
        Coordinate. Measure.
      </p>
      <div className="peek-tabs">
        <span>Projects</span>
        <span>Activity map</span>
        <span>Timeline</span>
        <span>Observations</span>
      </div>
      <div className="vision-layout">
        <div className="vision-map glass">
          <div className="vision-land" aria-hidden="true" />
          <p className="vision-caption">See where your activity happens.</p>
        </div>
        <div className="vision-projects glass">
          <p className="kicker">Projects · Activities · Goals</p>
          {rows.map(([name, width], index) => (
            <div className="project-row" key={name}>
              <span>0{index + 1}</span>
              <div>
                <h3>{name}</h3>
                <span className={`progress-line progress-${width}`} aria-hidden="true">
                  <i />
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="peek-feature glass">
        <span className="inline-icon">
          <DoorIcon kind="Vision" />
        </span>
        <div>
          <h3>Observations and advisories</h3>
          <p>Read plain-language observations and advisories, with the evidence behind each one.</p>
          <a className="feed-link" href={`${PATH_ROOT}/vision`}>
            Read observations in Vision
          </a>
        </div>
      </div>
    </div>
  );
}

function SoonPeek({ card }: { card: AppCard }) {
  return (
    <div className="soon-peek peek-content">
      <div className="soon-symbol">
        <DoorIcon kind={APP_ICON[card.slug] ?? 'star'} />
      </div>
      <p className="kicker">{card.label}</p>
      <p className="peek-title">Coming soon</p>
      <p className="soon-note">This part of Citizens is not built yet.</p>
      <div className="soon-rule" />
      <h3>{`${card.verbs.join('. ')}.`}</h3>
      <p>{card.summary}</p>
      {card.slug === 'impact' ? (
        <div className="impact-first glass">
          <p className="kicker">Kingdom Projects · Connect</p>
          <p>{IMPACT_PROGRESSION.note}</p>
          <div className="fit-chips">
            {IMPACT_PROGRESSION.steps.map((step) => (
              <span key={step.name}>{step.name}</span>
            ))}
          </div>
          <a className="feed-link" href={CONNECT.kingdomProjects}>
            {IMPACT_PROGRESSION.cta}
          </a>
        </div>
      ) : null}
    </div>
  );
}
