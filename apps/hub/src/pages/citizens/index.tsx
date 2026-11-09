import type { NextPage } from 'next';
import { PATH_ROOT } from '@citizens/ecosystem';
import { AppWindows } from '../../components/door/AppWindows';
import { CentralFeed } from '../../components/door/CentralFeed';
import { CitizensHeader } from '../../components/door/CitizensHeader';
import { DoorFooter, DoorHead, DoorSkip } from '../../components/door/DoorChrome';
import { ThemeSync } from '../../components/door/ThemeSync';
import { CENTRAL, SLOGAN, SITE_NAME } from '../../lib/content';

/**
 * Citizens' front door is Central: an editorial mosaic, then a small window for every app.
 * The windows preview in place. Only their arrows open the live app.
 */
const Central: NextPage = () => (
  <div className="door door-central surface ambient">
    <DoorHead title={CENTRAL.title} description={CENTRAL.description} canonicalPath={PATH_ROOT} />
    <ThemeSync />
    <DoorSkip />
    <CitizensHeader current="central" />
    <main id="main" className="central-pad">
      <CentralFeed />
      <AppWindows />
    </main>
    <DoorFooter mark={`${SITE_NAME}. ${SLOGAN}.`} />
  </div>
);

export default Central;
