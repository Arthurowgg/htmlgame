// Ferramenta de desenvolvimento: desenha pedaços da interface do jogo num
// rasterizador mínimo (só o que o jogo usa) e salva PNGs em gen/.
//
//   node tools/preview.mjs
//
// Serve para conferir a fonte de pixel, os ícones e o mapa sem abrir o
// navegador. Não faz parte do jogo publicado.
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const gen = resolve(here, '..', 'gen');
mkdirSync(gen, { recursive: true });

// ------------------------------------------------------------- cores ------
const NAMED = { white: [255, 255, 255], black: [0, 0, 0], red: [255, 0, 0] };
function parseColor(c) {
  if (typeof c !== 'string') return [0, 0, 0, 1];
  c = c.trim();
  if (c[0] === '#') {
    if (c.length === 4) return [parseInt(c[1] + c[1], 16), parseInt(c[2] + c[2], 16), parseInt(c[3] + c[3], 16), 1];
    if (c.length === 7) return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16), 1];
    if (c.length === 9) return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16), parseInt(c.slice(7, 9), 16) / 255];
  }
  let m = /^rgba?\(([^)]+)\)$/.exec(c);
  if (m) {
    const p = m[1].split(',').map(v => parseFloat(v.trim()));
    return [p[0] | 0, p[1] | 0, p[2] | 0, p.length > 3 ? p[3] : 1];
  }
  const n = NAMED[c.toLowerCase()];
  return n ? [n[0], n[1], n[2], 1] : [255, 0, 255, 1];
}

// --------------------------------------------------------- tela (raster) --
class Ctx {
  constructor(canvas) {
    this.canvas = canvas;
    this.data = canvas.data;
    this.W = canvas.width;
    this.H = canvas.height;
    this.fillStyle = '#fff';
    this.strokeStyle = '#fff';
    this.globalAlpha = 1;
    this.lineWidth = 1;
    this.imageSmoothingEnabled = false;
    this.font = '';
    this.textAlign = 'left';
    this.textBaseline = 'top';
    this._st = [];
    this.t = { x: 0, y: 0, s: 1, r: 0 };
    this.clip_ = { x0: 0, y0: 0, x1: this.W, y1: this.H };
    this.path = [];
    this._sub = null;
  }
  save() { this._st.push({ t: { ...this.t }, clip: { ...this.clip_ }, fs: this.fillStyle, ss: this.strokeStyle, ga: this.globalAlpha }); }
  restore() { const s = this._st.pop(); if (!s) return; this.t = s.t; this.clip_ = s.clip; this.fillStyle = s.fs; this.strokeStyle = s.ss; this.globalAlpha = s.ga; }
  translate(x, y) { this.t.x += x * this.t.s; this.t.y += y * this.t.s; }
  rotate(r) { this.t.r += r; }
  scale(s) { this.t.s *= s; }
  setTransform() { this.t = { x: 0, y: 0, s: 1, r: 0 }; }
  pt(x, y) {
    const c = Math.cos(this.t.r), s = Math.sin(this.t.r);
    const px = x * this.t.s, py = y * this.t.s;
    return [this.t.x + px * c - py * s, this.t.y + px * s + py * c];
  }
  px(x, y, col, a) {
    const X = Math.round(x), Y = Math.round(y);
    if (X < this.clip_.x0 || Y < this.clip_.y0 || X >= this.clip_.x1 || Y >= this.clip_.y1) return;
    if (X < 0 || Y < 0 || X >= this.W || Y >= this.H) return;
    const o = (Y * this.W + X) * 4;
    const A = (a === undefined ? 1 : a) * this.globalAlpha;
    const d = this.data;
    d[o] = d[o] * (1 - A) + col[0] * A;
    d[o + 1] = d[o + 1] * (1 - A) + col[1] * A;
    d[o + 2] = d[o + 2] * (1 - A) + col[2] * A;
    d[o + 3] = Math.max(d[o + 3], Math.round(255 * A));
  }
  fillRect(x, y, w, h) {
    const [x0, y0] = this.pt(x, y);
    const [x1, y1] = this.pt(x + w, y + h);
    const col = parseColor(this.fillStyle);
    const X0 = Math.floor(Math.min(x0, x1)), X1 = Math.ceil(Math.max(x0, x1));
    const Y0 = Math.floor(Math.min(y0, y1)), Y1 = Math.ceil(Math.max(y0, y1));
    for (let Y = Y0; Y < Y1; Y++) for (let X = X0; X < X1; X++) this.px(X, Y, col, col[3]);
  }
  clearRect() {}
  beginPath() { this.path = []; this._sub = null; }
  moveTo(x, y) { const p = this.pt(x, y); this.path.push({ m: 1, p }); this._sub = p; }
  lineTo(x, y) { this.path.push({ m: 0, p: this.pt(x, y) }); }
  closePath() { if (this._sub) this.path.push({ m: 0, p: this._sub }); }
  rect(x, y, w, h) {
    this.moveTo(x, y); this.lineTo(x + w, y); this.lineTo(x + w, y + h); this.lineTo(x, y + h); this.closePath();
  }
  arc(cx, cy, r, a0 = 0, a1 = Math.PI * 2) {
    const n = Math.max(8, Math.ceil(r * 2));
    for (let i = 0; i <= n; i++) {
      const a = a0 + (a1 - a0) * (i / n);
      const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
      if (i === 0) this.moveTo(x, y); else this.lineTo(x, y);
    }
    this.closePath();
  }
  _poly() {
    // caminho atual → lista de polígonos em coordenadas de tela
    const polys = [];
    let cur = [];
    for (const seg of this.path) {
      if (seg.m && cur.length) { polys.push(cur); cur = []; }
      cur.push(seg.p);
    }
    if (cur.length) polys.push(cur);
    return polys;
  }
  _bbox() {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const seg of this.path) {
      x0 = Math.min(x0, seg.p[0]); x1 = Math.max(x1, seg.p[0]);
      y0 = Math.min(y0, seg.p[1]); y1 = Math.max(y1, seg.p[1]);
    }
    return [x0, y0, x1, y1];
  }
  clip() {
    const [x0, y0, x1, y1] = this._bbox();
    this.clip_ = {
      x0: Math.max(this.clip_.x0, Math.floor(x0)), y0: Math.max(this.clip_.y0, Math.floor(y0)),
      x1: Math.min(this.clip_.x1, Math.ceil(x1 + 1)), y1: Math.min(this.clip_.y1, Math.ceil(y1 + 1)),
    };
  }
  _fillPolys(polys, col) {
    for (const poly of polys) {
      let ymin = 1e9, ymax = -1e9;
      for (const p of poly) { ymin = Math.min(ymin, p[1]); ymax = Math.max(ymax, p[1]); }
      for (let y = Math.floor(ymin); y <= Math.ceil(ymax); y++) {
        const xs = [];
        for (let i = 0; i < poly.length; i++) {
          const a = poly[i], b = poly[(i + 1) % poly.length];
          if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y)) {
            xs.push(a[0] + (y - a[1]) / (b[1] - a[1]) * (b[0] - a[0]));
          }
        }
        xs.sort((p, q) => p - q);
        for (let i = 0; i + 1 < xs.length; i += 2) {
          for (let x = Math.ceil(xs[i]); x < xs[i + 1]; x++) this.px(x, y, col, col[3]);
        }
      }
    }
  }
  fill() { const c = parseColor(this.fillStyle); this._fillPolys(this._poly(), c); }
  stroke() { const c = parseColor(this.strokeStyle); this._fillPolys(this._poly(), c); }
  strokeRect(x, y, w, h) {
    this.beginPath();
    this.moveTo(x, y); this.lineTo(x + w, y); this.lineTo(x + w, y + 1); this.lineTo(x, y + 1); this.closePath();
    this.fill();
    this.beginPath();
    this.moveTo(x, y + h - 1); this.lineTo(x + w, y + h - 1); this.lineTo(x + w, y + h); this.lineTo(x, y + h); this.closePath();
    this.fill();
    this.beginPath();
    this.moveTo(x, y); this.lineTo(x + 1, y); this.lineTo(x + 1, y + h); this.lineTo(x, y + h); this.closePath();
    this.fill();
    this.beginPath();
    this.moveTo(x + w - 1, y); this.lineTo(x + w, y); this.lineTo(x + w, y + h); this.lineTo(x + w - 1, y + h); this.closePath();
    this.fill();
  }
  fillText() {}
  measureText() { return { width: 0 }; }
  createImageData(w, h) { return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }; }
  getImageData(x, y, w, h) {
    const out = { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) };
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const s = ((y + j) * this.W + (x + i)) * 4, d = (j * w + i) * 4;
      out.data[d] = this.data[s]; out.data[d + 1] = this.data[s + 1];
      out.data[d + 2] = this.data[s + 2]; out.data[d + 3] = this.data[s + 3];
    }
    return out;
  }
  putImageData(img, x, y) {
    for (let j = 0; j < img.height; j++) for (let i = 0; i < img.width; i++) {
      const s = (j * img.width + i) * 4;
      this.px(x + i, y + j, [img.data[s], img.data[s + 1], img.data[s + 2]], img.data[s + 3] / 255);
    }
  }
  drawImage(img, ...a) {
    let sx = 0, sy = 0, sw = img.width, sh = img.height, dx, dy, dw, dh;
    if (a.length === 2) { [dx, dy] = a; dw = sw; dh = sh; }
    else if (a.length === 4) { [dx, dy, dw, dh] = a; }
    else { [sx, sy, sw, sh, dx, dy, dw, dh] = a; }
    const src = img._ctx ? img._ctx.data : img.data;
    const SW = img.width;
    const col = [0, 0, 0];
    const steps = Math.max(Math.abs(dw), Math.abs(dh));
    for (let j = 0; j < Math.abs(dh); j++) {
      for (let i = 0; i < Math.abs(dw); i++) {
        const u = sw / Math.abs(dw), v = sh / Math.abs(dh);
        const px = Math.floor(sx + i * u), py = Math.floor(sy + j * v);
        if (px < 0 || py < 0 || px >= img.width || py >= img.height) continue;
        const o = (py * SW + px) * 4;
        const alpha = src[o + 3] / 255;
        if (alpha <= 0) continue;
        col[0] = src[o]; col[1] = src[o + 1]; col[2] = src[o + 2];
        const [X, Y] = this.pt(dx + i, dy + j);
        this.px(X, Y, col, alpha);
      }
    }
  }
}

class CanvasShim {
  constructor(w = 0, h = 0) {
    this.width = w; this.height = h;
    this.data = new Uint8ClampedArray(Math.max(1, w * h * 4));
    this._ctx = null;
  }
  getContext() {
    if (!this._ctx || this._ctx.W !== this.width || this._ctx.H !== this.height) {
      this.data = new Uint8ClampedArray(Math.max(1, this.width * this.height * 4));
      this._ctx = new Ctx(this);
    }
    return this._ctx;
  }
  toDataURL() { return ''; }
}

// -------------------------------------------------------------- PNG ------
function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = c ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function savePNG(canvas, file, zoom = 1) {
  const W = canvas.width * zoom, H = canvas.height * zoom;
  const raw = Buffer.alloc((W * 4 + 1) * H);
  let p = 0;
  for (let y = 0; y < H; y++) {
    raw[p++] = 0;
    for (let x = 0; x < W; x++) {
      const sx = Math.floor(x / zoom), sy = Math.floor(y / zoom);
      const o = (sy * canvas.width + sx) * 4;
      const d = canvas.data;
      const a = d[o + 3] / 255;
      raw[p++] = d[o] * a + 20 * (1 - a);
      raw[p++] = d[o + 1] * a + 18 * (1 - a);
      raw[p++] = d[o + 2] * a + 32 * (1 - a);
      raw[p++] = 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  writeFileSync(file, png);
  return file;
}

// ------------------------------------------------------------- cenários ---
globalThis.document = {
  createElement(tag) { return tag === 'canvas' ? new CanvasShim(1, 1) : {}; },
  getElementById() { return null; },
};
globalThis.window = globalThis;

const { drawText, textWidth, glyphRows } = await import('../js/font.js');
const icons = await import('../js/icons.js');

function panel(ctx, x, y, w, h) {
  ctx.fillStyle = '#1b1830';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = '#3b3360';
  ctx.fillRect(x, y, w, 1); ctx.fillRect(x, y + h - 1, w, 1);
  ctx.fillRect(x, y, 1, h); ctx.fillRect(x + w - 1, y, 1, h);
  ctx.fillStyle = '#574a86';
  ctx.fillRect(x + 1, y + 1, w - 2, 1);
}

// 1) folha de teste da fonte
function fontePNG() {
  const cv = new CanvasShim(360, 250);
  const c = cv.getContext('2d');
  c.fillStyle = '#0f0d1c'; c.fillRect(0, 0, cv.width, cv.height);
  panel(c, 4, 4, 352, 242);
  drawText(c, 'GRAND PIXEL GAME', 12, 12, 2, '#ffd76a', { shadow: '#00000088' });
  drawText(c, 'abcdefghijklmnopqrstuvwxyz', 12, 36, 1, '#f2ebdd');
  drawText(c, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 12, 48, 1, '#f2ebdd');
  drawText(c, '0123456789 !?.,:;()[]{}/%*#&<>+-=_', 12, 60, 1, '#9b92b8');
  drawText(c, 'áàâãéêíóôõúüç ÁÀÂÃÉÊÍÓÔÕÚÜÇ', 12, 72, 1, '#8cd96a');
  drawText(c, 'A jornada começa na Praça de Solaria — 70 missões!', 12, 90, 1, '#f2ebdd');
  drawText(c, 'O selo desperta com 12 cristais da memória…', 12, 102, 1, '#ffd76a');
  const frases = [
    ['minúsculas misturadas: Hgjpqy ilt fbrk', '#7ad9e8'],
    ['números: 1234567890 · tempo 1h 42min 07s', '#ffb35c'],
    ['CONQUISTA: CORAÇÃO DE SOLARIA (9/9)', '#ffd76a'],
    ['use WASD para andar, E para agir e M para o mapa', '#f2ebdd'],
  ];
  frases.forEach(([t, col], i) => drawText(c, t, 12, 122 + i * 14, 1, col));
  // alfabeto em grade, para conferir glifos um a um
  let x = 12, y = 186;
  for (const ch of 'abcdefghijklmnopqrstuvwxyz0123456789') {
    drawText(c, ch, x, y, 1, '#f2ebdd');
    x += 12;
    if (x > 340) { x = 12; y += 12; }
  }
  return savePNG(cv, resolve(gen, 'prev-fonte.png'), 2);
}

// 2) folha de ícones
function iconesPNG() {
  const nomes = icons.iconNames();
  const cols = 6;
  const cw = 62, chh = 46;
  const rows = Math.ceil(nomes.length / cols);
  const cv = new CanvasShim(cols * cw + 8, rows * chh + 8);
  const c = cv.getContext('2d');
  c.fillStyle = '#0f0d1c'; c.fillRect(0, 0, cv.width, cv.height);
  nomes.forEach((n, i) => {
    const x = 8 + (i % cols) * cw, y = 8 + Math.floor(i / cols) * chh;
    c.fillStyle = '#171430'; c.fillRect(x, y, cw - 6, chh - 6);
    c.fillStyle = '#2a2446'; c.fillRect(x, y, cw - 6, 1); c.fillRect(x, y, 1, chh - 6);
    icons.drawIcon(c, n, x + (cw - 6 - 27) / 2, y + 4, 3);
    drawText(c, n.slice(0, 8), x + 3, y + chh - 17, 1, '#9b92b8');
  });
  return savePNG(cv, resolve(gen, 'prev-icones.png'), 2);
}

// 3) minimapa e mapa grande
async function mapasPNG() {
  const { World, REGIONS, POIS } = await import('../js/world.js');
  const mm = await import('../js/minimap.js');
  const world = new World(20260908);

  const st = {
    player: { x: 0, z: 0 }, cam: { yaw: 0.6 }, visited: new Set(POIS.map(p => p.id)),
    hasLens: true, world, regions: REGIONS, pois: POIS,
    landmarks: world.landmarks || [],
    objective: { x: 36, z: 9, cor: '#ffd76a' },
  };
  const cvA = new CanvasShim(420, 260);
  const a = cvA.getContext('2d');
  a.fillStyle = '#0f0d1c'; a.fillRect(0, 0, cvA.width, cvA.height);
  mm.drawMinimap(a, 420, 260, st);
  const cvB = new CanvasShim(208, 208);
  const b = cvB.getContext('2d');
  mm.drawBigMap(b, st);
  return [savePNG(cvA, resolve(gen, 'prev-minimapa.png'), 2),
          savePNG(cvB, resolve(gen, 'prev-mapa.png'), 2)];
}

console.log('fonte:  ', fontePNG());
console.log('ícones: ', iconesPNG());
console.log('mapas:  ', (await mapasPNG()).join('  '));
