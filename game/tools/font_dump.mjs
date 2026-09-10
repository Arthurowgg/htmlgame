// Extrai os glifos da fonte do jogo (js/font.js) para gen/font.json, que o
// tools/build_font.py transforma em assets/fonts/grandpixel.ttf.
//
//   node tools/font_dump.mjs
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { glyphRows, glyphWidth, FONT_H } from '../js/font.js';
import { GLYPHS, COMPOSED } from '../js/fontdata.js';

const here = dirname(fileURLToPath(import.meta.url));
const gen = resolve(here, '..', 'gen');
mkdirSync(gen, { recursive: true });

// tudo o que está desenhado em fontdata.js (base + acentuadas)
const chars = Object.keys(GLYPHS).join('') + Object.keys(COMPOSED).join('');
const out = { height: FONT_H, glyphs: {} };
const seen = new Set();
for (const ch of chars) {
  if (seen.has(ch)) continue;
  seen.add(ch);
  const rows = glyphRows(ch);
  if (!rows) continue;
  out.glyphs[ch] = { rows, w: ch === ' ' ? 3 : glyphWidth(ch) };
}
writeFileSync(resolve(gen, 'font.json'), JSON.stringify(out, null, 0));
console.log('glifos:', Object.keys(out.glyphs).length, '→ gen/font.json');
