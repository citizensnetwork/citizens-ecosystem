import type { NextPage } from 'next';
import { PATH_ROOT } from '@citizens/ecosystem';
import { CentralSection } from '../../components/central/CentralSection';
import { EcosystemDiagram } from '../../components/EcosystemDiagram';
import { AppIcon, ArrowIcon } from '../../components/Icons';
import { Layout } from '../../components/Layout';
import {
  BAND,
  COMING_SOON_BADGE,
  ECOSYSTEM_HEADING,
  ECOSYSTEM_SUB,
  HERO,
  INTRO,
  LANDING_DESCRIPTION,
  LANDING_TITLE,
  PAGES,
  PART_TO_PLAY,
  PHILOSOPHY,
  SCRIPTURE,
  appCards,
  heroPhoto,
} from '../../lib/content';
import type { AppCard } from '../../lib/content';

// The one hub page that ships JavaScript: the Central feed loads today's cards from Connect's /api/v1 and lays them out
// in staggered columns. Everything else on the page is still static HTML.

/**
 * One tile. The whole tile is the link (a plain rectangle, so the keyboard focus ring is never clipped); the slanted
 * shape is the decorative `tile-art` inside it. Hovering or focusing a tile on a device that can hover swaps the verbs
 * for the platform's purpose; everywhere else the tile shows its name and verbs, and the ecosystem page says the rest.
 */
function Tile({ card, wide }: { card: AppCard; wide: boolean }) {
  const classes = ['tile', `tile-${card.slug}`];
  if (card.comingSoon) classes.push('tile-soon');
  if (wide) classes.push('tile-wide');
  return (
    <li className={classes.join(' ')}>
      <a className="tile-link" href={card.href}>
        <span className="tile-art" aria-hidden="true">
          {card.photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="tile-photo" src={card.photo.src} alt="" loading="lazy" />
          ) : null}
        </span>
        <span className="tile-body">
          <span className="tile-main">
            <AppIcon slug={card.slug} className="tile-icon" />
            <span className="tile-title">{card.short}</span>{' '}
            <span className="tile-verbs">{card.tileVerbs}</span>
          </span>
          <span className="tile-more" aria-hidden="true">
            <span className="tile-more-title">{card.short}</span>
            {card.tagline}
          </span>
          {card.comingSoon ? (
            <>
              {' '}
              <span className="badge">{COMING_SOON_BADGE}</span>
            </>
          ) : null}
        </span>
      </a>
    </li>
  );
}

const Landing: NextPage = () => {
  const cards = appCards();
  const photo = heroPhoto();
  // A lone last tile (7 tiles in rows of 3) spans the whole row, like Impact in the design.
  const lastIsAlone = cards.length % 3 === 1;
  return (
    <Layout title={LANDING_TITLE} description={LANDING_DESCRIPTION} canonicalPath={PATH_ROOT}>
      <section className="hero on-dark" aria-labelledby="hero-title">
        <div className="wrap hero-inner">
          <div className="hero-text">
            <span className="hero-rule" aria-hidden="true" />
            <h1 id="hero-title">{HERO.headline}</h1>
            <p className="hero-verbs">{HERO.verbs}</p>
            <div className="hero-actions">
              <a className="button button-outline" href="#ecosystem">
                {HERO.primaryCta}
                <ArrowIcon className="arrow" />
              </a>
              <a className="hero-link" href={PAGES.getInvolved}>
                {HERO.secondaryCta}
              </a>
            </div>
          </div>
        </div>
        <div className="hero-art" aria-hidden="true">
          {photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="hero-photo" src={photo.src} alt="" />
          ) : null}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="hero-crown" src="/citizens-crown.png" alt="" width={240} height={130} />
        </div>
      </section>

      <CentralSection />

      <div className="wrap intro">
        <p className="intro-lead">{INTRO.lead}</p>
        <p>{INTRO.body}</p>
        <p>{INTRO.belief}</p>
      </div>

      <section id="ecosystem" className="wrap ecosystem" aria-labelledby="ecosystem-title">
        <h2 id="ecosystem-title">{ECOSYSTEM_HEADING}</h2>
        <p className="section-sub">{ECOSYSTEM_SUB}</p>
        <ul className="tiles">
          {cards.map((card, index) => (
            <Tile key={card.slug} card={card} wide={lastIsAlone && index === cards.length - 1} />
          ))}
        </ul>
      </section>

      <section className="band on-dark" aria-labelledby="band-title">
        <div className="wrap band-grid">
          <div className="band-text">
            <h2 id="band-title">{BAND.title}</h2>
            <p>{BAND.body}</p>
            <a className="button button-outline" href={PAGES.howItWorks}>
              {BAND.cta}
              <ArrowIcon className="arrow" />
            </a>
          </div>
          <EcosystemDiagram />
        </div>
      </section>

      <div className="wrap">
        <figure className="scripture">
          <blockquote>
            <p>{SCRIPTURE.text}</p>
          </blockquote>
          <figcaption>{SCRIPTURE.reference}</figcaption>
          <a className="text-link" href={PAGES.philosophy}>
            {PHILOSOPHY.title}
          </a>
        </figure>
      </div>

      <p className="part-to-play">{PART_TO_PLAY}</p>
    </Layout>
  );
};

export default Landing;
