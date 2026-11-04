import type { NextPage } from 'next';
import { Layout } from '../../components/Layout';
import { PageHead } from '../../components/PageHead';
import {
  CONNECT,
  GET_INVOLVED,
  PAGES,
  PART_TO_PLAY,
  SITE_NAME,
  pageTitle,
} from '../../lib/content';

// Pure static HTML: no interaction, so no JavaScript.
export const config = { unstable_runtimeJS: false };

/**
 * Five kinds of people, each with the doors that open today. Every door is a real address (Connect's screens, or
 * another platform's page), so nothing here promises something that is not there.
 */
const GetInvolved: NextPage = () => (
  <Layout
    title={pageTitle(GET_INVOLVED.title)}
    description={GET_INVOLVED.description}
    canonicalPath={PAGES.getInvolved}
  >
    <PageHead eyebrow={SITE_NAME} title={GET_INVOLVED.heading} lead={GET_INVOLVED.intro} />
    <div className="wrap prose">
      <ul className="audiences">
        {GET_INVOLVED.audiences.map((audience) => (
          <li key={audience.id} id={audience.id} className="audience">
            <h2>{audience.name}</h2>
            <p>{audience.text}</p>
            <ul className="doors">
              {audience.doors.map((door) => (
                <li key={door.label}>
                  <a className="button button-quiet" href={door.href}>
                    {door.label}
                  </a>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
      <section className="closing" aria-labelledby="closing-title">
        <h2 id="closing-title">{GET_INVOLVED.closing}</h2>
        <div className="cta-row">
          <a className="button" href={PAGES.ecosystem}>
            {GET_INVOLVED.ctaPrimary}
          </a>
          <a className="button button-quiet" href={CONNECT.home}>
            {GET_INVOLVED.ctaSecondary}
          </a>
        </div>
      </section>
    </div>
    <p className="part-to-play">{PART_TO_PLAY}</p>
  </Layout>
);

export default GetInvolved;
