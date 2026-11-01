import type { NextPage } from 'next';
import { PATH_ROOT } from '@citizens/ecosystem';
import { Layout } from '../../components/Layout';
import {
  COMING_SOON_BADGE,
  ECOSYSTEM_HEADING,
  HERO_BODY,
  HERO_LEAD,
  LANDING_DESCRIPTION,
  LANDING_TITLE,
  SCRIPTURE,
  SLOGAN,
  appCards,
} from '../../lib/content';

// Pure static HTML: the page has no interaction, so it ships no JavaScript at all.
export const config = { unstable_runtimeJS: false };

const Landing: NextPage = () => (
  <Layout title={LANDING_TITLE} description={LANDING_DESCRIPTION} canonicalPath={PATH_ROOT}>
    <section className="hero" aria-labelledby="hero-title">
      <p className="eyebrow">Citizens</p>
      <h1 id="hero-title">{SLOGAN}</h1>
      <p className="lead">{HERO_LEAD}</p>
      <p>{HERO_BODY}</p>
    </section>

    <section aria-labelledby="ecosystem-title">
      <h2 id="ecosystem-title">{ECOSYSTEM_HEADING}</h2>
      <ul className="cards">
        {appCards().map((card) => (
          <li key={card.slug} className={card.comingSoon ? 'card card-soon' : 'card'}>
            <h3>{card.label}</h3>
            {card.comingSoon ? <p className="badge">{COMING_SOON_BADGE}</p> : null}
            <p>{card.summary}</p>
            <a className="button" href={card.href}>
              {card.comingSoon ? `About ${card.label}` : `Open ${card.label}`}
            </a>
          </li>
        ))}
      </ul>
    </section>

    <figure className="scripture">
      <blockquote>
        <p>{SCRIPTURE.text}</p>
      </blockquote>
      <figcaption>{SCRIPTURE.reference}</figcaption>
    </figure>
  </Layout>
);

export default Landing;
