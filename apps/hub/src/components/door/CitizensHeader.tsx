import { PATH_ROOT } from '@citizens/ecosystem';
import type { AppCard } from '../../lib/content';
import { PAGES, SLOGAN, SITE_NAME, appCards } from '../../lib/content';
import { APP_ICON } from '../../lib/feed';
import { DoorIcon } from './Icon';

function line(card: AppCard): string {
  return `${card.verbs.join('. ')}.`;
}

/**
 * Sticky Central bar: back, wordmark, then Me, the plain C, and the crown.
 * The crown list is a hash target, so it opens and closes with no script. Choosing an app jumps to that
 * app's window on Central. The arrow beside it is the live app.
 */
export function CitizensHeader({ current }: { current: 'central' | 'settings' }) {
  const cards = appCards();
  return (
    <header className="citizens-header glass">
      <div className="door-brand">
        <a className="back" href={current === 'central' ? '/' : PATH_ROOT}>
          <span className="sr-only">
            {current === 'central' ? 'Back to 219' : 'Back to Central'}
          </span>
          <span aria-hidden="true">←</span>
        </a>
        <a className="wordmark-lockup" href={PATH_ROOT}>
          <span className="wordmark">{SITE_NAME.toUpperCase()}</span>
          <span className="tagline">{SLOGAN}</span>
        </a>
      </div>
      <nav className="header-controls" aria-label="Citizens">
        <a
          className={current === 'settings' ? 'header-control selected-me' : 'header-control'}
          href={PAGES.settings}
          aria-current={current === 'settings' ? 'page' : undefined}
        >
          <span className="nav-icon">
            <DoorIcon kind="Me" />
          </span>
          <small>Me</small>
        </a>
        <a
          className={current === 'central' ? 'header-control central-active' : 'header-control'}
          href={PATH_ROOT}
          aria-current={current === 'central' ? 'page' : undefined}
          aria-label="Central"
        >
          <span className="central-mark">C</span>
          <small>Central</small>
        </a>
        <a
          className="header-control crown-open"
          href="#apps-menu"
          aria-expanded="false"
          aria-controls="apps-menu"
        >
          <CrownMark />
          <small>Citizens</small>
          <span className="sr-only">Open the app list</span>
        </a>
        <a
          className="header-control crown-close"
          href="#main"
          aria-expanded="true"
          aria-controls="apps-menu"
        >
          <CrownMark />
          <small>Citizens</small>
          <span className="sr-only">Close the app list</span>
        </a>
      </nav>
      <div className="ecosystem glass" id="apps-menu">
        <div className="ecosystem-heading">
          <p className="kicker">{SITE_NAME}</p>
          <a className="back" href="#main">
            <span className="sr-only">Close apps</span>
            <span aria-hidden="true">×</span>
          </a>
        </div>
        <ul className="ecosystem-grid">
          {cards.map((card) => (
            <li key={card.slug} className="eco-app">
              <a
                className="eco-preview"
                href={current === 'central' ? `#app-${card.slug}` : `${PATH_ROOT}#app-${card.slug}`}
              >
                <span className="inline-icon">
                  <DoorIcon kind={APP_ICON[card.slug] ?? 'star'} />
                </span>
                <span>
                  <b>{card.short}</b>
                  <small>{line(card)}</small>
                </span>
              </a>
              <a className="eco-arrow" href={card.href}>
                <span className="sr-only">{appAction(card)}</span>
                <span aria-hidden="true">↗</span>
              </a>
            </li>
          ))}
        </ul>
      </div>
    </header>
  );
}

export function appAction(card: AppCard): string {
  return card.comingSoon ? `About ${card.label}` : `Open ${card.label}`;
}

function CrownMark() {
  return (
    <span className="crown-mark">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/citizens-crown.png" width={48} height={26} alt="" />
    </span>
  );
}
