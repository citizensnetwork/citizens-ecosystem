import { Head, Html, Main, NextScript } from 'next/document';
import Script from 'next/script';

export default function HubDocument() {
  return (
    <Html lang="en">
      <Head>
        {/* The domain root belongs to the front door, so the icons are root-absolute here (and only here). */}
        <link rel="icon" href="/icon.svg" type="image/svg+xml" />
        <link rel="icon" href="/favicon.ico" sizes="48x48" />
        {/* Sets data-theme before paint. Central and Settings follow it; the 219 page stays light. */}
        <Script src="/theme-init.js" strategy="beforeInteractive" />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
