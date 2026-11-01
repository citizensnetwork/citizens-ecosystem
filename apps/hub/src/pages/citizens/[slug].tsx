import type { GetStaticPaths, GetStaticProps, NextPage } from 'next';
import { COMING_SOON, PATH_ROOT } from '@citizens/ecosystem';
import { Layout } from '../../components/Layout';
import { BACK_TO_ECOSYSTEM, COMING_SOON_BADGE, COMING_SOON_NOTE } from '../../lib/content';

// Pure static HTML: no interaction, so no JavaScript.
export const config = { unstable_runtimeJS: false };

interface ComingSoonProps {
  label: string;
  summary: string;
}

/**
 * /citizens/learn, /citizens/play, /citizens/move: one page per entry in the registry's COMING_SOON list.
 * fallback: false makes every other /citizens/<x> a 404. (The built apps never reach this page: the hub's rewrites
 * hand /citizens/connect, /vision and /wear to their own projects first.)
 */
export const getStaticPaths: GetStaticPaths = () => ({
  paths: COMING_SOON.map((app) => ({ params: { slug: app.slug } })),
  fallback: false,
});

export const getStaticProps: GetStaticProps<ComingSoonProps, { slug: string }> = ({ params }) => {
  const app = COMING_SOON.find((entry) => entry.slug === params?.slug);
  if (!app) return { notFound: true };
  return { props: { label: app.label, summary: app.summary } };
};

const ComingSoon: NextPage<ComingSoonProps> = ({ label, summary }) => (
  <Layout title={`${label}: ${COMING_SOON_BADGE.toLowerCase()}`} description={summary} noindex>
    <section className="soon" aria-labelledby="soon-title">
      <p className="badge">{COMING_SOON_BADGE}</p>
      <h1 id="soon-title">{label}</h1>
      <p className="lead">{summary}</p>
      <p>{COMING_SOON_NOTE}</p>
      <a className="button" href={PATH_ROOT}>
        {BACK_TO_ECOSYSTEM}
      </a>
    </section>
  </Layout>
);

export default ComingSoon;
