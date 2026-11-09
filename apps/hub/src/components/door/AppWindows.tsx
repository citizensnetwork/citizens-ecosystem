import { appCards, CENTRAL, COMING_SOON_BADGE, ECOSYSTEM_PAGE } from '../../lib/content';
import { APP_ICON } from '../../lib/feed';
import { appAction } from './CitizensHeader';
import { DoorIcon } from './Icon';
import { AppPeek } from './Peeks';

function verbs(card: { verbs: readonly string[] }): string {
  return `${card.verbs.join('. ')}.`;
}

/**
 * One small window per app. The window itself is a preview (a hash target). The arrow, and the link under
 * the copy, go to the live app. Connect uses the same window; it does not replace Central.
 */
export function AppWindows() {
  const cards = appCards();
  return (
    <div className="windows">
      {cards.map((card) => {
        const action = appAction(card);
        return (
          <section
            key={card.slug}
            id={`app-${card.slug}`}
            className="app-block"
            aria-labelledby={`app-title-${card.slug}`}
          >
            <div className="app-window glass">
              <div className="window-bar">
                <div className="window-title">
                  <span className="window-dot" aria-hidden="true" />
                  <span>{card.label}</span>
                </div>
                <a className="window-enter" href={card.href}>
                  <span className="inline-icon">
                    <DoorIcon kind={APP_ICON[card.slug] ?? 'star'} />
                  </span>
                  <span className="sr-only">{action}</span>
                  <span aria-hidden="true">↗</span>
                </a>
              </div>
              <div className="window-scroll">
                <a className="window-cover" href={`#app-${card.slug}`}>
                  <span className="inline-icon">
                    <DoorIcon kind={APP_ICON[card.slug] ?? 'star'} />
                  </span>
                  <span>
                    {CENTRAL.preview} {card.short}
                  </span>
                </a>
                <div className="peek">
                  <AppPeek card={card} />
                </div>
              </div>
            </div>
            <div className="app-explanation">
              <div className="explanation-heading">
                <div>
                  <p className="kicker">
                    {card.label}
                    {card.comingSoon ? ` · ${COMING_SOON_BADGE}` : ''}
                  </p>
                  <h2 id={`app-title-${card.slug}`}>{verbs(card)}</h2>
                </div>
                <span className="explanation-icon">
                  <DoorIcon kind={APP_ICON[card.slug] ?? 'star'} />
                </span>
              </div>
              <p className="explanation-body">{card.description}</p>
              <div className="explanation-details">
                <div>
                  <h3 className="kicker">
                    {card.comingSoon ? ECOSYSTEM_PAGE.planHeading : ECOSYSTEM_PAGE.todayHeading}
                  </h3>
                  {card.comingSoon ? (
                    <p>{card.summary}</p>
                  ) : (
                    <ul>
                      {card.today.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="where-fits">
                  <h3 className="kicker">{ECOSYSTEM_PAGE.fitsHeading}</h3>
                  <div className="fit-chips">
                    {card.fits.map((fit) => (
                      <span key={fit}>{fit}</span>
                    ))}
                  </div>
                </div>
              </div>
              <a className="paint-button dark-button" href={card.href}>
                {action}
              </a>
            </div>
          </section>
        );
      })}
    </div>
  );
}
