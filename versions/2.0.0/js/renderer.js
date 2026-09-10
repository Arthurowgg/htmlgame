import { mat4, mat4Identity, mat4Multiply, mat4Perspective, mat4LookAt, clamp, lerp } from './math.js';
import { BLOCK_COLOR, WATER } from './world.js';

const VS = `
attribute vec3 aPos;
attribute vec4 aCol;
uniform mat4 uMVP;
uniform vec3 uEye;
uniform float uFogStart;
uniform float uFogEnd;
uniform float uTime;
varying vec4 vCol;
varying float vFog;
varying vec3 vWorld;
void main(){
  vec3 p = aPos;
  // subtle water shimmer via color only; geometry stays
  gl_Position = uMVP * vec4(p, 1.0);
  vWorld = p;
  vCol = aCol;
  float d = length(uEye - p);
  vFog = clamp((d - uFogStart) / max(uFogEnd - uFogStart, 0.001), 0.0, 1.0);
}`;

const FS = `
precision mediump float;
varying vec4 vCol;
varying float vFog;
varying vec3 vWorld;
uniform vec3 uFogColor;
uniform vec3 uSunDir;
uniform vec3 uAmbient;
uniform vec3 uSunColor;
uniform float uTime;
void main(){
  vec3 col = vCol.rgb;
  // cheap fake lighting from height-ish
  float shade = 0.75 + 0.25 * col.g;
  col *= shade;
  // crystal sparkle
  if (col.b > 0.85 && col.r < 0.6) {
    float sp = sin(vWorld.x * 3.0 + vWorld.z * 2.0 + uTime * 4.0) * 0.5 + 0.5;
    col += sp * 0.15 * vec3(0.5, 0.8, 1.0);
  }
  // lava glow
  if (col.r > 0.85 && col.g < 0.45) {
    float g = sin(uTime * 3.0 + vWorld.x + vWorld.z) * 0.5 + 0.5;
    col += g * 0.2 * vec3(1.0, 0.4, 0.0);
  }
  float f = vFog * vFog * (3.0 - 2.0 * vFog);
  col = mix(col, uFogColor, f);
  gl_FragColor = vec4(col, vCol.a);
}`;

const VS_SPR = `
attribute vec3 aPos;
attribute vec2 aUv;
attribute vec4 aCol;
uniform mat4 uMVP;
varying vec2 vUv;
varying vec4 vCol;
void main(){
  gl_Position = uMVP * vec4(aPos, 1.0);
  vUv = aUv; vCol = aCol;
}`;
const FS_SPR = `
precision mediump float;
varying vec2 vUv;
varying vec4 vCol;
uniform sampler2D uTex;
void main(){
  vec4 t = texture2D(uTex, vUv);
  if (t.a < 0.1) discard;
  gl_FragColor = vec4(t.rgb * vCol.rgb, t.a * vCol.a);
}`;

function compile(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(s));
  }
  return s;
}
function program(gl, vs, fs) {
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(p));
  }
  return p;
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl', {
      antialias: false, alpha: false, depth: true, powerPreference: 'high-performance',
    });
    if (!gl) throw new Error('WebGL not available');
    this.gl = gl;
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    this.prog = program(gl, VS, FS);
    this.loc = {
      aPos: gl.getAttribLocation(this.prog, 'aPos'),
      aCol: gl.getAttribLocation(this.prog, 'aCol'),
      uMVP: gl.getUniformLocation(this.prog, 'uMVP'),
      uEye: gl.getUniformLocation(this.prog, 'uEye'),
      uFogStart: gl.getUniformLocation(this.prog, 'uFogStart'),
      uFogEnd: gl.getUniformLocation(this.prog, 'uFogEnd'),
      uFogColor: gl.getUniformLocation(this.prog, 'uFogColor'),
      uTime: gl.getUniformLocation(this.prog, 'uTime'),
      uSunDir: gl.getUniformLocation(this.prog, 'uSunDir'),
      uAmbient: gl.getUniformLocation(this.prog, 'uAmbient'),
      uSunColor: gl.getUniformLocation(this.prog, 'uSunColor'),
    };

    this.sprProg = program(gl, VS_SPR, FS_SPR);
    this.sprLoc = {
      aPos: gl.getAttribLocation(this.sprProg, 'aPos'),
      aUv: gl.getAttribLocation(this.sprProg, 'aUv'),
      aCol: gl.getAttribLocation(this.sprProg, 'aCol'),
      uMVP: gl.getUniformLocation(this.sprProg, 'uMVP'),
      uTex: gl.getUniformLocation(this.sprProg, 'uTex'),
    };

    this.vboPos = gl.createBuffer();
    this.vboCol = gl.createBuffer();
    this.meshCount = 0;
    this.chunkCX = null;
    this.chunkCZ = null;

    this.mvp = mat4();
    this.proj = mat4();
    this.view = mat4();
    this.tmp = mat4();

    this.atlas = this._buildAtlas();
    this.sprites = [];
    this.particles = [];
    this.time = 0;
    this.dayT = 0.35; // 0..1
  }

  _buildAtlas() {
    const gl = this.gl;
    const c = document.createElement('canvas');
    c.width = 64; c.height = 64;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    // 4x4 tiles of 16px for entity skins
    const tiles = [
      // 0 player body
      () => { fill(ctx, 0, 0, '#5a9e6f'); rect(ctx, 4, 4, 8, 8, '#1a1008'); rect(ctx, 6, 14, 4, 2, '#1a1008'); },
      // 1 slime
      () => { fill(ctx, 16, 0, '#6dce4a'); rect(ctx, 20, 6, 3, 3, '#102'); rect(ctx, 25, 6, 3, 3, '#102'); },
      // 2 shadow
      () => { fill(ctx, 32, 0, '#2a2040'); rect(ctx, 36, 6, 3, 3, '#f44'); rect(ctx, 41, 6, 3, 3, '#f44'); },
      // 3 crystal golem
      () => { fill(ctx, 48, 0, '#5ec8ff'); rect(ctx, 52, 6, 3, 3, '#fff'); rect(ctx, 57, 6, 3, 3, '#fff'); },
      // 4 npc
      () => { fill(ctx, 0, 16, '#e8b84a'); rect(ctx, 4, 20, 3, 3, '#1a1008'); rect(ctx, 9, 20, 3, 3, '#1a1008'); },
      // 5 boss
      () => { fill(ctx, 16, 16, '#8b1e3f'); rect(ctx, 20, 20, 4, 4, '#ff0'); rect(ctx, 28, 20, 4, 4, '#ff0'); },
      // 6 item star
      () => { fill(ctx, 32, 16, '#0000'); star(ctx, 40, 24, 6, '#ffe566'); },
      // 7 heart
      () => { fill(ctx, 48, 16, '#0000'); heart(ctx, 56, 24, '#ff5d6c'); },
    ];
    tiles.forEach(fn => fn());
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return tex;
  }

  setMesh(mesh) {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vboPos);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.positions, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vboCol);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.colors, gl.STATIC_DRAW);
    this.meshCount = mesh.count;
  }

  maybeRebuild(world, px, pz, force = false) {
    const cx = Math.floor(px / 8) * 8;
    const cz = Math.floor(pz / 8) * 8;
    if (!force && this.chunkCX === cx && this.chunkCZ === cz) return false;
    this.chunkCX = cx; this.chunkCZ = cz;
    const mesh = world.buildChunkMesh(px, pz, 30);
    this.setMesh(mesh);
    return true;
  }

  resize(cssW, cssH, scale = 2) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    // internal pixel resolution for chunky look
    const iw = Math.max(320, Math.floor(cssW / scale));
    const ih = Math.max(180, Math.floor(cssH / scale));
    if (this.canvas.width !== iw || this.canvas.height !== ih) {
      this.canvas.width = iw;
      this.canvas.height = ih;
    }
    this.canvas.style.width = cssW + 'px';
    this.canvas.style.height = cssH + 'px';
    this.gl.viewport(0, 0, iw, ih);
    this.iw = iw; this.ih = ih;
  }

  skyColor(dayT) {
    // dayT 0 night .. 0.25 dawn .. 0.5 noon .. 0.75 dusk .. 1 night
    const t = ((dayT % 1) + 1) % 1;
    const night = [0.05, 0.06, 0.12];
    const dawn = [0.85, 0.45, 0.30];
    const day = [0.45, 0.70, 0.95];
    const dusk = [0.90, 0.40, 0.25];
    let a, b, k;
    if (t < 0.2) { a = night; b = dawn; k = t / 0.2; }
    else if (t < 0.3) { a = dawn; b = day; k = (t - 0.2) / 0.1; }
    else if (t < 0.7) { a = day; b = day; k = 0; }
    else if (t < 0.8) { a = day; b = dusk; k = (t - 0.7) / 0.1; }
    else { a = dusk; b = night; k = (t - 0.8) / 0.2; }
    return [
      lerp(a[0], b[0], k),
      lerp(a[1], b[1], k),
      lerp(a[2], b[2], k),
    ];
  }

  begin(cam, time, dayT) {
    this.time = time;
    this.dayT = dayT;
    const gl = this.gl;
    const sky = this.skyColor(dayT);
    gl.clearColor(sky[0], sky[1], sky[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    const aspect = this.iw / Math.max(1, this.ih);
    mat4Perspective(this.proj, (70 * Math.PI) / 180, aspect, 0.1, 120);
    mat4LookAt(
      this.view,
      cam.x, cam.y, cam.z,
      cam.x + cam.fx, cam.y + cam.fy, cam.z + cam.fz,
      0, 1, 0
    );
    mat4Multiply(this.mvp, this.proj, this.view);

    gl.useProgram(this.prog);
    gl.uniformMatrix4fv(this.loc.uMVP, false, this.mvp);
    gl.uniform3f(this.loc.uEye, cam.x, cam.y, cam.z);
    const night = dayT < 0.2 || dayT > 0.85;
    gl.uniform1f(this.loc.uFogStart, night ? 18 : 28);
    gl.uniform1f(this.loc.uFogEnd, night ? 48 : 70);
    gl.uniform3fv(this.loc.uFogColor, sky);
    gl.uniform1f(this.loc.uTime, time);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.vboPos);
    gl.enableVertexAttribArray(this.loc.aPos);
    gl.vertexAttribPointer(this.loc.aPos, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vboCol);
    gl.enableVertexAttribArray(this.loc.aCol);
    gl.vertexAttribPointer(this.loc.aCol, 4, gl.FLOAT, false, 0, 0);

    if (this.meshCount) gl.drawArrays(gl.TRIANGLES, 0, this.meshCount);
  }

  /** queue a billboard sprite (tile index 0..7) */
  drawSprite(x, y, z, tile, w = 0.8, h = 0.8, tint = [1, 1, 1, 1], cam) {
    // build billboard facing camera yaw
    const yaw = Math.atan2(cam.fx, cam.fz);
    const cos = Math.cos(yaw), sin = Math.sin(yaw);
    const hw = w / 2;
    // corners
    const tx = (tile % 4) / 4;
    const ty = Math.floor(tile / 4) / 4;
    const tw = 0.25, th = 0.25;
    const u0 = tx, v0 = ty, u1 = tx + tw, v1 = ty + th;
    // billboard left-right axis is perpendicular to forward on XZ
    const lx = cos, lz = -sin;
    const verts = [
      x - lx * hw, y,     z - lz * hw, u0, v1,
      x + lx * hw, y,     z + lz * hw, u1, v1,
      x + lx * hw, y + h, z + lz * hw, u1, v0,
      x - lx * hw, y,     z - lz * hw, u0, v1,
      x + lx * hw, y + h, z + lz * hw, u1, v0,
      x - lx * hw, y + h, z - lz * hw, u0, v0,
    ];
    this.sprites.push({ verts, tint });
  }

  flushSprites(cam) {
    if (!this.sprites.length) return;
    const gl = this.gl;
    const data = [];
    const cols = [];
    for (const s of this.sprites) {
      for (let i = 0; i < 6; i++) {
        const o = i * 5;
        data.push(s.verts[o], s.verts[o + 1], s.verts[o + 2], s.verts[o + 3], s.verts[o + 4]);
        cols.push(s.tint[0], s.tint[1], s.tint[2], s.tint[3]);
      }
    }
    const n = data.length / 5;
    if (!this.sprPos) {
      this.sprPos = gl.createBuffer();
      this.sprCol = gl.createBuffer();
    }
    // interleaved pos+uv
    const buf = new Float32Array(data);
    const cbuf = new Float32Array(cols);
    gl.useProgram(this.sprProg);
    gl.uniformMatrix4fv(this.sprLoc.uMVP, false, this.mvp);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.atlas);
    gl.uniform1i(this.sprLoc.uTex, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.sprPos);
    gl.bufferData(gl.ARRAY_BUFFER, buf, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(this.sprLoc.aPos);
    gl.vertexAttribPointer(this.sprLoc.aPos, 3, gl.FLOAT, false, 20, 0);
    gl.enableVertexAttribArray(this.sprLoc.aUv);
    gl.vertexAttribPointer(this.sprLoc.aUv, 2, gl.FLOAT, false, 20, 12);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.sprCol);
    gl.bufferData(gl.ARRAY_BUFFER, cbuf, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(this.sprLoc.aCol);
    gl.vertexAttribPointer(this.sprLoc.aCol, 4, gl.FLOAT, false, 0, 0);

    gl.depthMask(false);
    gl.drawArrays(gl.TRIANGLES, 0, n);
    gl.depthMask(true);
    this.sprites.length = 0;
  }

  addParticle(x, y, z, vx, vy, vz, life, color) {
    this.particles.push({ x, y, z, vx, vy, vz, life, max: life, color });
  }

  updateParticles(dt, cam) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) { this.particles.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      p.vy -= 6 * dt;
      const a = clamp(p.life / p.max, 0, 1);
      this.drawSprite(p.x, p.y, p.z, 6, 0.25, 0.25, [p.color[0], p.color[1], p.color[2], a], cam);
    }
  }
}

function fill(ctx, x, y, c) {
  ctx.fillStyle = c;
  ctx.fillRect(x, y, 16, 16);
}
function rect(ctx, x, y, w, h, c) {
  ctx.fillStyle = c;
  ctx.fillRect(x, y, w, h);
}
function star(ctx, cx, cy, r, c) {
  ctx.fillStyle = c;
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + i * Math.PI * 2 / 5;
    const b = a + Math.PI / 5;
    ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    ctx.lineTo(cx + Math.cos(b) * r * 0.4, cy + Math.sin(b) * r * 0.4);
  }
  ctx.closePath();
  ctx.fill();
}
function heart(ctx, cx, cy, c) {
  ctx.fillStyle = c;
  ctx.beginPath();
  ctx.moveTo(cx, cy + 4);
  ctx.bezierCurveTo(cx - 8, cy - 2, cx - 4, cy - 8, cx, cy - 4);
  ctx.bezierCurveTo(cx + 4, cy - 8, cx + 8, cy - 2, cx, cy + 4);
  ctx.fill();
}
