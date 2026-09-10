export const PI = Math.PI;
export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;

export function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
export function lerp(a, b, t) { return a + (b - a) * t; }
export function smoothstep(e0, e1, x) {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}
export function mix(a, b, t) { return lerp(a, b, t); }
export function rand(a = 0, b = 1) { return a + Math.random() * (b - a); }
export function randInt(a, b) { return (a + Math.random() * (b - a + 1)) | 0; }
export function chance(p) { return Math.random() < p; }
export function len2(x, z) { return Math.hypot(x, z); }
export function len3(x, y, z) { return Math.hypot(x, y, z); }
export function dist2(ax, az, bx, bz) { return Math.hypot(ax - bx, az - bz); }
export function dist3(ax, ay, az, bx, by, bz) { return Math.hypot(ax - bx, ay - by, az - bz); }
export function angleWrap(a) {
  while (a > PI) a -= TAU;
  while (a < -PI) a += TAU;
  return a;
}

/** Mulberry32 */
export function mulberry32(seed) {
  let s = seed | 0;
  return function () {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 2D value noise */
export function hash2(x, z, seed = 0) {
  let n = Math.imul(x | 0, 374761393) + Math.imul(z | 0, 668265263) + (seed | 0) * 982451653;
  n = (n ^ (n >>> 13)) * 1274126177;
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}
export function valueNoise2(x, z, seed = 0) {
  const x0 = Math.floor(x), z0 = Math.floor(z);
  const fx = x - x0, fz = z - z0;
  const sx = fx * fx * (3 - 2 * fx);
  const sz = fz * fz * (3 - 2 * fz);
  const a = hash2(x0, z0, seed);
  const b = hash2(x0 + 1, z0, seed);
  const c = hash2(x0, z0 + 1, seed);
  const d = hash2(x0 + 1, z0 + 1, seed);
  return lerp(lerp(a, b, sx), lerp(c, d, sx), sz);
}
export function fbm(x, z, seed = 0, oct = 4) {
  let a = 0, amp = 0.5, f = 1, n = 0;
  for (let i = 0; i < oct; i++) {
    a += valueNoise2(x * f, z * f, seed + i * 101) * amp;
    n += amp; amp *= 0.5; f *= 2;
  }
  return a / n;
}

/* ---------- mat4 (column-major) ---------- */
export function mat4() {
  return new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);
}
export function mat4Identity(o) {
  o.set([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]); return o;
}
export function mat4Multiply(o, a, b) {
  const a00=a[0],a01=a[1],a02=a[2],a03=a[3],a10=a[4],a11=a[5],a12=a[6],a13=a[7];
  const a20=a[8],a21=a[9],a22=a[10],a23=a[11],a30=a[12],a31=a[13],a32=a[14],a33=a[15];
  const b00=b[0],b01=b[1],b02=b[2],b03=b[3],b10=b[4],b11=b[5],b12=b[6],b13=b[7];
  const b20=b[8],b21=b[9],b22=b[10],b23=b[11],b30=b[12],b31=b[13],b32=b[14],b33=b[15];
  o[0]=a00*b00+a10*b01+a20*b02+a30*b03;
  o[1]=a01*b00+a11*b01+a21*b02+a31*b03;
  o[2]=a02*b00+a12*b01+a22*b02+a32*b03;
  o[3]=a03*b00+a13*b01+a23*b02+a33*b03;
  o[4]=a00*b10+a10*b11+a20*b12+a30*b13;
  o[5]=a01*b10+a11*b11+a21*b12+a31*b13;
  o[6]=a02*b10+a12*b11+a22*b12+a32*b13;
  o[7]=a03*b10+a13*b11+a23*b12+a33*b13;
  o[8]=a00*b20+a10*b21+a20*b22+a30*b23;
  o[9]=a01*b20+a11*b21+a21*b22+a31*b23;
  o[10]=a02*b20+a12*b21+a22*b22+a32*b23;
  o[11]=a03*b20+a13*b21+a23*b22+a33*b23;
  o[12]=a00*b30+a10*b31+a20*b32+a30*b33;
  o[13]=a01*b30+a11*b31+a21*b32+a31*b33;
  o[14]=a02*b30+a12*b31+a22*b32+a32*b33;
  o[15]=a03*b30+a13*b31+a23*b32+a33*b33;
  return o;
}
export function mat4Perspective(o, fovy, aspect, near, far) {
  const f = 1 / Math.tan(fovy / 2);
  const nf = 1 / (near - far);
  o.set([
    f/aspect,0,0,0,
    0,f,0,0,
    0,0,(far+near)*nf,-1,
    0,0,(2*far*near)*nf,0
  ]);
  return o;
}
export function mat4LookAt(o, ex,ey,ez, cx,cy,cz, ux,uy,uz) {
  let zx = ex-cx, zy = ey-cy, zz = ez-cz;
  let len = 1 / (Math.hypot(zx,zy,zz) || 1);
  zx*=len; zy*=len; zz*=len;
  let xx = uy*zz - uz*zy, xy = uz*zx - ux*zz, xz = ux*zy - uy*zx;
  len = 1 / (Math.hypot(xx,xy,xz) || 1);
  xx*=len; xy*=len; xz*=len;
  const yx = zy*xz - zz*xy, yy = zz*xx - zx*xz, yz = zx*xy - zy*xx;
  o.set([
    xx, yx, zx, 0,
    xy, yy, zy, 0,
    xz, yz, zz, 0,
    -(xx*ex+xy*ey+xz*ez),
    -(yx*ex+yy*ey+yz*ez),
    -(zx*ex+zy*ey+zz*ez),
    1
  ]);
  return o;
}
export function mat4MultiplyVec4(m, x,y,z,w=1) {
  return [
    m[0]*x + m[4]*y + m[8]*z + m[12]*w,
    m[1]*x + m[5]*y + m[9]*z + m[13]*w,
    m[2]*x + m[6]*y + m[10]*z + m[14]*w,
    m[3]*x + m[7]*y + m[11]*z + m[15]*w,
  ];
}
