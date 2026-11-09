import type { AppProps } from 'next/app';
import '../styles/hub.css';
import '../styles/door.css';

export default function HubApp({ Component, pageProps }: AppProps) {
  return <Component {...pageProps} />;
}
