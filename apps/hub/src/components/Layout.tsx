import Head from 'next/head';
import type { ReactNode } from 'react';
import { PATH_ROOT } from '@citizens/ecosystem';
import { ChevronIcon, SearchIcon } from './Icons';
import { JOIN, PAGES, SEARCH, SITE_NAME, SLOGAN, canonicalUrl, navGroups } from '../lib/content';

interface LayoutProps {
  title: string;
  description: string;
  /** The page's own path, for the canonical link; omit on a page that must not be indexed. */
  canonicalPath?: string;
  noindex?: boolean;
  children: ReactNode;
}

/**
 * The frame every front-door page shares: skip link, banner with the menus, main landmark and footer. Plain HTML and
 * one external stylesheet, so the strict Content-Security-Policy needs nothing inline.
 *
 * The three menus are `<details>` disclosures: they open and close with no script, by keyboard (Enter or Space on the
 * summary) as well as by pointer, and the shared `name` makes opening one close the others where the browser supports it.
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
        <meta name="theme-color" content="#ffffff" />
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
        <div className="wrap header-row">
          <a className="brand" href={PATH_ROOT}>
            {/* A fixed-size brand mark served as a plain file: the page ships no script, so no image optimiser runs. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="brand-crown" src="/citizens-crown.png" width={48} height={26} alt="" />
            <span className="brand-name">{SITE_NAME}</span>
          </a>
          <nav className="nav" aria-label="Main">
            {navGroups().map((group) => (
              <details key={group.id} className="nav-group" name="nav">
                <summary>
                  {group.label}
                  <ChevronIcon className="chevron" />
                </summary>
                <ul className="nav-panel">
                  {group.links.map((link) => (
                    <li key={link.href}>
                      <a href={link.href}>{link.label}</a>
                    </li>
                  ))}
                </ul>
              </details>
            ))}
            <a className="nav-search" href={SEARCH.href}>
              <SearchIcon />
              <span className="sr-only">{SEARCH.label}</span>
            </a>
            <a className="join" href={JOIN.href}>
              {JOIN.label}
            </a>
          </nav>
        </div>
      </header>
      <main id="main" className="main">
        {children}
      </main>
      <footer className="site-footer on-dark">
        <div className="wrap footer-row">
          <p>
            {SITE_NAME}. {SLOGAN}.
          </p>
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
        </div>
      </footer>
    </>
  );
}
