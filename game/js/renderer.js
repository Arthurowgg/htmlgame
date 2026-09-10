// GRAND PIXEL GAME — renderizador WebGL: terreno voxel, sprites e brilhos
// Toda a transformação de câmera é feita na GPU via matrizes (view/projeção);
// a CPU só envia vértices do mundo e calcula animações leves (água, partículas).
import { TS, WATER_Y, CHUNK } from './world.js';

// ---------- shaders ----------
const VS_TER = `
attribute vec3 aPos; attribute vec4 aCol;
uniform mat4 uMVP; uniform vec3 uEye; uniform float uFogA; uniform float uInvSpan;
varying vec4 vCol; varying float vDist;
void main(){
  gl_Position = uMVP * vec4(aPos, 1.0);
  vCol = aCol;
  vDist = clamp((length(uEye - aPos) - uFogA) * uInvSpan, 0.0, 1.0);
}`;
const FS_TER = `
precision mediump float;
varying vec4 vCol; varying float vDist;
uniform vec3 uFog; uniform vec3 uTint;
void main(){
  vec3 lit = vCol.rgb * uTint;
  float f = vDist * vDist * (3.0 - 2.0 * vDist);
  gl_FragColor = vec4(mix(lit, uFog, f), vCol.a);
}`;

const VS_SPR = `
attribute vec3 aPos; attribute vec2 aUv; attribute vec3 aTint; attribute float aAlpha;
uniform mat4 uMVP; uniform vec3 uEye; uniform float uFogA; uniform float uInvSpan;
varying vec2 vUv; varying vec3 vTint; varying float vFog; varying float vAlpha;
void main(){
  gl_Position = uMVP * vec4(aPos, 1.0);
  vUv = aUv; vTint = aTint; vAlpha = aAlpha;
  vFog = clamp((length(uEye - aPos) - uFogA) * uInvSpan, 0.0, 1.0);
}`;
const FS_SPR = `
precision mediump float;
varying vec2 vUv; varying vec3 vTint; varying float vFog; varying float vAlpha;
uniform sampler2D uTex; uniform vec3 uFog; uniform vec3 uTint;
void main(){
  vec4 t = texture2D(uTex, vUv);
  if (t.a < 0.12) discard;
  vec3 lit = t.rgb * vTint * uTint;
  vec3 c = mix(lit, uFog, vFog * vFog * (3.0 - 2.0 * vFog));
  gl_FragColor = vec4(c, t.a * vAlpha);
}`;

const VS_GLOW = `
attribute vec3 aPos; attribute vec4 aCol;
uniform mat4 uMVP;
varying vec4 vCol;
void main(){ gl_Position = uMVP * vec4(aPos, 1.0); vCol = aCol; }`;
const FS_GLOW = `
precision mediump float;
varying vec4 vCol;
void main(){ gl_FragColor = vec4(vCol.rgb * vCol.a, vCol.a); }`;

const VS_SKY = `
attribute vec2 aPos; varying vec2 vP;
void main(){ gl_Position = vec4(aPos, 0.99999, 1.0); vP = aPos * 0.5 + 0.5; }`;
const FS_SKY = `
precision mediump float;
varying vec2 vP;
uniform vec3 cTop; uniform vec3 cMid; uniform vec3 cBot;
uniform float uStars;
uniform vec2 uDisc;      // posição do sol/lua (NDC)
uniform vec3 uDCol;      // cor do núcleo do disco
uniform vec3 uDCol2;     // cor do halo
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
void main(){
  float y = vP.y;
  vec3 c = mix(cBot, cMid, smoothstep(0.14, 0.55, y));
  c = mix(c, cTop, smoothstep(0.58, 0.98, y));
  // estrelas (só no céu escuro)
  vec2 cell = floor(vP * vec2(150.0, 90.0));
  float st = hash(cell);
  float tw = 0.5 + 0.5 * sin(hash(cell + 7.0) * 60.0 + uStars * 40.0);
  if (st > 0.975 && vP.y > 0.35) {
    float a = uStars * smoothstep(0.975, 1.0, st) * tw;
    c += vec3(1.0, 0.98, 0.9) * a * 0.9;
  }
  // disco do sol/lua com halo suave
  float d = distance(vP, uDisc);
  c = mix(c, uDCol2, uDCol2.a * (1.0 - smoothstep(0.03, 0.12, d)));
  c = mix(c, uDCol.rgb, uDCol.a * (1.0 - smoothstep(0.0, 0.03, d)));
  // brilho quente do horizonte
  c += vec3(0.20, 0.12, 0.13) * (1.0 - smoothstep(0.04, 0.20, y)) * 0.55;
  gl_FragColor = vec4(c, 1.0);
}`;

export const ART = {
  tree0: 0, tree1: 1, tree2: 2, rock: 3, crystal: 4, crystalP: 5, florete: 6,
  chest: 7, chestOpen: 8, sign: 9, lantern: 10, torch: 11, fire: 12,
  slime: 13, flower0: 14, flower1: 15, flower2: 16, flower3: 17, flower4: 18,
  npc0: 19, npc1: 20, npc2: 21, hero: 22, shadow: 23,
  bush: 24, berry: 25, ore: 26, shell: 27, essence: 28, shrine: 29, wisp: 30,
  golem: 31, gate: 32, portal: 33, selo: 34, ship: 35,
};
const NARTS = 36;
const CELL = 40;

function compile(gl, vs, fs) {
  const sh = (t, s) => {
    const o = gl.createShader(t);
    gl.shaderSource(o, s);
    gl.compileShader(o);
    if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error('shader: ' + gl.getShaderInfoLog(o));
    return o;
  };
  const p = gl.createProgram();
  gl.attachShader(p, sh(gl.VERTEX_SHADER, vs));
  gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('link: ' + gl.getProgramInfoLog(p));
  return p;
}

// ---------- pequenas matrizes (column-major) ----------
function m4persp(fovy, aspect, near, far) {
  const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
  return new Float32Array([
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far + near) * nf, -1,
    0, 0, 2 * far * near * nf, 0,
  ]);
}
// view com a MESMA convenção da projeção CPU original do jogo:
// x1 = dx*cos(yaw)+dz*sin(yaw); z1=-dx*sin(yaw)+dz*cos(yaw)
// y2 = dy*cos(pitch)-z1*sin(pitch); z2 = dy*sin(pitch)+z1*cos(pitch); w=-z2
function m4view(eye, yaw, pitch) {
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  const ex = eye[0], ey = eye[1], ez = eye[2];
  const tx = -(cy * ex + sy * ez);
  const ty = -((sp * sy) * ex + cp * ey - (sp * cy) * ez);
  const tz = -((-cp * sy) * ex + sp * ey + (cp * cy) * ez);
  return new Float32Array([
    cy, sp * sy, -cp * sy, 0,
    0, cp, sp, 0,
    sy, -sp * cy, cp * cy, 0,
    tx, ty, tz, 1,
  ]);
}
function m4mul(a, b) {
  const o = new Float32Array(16);
  for (let c = 0; c < 4; c++)
    for (let r = 0; r < 4; r++) {
      o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    }
  return o;
}

// ---------- atlas ----------
export class SpriteAtlas {
  constructor() {
    const cols = 8;
    const rows = Math.ceil(NARTS / cols);
    this.W = cols * CELL; this.H = rows * CELL;
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.W; this.canvas.height = this.H;
    this.ctx = this.canvas.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;
    this.paintAll();
  }
  uv(id) {
    const cols = 8;
    const x = (id % cols) * CELL, y = Math.floor(id / cols) * CELL;
    return [x / this.W, 1 - (y + CELL) / this.H, (x + CELL) / this.W, 1 - y / this.H];
  }
  cell(id) {
    const cols = 8;
    return [(id % cols) * CELL, Math.floor(id / cols) * CELL];
  }
  paintAll() {
    const at = (id, w, h, draw) => {
      const [ox, oy] = this.cell(id);
      const s = 2;
      const bx = ox + (CELL - w * s) / 2, by = oy + (CELL - h * s) / 2;
      draw((gx, gy, color, w2 = 1, h2 = 1) => {
        this.ctx.fillStyle = color;
        this.ctx.fillRect(bx + gx * s, by + gy * s, w2 * s, h2 * s);
      });
    };
    const C = {
      bark: '#6b4a2c', barkD: '#4d331d', stone: ['#8d9198', '#767b83', '#5f646c'],
      wood: '#9c6b3f', woodD: '#6f4a2a', plank: '#b98a55',
    };
    for (let v = 0; v < 3; v++) {
      at(ART['tree' + v], 14, 16, px => {
        const L = ['#2f7d33', '#3c943c', '#4fae46'][v];
        const LD = ['#1f5c26', '#256b2b', '#2f7d33'][v];
        const LH = ['#4fae46', '#5fbd54', '#6cc95f'][v];
        for (let y = 10; y < 15; y++) { px(6, y, C.bark); px(7, y, C.bark); }
        px(6, 14, C.barkD); px(7, 14, C.barkD);
        const top = y => {
          const w = [7, 6, 4, 3][y] || 2;
          const x0 = 7 - Math.floor(w / 2);
          for (let i = 0; i < w; i++) px(x0 + i, y, (i + y) % 2 === 0 ? LH : L);
        };
        top(0); top(1); top(2); top(3);
        px(5, 0, LD); px(9, 0, LD); px(6, 1, LD); px(8, 1, LD);
      });
    }
    at(ART.rock, 12, 9, px => {
      for (let y = 4; y < 8; y++)
        for (let dx = 1; dx < 11; dx++) px(dx, y, dx < 2 || dx > 9 ? C.stone[1] : C.stone[0]);
      px(0, 6, C.stone[2]); px(11, 6, C.stone[2]); px(1, 8, C.stone[2]); px(2, 8, C.stone[1]);
      px(8, 8, C.stone[2]); px(9, 8, C.stone[1]); px(10, 8, C.stone[2]);
      px(2, 3, C.stone[0]); px(3, 2, C.stone[0]); px(4, 2, C.stone[0]); px(5, 3, C.stone[0]);
      px(6, 3, C.stone[1]); px(7, 3, C.stone[1]); px(8, 2, C.stone[0]); px(9, 2, C.stone[1]);
      px(3, 1, C.stone[0]); px(4, 1, C.stone[1]); px(5, 1, C.stone[0]); px(6, 1, C.stone[0]);
      px(7, 1, C.stone[0]); px(8, 1, C.stone[1]); px(4, 0, C.stone[0]); px(5, 0, C.stone[0]);
      px(6, 0, C.stone[1]); px(2, 4, C.stone[2]); px(9, 4, C.stone[2]);
    });
    const crystalArt = (id, pickup) => at(id, 9, 12, px => {
      const c = ['#9be8ff', '#7ad9f2', '#5cc0e0'];
      if (pickup) { c[0] = '#ffd0f0'; c[1] = '#ff9de0'; c[2] = '#e06ab8'; }
      px(3, 7, C.stone[1]); px(4, 7, C.stone[0]); px(5, 7, C.stone[1]);
      px(3, 8, '#6a6f7c'); px(4, 8, C.stone[1]); px(5, 8, '#6a6f7c');
      px(2, 4, c[2]); px(3, 3, c[1]); px(4, 3, c[0]); px(5, 3, c[1]); px(6, 4, c[2]);
      px(2, 5, c[1]); px(3, 5, c[0]); px(4, 5, '#ffffff'); px(5, 5, c[0]); px(6, 5, c[1]);
      px(3, 6, c[0]); px(4, 6, '#ffffff'); px(5, 6, c[0]);
      px(1, 4, c[2]); px(7, 4, c[2]);
      px(3, 2, c[0]); px(4, 2, c[1]);
      px(4, 1, c[0]);
      px(2, 9, '#4c5058'); px(3, 9, '#5a5e68'); px(4, 9, '#4c5058'); px(5, 9, '#5a5e68');
    });
    crystalArt(ART.crystal, false);
    crystalArt(ART.crystalP, true);
    at(ART.florete, 7, 10, px => {
      px(3, 5, '#1f7a46'); px(3, 6, '#1f7a46'); px(3, 7, '#175f36'); px(3, 8, '#123f26');
      px(2, 4, '#2f9a5a'); px(4, 4, '#2f9a5a');
      px(2, 3, '#8ff9ff'); px(3, 3, '#d9fbff'); px(4, 3, '#8ff9ff');
      px(1, 2, '#7de4ff'); px(2, 2, '#d9fbff'); px(4, 2, '#d9fbff'); px(5, 2, '#7de4ff');
      px(3, 1, '#aef7ff'); px(3, 0, '#eaffff');
    });
    const chestArt = (id, open) => at(id, 12, open ? 10 : 8, px => {
      for (let y = 2; y < 8; y++)
        for (let dx = 1; dx < 11; dx++) px(dx, y, y > 6 ? C.woodD : C.wood);
      px(0, 3, C.woodD); px(11, 3, C.woodD);
      if (!open) {
        for (let dx = 0; dx < 12; dx++) px(dx, 1, '#8a5a34');
        for (let dx = 2; dx < 10; dx++) px(dx, 0, C.plank);
      } else {
        for (let dx = 2; dx < 10; dx++) px(dx, 0, '#241a10');
      }
      px(0, 4, '#e6c25a'); px(11, 4, '#e6c25a');
      px(5, 3, '#f0d878'); px(6, 3, '#f0d878'); px(5, 4, '#c9a63e'); px(6, 4, '#c9a63e');
      px(1, 2, '#f7e79a'); px(10, 2, '#f7e79a');
    });
    chestArt(ART.chest, false); chestArt(ART.chestOpen, true);
    at(ART.sign, 8, 10, px => {
      for (let dx = 0; dx < 8; dx++) { px(dx, 4, C.plank); px(dx, 5, C.plank); }
      px(0, 4, C.wood); px(7, 4, C.wood);
      px(1, 3, C.plank); px(2, 3, C.plank); px(5, 3, C.plank); px(6, 3, C.plank);
      px(0, 2, '#5a3b22'); px(7, 2, '#5a3b22');
      px(3, 2, '#c8a25f'); px(4, 2, '#c8a25f');
      px(3, 6, C.bark); px(4, 6, C.bark); px(3, 7, C.barkD); px(4, 7, C.barkD);
      px(3, 8, '#3a2a1c'); px(4, 8, '#3a2a1c'); px(3, 9, '#241a10'); px(4, 9, '#241a10');
    });
    at(ART.lantern, 7, 12, px => {
      px(3, 0, '#20242c'); px(3, 1, '#20242c');
      px(2, 2, '#20242c'); px(4, 2, '#20242c');
      for (let dx = 1; dx < 6; dx++) { px(dx, 6, '#20242c'); px(dx, 7, '#20242c'); }
      for (let dx = 2; dx < 5; dx++) {
        px(dx, 3, '#ffd76a'); px(dx, 4, '#ffd76a'); px(dx, 5, '#e8962e');
      }
      px(3, 4, '#fff3c0');
      px(1, 6, '#20242c'); px(5, 6, '#20242c');
      px(3, 8, '#16181e'); px(3, 9, '#16181e'); px(3, 10, '#101218'); px(3, 11, '#101218');
    });
    at(ART.torch, 5, 12, px => {
      px(2, 4, C.bark); px(2, 5, C.bark); px(2, 6, C.bark);
      px(2, 7, C.bark); px(2, 8, C.bark); px(2, 9, C.barkD);
      px(2, 3, '#ff7b3a'); px(2, 2, '#ffb84d'); px(2, 1, '#ffd76a');
      px(1, 2, '#e8962e'); px(3, 2, '#e8962e'); px(1, 3, '#c96a2a'); px(3, 3, '#c96a2a');
    });
    at(ART.fire, 9, 6, px => {
      px(3, 4, '#c96a2a'); px(4, 4, '#c96a2a'); px(5, 4, '#c96a2a');
      px(3, 3, '#ff7b3a'); px(4, 3, '#ffb84d'); px(5, 3, '#ff7b3a');
      px(4, 2, '#ffd76a'); px(3, 2, '#e8962e'); px(5, 2, '#e8962e');
      px(4, 1, '#ffe9a8');
    });
    at(ART.slime, 12, 8, px => {
      px(1, 5, '#2f9c46'); px(2, 4, '#3fae52'); px(3, 3, '#54ce63'); px(4, 3, '#6ee36f');
      px(5, 3, '#6ee36f'); px(6, 3, '#6ee36f'); px(7, 3, '#6ee36f'); px(8, 3, '#54ce63');
      px(9, 4, '#3fae52'); px(10, 5, '#2f9c46');
      for (let y = 4; y < 7; y++)
        for (let dx = 1; dx < 11; dx++) px(dx, y, y > 5 ? '#2f9c46' : '#54ce63');
      for (let dx = 0; dx < 12; dx++) px(dx, 7, '#1f7a38');
      px(0, 6, '#2f9c46'); px(11, 6, '#2f9c46'); px(0, 5, '#3fae52'); px(11, 5, '#3fae52');
      px(3, 4, '#ffffff'); px(8, 4, '#ffffff');
      px(4, 4, '#14241a'); px(9, 4, '#14241a');
      px(3, 3, '#eafff0'); px(8, 3, '#eafff0');
      px(6, 3, '#a5f7ad');
    });
    const flCols = ['#ff8fb8', '#ffe066', '#c9a0ff', '#8fd6ff', '#ffd0e0'];
    const flMid = ['#ff5f9e', '#ffc22e', '#a06bff', '#5aa9ff', '#ff9ec0'];
    for (let f = 0; f < 5; f++) {
      at(ART['flower' + f], 5, 5, px => {
        px(2, 3, '#2f7a3f'); px(2, 4, '#1f5c2e');
        px(1, 1, flCols[f]); px(2, 0, flCols[f]); px(3, 1, flCols[f]);
        px(2, 2, flMid[f]);
      });
    }
    const npcBase = (px, pal) => {
      const [robe, robeD, hat, hair, skin] = pal;
      for (let dx = 2; dx < 8; dx++) { px(dx, 5, robe); px(dx, 6, robe); }
      for (let dx = 2; dx < 8; dx++) { px(dx, 7, robeD); px(dx, 8, robeD); }
      px(1, 5, robeD); px(8, 5, robeD); px(1, 6, robeD); px(8, 6, robeD);
      px(1, 7, skin); px(8, 7, skin);
      for (let dx = 3; dx < 7; dx++) px(dx, 9, robeD);
      px(2, 9, robeD); px(7, 9, robeD); px(3, 10, robeD); px(4, 10, robeD); px(5, 10, robeD); px(6, 10, robeD);
      px(3, 11, robeD); px(4, 11, robeD); px(5, 11, robeD); px(6, 11, robeD);
      px(3, 12, robeD); px(6, 12, robeD); px(3, 13, '#241a12'); px(6, 13, '#241a12');
      for (let dx = 3; dx < 7; dx++) { px(dx, 1, skin); px(dx, 2, skin); px(dx, 3, skin); }
      px(2, 2, skin); px(7, 2, skin); px(2, 3, skin); px(7, 3, skin);
      for (let dx = 2; dx < 8; dx++) px(dx, 0, hat);
      px(2, 1, hat); px(7, 1, hat);
      px(3, 1, hair); px(4, 1, hair); px(5, 1, hair); px(6, 1, hair);
      px(3, 3, '#1c1a24'); px(6, 3, '#1c1a24');
      px(3, 2, '#f2d9c0'); px(6, 2, '#f2d9c0');
    };
    at(ART.npc0, 10, 14, px => {
      npcBase(px, ['#8a4a8e', '#6a3568', '#e0b84a', '#c99a3c', '#e8b88a']);
      px(3, 4, '#f2f2f2'); px(4, 4, '#f2f2f2'); px(5, 4, '#f2f2f2'); px(6, 4, '#f2f2f2');
      px(4, 5, '#f2f2f2'); px(5, 5, '#f2f2f2');
      px(2, 0, '#e0b84a'); px(7, 0, '#e0b84a');
    });
    at(ART.npc1, 10, 14, px => {
      npcBase(px, ['#3f9a5c', '#2c7443', '#2c7443', '#8a5f3a', '#e8b88a']);
      px(3, 4, '#aee3bf');
    });
    at(ART.npc2, 10, 14, px => {
      npcBase(px, ['#3a7fa0', '#2b5f7a', '#2b2f3a', '#2b2f3a', '#dcae82']);
      px(4, 7, '#c9a23c'); px(5, 7, '#c9a23c');
      px(7, 9, '#8a4a2a'); px(8, 10, '#8a4a2a'); px(8, 9, '#6f3d22');
    });
    at(ART.hero, 10, 14, px => {
      const robe = '#3a5fb0', robeD = '#29418a', hair = '#3a2a20', skin = '#eec092';
      for (let dx = 2; dx < 8; dx++) { px(dx, 5, robe); px(dx, 6, robe); }
      for (let dx = 2; dx < 8; dx++) { px(dx, 7, robeD); px(dx, 8, robeD); }
      px(1, 5, robeD); px(8, 5, robeD); px(1, 6, robeD); px(8, 6, robeD);
      px(1, 7, skin); px(8, 7, skin);
      for (let dx = 2; dx < 8; dx++) px(dx, 9, '#4a4a5c');
      for (let dx = 2; dx < 8; dx++) px(dx, 10, '#3a3a48');
      px(3, 11, '#2a2a34'); px(4, 11, '#2a2a34'); px(5, 11, '#2a2a34'); px(6, 11, '#2a2a34');
      px(3, 12, '#2a2a34'); px(6, 12, '#2a2a34');
      px(3, 13, '#1c1c24'); px(6, 13, '#1c1c24');
      for (let dx = 3; dx < 7; dx++) { px(dx, 1, skin); px(dx, 2, skin); px(dx, 3, skin); }
      px(2, 2, skin); px(7, 2, skin); px(2, 3, skin); px(7, 3, skin);
      for (let dx = 2; dx < 8; dx++) px(dx, 0, hair);
      px(2, 1, hair); px(7, 1, hair);
      px(3, 4, '#e8c23c'); px(4, 4, '#e8c23c'); px(5, 4, '#e8c23c'); px(6, 4, '#e8c23c');
      px(3, 3, '#1c1a24'); px(6, 3, '#1c1a24');
      px(4, 2, '#f6d8b4'); px(5, 2, '#f6d8b4');
    });
    at(ART.shadow, 12, 4, px => {
      for (let y = 0; y < 4; y++)
        for (let dx = 4 - y; dx < 8 + y; dx++)
          px(dx, y, y === 0 ? 'rgba(10,8,18,0.55)' : 'rgba(10,8,18,0.38)');
    });
    // arbusto
    at(ART.bush, 9, 6, px => {
      for (let y = 2; y < 5; y++)
        for (let dx = 1; dx < 8; dx++) px(dx, y, '#2e7d33');
      px(0, 3, '#245f28'); px(8, 3, '#245f28'); px(1, 5, '#1c4a20'); px(2, 5, '#1c4a20');
      px(5, 5, '#1c4a20'); px(6, 5, '#1c4a20'); px(7, 5, '#1c4a20');
      px(2, 2, '#3f9c44'); px(5, 2, '#3f9c44'); px(7, 2, '#3f9c44'); px(3, 1, '#4fae46');
    });
    // baga
    at(ART.berry, 6, 7, px => {
      px(2, 5, '#5a3b22'); px(3, 5, '#5a3b22'); px(2, 6, '#3f2a18'); px(3, 6, '#3f2a18');
      px(1, 2, '#e63c4e'); px(2, 1, '#e63c4e'); px(3, 1, '#e63c4e'); px(4, 2, '#e63c4e');
      px(1, 3, '#c22a3c'); px(2, 4, '#c22a3c'); px(3, 4, '#c22a3c'); px(4, 3, '#c22a3c');
      px(2, 0, '#ff8090'); px(3, 0, '#ff8090');
      px(3, 2, '#2f7a3f'); px(4, 1, '#2f7a3f');
    });
    // minério
    at(ART.ore, 8, 8, px => {
      px(2, 6, '#5a5e68'); px(3, 6, '#5a5e68'); px(4, 6, '#5a5e68'); px(5, 6, '#5a5e68');
      px(2, 2, '#6a6f7c'); px(3, 1, '#6a6f7c'); px(4, 1, '#6a6f7c'); px(5, 2, '#6a6f7c');
      px(2, 3, '#8d9198'); px(3, 4, '#8d9198'); px(4, 4, '#8d9198'); px(5, 3, '#8d9198');
      px(1, 3, '#5a5e68'); px(6, 3, '#5a5e68');
      px(3, 3, '#7df2ff'); px(4, 3, '#7df2ff'); px(3, 5, '#4fc6d8'); px(4, 5, '#4fc6d8');
      px(1, 4, '#5a5e68'); px(6, 4, '#5a5e68'); px(3, 2, '#b8fbff'); px(4, 2, '#b8fbff');
      px(3, 0, '#7df2ff'); px(4, 0, '#7df2ff');
    });
    // concha
    at(ART.shell, 7, 6, px => {
      px(3, 5, '#d9c39a'); px(4, 5, '#c9b088');
      px(2, 3, '#f0dfb4'); px(3, 2, '#f0dfb4'); px(4, 2, '#f7ecd0'); px(5, 3, '#f0dfb4');
      px(2, 4, '#e6d0a2'); px(5, 4, '#e6d0a2');
      px(3, 3, '#d9c39a'); px(4, 3, '#e6d0a2');
      px(1, 3, '#c9b088'); px(6, 3, '#c9b088'); px(1, 4, '#b89c70'); px(6, 4, '#b89c70');
      px(3, 0, '#fdf6e0'); px(4, 0, '#fdf6e0'); px(3, 1, '#f7ecd0'); px(4, 1, '#f7ecd0');
    });
    // essência
    at(ART.essence, 6, 8, px => {
      px(2, 3, '#9af0ff'); px(3, 2, '#9af0ff'); px(4, 2, '#d8fbff'); px(5, 3, '#9af0ff');
      px(2, 4, '#6fcfe8'); px(3, 5, '#6fcfe8'); px(4, 5, '#a5e6f5'); px(5, 4, '#6fcfe8');
      px(1, 3, '#4aa9c2'); px(6, 3, '#4aa9c2'); px(3, 1, '#eaffff'); px(4, 1, '#ffffff');
      px(3, 3, '#ffffff'); px(3, 4, '#eaffff'); px(4, 3, '#f0ffff');
      px(2, 6, '#7ad9ee'); px(3, 6, '#7ad9ee'); px(4, 6, '#7ad9ee'); px(3, 7, '#cdeef7');
    });
    // santuário
    at(ART.shrine, 9, 10, px => {
      px(3, 7, '#7d828b'); px(4, 7, '#8d9198'); px(5, 7, '#7d828b');
      px(2, 8, '#666b74'); px(6, 8, '#666b74'); px(3, 8, '#7d828b'); px(4, 8, '#7d828b'); px(5, 8, '#7d828b');
      px(2, 9, '#545860'); px(3, 9, '#545860'); px(4, 9, '#545860'); px(5, 9, '#545860'); px(6, 9, '#545860');
      px(3, 6, '#5a5e68'); px(5, 6, '#5a5e68');
      px(2, 4, '#9df2ff'); px(3, 3, '#c9f9ff'); px(4, 3, '#eafeff'); px(5, 4, '#9df2ff');
      px(3, 2, '#eafeff'); px(4, 2, '#ffffff');
      px(2, 5, '#54c8dd'); px(5, 5, '#54c8dd');
      px(3, 1, '#54c8dd'); px(4, 1, '#7ad9ee'); px(4, 0, '#b8fbff');
    });
    // wisp
    at(ART.wisp, 8, 10, px => {
      px(3, 1, '#bbffff'); px(4, 1, '#eeffff'); px(3, 2, '#88ffff'); px(4, 2, '#ccffff');
      px(2, 3, '#88ffff'); px(3, 3, '#eeffff'); px(4, 3, '#ffffff'); px(5, 3, '#88ffff');
      px(1, 4, '#66eeff'); px(2, 4, '#ccffff'); px(3, 4, '#ffffff'); px(4, 4, '#ffffff');
      px(5, 4, '#ccffff'); px(6, 4, '#66eeff');
      px(1, 5, '#66eeff'); px(2, 5, '#99ffff'); px(3, 5, '#ffffff'); px(4, 5, '#ffffff');
      px(5, 5, '#99ffff'); px(6, 5, '#66eeff');
      px(2, 6, '#77eeff'); px(3, 6, '#99ffff'); px(4, 6, '#99ffff'); px(5, 6, '#77eeff');
      px(3, 7, '#66eeff'); px(4, 7, '#66eeff');
      px(2, 0, '#eeffff'); px(5, 0, '#eeffff');
      px(2, 3, '#cc0000'); px(5, 3, '#cc0000');
      px(2, 2, '#ff8800'); px(5, 2, '#ff8800');
    });
    // ---- artes novas (índices 31..35) ----
    // golem: golem de pedra com núcleo brilhante
    at(ART.golem, 14, 17, px => {
      const st = ['#8d9198', '#767b83', '#5f646c'];
      for (let y = 8; y < 14; y++) for (let dx = 2; dx < 12; dx++) px(dx, y, y > 12 ? st[2] : st[0]);
      for (let dx = 0; dx < 3; dx++) { px(dx, 5 + dx * 2, st[1]); px(11 + dx, 7 - dx, st[1]); }
      px(4, 7, st[2]); px(5, 7, '#9bf7ff'); px(6, 7, '#d8feff'); px(7, 7, '#7fdbe8'); px(9, 7, st[2]);
      for (let y = 3; y < 8; y++) for (let dx = 3; dx < 11; dx++) px(dx, y, st[0]);
      px(3, 2, st[1]); px(4, 1, st[0]); px(5, 1, st[0]); px(6, 1, st[0]); px(7, 1, st[1]);
      px(8, 2, st[0]); px(9, 2, st[1]); px(10, 3, st[1]);
      px(4, 4, '#16181e'); px(9, 4, '#16181e'); px(4, 3, '#e8edf5'); px(9, 3, '#c8cdd6');
      px(4, 8, st[2]); px(9, 8, st[2]); px(6, 5, '#9bf7ff');
      px(3, 14, st[2]); px(10, 14, st[2]); px(4, 15, st[2]); px(5, 15, st[2]); px(8, 15, st[2]); px(9, 15, st[2]);
      px(2, 5, st[1]); px(11, 7, st[1]); px(3, 6, '#5f646c'); px(10, 6, '#5f646c');
    });
    // gate: arco de pedra escura com vazio violeta
    at(ART.gate, 13, 16, px => {
      for (let y = 0; y < 10; y++) { px(0, y + 2, '#3a3f4c'); px(1, y + 2, '#4c5264'); px(11, y + 2, '#3a3f4c'); px(12, y + 2, '#4c5264'); }
      px(2, 10, '#2a2e3a'); px(10, 10, '#2a2e3a');
      for (let y = 0; y < 7; y++) { px(2, 2 + y, '#4c5264'); px(10, 2 + y, '#4c5264'); }
      px(3, 8, '#4c5264'); px(9, 8, '#4c5264'); px(4, 7, '#4c5264'); px(8, 7, '#4c5264'); px(5, 6, '#4c5264'); px(7, 6, '#4c5264');
      for (let y = 8; y < 15; y++) for (let dx = 3; dx < 10; dx++) px(dx, y, (y + dx) % 3 ? '#191425' : '#241b38');
      px(4, 13, '#8a6bff'); px(7, 13, '#6b8aff'); px(5, 14, '#3a2a5a'); px(6, 14, '#3a2a5a');
      px(1, 0, '#8d9198'); px(2, 0, '#aeb4bd'); px(10, 0, '#aeb4bd'); px(11, 0, '#8d9198');
      px(0, 1, '#767b83');
    });
    // portal: vórtice de energia
    at(ART.portal, 10, 12, px => {
      for (let y = 1; y < 11; y++) for (let dx = 1; dx < 9; dx++) {
        const d = Math.abs(dx - 4.5) + Math.abs(y - 5.5);
        if (d > 6) px(dx, y, '#1a1626');
        else px(dx, y, '#241b3a');
      }
      const ring = (cx, cy, r, c1, c2) => {
        for (let a = 0; a < 24; a++) {
          const x = Math.round(cx + Math.cos(a / 24 * 6.283) * r);
          const y = Math.round(cy + Math.sin(a / 24 * 6.283) * r * 0.82);
          px(x, y, a % 2 ? c1 : c2);
        }
      };
      ring(4.5, 5.5, 3.6, '#b18cff', '#7a5cff'); ring(4.5, 5.5, 2.2, '#e4d6ff', '#9c7aff');
      px(4, 4, '#ffffff'); px(5, 5, '#ffffff'); px(4, 6, '#e4d6ff'); px(5, 7, '#c9b0ff');
    });
    // selo: pedra de selo com runa de luz
    at(ART.selo, 12, 6, px => {
      px(0, 3, '#8a8f98'); px(1, 2, '#9aa0aa'); px(10, 2, '#9aa0aa'); px(11, 3, '#8a8f98');
      for (let dx = 1; dx < 11; dx++) px(dx, 3, '#767b83');
      px(2, 1, '#a7adb8'); px(9, 1, '#a7adb8'); px(3, 0, '#c2c7d0'); px(8, 0, '#c2c7d0'); px(4, 0, '#ffd76a'); px(7, 0, '#ffd76a');
      px(5, 1, '#ffe9a8'); px(6, 1, '#ffe9a8'); px(5, 2, '#ffb35c'); px(6, 2, '#ffb35c');
    });
    // ship: casco naufragado
    at(ART.ship, 15, 7, px => {
      px(0, 5, '#3a2a1c'); px(1, 4, '#4d3824'); px(13, 4, '#4d3824'); px(14, 5, '#3a2a1c');
      for (let dx = 1; dx < 14; dx++) { px(dx, 5, '#5a4228'); px(dx, 6, '#3a2a1c'); }
      px(1, 3, '#6b4f30'); px(2, 3, '#7a5c38'); px(3, 3, '#6b4f30'); px(4, 3, '#7a5c38'); px(10, 3, '#6b4f30'); px(11, 3, '#5a4228'); px(12, 3, '#6b4f30');
      px(3, 2, '#8a6a40'); px(4, 2, '#7a5c38'); px(10, 2, '#8a6a40');
      px(12, 0, '#4d3824'); px(12, 1, '#5a4228'); px(13, 1, '#4d3824'); px(13, 2, '#5a4228');
      px(8, 1, '#c9a23c'); px(9, 1, '#c9a23c');
    });
  }
  upload(gl) {
    this.tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.canvas);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindTexture(gl.TEXTURE_2D, null);
  }
}

export class Renderer {
  constructor(canvas, world, opts) {
    this.canvas = canvas;
    this.world = world;
    this.glowsOn = true;
    const o = opts || {};
    // várias tentativas: quanto mais conservador, mais chance de abrir
    const tries = [
      { antialias: o.antialias !== false, alpha: false, depth: true, powerPreference: 'high-performance' },
      { antialias: false, alpha: false, depth: true },
      { antialias: false, alpha: false, depth: true, failIfMajorPerformanceCaveat: false },
    ];
    let gl = null, why = '';
    for (const at of tries) {
      try { gl = canvas.getContext('webgl', at) || canvas.getContext('experimental-webgl', at); } catch (e) { why = e.message; }
      if (gl) break;
    }
    this.gl = gl;
    if (!gl) {
      throw new Error('o navegador não liberou o WebGL' + (why ? ' (' + why + ')' : '') +
        ' — driver de vídeo antigo ou aceleração desligada');
    }
    this.pTer = compile(gl, VS_TER, FS_TER);
    this.pSpr = compile(gl, VS_SPR, FS_SPR);
    this.pGlow = compile(gl, VS_GLOW, FS_GLOW);
    this.pSky = compile(gl, VS_SKY, FS_SKY);
    const mkU = (p, names) => {
      const u = {};
      for (const n of names) u[n] = gl.getUniformLocation(p, n);
      return u;
    };
    this.uTer = mkU(this.pTer, ['uMVP', 'uEye', 'uFogA', 'uInvSpan', 'uFog', 'uTint']);
    this.uSpr = mkU(this.pSpr, ['uTex', 'uMVP', 'uEye', 'uFogA', 'uInvSpan', 'uFog', 'uTint']);
    this.uGlow = mkU(this.pGlow, ['uMVP']);
    this.uSky = mkU(this.pSky, ['cTop', 'cMid', 'cBot', 'uStars', 'uDisc', 'uDCol', 'uDCol2']);
    this.bufs = { spr: gl.createBuffer(), glow: gl.createBuffer(), dyn: gl.createBuffer(), sky: gl.createBuffer() };
    this.terBufs = {}; // cache de buffers de terreno por chunk/banda
    this.skyVerts = new Float32Array([-1, -1, 3, -1, -1, 3]);
    this.atlas = new SpriteAtlas();
    this.atlas.upload(gl);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.clearDepth(1);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(0.01, 0.01, 0.03, 1);
    this.cam = { x: 0, y: 10, z: 0, yaw: 0, pitch: 0, fogA: 70, fogB: 215 };
    this._waterCells = {};
    this.projF = 1; this.projF5 = 1;
    this.fov = 1.12;
    this._near = 0.1; this._far = 520;
    this.terLRU = new Map();   // chunk -> {buf, verts}
    this._locCache = new WeakMap();
  }
  attrLoc(prog, name) {
    let m = this._locCache.get(prog);
    if (!m) { m = new Map(); this._locCache.set(prog, m); }
    if (!m.has(name)) m.set(name, this.gl.getAttribLocation(prog, name));
    return m.get(name);
  }
  resize(w, h) {
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w; this.canvas.height = h;
    }
  }
  setCam(x, y, z, yaw, pitch, fov = 1.12, fogA = this.cam.fogA, fogB = this.cam.fogB) {
    this.cam.x = x; this.cam.y = y; this.cam.z = z;
    this.cam.yaw = yaw; this.cam.pitch = pitch;
    this.cam.fogA = fogA; this.cam.fogB = fogB;
    this.fov = fov;
    const aspect = this.canvas.width / this.canvas.height;
    this.projF = 1 / Math.tan(fov / 2) / aspect;
    this.projF5 = 1 / Math.tan(fov / 2);
    const P = m4persp(fov, aspect, this._near, this._far);
    const V = m4view([x, y, z], yaw, pitch);
    this.mvp = m4mul(P, V);
    this._eye = [x, y, z];
  }
  // projeta um ponto do mundo → clip [x,y,zw] (mesma convenção da GPU)
  project(p, out) {
    const c = this.cam;
    const cy = Math.cos(c.yaw), sy = Math.sin(c.yaw);
    const cxp = Math.cos(c.pitch), sxp = Math.sin(c.pitch);
    const dx = p[0] - c.x, dy = p[1] - c.y, dz = p[2] - c.z;
    const x1 = dx * cy + dz * sy;
    const z1 = -dx * sy + dz * cy;
    const y2 = dy * cxp - z1 * sxp;
    const z2 = dy * sxp + z1 * cxp;
    const w = -z2;
    if (w < 0.05) return null;
    out[0] = this.projF * x1 / w;
    out[1] = this.projF5 * y2 / w;
    out[2] = -1 + 2 * Math.min(w, 300) / 300;
    return out;
  }
  _sky() {
    const gl = this.gl;
    gl.depthMask(false);
    gl.useProgram(this.pSky);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.bufs.sky);
    gl.bufferData(gl.ARRAY_BUFFER, this.skyVerts, gl.STATIC_DRAW);
    const loc = this.attrLoc(this.pSky, 'aPos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const e = this._env || {};
    gl.uniform3f(this.uSky.cTop, e.top ? e.top[0] : 0.012, e.top ? e.top[1] : 0.011, e.top ? e.top[2] : 0.032);
    gl.uniform3f(this.uSky.cMid, e.mid ? e.mid[0] : 0.115, e.mid ? e.mid[1] : 0.075, e.mid ? e.mid[2] : 0.16);
    gl.uniform3f(this.uSky.cBot, e.bot ? e.bot[0] : 0.44, e.bot ? e.bot[1] : 0.24, e.bot ? e.bot[2] : 0.32);
    const stars = e.stars !== undefined ? e.stars : 0;
    gl.uniform1f(this.uSky.uStars, stars);
    const d = e.disc || { x: 0.76, y: 0.3 };
    gl.uniform2f(this.uSky.uDisc, d.x, d.y);
    const dc = e.discCol || { r: 1, g: 0.98, b: 0.88, a: 0 };
    const dc2 = e.discCol2 || { r: 1, g: 0.95, b: 0.8, a: 0 };
    gl.uniform4f(this.uSky.uDCol, dc.r, dc.g, dc.b, dc.a);
    gl.uniform4f(this.uSky.uDCol2, dc2.r, dc2.g, dc2.b, dc2.a);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.depthMask(true);
  }
  _useTerrainGlobals(p) {
    const gl = this.gl;
    gl.useProgram(p);
    const u = p === this.pTer ? this.uTer : this.uSpr;
    gl.uniformMatrix4fv(u.uMVP, false, this.mvp);
    gl.uniform3f(u.uEye, this.cam.x, this.cam.y, this.cam.z);
    const fogA = this.cam.fogA !== undefined ? this.cam.fogA : 70;
    const fogB = this.cam.fogB !== undefined ? this.cam.fogB : 215;
    gl.uniform1f(u.uFogA, fogA);
    gl.uniform1f(u.uInvSpan, 1 / Math.max(1, fogB - fogA));
    const t = this._envTint || [1, 1, 1];
    gl.uniform3f(u.uTint, t[0], t[1], t[2]);
    return { fogA, fogB };
  }
  _terrain(fogC, time) {
    const gl = this.gl;
    const world = this.world;
    const cam = this.cam;
    const fogA = cam.fogA, fogB = cam.fogB;
    const L = CHUNK * TS; // 32 unidades por chunk
    this._useTerrainGlobals(this.pTer);
    gl.uniform3f(this.uTer.uFog, fogC[0], fogC[1], fogC[2]);
    const ccx = Math.floor(world.tileAt(cam.x) / CHUNK);
    const ccz = Math.floor(world.tileAt(cam.z) / CHUNK);
    const R = Math.ceil((fogB + 84) / L);
    const farC = fogB + 90;
    const sinY = Math.sin(cam.yaw), cosY = Math.cos(cam.yaw);
    const wq = [];
    for (let dz = -R; dz <= R; dz++) {
      const cz = ccz + dz;
      if (cz < 0 || cz >= world.CHUNKS) continue;
      for (let dx = -R; dx <= R; dx++) {
        const cx = ccx + dx;
        if (cx < 0 || cx >= world.CHUNKS) continue;
        const cwx = world.tileCenter(cx * CHUNK + CHUNK / 2);
        const cwz = world.tileCenter(cz * CHUNK + CHUNK / 2);
        const ddx = cwx - cam.x, ddz = cwz - cam.z;
        if (ddx * ddx + ddz * ddz > farC * farC) continue;
        // cull traseiro simples (centro do chunk atrás da câmera)
        const fwd = ddx * sinY - ddz * cosY;
        if (fwd < -L) continue;
        this._chunkDraw(cx, cz);
        const cells = this._waterCellsOf(cx, cz);
        for (let ci = 0; ci < cells.length; ci++) wq.push(cells[ci][0], cells[ci][1], cells[ci][2]);
      }
    }
    if (wq.length) this._water(wq, time);
  }
  _chunkDraw(cx, cz) {
    const gl = this.gl;
    const world = this.world;
    const key = cx + '_' + cz;
    let ent = this.terLRU.get(key);
    if (!ent) {
      const parts = [];
      let verts = 0;
      for (let b = 0; b < 4; b++) {
        const buf = world.bandMesh(cx, cz, b);
        if (buf.length) { parts.push(buf); verts += buf.length / 7; }
      }
      if (!verts) { this.terLRU.set(key, null); return; }
      const data = new Float32Array(verts * 7);
      let off = 0;
      for (const p of parts) { data.set(p, off); off += p.length; }
      const bb = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, bb);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      ent = { buf: bb, verts };
      this.terLRU.set(key, ent);
      if (this.terLRU.size > 360) {
        let evict = 0;
        for (const [k, v] of this.terLRU) {
          if (k !== key && v && v.lastSeen !== undefined && v.lastSeen !== this._fid) {
            gl.deleteBuffer(v.buf); this.terLRU.delete(k);
          }
          if (++evict > 40) break;
        }
      }
    } else if (!ent) return;
    ent.lastSeen = this._fid;
    this.terLRU.delete(key);
    this.terLRU.set(key, ent);
    gl.bindBuffer(gl.ARRAY_BUFFER, ent.buf);
    const lp = this.attrLoc(this.pTer, 'aPos');
    gl.enableVertexAttribArray(lp);
    gl.vertexAttribPointer(lp, 3, gl.FLOAT, false, 28, 0);
    const lc = this.attrLoc(this.pTer, 'aCol');
    gl.enableVertexAttribArray(lc);
    gl.vertexAttribPointer(lc, 4, gl.FLOAT, false, 28, 12);
    gl.drawArrays(gl.TRIANGLES, 0, ent.verts);
  }
  _waterCellsOf(cx, cz) {
    const key = cx + '_' + cz;
    if (this._waterCells[key]) return this._waterCells[key];
    const world = this.world;
    const arr = [];
    const x0 = cx * CHUNK, z0 = cz * CHUNK;
    for (let z = z0; z < z0 + CHUNK; z++)
      for (let x = x0; x < x0 + CHUNK; x++) {
        if (x >= world.CELLS || z >= world.CELLS) continue;
        if (world.hOf(x, z) > 0) continue;
        const wx = world.tileCenter(x), wz = world.tileCenter(z);
        const shore = world.hOf(x - 1, z) > 0 || world.hOf(x + 1, z) > 0 || world.hOf(x, z - 1) > 0 || world.hOf(x, z + 1) > 0;
        arr.push([wx, wz, shore ? 1 : 0]);
      }
    this._waterCells[key] = arr;
    return arr;
  }
  _water(cells, time) {
    if (!cells.length) return;
    const gl = this.gl;
    const out = [];
    const y = WATER_Y;
    for (let i = 0; i < cells.length; i += 3) {
      const wx = cells[i], wz = cells[i + 1], shore = cells[i + 2];
      const gx = wx * 0.42, gz = wz * 0.42;
      const ph = Math.sin(gx * 1.13 + time * 1.15) + Math.sin(gz * 0.87 - time * 0.93) + Math.sin((gx + gz) * 0.61 + time * 0.7);
      const mixT = Math.max(0, Math.min(1, 0.30 + 0.28 * ph));
      let r = 0.05 + 0.15 * mixT;
      let gg = 0.12 + 0.26 * mixT;
      let bb = 0.30 + 0.32 * mixT;
      if (shore) { r *= 1.25; gg *= 1.2; bb *= 1.1; }
      out.push(
        wx - 1, y, wz - 1, r, gg, bb, 0.88,
        wx + 1, y, wz - 1, r, gg, bb, 0.88,
        wx + 1, y, wz + 1, r, gg, bb, 0.88,
        wx - 1, y, wz - 1, r, gg, bb, 0.88,
        wx + 1, y, wz + 1, r, gg, bb, 0.88,
        wx - 1, y, wz + 1, r, gg, bb, 0.88,
      );
    }
    if (!out.length) return;
    gl.useProgram(this.pTer);
    this._useTerrainGlobals(this.pTer);
    gl.uniform3f(this.uTer.uFog, this._fogC[0], this._fogC[1], this._fogC[2]);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.bufs.dyn);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(out), gl.DYNAMIC_DRAW);
    const lp = this.attrLoc(this.pTer, 'aPos');
    gl.enableVertexAttribArray(lp);
    gl.vertexAttribPointer(lp, 3, gl.FLOAT, false, 28, 0);
    const lc = this.attrLoc(this.pTer, 'aCol');
    gl.enableVertexAttribArray(lc);
    gl.vertexAttribPointer(lc, 4, gl.FLOAT, false, 28, 12);
    gl.drawArrays(gl.TRIANGLES, 0, out.length / 7);
  }
  _sprites(list, fogC) {
    if (!list.length) return;
    const gl = this.gl;
    const data = [];
    const u = this.uSpr;
    for (const s of list) {
      const dx = s.x - this.cam.x, dz = s.z - this.cam.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      const fogB = this.cam.fogB !== undefined ? this.cam.fogB : 215;
      if (dist > fogB) continue;
      const n = dist || 1;
      const rx = -dz / n, rz = dx / n;
      const hw = s.w / 2;
      const alpha = s.a !== undefined ? s.a : 1;
      const tint = s.tint || [1, 1, 1];
      const uv = this.atlas.uv(s.art);
      const x0 = s.x - rx * hw, z0 = s.z - rz * hw;
      const x1 = s.x + rx * hw, z1 = s.z + rz * hw;
      const yb = s.y, yt = s.y + s.h;
      const push = (x, y, z, uu, vv) => {
        data.push(x, y, z, uu, vv, tint[0], tint[1], tint[2], alpha);
      };
      push(x0, yb, z0, uv[0], uv[1]);
      push(x1, yb, z1, uv[2], uv[1]);
      push(x1, yt, z1, uv[2], uv[3]);
      push(x0, yb, z0, uv[0], uv[1]);
      push(x1, yt, z1, uv[2], uv[3]);
      push(x0, yt, z0, uv[0], uv[3]);
    }
    if (!data.length) return;
    gl.useProgram(this.pSpr);
    this._useTerrainGlobals(this.pSpr);
    gl.uniform3f(u.uFog, fogC[0], fogC[1], fogC[2]);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.bufs.spr);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.DYNAMIC_DRAW);
    gl.depthMask(false);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.atlas.tex);
    gl.uniform1i(this.uSpr.uTex, 0);
    const lp = this.attrLoc(this.pSpr, 'aPos');
    gl.enableVertexAttribArray(lp);
    gl.vertexAttribPointer(lp, 3, gl.FLOAT, false, 36, 0);
    const lu = this.attrLoc(this.pSpr, 'aUv');
    gl.enableVertexAttribArray(lu);
    gl.vertexAttribPointer(lu, 2, gl.FLOAT, false, 36, 12);
    const lt = this.attrLoc(this.pSpr, 'aTint');
    gl.enableVertexAttribArray(lt);
    gl.vertexAttribPointer(lt, 3, gl.FLOAT, false, 36, 20);
    const la = this.attrLoc(this.pSpr, 'aAlpha');
    gl.enableVertexAttribArray(la);
    gl.vertexAttribPointer(la, 1, gl.FLOAT, false, 36, 32);
    gl.drawArrays(gl.TRIANGLES, 0, data.length / 9);
    gl.depthMask(true);
  }
  _glows(list, time) {
    if (!list.length) return;
    const gl = this.gl;
    const data = [];
    for (const g of list) {
      const dx = g.x - this.cam.x, dz = g.z - this.cam.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist > (g.range || 40)) continue;
      const n = dist || 1;
      const rx = -dz / n, rz = dx / n;
      const hw = g.w / 2, hh = g.h / 2;
      const fade = Math.max(0, 1 - dist / (g.range || 40));
      const a = Math.max(0, g.a * fade * (0.55 + 0.45 * Math.sin(time * (g.sp || 2) + (g.ph || 0))));
      if (a < 0.005) continue;
      const y = g.y + (g.rise || 0);
      const x0 = g.x - rx * hw, z0 = g.z - rz * hw;
      const x1 = g.x + rx * hw, z1 = g.z + rz * hw;
      const push = (x, yy, z) => {
        data.push(x, yy, z, g.r, g.g, g.b, a);
      };
      push(x0, y, z0); push(x1, y, z1); push(x1, y + g.h, z1);
      push(x0, y, z0); push(x1, y + g.h, z1); push(x0, y + g.h, z0);
    }
    if (!data.length) return;
    gl.useProgram(this.pGlow);
    gl.uniformMatrix4fv(this.uGlow.uMVP, false, this.mvp);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.bufs.glow);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.DYNAMIC_DRAW);
    gl.depthMask(false);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    const lp = this.attrLoc(this.pGlow, 'aPos');
    gl.enableVertexAttribArray(lp);
    gl.vertexAttribPointer(lp, 3, gl.FLOAT, false, 28, 0);
    const lc = this.attrLoc(this.pGlow, 'aCol');
    gl.enableVertexAttribArray(lc);
    gl.vertexAttribPointer(lc, 4, gl.FLOAT, false, 28, 12);
    gl.drawArrays(gl.TRIANGLES, 0, data.length / 7);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(true);
  }
  render(cam, time, entities, glows, env) {
    const gl = this.gl;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    this.setCam(cam.x, cam.y, cam.z, cam.yaw, cam.pitch, 1.12,
      cam.fogA !== undefined ? cam.fogA : 70, cam.fogB !== undefined ? cam.fogB : 215);
    this._fid = (this._fid || 0) + 1;
    this._env = env || null;
    this._envTint = env && env.tint ? env.tint : [1, 1, 1];
    this._sky();
    let fogC;
    if (env && env.fog) fogC = env.fog;
    else if (env) fogC = [env.bot[0] * 0.5, env.bot[1] * 0.42, env.bot[2] * 0.5];
    else fogC = [0.17, 0.11, 0.18];
    this._fogC = fogC;
    this._terrain(fogC, time || 0);
    if (entities && entities.length) this._sprites(entities, fogC);
    if (glows && glows.length) this._glows(glows, time || 0);
  }
}
