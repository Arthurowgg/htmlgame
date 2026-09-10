import { mat4, mat4Multiply, mat4Perspective, mat4LookAt, clamp, lerp } from './math.js';

const VS = `
attribute vec3 aPos;
attribute vec4 aCol;
attribute vec3 aNrm;
uniform mat4 uMVP;
uniform mat4 uView;
uniform vec3 uEye;
uniform float uFogStart, uFogEnd;
varying vec4 vCol;
varying vec3 vNrm;
varying vec3 vWorld;
varying float vFog;
void main(){
  vec4 wp = vec4(aPos, 1.0);
  gl_Position = uMVP * wp;
  vWorld = aPos;
  vNrm = aNrm;
  vCol = aCol;
  float d = length(uEye - aPos);
  vFog = clamp((d - uFogStart) / max(uFogEnd - uFogStart, 0.001), 0.0, 1.0);
}`;

const FS = `
precision mediump float;
varying vec4 vCol;
varying vec3 vNrm;
varying vec3 vWorld;
varying float vFog;
uniform vec3 uFogColor;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uAmb;
uniform float uTime;
uniform float uDay;
void main(){
  vec3 N = normalize(vNrm);
  float ndl = max(0.0, dot(N, normalize(uSunDir)));
  // soft wrap lighting
  float wrap = ndl * 0.75 + 0.25;
  // sky bounce on tops
  float sky = max(0.0, N.y) * 0.18;
  vec3 lit = vCol.rgb * (uAmb + uSunColor * wrap + vec3(0.35,0.45,0.7) * sky);

  // specular sparkle on crystals / metal-ish (blue-heavy)
  if (vCol.b > 0.8 && vCol.r < 0.55) {
    float sp = pow(max(0.0, dot(N, normalize(uSunDir + vec3(0.0,0.4,0.0)))), 24.0);
    lit += sp * vec3(0.6, 0.9, 1.0);
    lit += (0.5 + 0.5 * sin(uTime * 5.0 + vWorld.x * 2.0 + vWorld.z)) * 0.12 * vec3(0.4,0.8,1.0);
  }
  // lava emissive
  if (vCol.r > 0.85 && vCol.g < 0.4) {
    lit += (0.5 + 0.5 * sin(uTime * 3.0 + vWorld.x + vWorld.z)) * vec3(1.0, 0.35, 0.05);
  }
  // neon emissive
  if (vCol.g > 0.85 && vCol.r < 0.35) {
    lit += vec3(0.15, 0.6, 0.45);
  }
  // gold
  if (vCol.r > 0.85 && vCol.g > 0.65 && vCol.b < 0.4) {
    lit += 0.2 * vec3(1.0, 0.85, 0.3);
  }

  // height-based cool/warm
  lit *= mix(vec3(0.92,0.95,1.05), vec3(1.05,1.0,0.95), clamp(vWorld.y / 20.0, 0.0, 1.0));

  float f = vFog * vFog * (3.0 - 2.0 * vFog);
  // sun bloom near horizon fog
  float sunGlow = pow(max(0.0, dot(normalize(vWorld - vec3(0.0)), normalize(uSunDir))), 8.0) * (1.0 - vFog);
  lit = mix(lit, uFogColor, f);
  lit += uSunColor * sunGlow * 0.15 * (1.0 - abs(uDay - 0.5) * 1.5);
  gl_FragColor = vec4(lit, vCol.a);
}`;

const VS_SPR = `
attribute vec3 aPos; attribute vec2 aUv; attribute vec4 aCol;
uniform mat4 uMVP;
varying vec2 vUv; varying vec4 vCol;
void main(){ gl_Position = uMVP * vec4(aPos,1.0); vUv=aUv; vCol=aCol; }`;
const FS_SPR = `
precision mediump float;
varying vec2 vUv; varying vec4 vCol;
uniform sampler2D uTex;
void main(){
  vec4 t = texture2D(uTex, vUv);
  if (t.a < 0.12) discard;
  gl_FragColor = vec4(t.rgb * vCol.rgb, t.a * vCol.a);
}`;

// Fullscreen god-ray / vignette pass (drawn as 2D overlay via simple tris)
const VS_FX = `
attribute vec2 aPos;
varying vec2 vUv;
void main(){ vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }`;
const FS_FX = `
precision mediump float;
varying vec2 vUv;
uniform vec3 uSunScreen; // xy 0..1, z strength
uniform float uTime;
uniform vec3 uTint;
void main(){
  vec2 uv = vUv;
  vec2 sun = uSunScreen.xy;
  float dist = length(uv - sun);
  // radial god rays via angular noise
  float ang = atan(uv.y - sun.y, uv.x - sun.x);
  float rays = 0.0;
  rays += pow(max(0.0, cos(ang * 12.0 + uTime * 0.4)), 4.0);
  rays += pow(max(0.0, cos(ang * 7.0 - uTime * 0.25)), 6.0) * 0.6;
  float shaft = rays * exp(-dist * 3.5) * uSunScreen.z;
  // vignette
  float vig = smoothstep(1.1, 0.35, length(uv - 0.5));
  vec3 col = uTint * shaft * 0.55;
  float a = clamp(shaft * 0.55 + (1.0 - vig) * 0.25, 0.0, 0.65);
  gl_FragColor = vec4(col, a);
}`;

function compile(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src); gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
  return s;
}
function program(gl, vs, fs) {
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
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
      aNrm: gl.getAttribLocation(this.prog, 'aNrm'),
      uMVP: gl.getUniformLocation(this.prog, 'uMVP'),
      uView: gl.getUniformLocation(this.prog, 'uView'),
      uEye: gl.getUniformLocation(this.prog, 'uEye'),
      uFogStart: gl.getUniformLocation(this.prog, 'uFogStart'),
      uFogEnd: gl.getUniformLocation(this.prog, 'uFogEnd'),
      uFogColor: gl.getUniformLocation(this.prog, 'uFogColor'),
      uSunDir: gl.getUniformLocation(this.prog, 'uSunDir'),
      uSunColor: gl.getUniformLocation(this.prog, 'uSunColor'),
      uAmb: gl.getUniformLocation(this.prog, 'uAmb'),
      uTime: gl.getUniformLocation(this.prog, 'uTime'),
      uDay: gl.getUniformLocation(this.prog, 'uDay'),
    };

    this.sprProg = program(gl, VS_SPR, FS_SPR);
    this.sprLoc = {
      aPos: gl.getAttribLocation(this.sprProg, 'aPos'),
      aUv: gl.getAttribLocation(this.sprProg, 'aUv'),
      aCol: gl.getAttribLocation(this.sprProg, 'aCol'),
      uMVP: gl.getUniformLocation(this.sprProg, 'uMVP'),
      uTex: gl.getUniformLocation(this.sprProg, 'uTex'),
    };

    this.fxProg = program(gl, VS_FX, FS_FX);
    this.fxLoc = {
      aPos: gl.getAttribLocation(this.fxProg, 'aPos'),
      uSunScreen: gl.getUniformLocation(this.fxProg, 'uSunScreen'),
      uTime: gl.getUniformLocation(this.fxProg, 'uTime'),
      uTint: gl.getUniformLocation(this.fxProg, 'uTint'),
    };
    this.fxVbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.fxVbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1,-1, 1,-1, -1,1,  -1,1, 1,-1, 1,1
    ]), gl.STATIC_DRAW);

    this.vboPos = gl.createBuffer();
    this.vboCol = gl.createBuffer();
    this.vboNrm = gl.createBuffer();
    this.meshCount = 0;
    this.chunkCX = null; this.chunkCZ = null;

    this.mvp = mat4(); this.proj = mat4(); this.view = mat4();
    this.atlas = this._buildAtlas();
    this.sprites = [];
    this.particles = [];
    this.time = 0;
    this.dayT = 0.35;
    this.sunDir = [0.4, 0.8, 0.3];
    this.sunColor = [1, 0.95, 0.85];
  }

  _buildAtlas() {
    const gl = this.gl;
    const c = document.createElement('canvas');
    c.width = 64; c.height = 64;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    const tile = (i, fn) => { const x = (i % 4) * 16, y = ((i / 4) | 0) * 16; fn(x, y); };
    const fill = (x,y,c_) => { ctx.fillStyle=c_; ctx.fillRect(x,y,16,16); };
    const r = (x,y,w,h,c_) => { ctx.fillStyle=c_; ctx.fillRect(x,y,w,h); };
    tile(0, (x,y) => { fill(x,y,'#5a9e6f'); r(x+4,y+4,3,3,'#1a1008'); r(x+9,y+4,3,3,'#1a1008'); r(x+6,y+11,4,2,'#1a1008'); });
    tile(1, (x,y) => { fill(x,y,'#6dce4a'); r(x+4,y+5,3,3,'#102'); r(x+9,y+5,3,3,'#102'); });
    tile(2, (x,y) => { fill(x,y,'#2a2040'); r(x+4,y+5,3,3,'#f44'); r(x+9,y+5,3,3,'#f44'); });
    tile(3, (x,y) => { fill(x,y,'#5ec8ff'); r(x+4,y+5,3,3,'#fff'); r(x+9,y+5,3,3,'#fff'); });
    tile(4, (x,y) => { fill(x,y,'#e8b84a'); r(x+4,y+5,3,3,'#1a1008'); r(x+9,y+5,3,3,'#1a1008'); });
    tile(5, (x,y) => { fill(x,y,'#8b1e3f'); r(x+3,y+4,4,4,'#ff0'); r(x+9,y+4,4,4,'#ff0'); });
    tile(6, (x,y) => { // item gem
      ctx.clearRect(x,y,16,16);
      ctx.fillStyle='#ffe566';
      ctx.beginPath(); ctx.moveTo(x+8,y+2); ctx.lineTo(x+14,y+8); ctx.lineTo(x+8,y+14); ctx.lineTo(x+2,y+8); ctx.fill();
    });
    tile(7, (x,y) => { // heart
      ctx.clearRect(x,y,16,16);
      ctx.fillStyle='#ff5d6c';
      ctx.beginPath();
      ctx.moveTo(x+8,y+13);
      ctx.bezierCurveTo(x+2,y+8, x+2,y+3, x+8,y+5);
      ctx.bezierCurveTo(x+14,y+3, x+14,y+8, x+8,y+13);
      ctx.fill();
    });
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
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
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vboNrm);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.normals, gl.STATIC_DRAW);
    this.meshCount = mesh.count;
  }

  maybeRebuild(world, px, pz, force = false) {
    const cx = Math.floor(px / 6) * 6;
    const cz = Math.floor(pz / 6) * 6;
    if (!force && this.chunkCX === cx && this.chunkCZ === cz) return false;
    this.chunkCX = cx; this.chunkCZ = cz;
    this.setMesh(world.buildChunkMesh(px, pz, 34));
    return true;
  }

  resize(cssW, cssH, scale = 2) {
    const iw = Math.max(480, Math.floor(cssW / Math.max(1, scale)));
    const ih = Math.max(270, Math.floor(cssH / Math.max(1, scale)));
    if (this.canvas.width !== iw || this.canvas.height !== ih) {
      this.canvas.width = iw; this.canvas.height = ih;
    }
    this.canvas.style.width = cssW + 'px';
    this.canvas.style.height = cssH + 'px';
    this.gl.viewport(0, 0, iw, ih);
    this.iw = iw; this.ih = ih;
  }

  skyColor(dayT) {
    const t = ((dayT % 1) + 1) % 1;
    const night=[0.04,0.05,0.12], dawn=[0.90,0.48,0.32], day=[0.42,0.68,0.95], dusk=[0.92,0.42,0.28];
    let a,b,k;
    if (t < 0.2) { a=night; b=dawn; k=t/0.2; }
    else if (t < 0.3) { a=dawn; b=day; k=(t-0.2)/0.1; }
    else if (t < 0.7) { a=day; b=day; k=0; }
    else if (t < 0.8) { a=day; b=dusk; k=(t-0.7)/0.1; }
    else { a=dusk; b=night; k=(t-0.8)/0.2; }
    return [lerp(a[0],b[0],k), lerp(a[1],b[1],k), lerp(a[2],b[2],k)];
  }

  updateSun(dayT) {
    // sun arcs across sky
    const ang = (dayT - 0.25) * Math.PI * 2;
    this.sunDir = [Math.cos(ang) * 0.7, Math.sin(ang), Math.sin(ang * 0.5) * 0.4];
    // normalize
    const l = Math.hypot(...this.sunDir) || 1;
    this.sunDir = this.sunDir.map(v => v / l);
    const h = Math.max(0, this.sunDir[1]);
    if (h > 0.15) this.sunColor = [1.0, 0.95, 0.85];
    else if (h > 0) this.sunColor = [1.0, 0.55, 0.30];
    else this.sunColor = [0.35, 0.45, 0.75];
  }

  begin(cam, time, dayT) {
    this.time = time; this.dayT = dayT;
    this.updateSun(dayT);
    const gl = this.gl;
    const sky = this.skyColor(dayT);
    gl.clearColor(sky[0], sky[1], sky[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    const aspect = this.iw / Math.max(1, this.ih);
    mat4Perspective(this.proj, (72 * Math.PI) / 180, aspect, 0.08, 140);
    mat4LookAt(this.view, cam.x, cam.y, cam.z, cam.x + cam.fx, cam.y + cam.fy, cam.z + cam.fz, 0, 1, 0);
    mat4Multiply(this.mvp, this.proj, this.view);

    const night = dayT < 0.2 || dayT > 0.85;
    const amb = night ? [0.18, 0.20, 0.32] : [0.32, 0.34, 0.40];

    gl.useProgram(this.prog);
    gl.uniformMatrix4fv(this.loc.uMVP, false, this.mvp);
    gl.uniformMatrix4fv(this.loc.uView, false, this.view);
    gl.uniform3f(this.loc.uEye, cam.x, cam.y, cam.z);
    gl.uniform1f(this.loc.uFogStart, night ? 22 : 36);
    gl.uniform1f(this.loc.uFogEnd, night ? 55 : 85);
    gl.uniform3fv(this.loc.uFogColor, sky);
    gl.uniform3fv(this.loc.uSunDir, this.sunDir);
    gl.uniform3fv(this.loc.uSunColor, this.sunColor);
    gl.uniform3fv(this.loc.uAmb, amb);
    gl.uniform1f(this.loc.uTime, time);
    gl.uniform1f(this.loc.uDay, dayT);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.vboPos);
    gl.enableVertexAttribArray(this.loc.aPos);
    gl.vertexAttribPointer(this.loc.aPos, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vboCol);
    gl.enableVertexAttribArray(this.loc.aCol);
    gl.vertexAttribPointer(this.loc.aCol, 4, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vboNrm);
    gl.enableVertexAttribArray(this.loc.aNrm);
    gl.vertexAttribPointer(this.loc.aNrm, 3, gl.FLOAT, false, 0, 0);

    if (this.meshCount) gl.drawArrays(gl.TRIANGLES, 0, this.meshCount);
  }

  drawSprite(x, y, z, tile, w = 0.8, h = 0.8, tint = [1,1,1,1], cam) {
    const yaw = Math.atan2(cam.fx, cam.fz);
    const cos = Math.cos(yaw), sin = Math.sin(yaw);
    const hw = w / 2;
    const tx = (tile % 4) / 4, ty = Math.floor(tile / 4) / 4;
    const u0 = tx, v0 = ty, u1 = tx + 0.25, v1 = ty + 0.25;
    const lx = cos, lz = -sin;
    const verts = [
      x - lx*hw, y, z - lz*hw, u0, v1,
      x + lx*hw, y, z + lz*hw, u1, v1,
      x + lx*hw, y+h, z + lz*hw, u1, v0,
      x - lx*hw, y, z - lz*hw, u0, v1,
      x + lx*hw, y+h, z + lz*hw, u1, v0,
      x - lx*hw, y+h, z - lz*hw, u0, v0,
    ];
    this.sprites.push({ verts, tint });
  }

  flushSprites() {
    if (!this.sprites.length) return;
    const gl = this.gl;
    const data = [], cols = [];
    for (const s of this.sprites) {
      for (let i = 0; i < 6; i++) {
        const o = i * 5;
        data.push(s.verts[o], s.verts[o+1], s.verts[o+2], s.verts[o+3], s.verts[o+4]);
        cols.push(s.tint[0], s.tint[1], s.tint[2], s.tint[3]);
      }
    }
    if (!this.sprPos) { this.sprPos = gl.createBuffer(); this.sprCol = gl.createBuffer(); }
    gl.useProgram(this.sprProg);
    gl.uniformMatrix4fv(this.sprLoc.uMVP, false, this.mvp);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.atlas);
    gl.uniform1i(this.sprLoc.uTex, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.sprPos);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(this.sprLoc.aPos);
    gl.vertexAttribPointer(this.sprLoc.aPos, 3, gl.FLOAT, false, 20, 0);
    gl.enableVertexAttribArray(this.sprLoc.aUv);
    gl.vertexAttribPointer(this.sprLoc.aUv, 2, gl.FLOAT, false, 20, 12);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.sprCol);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(cols), gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(this.sprLoc.aCol);
    gl.vertexAttribPointer(this.sprLoc.aCol, 4, gl.FLOAT, false, 0, 0);
    gl.depthMask(false);
    gl.drawArrays(gl.TRIANGLES, 0, data.length / 5);
    gl.depthMask(true);
    this.sprites.length = 0;
  }

  addParticle(x,y,z,vx,vy,vz,life,color) {
    this.particles.push({ x,y,z,vx,vy,vz,life,max:life,color });
  }
  updateParticles(dt, cam) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) { this.particles.splice(i,1); continue; }
      p.x += p.vx*dt; p.y += p.vy*dt; p.z += p.vz*dt; p.vy -= 6*dt;
      const a = clamp(p.life / p.max, 0, 1);
      this.drawSprite(p.x, p.y, p.z, 6, 0.28, 0.28, [p.color[0],p.color[1],p.color[2],a], cam);
    }
  }

  /** Project sun to screen and draw god-ray overlay */
  drawGodRays(cam) {
    const gl = this.gl;
    // sun position in world far away
    const sunDist = 80;
    const sx = cam.x + this.sunDir[0] * sunDist;
    const sy = cam.y + this.sunDir[1] * sunDist;
    const sz = cam.z + this.sunDir[2] * sunDist;
    // clip
    const m = this.mvp;
    const x = m[0]*sx + m[4]*sy + m[8]*sz + m[12];
    const y = m[1]*sx + m[5]*sy + m[9]*sz + m[13];
    const w = m[3]*sx + m[7]*sy + m[11]*sz + m[15];
    if (w <= 0.1) return; // behind
    const ndcX = x / w, ndcY = y / w;
    const u = ndcX * 0.5 + 0.5;
    const v = ndcY * 0.5 + 0.5;
    const strength = clamp(this.sunDir[1] * 1.4 + 0.15, 0, 1) * 0.9;
    if (strength < 0.05) return;

    gl.disable(gl.DEPTH_TEST);
    gl.useProgram(this.fxProg);
    gl.uniform3f(this.fxLoc.uSunScreen, u, v, strength);
    gl.uniform1f(this.fxLoc.uTime, this.time);
    gl.uniform3fv(this.fxLoc.uTint, this.sunColor);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.fxVbo);
    gl.enableVertexAttribArray(this.fxLoc.aPos);
    gl.vertexAttribPointer(this.fxLoc.aPos, 2, gl.FLOAT, false, 0, 0);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.enable(gl.DEPTH_TEST);
  }
}
