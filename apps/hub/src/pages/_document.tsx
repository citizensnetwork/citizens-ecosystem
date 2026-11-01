import { Head, Html, Main, NextScript } from 'next/document';

export default function HubDocument() {
  return (
    <Html lang="en">
      <Head>
        {/* The domain root belongs to the front door, so the icons are root-absolute here (and only here). */}
        <link rel="icon" href="/icon.svg" type="image/svg+xml" />
        <link rel="icon" href="/favicon.ico" sizes="48x48" />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
