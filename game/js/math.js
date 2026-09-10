// GRAND PIXEL GAME — matemática 3D (aleatório, ruído, utilidades)
export const clamp = (x, a, b) => x < a ? a : (x > b ? b : x);
export const clamp01 = x => clamp(x, 0, 1);
export const lerp = (a, b, t) => a + (b - a) * t;
export const deg2rad = d => d * Math.PI / 180;
export const rand = (a = 1, b) => b === undefined ? Math.random() * a : a + Math.random() * (b - a);
export const irand = (a, b) => Math.floor(rand(a, b + 1));
export const smoothstep = (e0, e1, x) => { const t = clamp01((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };
export const dist2 = (ax, ay, bx, by) => { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; };
export const dist2d = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
export const hex = n => n.toString(16).padStart(2, '0');
export function h2r(hexStr) { const n = parseInt(hexStr.replace('#', ''), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
// Paleta 8 bits
export function palette(r, g, b) {
  const q = x => Math.round(x / 51) * 51;
  return (q(r) << 16) | (q(g) << 8) | q(b);
}
export const shade = (base, mult) => [
  Math.min(255, Math.max(0, Math.round(base[0] * mult))),
  Math.min(255, Math.max(0, Math.round(base[1] * mult))),
  Math.min(255, Math.max(0, Math.round(base[2] * mult)))
];
export const mix = (a, b, t) => [
  lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)
];
// ---- gerador pseudo-aleatório com semente (determinístico) ----
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// ---- noise 2D com valores por semente ----
export function valueNoise2D(seedFn) {
  const P = new Uint8Array(256);
  const ord = new Uint8Array(256);
  for (let i = 0; i < 256; i++) ord[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(seedFn() * (i + 1));
    const t = ord[i]; ord[i] = ord[j]; ord[j] = t;
  }
  let pi = 0;
  for (let k = 0; k < 256; k++) P[k] = ord[(pi++) & 255];
  const h = (x, y) => {
    const v = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
    return v - Math.floor(v);
  };
  const fade = t => t * t * (3 - 2 * t);
  return function (x, y) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const x0 = xi & 255, y0 = yi & 255;
    const v00 = P[(P[x0] + y0) & 255] / 255;
    const v10 = P[(P[x0 + 1] + y0) & 255] / 255;
    const v01 = P[(P[x0] + y0 + 1) & 255] / 255;
    const v11 = P[(P[x0 + 1] + y0 + 1) & 255] / 255;
    const u = fade(xf), v = fade(yf);
    const a = v00 + (v10 - v00) * u;
    const b = v01 + (v11 - v01) * u;
    return a + (b - a) * v;
  };
}
// ---- perspectiva ----
export function makePerspective(fovY, aspect, near, far) {
  const f = 1 / Math.tan(fovY / 2);
  const nf = 1 / (near - far);
  return [
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far + near) * nf, -1,
    0, 0, 2 * far * near * nf, 0
  ];
}
export function mulMat(a, b) {
  const o = new Float32Array(16);
  for (let i = 0; i < 4; i++)
    for (let j = 0; j < 4; j++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[i * 4 + k] * b[k * 4 + j];
      o[i * 4 + j] = s;
    }
  return o;
}
export function identity() {
  const o = new Float32Array(16);
  o[0] = o[5] = o[10] = o[15] = 1;
  return o;
}
export function makeModel(px, py, pz, rx, ry, rz, sx, sy, sz) {
  const o = identity();
  // scale
  o[0] = sx; o[5] = sy; o[10] = sz;
  // rot z
  const cz = Math.cos(rz), szz = Math.sin(rz);
  const m1 = identity();
  m1[0] = cz; m1[1] = szz; m1[4] = -szz; m1[5] = cz;
  o.set(mulMat(o, m1));
  // rot x
  const cx = Math.cos(rx), sxv = Math.sin(rx);
  const m2 = identity();
  m2[5] = cx; m2[6] = sxv; m2[9] = -sxv; m2[10] = cx;
  o.set(mulMat(o, m2));
  // rot y
  const cy = Math.cos(ry), syv = Math.sin(ry);
  const m3 = identity();
  m3[0] = cy; m3[2] = -syv; m3[8] = syv; m3[10] = cy;
  o.set(mulMat(o, m3));
  o[12] = px; o[13] = py; o[14] = pz;
  return o;
}
export function mulVec3(m, v) {
  const x = v[0], y = v[1], z = v[2];
  const w = m[3] * x + m[7] * y + m[11] * z + m[15];
  return [
    (m[0] * x + m[4] * y + m[8] * z + m[12]) / w,
    (m[1] * x + m[5] * y + m[9] * z + m[13]) / w,
    (m[2] * x + m[6] * y + m[10] * z + m[14]) / w
  ];
}
export function worldToClip(v, camPos, camRot, proj) {
  const cy = Math.cos(camRot[1]), sy = Math.sin(camRot[1]);
  const cx = Math.cos(camRot[0]), sxv = Math.sin(camRot[0]);
  const dx = v[0] - camPos[0], dy = v[1] - camPos[1], dz = v[2] - camPos[2];
  // camera space (yaw)
  const x1 = dx * cy + dz * sy;
  const z1 = -dx * sy + dz * cy;
  // pitch
  const y2 = dy * cx - z1 * sxv;
  const z2 = dy * sxv + z1 * cx;
  return [
    proj[0] * x1,
    proj[5] * y2,
    proj[10] * z2 + proj[14],
    -z2
  ];
}
export function distToSeg2D(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const l2 = dx * dx + dy * dy;
  let t = l2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
  t = clamp(t, 0, 1);
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
}
export function circleRectOverlap(cx, cy, r, rx, ry, rw, rh) {
  const nx = clamp(cx, rx, rx + rw);
  const ny = clamp(cy, ry, ry + rh);
  return dist2(cx, cy, nx, ny) < r * r;
}
export function fbm(noise, x, y, octs = 3) {
  let a = 0, amp = 0.5, f = 1;
  for (let i = 0; i < octs; i++) { a += noise(x * f, y * f) * amp; f *= 2.03; amp *= 0.5; }
  return a;
}
