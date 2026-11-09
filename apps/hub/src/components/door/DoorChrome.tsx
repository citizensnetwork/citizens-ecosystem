import Head from 'next/head';
import { PAGES, SITE_NAME, canonicalUrl } from '../../lib/content';

export function DoorHead({
  title,
  description,
  canonicalPath,
}: {
  title: string;
  description: string;
  canonicalPath: string;
}) {
  return (
    <Head>
      <title>{title}</title>
      <meta name="description" content={description} />
      <meta name="theme-color" content="#f7f6f1" />
      <link rel="canonical" href={canonicalUrl(canonicalPath)} />
      <meta property="og:site_name" content={SITE_NAME} />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:type" content="website" />
      <meta property="og:url" content={canonicalUrl(canonicalPath)} />
    </Head>
  );
}

/** Quiet footer so the existing content pages stay one click away. */
export function DoorFooter({ mark, note }: { mark: string; note?: string }) {
  return (
    <footer className="door-footer">
      <p>{mark}</p>
      {note ? <p>{note}</p> : null}
      <nav aria-label="Footer">
        <ul>
          <li>
            <a href={PAGES.ecosystem}>The ecosystem</a>
          </li>
          <li>
            <a href={PAGES.howItWorks}>How it works</a>
          </li>
          <li>
            <a href={PAGES.philosophy}>Our philosophy</a>
          </li>
          <li>
            <a href={PAGES.getInvolved}>Get involved</a>
          </li>
        </ul>
      </nav>
    </footer>
  );
}

export function DoorSkip() {
  return (
    <a className="skip-link" href="#main">
      Skip to content
    </a>
  );
}
