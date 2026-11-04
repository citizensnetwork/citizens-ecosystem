import type { NextPage } from 'next';
import { Layout } from '../../components/Layout';
import { PageHead } from '../../components/PageHead';
import {
  CONNECT,
  HOW,
  KINGDOM_PROJECTS,
  PAGES,
  SITE_NAME,
  appCards,
  pageTitle,
} from '../../lib/content';

// Pure static HTML: no interaction, so no JavaScript.
export const config = { unstable_runtimeJS: false };

/**
 * The five steps (Discover, Organise, Collaborate, Participate, Measure and Grow), who does what between Connect, Impact
 * and Vision, and Kingdom Projects: the way a community need is suggested in Connect today.
 */
const HowItWorks: NextPage = () => {
  const cards = appCards();
  const bySlug = new Map(cards.map((card) => [card.slug, card]));
  return (
    <Layout
      title={pageTitle(HOW.title)}
      description={HOW.description}
      canonicalPath={PAGES.howItWorks}
    >
      <PageHead eyebrow={SITE_NAME} title={HOW.heading} lead={HOW.intro} />
      <div className="wrap prose">
        <ol className="steps">
          {HOW.steps.map((step) => (
            <li key={step.n} className="step">
              <span className="step-n" aria-hidden="true">
                {step.n}
              </span>
              <div>
                <h2>{step.name}</h2>
                <p>{step.text}</p>
                <div className="chips">
                  {step.platforms.map((slug) => {
                    const card = bySlug.get(slug);
                    return card ? (
                      <a key={slug} className="chip" href={card.href}>
                        {card.short}
                      </a>
                    ) : null;
                  })}
                </div>
              </div>
            </li>
          ))}
        </ol>
        <p className="lead">{HOW.outro}</p>

        <section aria-labelledby="roles-title">
          <h2 id="roles-title">{HOW.roles.heading}</h2>
          <dl className="roles">
            {HOW.roles.rows.map((row) => (
              <div key={row.slug}>
                <dt>{bySlug.get(row.slug)?.label ?? row.slug}</dt>
                <dd>{row.role}</dd>
              </div>
            ))}
          </dl>
          <p>{HOW.roles.note}</p>
        </section>

        <section id="kingdom-projects" className="callout" aria-labelledby="kp-title">
          <h2 id="kp-title">{KINGDOM_PROJECTS.heading}</h2>
          <p className="lead">{KINGDOM_PROJECTS.lead}</p>
          <ol className="kp-steps">
            {KINGDOM_PROJECTS.steps.map((step) => (
              <li key={step.name}>
                <h3>{step.name}</h3>
                <p>{step.text}</p>
              </li>
            ))}
          </ol>
          <p>{KINGDOM_PROJECTS.closing}</p>
          <a className="button" href={CONNECT.kingdomProjects}>
            {KINGDOM_PROJECTS.cta}
          </a>
        </section>
      </div>
    </Layout>
  );
};

export default HowItWorks;
