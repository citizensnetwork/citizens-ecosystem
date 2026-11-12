import { AppIcon } from './Icons';

/**
 * The crown at the centre of six connected parts (the founder's design). Inline SVG: no script, no inline style, and
 * the crown is the brand's own PNG from the same origin.
 *
 * The six are the platforms people take part in. Vision is not drawn on purpose: it is the internal workspace of the
 * contributing organisations and supports them throughout, so it is not one of the "parts to play" (the founder's
 * architecture, 4 November 2026). The diagram is decoration for the words beside it, so it is hidden from assistive
 * technology; the tiles above it already name every platform.
 */

const CENTRE = 200;
const RING = 130;
const NODE_RADIUS = 30;
const ICON = 28;

/** Hexagon corners, in degrees clockwise from the right: Connect and Learn on top, Impact and Wear at the sides. */
const NODES = [
  { slug: 'connect', angle: 240 },
  { slug: 'learn', angle: 300 },
  { slug: 'wear', angle: 0 },
  { slug: 'play', angle: 60 },
  { slug: 'move', angle: 120 },
  { slug: 'impact', angle: 180 },
] as const;

/** Two decimals, so the markup is the same on every build. */
const round = (value: number) => Number(value.toFixed(2));

function onRing(angle: number) {
  const radians = (angle * Math.PI) / 180;
  return {
    x: round(CENTRE + RING * Math.cos(radians)),
    y: round(CENTRE + RING * Math.sin(radians)),
  };
}

export function EcosystemDiagram() {
  return (
    <svg className="diagram" viewBox="0 0 400 400" aria-hidden="true" focusable="false">
      <circle className="diagram-ring" cx={CENTRE} cy={CENTRE} r={RING} />
      {NODES.map(({ slug, angle }) => {
        const { x, y } = onRing(angle);
        return <line key={slug} className="diagram-spoke" x1={CENTRE} y1={CENTRE} x2={x} y2={y} />;
      })}
      <circle className="diagram-core" cx={CENTRE} cy={CENTRE} r={54} />
      <circle className="diagram-ring diagram-ring-core" cx={CENTRE} cy={CENTRE} r={54} />
      <image href="/citizens-crown.png" x={152} y={174} width={96} height={52} />
      {NODES.map(({ slug, angle }) => {
        const { x, y } = onRing(angle);
        return (
          <g key={slug}>
            <circle className="diagram-node" cx={x} cy={y} r={NODE_RADIUS} />
            <AppIcon
              slug={slug}
              x={round(x - ICON / 2)}
              y={round(y - ICON / 2)}
              width={ICON}
              height={ICON}
            />
          </g>
        );
      })}
    </svg>
  );
}
