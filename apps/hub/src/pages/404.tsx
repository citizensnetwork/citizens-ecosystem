import type { NextPage } from 'next';
import { PATH_ROOT } from '@citizens/ecosystem';
import { Layout } from '../components/Layout';
import { BACK_TO_ECOSYSTEM, NOT_FOUND_BODY, NOT_FOUND_TITLE } from '../lib/content';

// Pure static HTML: no interaction, so no JavaScript.
export const config = { unstable_runtimeJS: false };

const NotFound: NextPage = () => (
  <Layout title={NOT_FOUND_TITLE} description={NOT_FOUND_BODY} noindex>
    <section className="soon" aria-labelledby="notfound-title">
      <h1 id="notfound-title">{NOT_FOUND_TITLE}</h1>
      <p className="lead">{NOT_FOUND_BODY}</p>
      <a className="button" href={PATH_ROOT}>
        {BACK_TO_ECOSYSTEM}
      </a>
    </section>
  </Layout>
);

export default NotFound;
