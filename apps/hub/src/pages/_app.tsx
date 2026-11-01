import type { AppProps } from 'next/app';
import '../styles/hub.css';

export default function HubApp({ Component, pageProps }: AppProps) {
  return <Component {...pageProps} />;
}
