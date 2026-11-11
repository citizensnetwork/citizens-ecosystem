/**
 * One Central card. The template is chosen by the data the item carries (image, list, pause, text), never by its app
 * (guide section 7.4, guardrail G9). The card is drawn two columns wide when the layout engine's placement says
 * `span: 2`, not when the item's own `shape` says landscape: the engine may have drawn a landscape as a square.
 *
 * Every string is rendered as text, never as HTML. Links are limited to `https:` and the site's own `/citizens/`
 * paths, as the feed item contract says (guide section 3); anything else draws the card without a link.
 */
import type { CSSProperties } from 'react';
import type { CentralApp, FeedItem } from '@citizens/central/contract';
import { CentralIcon, hasCentralIcon } from './icons';

/** The contract's href rule, checked again on screen: the API is trusted, but not with where a tap goes. */
export function safeHref(href: unknown): string | null {
  if (typeof href !== 'string') return null;
  if (href.startsWith('/citizens/') && !href.startsWith('//')) return href;
  try {
    return new URL(href).protocol === 'https:' ? href : null;
  } catch {
    return null;
  }
}

const HEX = /^#[0-9a-f]{6}$/i;

export interface FeedCardProps {
  item: FeedItem;
  /** The source app's registry row, if the registry knows it. */
  app: CentralApp | undefined;
  span: 1 | 2;
  /** Position and size from the layout engine (absent while the card is being measured). */
  style?: CSSProperties;
  /** For the measuring copy: the key the feed reads its height by. */
  measureKey?: string;
}

export function FeedCard({ item, app, span, style, measureKey }: FeedCardProps) {
  const isPause = item.kind === 'pause';
  const classes = ['fc'];
  if (span === 2) classes.push('wide');
  if (isPause) classes.push('rest');
  const href = safeHref(item.href);
  // Images are `https:` only (contract section 3).
  const image =
    !isPause &&
    item.image &&
    typeof item.image.url === 'string' &&
    item.image.url.startsWith('https://')
      ? item.image
      : null;
  const list = !isPause && Array.isArray(item.list) && item.list.length ? item.list : null;

  const body = isPause ? (
    <span className="tx">
      <small>{item.summary ?? ''}</small>
      <h3>{item.title}</h3>
    </span>
  ) : (
    <span className="tx">
      <span className="pl">
        {app ? (
          <b
            style={
              app.accent && HEX.test(app.accent)
                ? ({ '--a': app.accent } as CSSProperties)
                : undefined
            }
          >
            {app.accent && HEX.test(app.accent) ? <i aria-hidden="true" /> : null}
            {app.name}
          </b>
        ) : null}
        {app ? `· ${item.kicker}` : item.kicker}
      </span>
      {!image && hasCentralIcon(item.icon) ? (
        <span className="ico">
          <CentralIcon name={item.icon} />
        </span>
      ) : null}
      <h3>{item.title}</h3>
      {list ? (
        <ol>
          {list.map((line, index) => (
            <li key={index}>
              <span className="ico">
                <CentralIcon name="notes" />
              </span>
              {line}
            </li>
          ))}
        </ol>
      ) : item.summary ? (
        <small>{item.summary}</small>
      ) : null}
    </span>
  );

  const content = (
    <>
      {image ? (
        // The image's height comes from CSS (guide 7.5), never from the file, so a late picture cannot move a card.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image.url} alt={image.alt ?? ''} loading="lazy" decoding="async" />
      ) : null}
      {body}
    </>
  );

  const shared = {
    className: classes.join(' '),
    style,
    'data-id': item.id,
    'data-measure': measureKey,
  };
  return href && !measureKey ? (
    <a {...shared} href={href}>
      {content}
    </a>
  ) : (
    <div {...shared}>{content}</div>
  );
}
