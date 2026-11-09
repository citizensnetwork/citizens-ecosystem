import { PATH_ROOT } from '@citizens/ecosystem';
import { CONNECT } from './content';

/** Example Central cards. Static on purpose: there is no feed engine in this change. */
export interface FeedItem {
  title: string;
  text: string;
  href: string;
  link: string;
}

export const NEW_IN_THE_BODY: FeedItem[] = [
  {
    title: 'A table with room for more',
    text: 'An evening of shared food and conversation.',
    href: CONNECT.home,
    link: 'Find it in Connect',
  },
  {
    title: 'Thoughtfully made, personally worn',
    text: 'Creative expression from independent brands.',
    href: `${PATH_ROOT}/wear`,
    link: 'Discover Wear',
  },
  {
    title: 'A clearer view of the work',
    text: 'Understanding organisational activity and contribution.',
    href: `${PATH_ROOT}/vision`,
    link: 'For organisations in Vision',
  },
  {
    title: 'Something useful to pass on',
    text: 'Practical learning and everyday skills.',
    href: `${PATH_ROOT}/learn`,
    link: 'Explore Learn',
  },
  {
    title: 'Make room for play',
    text: 'Shared moments and gathering memories.',
    href: `${PATH_ROOT}/play`,
    link: 'Discover Play',
  },
];

export const ROUTES = [
  { name: 'Park gate to riverside', distance: '3 km' },
  { name: 'Neighbourhood loop', distance: '5 km' },
] as const;

export const COFFEES = [
  'A quiet corner to talk',
  'A table to share',
  'A place to work together',
  'Somewhere new to pause',
] as const;

export const CAMPAIGNS = ['Vote 4 Jesus', 'Christ back in School', 'Stop Corruption'] as const;

export const TRACKS = [
  'A moment of worship',
  'For the morning',
  'On the way',
  'Quiet instrumentals',
  'Songs from the community',
  'A fresh perspective',
] as const;

/** Dazzle kind for each app window, in registry order (built, then coming soon). */
export const APP_ICON: Record<string, string> = {
  connect: 'Map',
  vision: 'Vision',
  wear: 'Wear',
  learn: 'video',
  play: 'Do',
  move: 'run',
  impact: 'star',
};
