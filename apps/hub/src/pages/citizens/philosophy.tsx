import type { NextPage } from 'next';
import { Layout } from '../../components/Layout';
import { PageHead } from '../../components/PageHead';
import {
  PAGES,
  PART_TO_PLAY,
  PHILOSOPHY,
  SCRIPTURE,
  SITE_NAME,
  pageTitle,
} from '../../lib/content';

// Pure static HTML: no interaction, so no JavaScript.
export const config = { unstable_runtimeJS: false };

/** What Citizens believes: a Kingdom built together, its foundation, the closing message, and the words it uses. */
const Philosophy: NextPage = () => (
  <Layout
    title={pageTitle(PHILOSOPHY.title)}
    description={PHILOSOPHY.description}
    canonicalPath={PAGES.philosophy}
  >
    <PageHead eyebrow={SITE_NAME} title={PHILOSOPHY.heading} lead={PHILOSOPHY.lead} />
    <div className="wrap prose">
      <p className="lead">{PHILOSOPHY.body}</p>
      <ul className="ticks">
        {PHILOSOPHY.beliefs.map((belief) => (
          <li key={belief}>{belief}</li>
        ))}
      </ul>
      <p>{PHILOSOPHY.notAnother}</p>
      <p>{PHILOSOPHY.notAllSame}</p>

      <section aria-labelledby="foundation-title">
        <h2 id="foundation-title">{PHILOSOPHY.foundation.heading}</h2>
        <p>{PHILOSOPHY.foundation.text}</p>
        <figure className="scripture">
          <blockquote>
            <p>{SCRIPTURE.text}</p>
          </blockquote>
          <figcaption>{SCRIPTURE.reference}</figcaption>
        </figure>
      </section>

      <section className="closing" aria-labelledby="closing-title">
        <h2 id="closing-title">{PHILOSOPHY.closing.heading}</h2>
        {PHILOSOPHY.closing.paragraphs.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
      </section>

      <section aria-labelledby="words-title">
        <h2 id="words-title">{PHILOSOPHY.words.heading}</h2>
        <dl className="words">
          {PHILOSOPHY.words.items.map((item) => (
            <div key={item.term}>
              <dt>{item.term}</dt>
              <dd>{item.text}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
    <p className="part-to-play">{PART_TO_PLAY}</p>
  </Layout>
);

export default Philosophy;
