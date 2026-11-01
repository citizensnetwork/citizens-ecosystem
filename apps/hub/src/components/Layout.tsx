import Head from 'next/head';
import type { ReactNode } from 'react';
import { PATH_ROOT } from '@citizens/ecosystem';
import { SITE_NAME, SLOGAN, canonicalUrl } from '../lib/content';

interface LayoutProps {
  title: string;
  description: string;
  /** The page's own path, for the canonical link; omit on a page that must not be indexed. */
  canonicalPath?: string;
  noindex?: boolean;
  children: ReactNode;
}

/**
 * The frame every front-door page shares: skip link, banner, main landmark and footer. Plain HTML and one external
 * stylesheet, so the strict Content-Security-Policy needs nothing inline.
 */
export function Layout({
  title,
  description,
  canonicalPath,
  noindex = false,
  children,
}: LayoutProps) {
  return (
    <>
      <Head>
        <title>{title}</title>
        <meta name="description" content={description} />
        <meta name="theme-color" content="#0a0a0a" />
        {noindex ? <meta name="robots" content="noindex" /> : null}
        {canonicalPath ? <link rel="canonical" href={canonicalUrl(canonicalPath)} /> : null}
        <meta property="og:site_name" content={SITE_NAME} />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
        <meta property="og:type" content="website" />
        {canonicalPath ? <meta property="og:url" content={canonicalUrl(canonicalPath)} /> : null}
      </Head>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="site-header">
        <div className="wrap">
          <a className="brand" href={PATH_ROOT}>
            {SITE_NAME}
          </a>
          <p className="slogan">{SLOGAN}</p>
        </div>
      </header>
      <main id="main" className="wrap">
        {children}
      </main>
      <footer className="site-footer">
        <div className="wrap">
          <p>
            {SITE_NAME}. {SLOGAN}.
          </p>
        </div>
      </footer>
    </>
  );
}
