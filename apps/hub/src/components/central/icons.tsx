/**
 * Central's icon set: 24-unit outline icons from the approved design check (guide section 7.6), copied from
 * docs/central/reference/central-reference.template.html. An item names its icon by key; an unknown key shows no
 * icon (the set is OPEN: the first source app's adapter also emits `calendar`, `pin` and `hands`, which are not drawn yet).
 */
import type { ReactElement } from 'react';

const PATHS: Readonly<Record<string, ReactElement>> = {
  run: (
    <path d="M14 22V16.9612C14 16.3537 13.7238 15.7791 13.2494 15.3995L11.5 14M11.5 14L13 7.5M11.5 14L10 13M13 7.5L11 7M13 7.5L15.0426 10.7681C15.3345 11.2352 15.8062 11.5612 16.3463 11.6693L18 12M10 13L11 7M10 13L9.40011 16.2994C9.18673 17.473 8.00015 18.2 6.85767 17.8573L4 17M11 7L8.10557 8.44721C7.428 8.786 7 9.47852 7 10.2361V12M14.5 3.5C14.5 4.05228 14.0523 4.5 13.5 4.5C12.9477 4.5 12.5 4.05228 12.5 3.5C12.5 2.94772 12.9477 2.5 13.5 2.5C14.0523 2.5 14.5 2.94772 14.5 3.5Z" />
  ),
  volume: (
    <>
      <path d="M11 5L6 9H3v6h3l5 4z" />
      <path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" />
    </>
  ),
  notes: (
    <>
      <path d="M9 18V6l10-2v12" />
      <circle cx="6.5" cy="18" r="2.5" />
      <circle cx="16.5" cy="16" r="2.5" />
    </>
  ),
  book: (
    <path d="M12 10.4V20M12 10.4C12 8.16 12 7.04 11.56 6.18C11.18 5.43 10.57 4.82 9.82 4.44C8.96 4 7.84 4 5.6 4H4.6C4.04 4 3.76 4 3.55 4.11C3.36 4.2 3.2 4.36 3.11 4.55C3 4.76 3 5.04 3 5.6V16.4C3 16.96 3 17.24 3.11 17.45C3.2 17.64 3.36 17.8 3.55 17.89C3.76 18 4.04 18 4.6 18H7.55C8.09 18 8.36 18 8.62 18.05C8.85 18.09 9.08 18.16 9.29 18.25C9.54 18.36 9.76 18.51 10.21 18.81L12 20M12 10.4C12 8.16 12 7.04 12.44 6.18C12.82 5.43 13.43 4.82 14.18 4.44C15.04 4 16.16 4 18.4 4H19.4C19.96 4 20.24 4 20.45 4.11C20.64 4.2 20.8 4.36 20.89 4.55C21 4.76 21 5.04 21 5.6V16.4C21 16.96 21 17.24 20.89 17.45C20.8 17.64 20.64 17.8 20.45 17.89C20.24 18 19.96 18 19.4 18H16.45C15.91 18 15.64 18 15.38 18.05C15.15 18.09 14.92 18.16 14.71 18.25C14.46 18.36 14.24 18.51 13.79 18.81L12 20" />
  ),
  bag: (
    <path d="M8 8H7.71C6.75 8 6.27 8 5.88 8.18C5.53 8.33 5.24 8.58 5.03 8.89C4.79 9.25 4.71 9.72 4.55 10.67L3.62 16.27C3.41 17.56 3.3 18.2 3.49 18.7C3.65 19.13 3.96 19.5 4.37 19.73C4.83 20 5.48 20 6.78 20H17.22C18.52 20 19.17 20 19.63 19.73C20.04 19.5 20.35 19.13 20.51 18.7C20.7 18.2 20.59 17.56 20.38 16.28L19.45 10.67C19.29 9.72 19.21 9.25 18.97 8.89C18.76 8.58 18.47 8.33 18.12 8.18C17.73 8 17.25 8 16.29 8H16M8 8H16M8 8C8 5.79 9.79 4 12 4C14.21 4 16 5.79 16 8" />
  ),
  cloud: <path d="M7 18a4 4 0 0 1-.6-7.96A6 6 0 0 1 18 9.5 4.25 4.25 0 0 1 17.5 18Z" />,
};

export function hasCentralIcon(key: string | undefined | null): key is string {
  return typeof key === 'string' && Object.prototype.hasOwnProperty.call(PATHS, key);
}

/** The icon for `name`, or nothing for a key the set does not have. Always hidden from assistive technology. */
export function CentralIcon({ name }: { name: string | undefined | null }) {
  if (!hasCentralIcon(name)) return null;
  return (
    <svg
      viewBox="0 0 24 24"
      width="100%"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  );
}
