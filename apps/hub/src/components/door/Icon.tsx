import type { ReactNode } from 'react';

/**
 * Dazzle Line drawings used on Central: 24px viewBox, stroke 2, round caps and joins, currentColor.
 * The paths are the approved set (Me, Map, Vision, Wear, and the feed drawings for video, run, coffee,
 * music and volume). Impact uses the star, which is the same weight.
 */
export function DoorIcon({ kind, className }: { kind: string; className?: string }) {
  return (
    <svg
      className={className ? `dazzle ${className}` : 'dazzle'}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths(kind)}
    </svg>
  );
}

function paths(kind: string): ReactNode {
  switch (kind) {
    case 'Me':
      return (
        <path d="M5 21C5 17.13 8.13 14 12 14C15.87 14 19 17.13 19 21M16 7C16 9.21 14.21 11 12 11C9.79 11 8 9.21 8 7C8 4.79 9.79 3 12 3C14.21 3 16 4.79 16 7Z" />
      );
    case 'Map':
      return <path d="M15 6V21M15 6L21 3V18L15 21M15 6L9 3M15 21L9 18M9 18L3 21V6L9 3M9 18V3" />;
    case 'Vision':
      return (
        <>
          <path d="M2.5 12C4.6 7.8 8 5.5 12 5.5S19.4 7.8 21.5 12C19.4 16.2 16 18.5 12 18.5S4.6 16.2 2.5 12Z" />
          <circle cx="12" cy="12" r="3" />
        </>
      );
    case 'Wear':
      return (
        <path d="M8.5 4 3.5 7.5 6 11.5 8 10.5V20H16V10.5L18 11.5 20.5 7.5 15.5 4C14.8 5.5 13.5 6.3 12 6.3S9.2 5.5 8.5 4Z" />
      );
    case 'Do':
      return (
        <>
          <rect x="4" y="4" width="6.5" height="6.5" rx="2" />
          <rect x="13.5" y="4" width="6.5" height="6.5" rx="2" />
          <rect x="4" y="13.5" width="6.5" height="6.5" rx="2" />
          <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="2" />
        </>
      );
    case 'video':
      return (
        <>
          <rect x="3" y="5" width="18" height="14" rx="3" />
          <path d="M10 9.5V14.5L14.5 12Z" />
        </>
      );
    case 'run':
      return (
        <path d="M14 22V16.96C14 16.35 13.72 15.78 13.25 15.4L11.5 14M11.5 14L13 7.5M11.5 14L10 13M13 7.5L11 7M13 7.5L15.04 10.77C15.33 11.24 15.81 11.56 16.35 11.67L18 12M10 13L11 7M10 13L9.4 16.3C9.19 17.47 8 18.2 6.86 17.86L4 17M11 7L8.11 8.45C7.43 8.79 7 9.48 7 10.24V12M14.5 3.5C14.5 4.05 14.05 4.5 13.5 4.5C12.95 4.5 12.5 4.05 12.5 3.5C12.5 2.95 12.95 2.5 13.5 2.5C14.05 2.5 14.5 2.95 14.5 3.5Z" />
      );
    case 'coffee':
      return (
        <path d="M4 20H18M10.94 20C7.1 19.97 4 16.85 4 13V8.92C4 8.41 4.41 8 4.92 8H17.08C17.59 8 18 8.41 18 8.92V9M11.06 20C14.9 19.97 18 16.85 18 13M18 9H19.5C20.88 9 22 10.12 22 11.5C22 12.88 20.88 14 19.5 14H18V13M18 9V13M15 3L14 5M12 3L11 5M9 3L8 5" />
      );
    case 'music':
      return (
        <>
          <path d="M9 18V6L20 4V16M9 10L20 8" />
          <circle cx="6.5" cy="18" r="2.5" />
          <circle cx="17.5" cy="16" r="2.5" />
        </>
      );
    case 'volume':
      return (
        <path d="M18.82 4.69C19.82 5.62 20.62 6.74 21.16 8C21.71 9.25 22 10.6 22 11.97C22 13.33 21.73 14.68 21.19 15.94C20.65 17.2 19.86 18.33 18.87 19.27M16.09 7.61C16.69 8.17 17.17 8.85 17.5 9.6C17.83 10.35 18 11.16 18 11.98C18 12.8 17.84 13.61 17.51 14.36C17.19 15.12 16.72 15.8 16.12 16.36M7.48 15.41L9.16 17.48C10.03 18.56 10.47 19.1 10.85 19.16C11.18 19.21 11.51 19.09 11.74 18.84C12 18.56 12 17.86 12 16.47V7.53C12 6.14 12 5.44 11.74 5.16C11.51 4.91 11.18 4.79 10.85 4.84C10.47 4.9 10.03 5.44 9.16 6.52L7.48 8.59C7.3 8.81 7.22 8.92 7.11 9C7.01 9.07 6.9 9.12 6.79 9.15C6.66 9.19 6.52 9.19 6.24 9.19H4.81C4.06 9.19 3.68 9.19 3.37 9.29C2.77 9.49 2.3 9.96 2.1 10.56C2 10.87 2 11.24 2 12C2 12.76 2 13.13 2.1 13.44C2.3 14.04 2.77 14.51 3.37 14.71C3.68 14.81 4.06 14.81 4.81 14.81H6.24C6.52 14.81 6.66 14.81 6.79 14.85C6.9 14.88 7.01 14.93 7.11 15C7.22 15.08 7.3 15.19 7.48 15.41Z" />
      );
    case 'sun':
      return (
        <>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 3V4.5M12 19.5V21M3 12H4.5M19.5 12H21M5.6 5.6 6.7 6.7M17.3 17.3 18.4 18.4M5.6 18.4 6.7 17.3M17.3 6.7 18.4 5.6" />
        </>
      );
    case 'moon':
      return <path d="M20 14.5A8 8 0 1 1 9.5 4 6.5 6.5 0 0 0 20 14.5Z" />;
    default:
      return (
        <path d="M12 3.5 14.6 8.8 20.4 9.6 16.2 13.7 17.2 19.5 12 16.8 6.8 19.5 7.8 13.7 3.6 9.6 9.4 8.8Z" />
      );
  }
}
