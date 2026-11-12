import type { ReactNode, SVGProps } from 'react';

/**
 * The pictograms on the front door. Inline SVG, so the strict Content-Security-Policy (no script, no inline style)
 * needs nothing more and the page ships no image request for them.
 *
 * Seven are paths from Lucide (https://lucide.dev, ISC licence: free to copy and change, the notice kept):
 * map-pin, eye, shirt, book-open, gamepad-2, handshake and search. The chevron and the arrow are the same family. The
 * runner has no Lucide twin, so it is drawn here in the same 24 x 24 grid, 2 px round stroke.
 *
 * Every icon is decorative: it sits next to the words that name it, so it is hidden from assistive technology. The
 * colour is `currentColor`; the stylesheet sets it.
 */

type IconProps = SVGProps<SVGSVGElement>;

function Icon({ children, ...rest }: IconProps & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const PinIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0" />
    <circle cx="12" cy="10" r="3" />
  </Icon>
);

export const EyeIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" />
    <circle cx="12" cy="12" r="3" />
  </Icon>
);

export const ShirtIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M20.38 3.46 16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z" />
  </Icon>
);

export const BookIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M12 5v16" />
    <path d="M20.001 19A2 2 0 0022 17V5a2 2 0 00-1.999-2L16 3.002A5 5 0 0012 5a5 5 0 00-4-2H4a2 2 0 00-2 2v12a2 2 0 001.999 2H8a5 5 0 014 2 5 5 0 014-2z" />
  </Icon>
);

export const GamepadIcon = (props: IconProps) => (
  <Icon {...props}>
    <line x1="6" x2="10" y1="11" y2="11" />
    <line x1="8" x2="8" y1="9" y2="13" />
    <line x1="15" x2="15.01" y1="12" y2="12" />
    <line x1="18" x2="18.01" y1="10" y2="10" />
    <path d="M17.32 5H6.68a4 4 0 0 0-3.978 3.59c-.006.052-.01.101-.017.152C2.604 9.416 2 14.456 2 16a3 3 0 0 0 3 3c1 0 1.5-.5 2-1l1.414-1.414A2 2 0 0 1 9.828 16h4.344a2 2 0 0 1 1.414.586L17 18c.5.5 1 1 2 1a3 3 0 0 0 3-3c0-1.545-.604-6.584-.685-7.258-.007-.05-.011-.1-.017-.151A4 4 0 0 0 17.32 5z" />
  </Icon>
);

export const HandshakeIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="m11 17 2 2a1 1 0 1 0 3-3" />
    <path d="m14 14 2.5 2.5a1 1 0 1 0 3-3l-3.88-3.88a3 3 0 0 0-4.24 0l-.88.88a1 1 0 1 1-3-3l2.81-2.81a5.79 5.79 0 0 1 7.06-.87l.47.28a2 2 0 0 0 1.42.25L21 4" />
    <path d="m21 3 1 11h-2" />
    <path d="M3 3 2 14l6.5 6.5a1 1 0 1 0 3-3" />
    <path d="M3 4h8" />
  </Icon>
);

/** A runner mid-stride: head, a long back leg, a bent front leg, and arms swinging. */
export const RunnerIcon = (props: IconProps) => (
  <Icon {...props}>
    <circle cx="13" cy="4" r="1" />
    <path d="M4 17l5 1 .75-1.5" />
    <path d="M15 21v-4l-4-3 1-6" />
    <path d="M7 12V9l5-1 3 3 3 1" />
  </Icon>
);

export const SearchIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="m21 21-4.34-4.34" />
    <circle cx="11" cy="11" r="8" />
  </Icon>
);

export const ChevronIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="m6 9 6 6 6-6" />
  </Icon>
);

export const ArrowIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M5 12h14" />
    <path d="m12 5 7 7-7 7" />
  </Icon>
);

const BY_SLUG: Record<string, (props: IconProps) => ReactNode> = {
  connect: PinIcon,
  vision: EyeIcon,
  wear: ShirtIcon,
  learn: BookIcon,
  play: GamepadIcon,
  move: RunnerIcon,
  impact: HandshakeIcon,
};

/** The pictogram for an app, by its registry slug (null for a slug with no icon yet, so a new app never crashes the page). */
export function AppIcon({ slug, ...rest }: IconProps & { slug: string }) {
  const Component = BY_SLUG[slug];
  return Component ? <Component {...rest} /> : null;
}

/** True when the app has its own pictogram: a test keeps every registry slug in this list. */
export function hasAppIcon(slug: string): boolean {
  return slug in BY_SLUG;
}
