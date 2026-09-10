// GRAND PIXEL GAME — fonte de pixel para o canvas
// Monta os glifos de js/fontdata.js, cuida dos acentos e desenha textos em
// qualquer escala inteira, sem suavização: o mesmo desenho que o .ttf usa no
// HTML (vide tools/build_font.py).
import {
  GLYPHS, GLYPH_H, GLYPH_COLS, BASE_ROW,
  ACCENT_UP, COMPOSED, CEDILHA, DIAERESE,
} from './fontdata.js';

export const FONT_H = GLYPH_H;          // altura de uma linha de texto
export const FONT_W = GLYPH_COLS + 1;   // avanço de referência (mono)

const G = {};        // char → { rows: [...], w: número de colunas usadas }

function rowBits(str) { return str.split(''); }

function addGlyph(ch, rows) {
  let w = 0;
  for (const r of rows) {
    for (let i = r.length - 1; i >= 0; i--) {
      if (r[i] === '#') { if (i + 1 > w) w = i + 1; break; }
    }
  }
  G[ch] = { rows, w };
}

// glifos de base
for (const ch of Object.keys(GLYPHS)) addGlyph(ch, GLYPHS[ch].split('/'));

// acentuadas: desce a base uma linha e escreve o acento por cima
function compose(ch, baseCh, accentCh) {
  const base = G[baseCh] || G['?'];
  const rows = base.rows.slice(1);
  rows.unshift('.....');
  const acc = accentCh === 'ç' ? CEDILHA
    : accentCh === '¨' ? DIAERESE
      : (ACCENT_UP[accentCh] || '').split('/');
  if (accentCh === 'ç') {
    // cedilha embaixo, sem deslocar a letra
    const b = G[baseCh].rows.slice();
    b[GLYPH_H - 1] = CEDILHA.split('/')[GLYPH_H - 1];
    G[ch] = { rows: b, w: G[baseCh].w };
    return;
  }
  const upper = baseCh === baseCh.toUpperCase();
  const line = upper ? 0 : 1;
  if (acc.length === GLYPH_H) {
    const merged = rows.slice();
    merged[line] = merged[line].split('').map((c, i) => (acc[line][i] === '#' ? '#' : c)).join('');
    G[ch] = { rows: merged, w: Math.max(base.w, accWidth(acc)) };
    return;
  }
  G[ch] = { rows, w: base.w };
}
function accWidth(acc) {
  let w = 0;
  for (const r of acc) {
    for (let i = r.length - 1; i >= 0; i--) if (r[i] === '#') { w = Math.max(w, i + 1); break; }
  }
  return w;
}
for (const ch of Object.keys(COMPOSED)) compose(ch, COMPOSED[ch][0], COMPOSED[ch][1]);

// maiúsculas pequenas viram maiúsculas; o que faltar vira '?'
function glyph(ch) {
  if (G[ch]) return G[ch];
  const up = ch.toUpperCase();
  if (G[up]) return G[up];
  return G['?'];
}

export function glyphRows(ch) { return glyph(ch).rows; }
export function hasGlyph(ch) { return !!G[ch]; }
export function glyphChars() { return Object.keys(G); }
export function glyphWidth(ch) { return ch === ' ' ? 3 : glyph(ch).w; }

// largura de um texto em pixels de jogo (escala 1)
export function textWidth(str, scale = 1) {
  let w = 0;
  for (const ch of String(str)) w += glyphWidth(ch) + 1;
  return (w > 0 ? w - 1 : 0) * scale;
}

export function textHeight(scale = 1) { return FONT_H * scale; }

// quebra em linhas que caibam em maxPx (pixels de jogo), respeitando palavras
export function wrapText(str, maxPx, scale = 1) {
  const lines = [];
  const maxW = Math.max(1, Math.floor(maxPx / scale));
  for (const para of String(str).split('\n')) {
    if (!para) { lines.push(''); continue; }
    let cur = '';
    for (const word of para.split(' ')) {
      const test = cur ? cur + ' ' + word : word;
      if (textWidth(test, 1) <= maxW) { cur = test; continue; }
      if (cur) lines.push(cur);
      cur = '';
      let w = word;
      while (textWidth(w, 1) > maxW && w.length > 1) {
        let cut = w.length;
        while (cut > 1 && textWidth(w.slice(0, cut), 1) > maxW) cut--;
        lines.push(w.slice(0, cut));
        w = w.slice(cut);
      }
      cur = w;
    }
    if (cur) lines.push(cur);
  }
  return lines;
}

// desenha um glifo: cada '#' vira um quadrado de lado "s" (escala)
function drawGlyph(ctx, g, x, y, s, color) {
  const w = g.w, h = GLYPH_H;
  let py = 0;
  for (const row of g.rows) {
    for (let px = 0; px < w; px++) {
      if (row[px] !== '#') continue;
      // junta pixels vizinhos na horizontal para desenhar menos retângulos
      let run = 1;
      while (px + run < w && row[px + run] === '#') run++;
      ctx.fillStyle = color;
      ctx.fillRect(x + px * s, y + py * s, run * s, s);
      px += run - 1;
    }
    py++;
  }
}

/**
 * Texto com a fonte de pixel.
 * opts: { align: 'left'|'center'|'right', shadow: cor, outline: cor,
 *         max: largura máxima (quebra), line: altura extra entre linhas,
 *         bg: cor de fundo, pad: folga do fundo }
 */
export function drawText(ctx, str, x, y, scale = 1, color = '#fff', opts = {}) {
  const s = Math.max(1, Math.round(scale));
  const text = String(str == null ? '' : str);
  const lines = opts.max ? wrapText(text, opts.max, s) : text.split('\n');
  const lineH = (FONT_H + (opts.line === undefined ? 2 : opts.line)) * s;
  let cy = y;
  ctx.imageSmoothingEnabled = false;
  for (const ln of lines) {
    const w = textWidth(ln, s);
    let cx = x;
    if (opts.align === 'center') cx = x - Math.round(w / 2);
    else if (opts.align === 'right') cx = x - w;
    if (opts.bg) {
      const pad = (opts.pad === undefined ? 2 : opts.pad) * s;
      ctx.fillStyle = opts.bg;
      ctx.fillRect(cx - pad, cy - pad, w + pad * 2, FONT_H * s + pad * 2);
    }
    if (opts.outline) {
      const oc = opts.outline;
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        drawLine(ctx, ln, cx + dx * s, cy + dy * s, s, oc);
      }
    } else if (opts.shadow) {
      drawLine(ctx, ln, cx + s, cy + s, s, opts.shadow);
    }
    drawLine(ctx, ln, cx, cy, s, color);
    cy += lineH;
  }
  return cy - y;
}

function drawLine(ctx, str, x, y, s, color) {
  let cx = x;
  for (const ch of str) {
    drawGlyph(ctx, glyph(ch), cx, y, s, color);
    cx += (glyphWidth(ch) + 1) * s;
  }
}

// usados por quem quiser medir antes de desenhar
export { BASE_ROW };
