import { PATH_ROOT } from '@citizens/ecosystem';
import { CENTRAL, CONNECT } from '../../lib/content';
import { HourCard } from './HourCard';
import { CAMPAIGNS, COFFEES, NEW_IN_THE_BODY, ROUTES, TRACKS } from '../../lib/feed';
import { DoorIcon } from './Icon';

function AppKicker({ name, href }: { name: string; href: string }) {
  return (
    <a className="app-kicker" href={href}>
      {name}
    </a>
  );
}

/** The editorial mosaic. Platform name first, then what the card is for. */
export function CentralFeed() {
  return (
    <>
      <div className="central-lead">
        <p className="kicker">{CENTRAL.kicker}</p>
        <h1>{CENTRAL.headline}</h1>
        <p className="lead-copy">{CENTRAL.lead}</p>
      </div>
      <div className="encouragement glass">
        <span className="enc-label">{CENTRAL.encouragementLabel}</span>
        <span className="enc-divider" aria-hidden="true">
          |
        </span>
        <span>
          “{CENTRAL.encouragement}” <small>{CENTRAL.encouragementRef}</small>
        </span>
      </div>
      <HourCard />
      <div className="top-mosaic">
        <article className="glass panel new-body">
          <p className="kicker">
            <AppKicker name="Central" href={PATH_ROOT} /> · What’s newly shared in the body
          </p>
          <h2>New in the Body!</h2>
          <div className="scroll-list" tabIndex={0} aria-label="Community updates">
            {NEW_IN_THE_BODY.map((item) => (
              <div key={item.title}>
                <b>
                  <a href={item.href}>{item.title}</a>
                </b>
                <p>{item.text}</p>
                <a className="feed-link" href={item.href}>
                  {item.link}
                </a>
              </div>
            ))}
          </div>
        </article>
        <div className="top-stack">
          <article className="glass panel oval">
            <span className="inline-icon">
              <DoorIcon kind="video" />
            </span>
            <div>
              <p className="kicker">
                <AppKicker name="Central" href={PATH_ROOT} /> · A window into shared life
              </p>
              <h2>Video / Status</h2>
            </div>
          </article>
          <article className="glass panel routes">
            <p className="kicker">
              <AppKicker name="Move" href={`${PATH_ROOT}/move`} /> · Routes near you
            </p>
            <h2>
              <a href={CONNECT.home}>Routes for Runners</a>
            </h2>
            {ROUTES.map((route) => (
              <a className="route" key={route.name} href={CONNECT.home}>
                <span className="inline-icon">
                  <DoorIcon kind="run" />
                </span>
                <span>{route.name}</span>
                <span>{` ${route.distance}`}</span>
              </a>
            ))}
            <a className="feed-link" href={CONNECT.home}>
              Find your next route
            </a>
          </article>
        </div>
      </div>
      <div className="lower-mosaic">
        <div className="loose-stack">
          <article className="glass panel rest">
            <p className="kicker">
              <AppKicker name="Central" href={PATH_ROOT} /> · A slower moment
            </p>
            <h2>Time to Rest...</h2>
            <div className="rest-sun" aria-hidden="true">
              <DoorIcon kind="sun" />
            </div>
            <p>
              Step away.
              <br />
              Take a breath.
              <br />
              Make room to be present.
            </p>
          </article>
          <article className="glass panel family">
            <p className="kicker">
              <AppKicker name="Connect" href={CONNECT.home} /> · Family concerns and practical care
            </p>
            <h2>
              <a href={CONNECT.home}>Family Concerns</a>
            </h2>
            <p>You do not have to carry every concern alone.</p>
            <a className="feed-link" href={CONNECT.home}>
              Support, prayer and practical care
            </a>
          </article>
        </div>
        <div className="loose-stack middle-stack">
          <article className="glass panel coffees">
            <p className="kicker">
              <AppKicker name="Connect" href={CONNECT.home} /> · Places to pause nearby
            </p>
            <h2>
              <a href={CONNECT.search}>Coffees around you</a>
            </h2>
            <div className="scroll-list compact" tabIndex={0} aria-label="Places to meet">
              {COFFEES.map((place) => (
                <p key={place}>
                  <a href={CONNECT.search}>
                    <span className="feed-glyph coffee-glyph" aria-hidden="true">
                      <DoorIcon kind="coffee" />
                    </span>
                    {place}
                  </a>
                </p>
              ))}
            </div>
            <a className="feed-link" href={CONNECT.search}>
              Explore nearby
            </a>
          </article>
          <article className="glass panel campaigns">
            <p className="kicker">
              <AppKicker name="Impact" href={`${PATH_ROOT}/impact`} /> · Voices and campaigns
            </p>
            <h2>
              <a href={`${PATH_ROOT}/impact`}>Who’s Campaigning?</a>
            </h2>
            {CAMPAIGNS.map((name) => (
              <a key={name} className="campaign-line" href={`${PATH_ROOT}/impact`}>
                <span className="feed-glyph volume-glyph" aria-hidden="true">
                  <DoorIcon kind="volume" />
                </span>
                <span>{name}</span>
              </a>
            ))}
            <a className="feed-link" href={`${PATH_ROOT}/impact`}>
              Shared responses in Impact
            </a>
          </article>
        </div>
        <article className="glass panel playlist">
          <p className="kicker">
            <AppKicker name="Play" href={`${PATH_ROOT}/play`} /> · Something to listen to
          </p>
          <span className="inline-icon">
            <DoorIcon kind="music" />
          </span>
          <h2>
            <a href={`${PATH_ROOT}/play`}>
              Expand
              <br /> the Playlist
            </a>
          </h2>
          <p>Something to listen to, something to share.</p>
          <ol className="tracks">
            {TRACKS.map((title, index) => (
              <li key={title}>
                <a className="track" href={`${PATH_ROOT}/play`}>
                  <span className="feed-glyph music-glyph" aria-hidden="true">
                    <DoorIcon kind="music" />
                  </span>
                  <span>
                    <small>{`${String(index + 1).padStart(2, '0')} `}</small>
                    <span className="track-title">{title}</span>
                  </span>
                </a>
              </li>
            ))}
          </ol>
        </article>
      </div>
    </>
  );
}
