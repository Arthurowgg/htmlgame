export const PI = Math.PI, TAU = Math.PI * 2;
export function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
export function lerp(a, b, t) { return a + (b - a) * t; }
export function smoothstep(e0, e1, x) {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}
export function dist2(ax, az, bx, bz) { return Math.hypot(ax - bx, az - bz); }
export function hash2(x, z, seed = 0) {
  let n = Math.imul(x | 0, 374761393) + Math.imul(z | 0, 668265263) + (seed | 0) * 982451653;
  n = (n ^ (n >>> 13)) * 1274126177;
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}
export function valueNoise2(x, z, seed = 0) {
  const x0 = Math.floor(x), z0 = Math.floor(z);
  const fx = x - x0, fz = z - z0;
  const sx = fx * fx * (3 - 2 * fx), sz = fz * fz * (3 - 2 * fz);
  const a = hash2(x0, z0, seed), b = hash2(x0 + 1, z0, seed);
  const c = hash2(x0, z0 + 1, seed), d = hash2(x0 + 1, z0 + 1, seed);
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
export function mulberry32(seed) {
  let s = seed | 0;
  return function () {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function mat4() {
  return new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);
}
export function mat4Multiply(o, a, b) {
  const a00=a[0],a01=a[1],a02=a[2],a03=a[3],a10=a[4],a11=a[5],a12=a[6],a13=a[7];
  const a20=a[8],a21=a[9],a22=a[10],a23=a[11],a30=a[12],a31=a[13],a32=a[14],a33=a[15];
  for (let i = 0; i < 4; i++) {
    const bi0=b[i*4], bi1=b[i*4+1], bi2=b[i*4+2], bi3=b[i*4+3];
    o[i*4]   = a00*bi0 + a10*bi1 + a20*bi2 + a30*bi3;
    o[i*4+1] = a01*bi0 + a11*bi1 + a21*bi2 + a31*bi3;
    o[i*4+2] = a02*bi0 + a12*bi1 + a22*bi2 + a32*bi3;
    o[i*4+3] = a03*bi0 + a13*bi1 + a23*bi2 + a33*bi3;
  }
  return o;
}
export function mat4Perspective(o, fovy, aspect, near, far) {
  const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
  o.set([f/aspect,0,0,0, 0,f,0,0, 0,0,(far+near)*nf,-1, 0,0,2*far*near*nf,0]);
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
  o.set([xx,yx,zx,0, xy,yy,zy,0, xz,yz,zz,0,
    -(xx*ex+xy*ey+xz*ez), -(yx*ex+yy*ey+yz*ez), -(zx*ex+zy*ey+zz*ez), 1]);
  return o;
}
