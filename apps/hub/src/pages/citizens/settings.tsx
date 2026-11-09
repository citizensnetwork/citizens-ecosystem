import type { NextPage } from 'next';
import { CitizensHeader } from '../../components/door/CitizensHeader';
import { DoorFooter, DoorHead, DoorSkip } from '../../components/door/DoorChrome';
import { ThemeChoice } from '../../components/door/ThemeChoice';
import { ThemeSync } from '../../components/door/ThemeSync';
import { APPEARANCE, PAGES, SLOGAN, SITE_NAME } from '../../lib/content';

/** Appearance for Central. There is no theme switch on the feed, the map, or the 219 homepage. */
const Settings: NextPage = () => (
  <div className="door door-central surface ambient">
    <DoorHead
      title={APPEARANCE.title}
      description={APPEARANCE.description}
      canonicalPath={PAGES.settings}
    />
    <ThemeSync />
    <DoorSkip />
    <CitizensHeader current="settings" />
    <main id="main" className="central-pad settings-pad">
      <p className="kicker">{APPEARANCE.section}</p>
      <h1>{APPEARANCE.heading}</h1>
      <ThemeChoice />
    </main>
    <DoorFooter mark={`${SITE_NAME}. ${SLOGAN}.`} />
  </div>
);

export default Settings;
