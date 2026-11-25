// The ScrapyTube logo: an arrow coming down into a tray, its head a rounded
// play triangle, on a white disc.
//
// This file is the one source of the geometry: Logo.tsx draws it inline and
// scripts/icons.ts writes the SVG and PNG icons from it. No imports, so Node
// can read it too.

/** Drawn in a 100 × 100 box. */
export const MARK_SIZE = 100;

export const ACCENT = '#0f7c86';
export const ACCENT_DARK = '#0a4e57';

const INK = '#16303a';

/** The logo's SVG elements. */
export function markMarkup(): string {
  return [
    `<circle cx="50" cy="50" r="42" fill="#ffffff" stroke="#c4d3d5" stroke-width="1.2"/>`,
    // The shaft, then the head: a play triangle pointing down.
    `<rect x="44" y="19" width="12" height="30" rx="4" fill="${ACCENT}"/>`,
    `<path d="M31 45 L69 45 L50 68 Z" fill="${ACCENT}" stroke="${ACCENT}" stroke-width="6" stroke-linejoin="round"/>`,
    // The tray it lands in.
    `<path d="M29 72 L29 77 Q29 81 33 81 L67 81 Q71 81 71 77 L71 72" fill="none" stroke="${INK}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>`,
  ].join('');
}
