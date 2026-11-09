import type { NextPage } from 'next';
import { Home219 } from '../components/door/Home219';

// The homepage is links and anchors. Weather, theme and the crown list live on Central.
export const config = { unstable_runtimeJS: false };

const Home: NextPage = () => <Home219 />;

export default Home;
