// Draws the app icons from the logo's geometry (src/client/components/mark.ts):
// the SVGs, and the PNGs the manifest and iOS need. Run it after changing the
// logo, and commit the result. It never runs in the Docker image.
//
//   yarn icons
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { Resvg } from '@resvg/resvg-js';

import { ACCENT, ACCENT_DARK, markMarkup } from '../src/client/components/mark.ts';

const publicDir = path.resolve(import.meta.dirname, '../public');
const iconsDir = path.join(publicDir, 'icons');
mkdirSync(iconsDir, { recursive: true });

const svg = (viewBox: number, body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${viewBox} ${viewBox}">${body}</svg>\n`;

const background = (rx: number) =>
  `<defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${ACCENT}"/><stop offset="1" stop-color="${ACCENT_DARK}"/></linearGradient></defs>` +
  `<rect width="512" height="512" rx="${rx}" fill="url(#bg)"/>`;

/** The mark `size` wide, centred in a 512 × 512 box. */
const markAt = (size: number) => {
  const scale = size / 100;
  const offset = (512 - size) / 2;
  return `<g transform="translate(${offset} ${offset}) scale(${scale})">${markMarkup()}</g>`;
};

const files = {
  // The browser tab: the mark only, on nothing.
  'favicon.svg': svg(100, markMarkup()),
  // The home screen icon: the mark on a teal rounded square.
  'icons/app-icon.svg': svg(512, `${background(112)}${markAt(380)}`),
  // Android adaptive icon: the background fills the square, the mark stays inside the central 80%.
  'icons/maskable-icon.svg': svg(512, `${background(0)}${markAt(330)}`),
} as const;

for (const [name, content] of Object.entries(files)) writeFileSync(path.join(publicDir, name), content);

function png(source: keyof typeof files, size: number, name: string) {
  const image = new Resvg(files[source], {
    fitTo: { mode: 'width', value: size },
    // There is no text in the icons: don't scan the system's fonts.
    font: { loadSystemFonts: false },
  })
    .render()
    .asPng();
  writeFileSync(path.join(iconsDir, name), image);
}

png('icons/app-icon.svg', 192, 'icon-192.png');
png('icons/app-icon.svg', 512, 'icon-512.png');
png('icons/maskable-icon.svg', 512, 'maskable-512.png');
// iOS rounds the corners itself and doesn't take transparency: the full square.
png('icons/maskable-icon.svg', 180, 'apple-touch-icon.png');

console.log('Icons written to public/.');
