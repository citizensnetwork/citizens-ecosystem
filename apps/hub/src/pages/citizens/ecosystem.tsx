import type { NextPage } from 'next';
import { AppIcon } from '../../components/Icons';
import { Layout } from '../../components/Layout';
import { PageHead } from '../../components/PageHead';
import {
  COMING_SOON_BADGE,
  ECOSYSTEM_INTRO,
  ECOSYSTEM_PAGE,
  ECOSYSTEM_SUB,
  PAGES,
  SITE_NAME,
  appCards,
  pageTitle,
} from '../../lib/content';

// Pure static HTML: no interaction, so no JavaScript.
export const config = { unstable_runtimeJS: false };

/**
 * The seven platforms, one section each (each platform's section has an id, so /citizens/ecosystem#connect works): what
 * it is, what you can do today (built apps only), or the plan (coming-soon apps), where it fits in "How it works", and
 * the way in. Says plainly which platforms are open and which are coming.
 */
const Ecosystem: NextPage = () => (
  <Layout
    title={pageTitle(ECOSYSTEM_PAGE.title)}
    description={ECOSYSTEM_PAGE.description}
    canonicalPath={PAGES.ecosystem}
  >
    <PageHead eyebrow={SITE_NAME} title={ECOSYSTEM_PAGE.title} lead={ECOSYSTEM_SUB} />
    <div className="wrap prose">
      <p className="lead">{ECOSYSTEM_INTRO}</p>
      <ol className="platforms">
        {appCards().map((card) => (
          <li key={card.slug} id={card.slug} className="platform">
            <div className="platform-head">
              <span className="platform-icon">
                <AppIcon slug={card.slug} />
              </span>
              <h2>{card.label}</h2>
              {card.comingSoon ? <span className="badge">{COMING_SOON_BADGE}</span> : null}
            </div>
            <p className="platform-verbs">{card.verbs.join('. ')}.</p>
            <p>{card.description}</p>
            {card.today.length > 0 ? (
              <>
                <h3>{ECOSYSTEM_PAGE.todayHeading}</h3>
                <ul className="ticks">
                  {card.today.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </>
            ) : (
              <>
                <h3>{ECOSYSTEM_PAGE.planHeading}</h3>
                <p>{card.summary}</p>
              </>
            )}
            {card.fits.length > 0 ? (
              <p className="fits">
                <span>{ECOSYSTEM_PAGE.fitsHeading}</span>
                {card.fits.map((fit) => (
                  <span key={fit} className="chip">
                    {fit}
                  </span>
                ))}
                <a className="text-link" href={PAGES.howItWorks}>
                  {ECOSYSTEM_PAGE.fitsLink}
                </a>
              </p>
            ) : null}
            <a className="button" href={card.href}>
              {card.comingSoon ? ECOSYSTEM_PAGE.about : ECOSYSTEM_PAGE.open} {card.label}
            </a>
          </li>
        ))}
      </ol>
    </div>
  </Layout>
);

export default Ecosystem;
