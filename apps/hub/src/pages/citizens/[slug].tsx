import type { GetStaticPaths, GetStaticProps, NextPage } from 'next';
import { COMING_SOON, PATH_ROOT } from '@citizens/ecosystem';
import { AppIcon } from '../../components/Icons';
import { Layout } from '../../components/Layout';
import {
  BACK_TO_ECOSYSTEM,
  CONNECT,
  COMING_SOON_BADGE,
  COMING_SOON_NOTE,
  ECOSYSTEM_PAGE,
  IMPACT_PROGRESSION,
  PAGES,
  appCards,
} from '../../lib/content';

// Pure static HTML: no interaction, so no JavaScript.
export const config = { unstable_runtimeJS: false };

interface ComingSoonProps {
  slug: string;
  label: string;
  summary: string;
  description: string;
  /** "Develop. Equip. Grow." */
  verbs: string;
  /** "04 Participate": where it takes part in "How it works". */
  fits: string[];
}

/**
 * /citizens/learn, /play, /move and /impact: one page per entry in the registry's COMING_SOON list.
 * fallback: false makes every other /citizens/<x> a 404. (The built apps never reach this page: the hub's rewrites
 * hand /citizens/connect, /vision and /wear to their own projects first, and the hub's own pages are static files.)
 */
export const getStaticPaths: GetStaticPaths = () => ({
  paths: COMING_SOON.map((app) => ({ params: { slug: app.slug } })),
  fallback: false,
});

export const getStaticProps: GetStaticProps<ComingSoonProps, { slug: string }> = ({ params }) => {
  const card = appCards().find((entry) => entry.comingSoon && entry.slug === params?.slug);
  if (!card) return { notFound: true };
  return {
    props: {
      slug: card.slug,
      label: card.label,
      summary: card.summary,
      description: card.description,
      verbs: `${card.verbs.join('. ')}.`,
      fits: card.fits,
    },
  };
};

/** Citizens Impact grows out of Kingdom Projects: show the four steps and which ones already work. */
function ImpactProgression() {
  return (
    <section className="callout" aria-labelledby="progress-title">
      <h2 id="progress-title">{IMPACT_PROGRESSION.heading}</h2>
      <p>{IMPACT_PROGRESSION.intro}</p>
      <ol className="progression">
        {IMPACT_PROGRESSION.steps.map((step) => (
          <li key={step.name} className={step.today ? undefined : 'later'}>
            <h3>{step.name}</h3>
            <p>{step.text}</p>
            <span className="tag">
              {step.today ? IMPACT_PROGRESSION.todayTag : IMPACT_PROGRESSION.laterTag}
            </span>
          </li>
        ))}
      </ol>
      <a className="button" href={CONNECT.kingdomProjects}>
        {IMPACT_PROGRESSION.cta}
      </a>
    </section>
  );
}

const ComingSoon: NextPage<ComingSoonProps> = ({
  slug,
  label,
  summary,
  description,
  verbs,
  fits,
}) => (
  <Layout title={`${label}: ${COMING_SOON_BADGE.toLowerCase()}`} description={summary} noindex>
    <section className="soon on-dark" aria-labelledby="soon-title">
      <div className="wrap soon-grid">
        <div>
          <p className="badge">{COMING_SOON_BADGE}</p>
          <h1 id="soon-title">{label}</h1>
          <p className="soon-verbs">{verbs}</p>
          <p className="lead">{summary}</p>
        </div>
        <AppIcon slug={slug} className="soon-icon" />
      </div>
    </section>
    <div className="wrap prose">
      <p>{description}</p>
      <p>{slug === 'impact' ? IMPACT_PROGRESSION.note : COMING_SOON_NOTE}</p>
      {slug === 'impact' ? <ImpactProgression /> : null}
      {fits.length > 0 ? (
        <p className="fits">
          <span>{ECOSYSTEM_PAGE.fitsHeading}</span>
          {fits.map((fit) => (
            <span key={fit} className="chip">
              {fit}
            </span>
          ))}
          <a className="text-link" href={PAGES.howItWorks}>
            {ECOSYSTEM_PAGE.fitsLink}
          </a>
        </p>
      ) : null}
      <a className="button" href={PATH_ROOT}>
        {BACK_TO_ECOSYSTEM}
      </a>
    </div>
  </Layout>
);

export default ComingSoon;
