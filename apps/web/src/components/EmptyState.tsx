import type { ReactNode } from 'react';

/*
 * Simple illustrations drawn for this app. Each is a 160×120 inline SVG using the same soft
 * palette, so they read well on the light background and stay tiny.
 */
const SVG_PROPS = {
  viewBox: '0 0 160 120',
  className: 'h-28 w-auto',
  'aria-hidden': true,
  focusable: false,
} as const;

function SunHills() {
  return (
    <svg {...SVG_PROPS}>
      <circle cx="80" cy="56" r="44" fill="#f5f5f5" />
      <g stroke="#a3a3a3" strokeWidth="3" strokeLinecap="round">
        {/* Eight rays around the sun (centre 80,52), from radius 22 to 30. */}
        <path d="M102 52h8M50 52h8M80 30v-8M80 74v8M95.6 36.4l5.6-5.6M64.4 36.4l-5.6-5.6M95.6 67.6l5.6 5.6M64.4 67.6l-5.6 5.6" />
      </g>
      <circle cx="80" cy="52" r="16" fill="#0a0a0a" />
      <path d="M8 104c22-22 46-26 72-12s46 12 72-6v34H8z" fill="#e5e5e5" />
      <path d="M8 110c30-16 58-16 86-4s38 8 58-2v16H8z" fill="#d4d4d4" />
    </svg>
  );
}

function CoffeeCup() {
  return (
    <svg {...SVG_PROPS}>
      <circle cx="80" cy="60" r="46" fill="#f5f5f5" />
      <g fill="none" stroke="#d4d4d4" strokeWidth="3" strokeLinecap="round">
        <path d="M66 24c-4 6 4 10 0 16M80 20c-4 6 4 10 0 16M94 24c-4 6 4 10 0 16" />
      </g>
      <ellipse cx="78" cy="98" rx="40" ry="7" fill="#e5e5e5" />
      <path d="M48 48h60v26a22 22 0 0 1-22 22H70a22 22 0 0 1-22-22z" fill="#0a0a0a" />
      <path d="M108 56h6a10 10 0 0 1 0 20h-8" fill="none" stroke="#0a0a0a" strokeWidth="6" />
      <ellipse cx="78" cy="48" rx="30" ry="5" fill="#404040" />
      <path
        d="M56 60c2 10 8 18 18 20"
        stroke="#525252"
        strokeWidth="3"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

function PaperPlane() {
  return (
    <svg {...SVG_PROPS}>
      <circle cx="82" cy="58" r="46" fill="#f5f5f5" />
      <path
        d="M20 96c18-4 30-14 40-26"
        fill="none"
        stroke="#d4d4d4"
        strokeWidth="3"
        strokeDasharray="2 7"
        strokeLinecap="round"
      />
      <path d="M58 70l78-40-28 66-18-22z" fill="#0a0a0a" />
      <path d="M58 70l78-40-46 44z" fill="#525252" />
      <path d="M90 74l18 22 4-30z" fill="#262626" />
      <g fill="#fff">
        <ellipse cx="38" cy="38" rx="14" ry="6" />
        <ellipse cx="128" cy="92" rx="12" ry="5" />
      </g>
    </svg>
  );
}

function Plant() {
  return (
    <svg {...SVG_PROPS}>
      <circle cx="80" cy="58" r="46" fill="#f5f5f5" />
      <path d="M80 82V44" stroke="#0a0a0a" strokeWidth="3" strokeLinecap="round" />
      <path d="M80 60c-4-14-16-22-30-20 2 14 14 22 30 20z" fill="#404040" />
      <path d="M80 52c4-14 16-22 30-20-2 14-14 22-30 20z" fill="#737373" />
      <path d="M80 44c-6-8-6-18 0-26 6 8 6 18 0 26z" fill="#0a0a0a" />
      <path d="M58 80h44l-6 28H64z" fill="#d4d4d4" />
      <rect x="54" y="76" width="52" height="8" rx="3" fill="#a3a3a3" />
    </svg>
  );
}

function CheckSparkles() {
  return (
    <svg {...SVG_PROPS}>
      <circle cx="80" cy="60" r="46" fill="#f5f5f5" />
      <circle cx="80" cy="60" r="28" fill="#0a0a0a" />
      <path
        d="M67 60l9 9 18-19"
        fill="none"
        stroke="#fff"
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <g fill="#a3a3a3">
        <path d="M124 26l3 7 7 3-7 3-3 7-3-7-7-3 7-3z" />
        <path d="M34 82l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" />
        <path d="M120 92l2 4 4 2-4 2-2 4-2-4-4-2 4-2z" />
      </g>
    </svg>
  );
}

function Magnifier() {
  return (
    <svg {...SVG_PROPS}>
      <circle cx="80" cy="58" r="46" fill="#f5f5f5" />
      <circle cx="72" cy="52" r="22" fill="#fff" stroke="#0a0a0a" strokeWidth="6" />
      <path d="M88 68l20 20" stroke="#0a0a0a" strokeWidth="9" strokeLinecap="round" />
      <path
        d="M62 46a12 12 0 0 1 10-6"
        stroke="#d4d4d4"
        strokeWidth="3"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

/** Friendly "nothing due" variations, rotated by day so the page doesn't change on every render. */
const FREE_DAY = [
  { Art: SunHills, text: 'Nothing due — enjoy your day.' },
  { Art: CoffeeCup, text: 'All clear. Maybe time for a coffee?' },
  { Art: PaperPlane, text: 'A free day. Go somewhere nice.' },
  { Art: Plant, text: 'Nothing planned — room to grow.' },
];

function pick<T>(items: T[], seed: string): T {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return items[Math.abs(h) % items.length]!;
}

export type EmptyKind = 'free' | 'caught-up' | 'no-tasks' | 'no-results';

/**
 * Empty-state illustration with a short positive message.
 * `seed` (e.g. the date) picks the variation for "free" so it stays stable for that day.
 */
export function EmptyState({
  kind,
  seed = '',
  children,
  compact = false,
}: {
  kind: EmptyKind;
  seed?: string;
  children?: ReactNode;
  compact?: boolean;
}) {
  const { Art, text } =
    kind === 'free'
      ? pick(FREE_DAY, seed)
      : kind === 'caught-up'
        ? { Art: CheckSparkles, text: "Nothing overdue — you're all caught up." }
        : kind === 'no-results'
          ? { Art: Magnifier, text: 'No matching tasks.' }
          : { Art: Plant, text: 'No tasks here yet — add one to get started.' };

  return (
    <div
      className={`flex flex-col items-center justify-center text-center ${compact ? 'py-8' : 'rounded-2xl border border-neutral-200 py-16'}`}
    >
      <Art />
      <p className="mt-5 text-[15px] text-neutral-500">{children ?? text}</p>
    </div>
  );
}
