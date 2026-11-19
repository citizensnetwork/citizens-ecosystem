/**
 * Central on the Citizens landing page: its heading block, then the feed (guide sections 7.3 and 11, steps 5 and 6).
 * The sticky bar and the Crown are not built: they wait for the founder's design check (open question O1).
 */
import { CENTRAL_HERO } from '../../lib/content';
import { CentralFeed } from './CentralFeed';
import type { CentralFeedProps } from './CentralFeed';

export function CentralSection(props: CentralFeedProps) {
  return (
    <section className="cen-wrap" aria-labelledby="central-title">
      <div className="cen">
        <div className="in">
          <div className="cen-hero">
            <span className="kicker">{CENTRAL_HERO.kicker}</span>
            <h2 id="central-title" className="cen-title">
              {CENTRAL_HERO.title}
            </h2>
            <p>{CENTRAL_HERO.body}</p>
          </div>
          <CentralFeed {...props} />
        </div>
      </div>
    </section>
  );
}
