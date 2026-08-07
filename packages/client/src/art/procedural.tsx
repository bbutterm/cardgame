import { useMemo, type ReactElement } from 'react';
import { createRng, type Rng } from '@delezh/engine';
import type { Faction } from '@delezh/cards';

/**
 * Procedural card art.
 *
 * There is no artist on this project, so every card's illustration is generated
 * from its id: the id seeds the RNG, the RNG picks one of six composition
 * families and fills it in. Same id always produces the same picture, on every
 * device, with no assets to download.
 *
 * The style is deliberately narrow — flat fills, 2px black outlines, three tints
 * of the faction colour — so thirty generated images still read as one set.
 *
 * REPLACING THIS WITH REAL ART: give the card a `art: '/img/whatever.png'` in
 * cards.ts. `<CardArt>` renders that instead and nothing else changes.
 */

const FACTION_PALETTES: Record<Faction, [string, string, string]> = {
  beast: ['#7fd858', '#4ea832', '#d6f5c4'],
  fire: ['#ff8c42', '#e0521a', '#ffd9b8'],
  shadow: ['#b18aff', '#6f45c4', '#e6dbff'],
  machine: ['#56cfe1', '#1f8fa5', '#c9f2f8'],
  neutral: ['#e2dcc8', '#a89f83', '#f5f1e4'],
};

const INK = '#12100e';

interface Ctx {
  rng: Rng;
  palette: [string, string, string];
}

/** Six families, chosen by seed. Each fills the same 100×100 box. */
const COMPOSITIONS: Array<(ctx: Ctx) => ReactElement[]> = [
  burst,
  bars,
  orbit,
  crystal,
  scatter,
  arcs,
];

function pickColor(ctx: Ctx, exclude?: string): string {
  const options = ctx.palette.filter((c) => c !== exclude);
  return options[ctx.rng.int(options.length)] as string;
}

/** Rays radiating from an off-centre origin. */
function burst(ctx: Ctx): ReactElement[] {
  const out: ReactElement[] = [];
  const cx = 30 + ctx.rng.int(40);
  const cy = 30 + ctx.rng.int(40);
  const count = 5 + ctx.rng.int(4);
  const step = 360 / count;
  const offset = ctx.rng.int(60);

  for (let i = 0; i < count; i++) {
    const a = ((i * step + offset) * Math.PI) / 180;
    const spread = (step * 0.38 * Math.PI) / 180;
    const len = 55 + ctx.rng.int(45);
    out.push(
      <path
        key={`ray-${i}`}
        d={`M ${cx} ${cy} L ${cx + Math.cos(a - spread) * len} ${cy + Math.sin(a - spread) * len} L ${
          cx + Math.cos(a + spread) * len
        } ${cy + Math.sin(a + spread) * len} Z`}
        fill={pickColor(ctx)}
        stroke={INK}
        strokeWidth={2}
        strokeLinejoin="round"
      />,
    );
  }
  out.push(
    <circle key="core" cx={cx} cy={cy} r={9 + ctx.rng.int(7)} fill={ctx.palette[1]} stroke={INK} strokeWidth={2.5} />,
  );
  return out;
}

/** Stacked horizontal slabs of varying width. */
function bars(ctx: Ctx): ReactElement[] {
  const out: ReactElement[] = [];
  const count = 4 + ctx.rng.int(3);
  const gap = 100 / count;
  for (let i = 0; i < count; i++) {
    const h = gap * (0.5 + ctx.rng.next() * 0.4);
    const w = 30 + ctx.rng.int(65);
    const x = ctx.rng.int(Math.max(1, 100 - w));
    out.push(
      <rect
        key={`bar-${i}`}
        x={x}
        y={i * gap + (gap - h) / 2}
        width={w}
        height={h}
        rx={2}
        fill={pickColor(ctx)}
        stroke={INK}
        strokeWidth={2}
      />,
    );
  }
  return out;
}

/** Concentric rings with satellites. */
function orbit(ctx: Ctx): ReactElement[] {
  const out: ReactElement[] = [];
  const cx = 50;
  const cy = 50;
  const rings = 2 + ctx.rng.int(2);
  for (let i = rings; i >= 1; i--) {
    out.push(
      <circle
        key={`ring-${i}`}
        cx={cx}
        cy={cy}
        r={i * (38 / rings)}
        fill={i % 2 === 0 ? ctx.palette[2] : pickColor(ctx)}
        stroke={INK}
        strokeWidth={2}
      />,
    );
  }
  const moons = 2 + ctx.rng.int(3);
  for (let i = 0; i < moons; i++) {
    const a = ctx.rng.next() * Math.PI * 2;
    const r = 40 + ctx.rng.int(12);
    out.push(
      <circle
        key={`moon-${i}`}
        cx={cx + Math.cos(a) * r}
        cy={cy + Math.sin(a) * r}
        r={4 + ctx.rng.int(5)}
        fill={ctx.palette[1]}
        stroke={INK}
        strokeWidth={2}
      />,
    );
  }
  return out;
}

/** An irregular faceted polygon, split into shards. */
function crystal(ctx: Ctx): ReactElement[] {
  const out: ReactElement[] = [];
  const points = 5 + ctx.rng.int(3);
  const cx = 50;
  const cy = 52;
  const outer: Array<[number, number]> = [];
  for (let i = 0; i < points; i++) {
    const a = (i / points) * Math.PI * 2 - Math.PI / 2;
    const r = 28 + ctx.rng.int(20);
    outer.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }

  out.push(
    <polygon
      key="body"
      points={outer.map(([x, y]) => `${x},${y}`).join(' ')}
      fill={ctx.palette[0]}
      stroke={INK}
      strokeWidth={2.5}
      strokeLinejoin="round"
    />,
  );
  for (let i = 0; i < outer.length; i += 2) {
    const a = outer[i] as [number, number];
    const b = outer[(i + 1) % outer.length] as [number, number];
    out.push(
      <polygon
        key={`facet-${i}`}
        points={`${cx},${cy} ${a[0]},${a[1]} ${b[0]},${b[1]}`}
        fill={ctx.palette[1]}
        stroke={INK}
        strokeWidth={1.5}
        strokeLinejoin="round"
      />,
    );
  }
  return out;
}

/** A loose grid of dots and squares. */
function scatter(ctx: Ctx): ReactElement[] {
  const out: ReactElement[] = [];
  const cols = 3 + ctx.rng.int(2);
  const cell = 100 / cols;
  for (let x = 0; x < cols; x++) {
    for (let y = 0; y < cols; y++) {
      if (ctx.rng.next() < 0.25) continue;
      const size = cell * (0.35 + ctx.rng.next() * 0.4);
      const px = x * cell + (cell - size) / 2;
      const py = y * cell + (cell - size) / 2;
      const round = ctx.rng.next() < 0.5;
      out.push(
        round ? (
          <circle
            key={`d-${x}-${y}`}
            cx={px + size / 2}
            cy={py + size / 2}
            r={size / 2}
            fill={pickColor(ctx)}
            stroke={INK}
            strokeWidth={1.8}
          />
        ) : (
          <rect
            key={`d-${x}-${y}`}
            x={px}
            y={py}
            width={size}
            height={size}
            rx={1.5}
            fill={pickColor(ctx)}
            stroke={INK}
            strokeWidth={1.8}
          />
        ),
      );
    }
  }
  return out;
}

/** Nested arcs sweeping across the frame. */
function arcs(ctx: Ctx): ReactElement[] {
  const out: ReactElement[] = [];
  const count = 3 + ctx.rng.int(3);
  const fromLeft = ctx.rng.next() < 0.5;
  for (let i = count; i >= 1; i--) {
    const r = i * (95 / count);
    const ox = fromLeft ? 4 : 96;
    out.push(
      <path
        key={`arc-${i}`}
        d={`M ${ox} ${96} A ${r} ${r} 0 0 ${fromLeft ? 1 : 0} ${fromLeft ? ox + r : ox - r} ${96 - r} L ${ox} ${96 - r} Z`}
        fill={i % 2 === 0 ? ctx.palette[0] : ctx.palette[2]}
        stroke={INK}
        strokeWidth={2}
        strokeLinejoin="round"
      />,
    );
  }
  out.push(
    <circle
      key="sun"
      cx={fromLeft ? 76 : 24}
      cy={24}
      r={10 + ctx.rng.int(6)}
      fill={ctx.palette[1]}
      stroke={INK}
      strokeWidth={2.5}
    />,
  );
  return out;
}

export interface CardArtProps {
  cardId: string;
  faction: Faction;
  /** Overrides the generated art — the slot real illustrations drop into. */
  art?: string;
  className?: string;
}

export function CardArt({ cardId, faction, art, className }: CardArtProps) {
  const shapes = useMemo(() => {
    if (art) return null;
    const rng = createRng(`art:${cardId}`);
    const palette = FACTION_PALETTES[faction];
    const composition = COMPOSITIONS[rng.int(COMPOSITIONS.length)] as (ctx: Ctx) => ReactElement[];
    return composition({ rng, palette });
  }, [cardId, faction, art]);

  if (art) {
    return <img className={className} src={art} alt="" draggable={false} loading="lazy" />;
  }

  return (
    <svg
      className={className}
      viewBox="0 0 100 100"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      focusable="false"
    >
      <rect width="100" height="100" fill={FACTION_PALETTES[faction][2]} />
      {shapes}
    </svg>
  );
}

export function factionColor(faction: Faction): string {
  return FACTION_PALETTES[faction][0];
}

export function factionInk(faction: Faction): string {
  return FACTION_PALETTES[faction][1];
}
