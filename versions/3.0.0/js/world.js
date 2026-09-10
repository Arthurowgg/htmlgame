import { fbm, hash2, mulberry32, clamp, dist2, lerp } from './math.js';

export const WORLD_R = 110;
export const WATER_Y = 4.0;

export const AIR=0, GRASS=1, DIRT=2, SAND=3, STONE=4, WATER=5, WOOD=6, LEAF=7,
  COBBLE=8, PLANKS=9, ROOF=10, BRICK=11, GLASS=12, METAL=13, GOLD=14,
  CRYSTAL=15, PATH=16, CROPS=17, FLOWER=18, SNOW=19, LAVA=20, NEON=21;

export const BLOCK_COLOR = {
  [GRASS]:[0.30,0.68,0.28], [DIRT]:[0.45,0.30,0.16], [SAND]:[0.90,0.82,0.55],
  [STONE]:[0.52,0.55,0.60], [WATER]:[0.12,0.42,0.78], [WOOD]:[0.48,0.30,0.14],
  [LEAF]:[0.18,0.52,0.22], [COBBLE]:[0.45,0.46,0.50], [PLANKS]:[0.68,0.52,0.30],
  [ROOF]:[0.72,0.20,0.16], [BRICK]:[0.62,0.28,0.22], [GLASS]:[0.55,0.78,0.95],
  [METAL]:[0.70,0.74,0.80], [GOLD]:[0.95,0.78,0.22], [CRYSTAL]:[0.40,0.85,1.0],
  [PATH]:[0.58,0.52,0.40], [CROPS]:[0.55,0.78,0.28], [FLOWER]:[0.95,0.40,0.70],
  [SNOW]:[0.92,0.95,1.0], [LAVA]:[0.95,0.32,0.06], [NEON]:[0.20,0.95,0.70],
};
export const SOLID = new Set([
  GRASS,DIRT,SAND,STONE,WOOD,COBBLE,PLANKS,ROOF,BRICK,METAL,GOLD,CRYSTAL,PATH,SNOW,NEON,
]);
export const TRANSLUCENT = new Set([WATER, GLASS, FLOWER, CROPS, LEAF]);

/** Named POIs like a battle-royale island — original "Lumina Isle" */
export const POIS = [
  { id:'spawn',   name:'Haven Plaza',     x:0,   z:0,   r:14, kind:'city',  color:'#e8b84a', discR:18 },
  { id:'market',  name:'Sun Market',      x:22,  z:8,   r:10, kind:'city',  color:'#ffb35c', discR:16 },
  { id:'docks',   name:'Tide Docks',      x:38,  z:28,  r:12, kind:'city',  color:'#5ec8ff', discR:18 },
  { id:'farm',    name:'Golden Fields',   x:30,  z:-22, r:14, kind:'farm',  color:'#a8d86a', discR:20 },
  { id:'forest',  name:'Whisper Grove',   x:-32, z:-18, r:16, kind:'wild',  color:'#2f8a4e', discR:22 },
  { id:'cliffs',  name:'Ironbluff',       x:-48, z:22,  r:14, kind:'city',  color:'#8a909a', discR:20 },
  { id:'ruins',   name:'Old Kingdom',     x:18,  z:-48, r:14, kind:'ruins', color:'#c0a070', discR:20 },
  { id:'crystal', name:'Prism Vale',      x:-22, z:52,  r:12, kind:'wild',  color:'#5ec8ff', discR:18 },
  { id:'peak',    name:'Ember Peak',      x:58,  z:-38, r:14, kind:'wild',  color:'#ff6a3d', discR:20 },
  { id:'frost',   name:'Frostcrown',      x:-58, z:-42, r:14, kind:'wild',  color:'#dfe9ff', discR:20 },
  { id:'neon',    name:'Neon District',   x:8,   z:48,  r:12, kind:'city',  color:'#22d3ee', discR:18 },
  { id:'arena',   name:'Sky Arena',       x:-8,  z:-28, r:10, kind:'arena', color:'#ff5d6c', discR:16 },
  { id:'lighthouse', name:'Beacon Point', x:55,  z:18,  r:8,  kind:'land',  color:'#ffe566', discR:14 },
  { id:'temple',  name:'Light Temple',    x:0,   z:-18, r:10, kind:'ruins', color:'#e8b84a', discR:16 },
];

export class World {
  constructor(seed = 20260910) {
    this.seed = seed;
    this.rng = mulberry32(seed);
    this.height = new Map();
    this.blocks = new Map();
    this.biomes = new Map();
    this._gen();
  }

  key(x,y,z){ return (x|0)+','+(y|0)+','+(z|0); }
  hkey(x,z){ return (x|0)+','+(z|0); }

  heightAt(x, z) {
    const k = this.hkey(x, z);
    if (this.height.has(k)) return this.height.get(k);
    return this._computeHeight(x, z);
  }

  _computeHeight(x, z) {
    const d = Math.hypot(x, z) / WORLD_R;
    const fall = clamp(1 - d * d * 0.95, 0, 1);
    if (fall <= 0.015) return 0;
    let h = fbm(x * 0.028, z * 0.028, this.seed, 5) * 12 + 5;
    // hills / peaks
    const m = fbm(x * 0.018 + 30, z * 0.018 + 30, this.seed + 9, 3);
    if (m > 0.58) h += (m - 0.58) * 36;
    // named region lifts
    for (const p of POIS) {
      const dd = dist2(x, z, p.x, p.z);
      if (dd < p.r * 1.6) {
        const t = 1 - dd / (p.r * 1.6);
        if (p.id === 'peak') h += t * t * 22;
        else if (p.id === 'frost') h += t * t * 14;
        else if (p.id === 'cliffs') h += t * t * 10;
        else if (p.kind === 'city' || p.kind === 'arena') h = lerp(h, 7.2, t * 0.85);
        else if (p.id === 'farm') h = lerp(h, 6.5, t * 0.7);
        else if (p.id === 'docks') h = lerp(h, 5.2, t * 0.8);
      }
    }
    // flatten spawn plaza hard
    const sd = Math.hypot(x, z);
    if (sd < 16) h = lerp(h, 7.0, clamp(1 - sd / 16, 0, 1));
    h *= fall;
    return Math.max(0, h);
  }

  biomeAt(x, z) {
    const k = this.hkey(x, z);
    if (this.biomes.has(k)) return this.biomes.get(k);
    const d = Math.hypot(x, z) / WORLD_R;
    const h = this.heightAt(x, z);
    let b = 'grass';
    if (d > 0.9) b = 'ocean';
    else if (h < WATER_Y + 0.8) b = 'beach';
    else if (dist2(x, z, 58, -38) < 18) b = 'volcano';
    else if (dist2(x, z, -58, -42) < 18) b = 'snow';
    else if (dist2(x, z, -22, 52) < 16) b = 'crystal';
    else if (dist2(x, z, 8, 48) < 14) b = 'neon';
    else if (dist2(x, z, -32, -18) < 20) b = 'forest';
    else if (h > 16) b = 'mountain';
    else if (fbm(x * 0.05, z * 0.05, this.seed + 3, 2) > 0.62) b = 'forest';
    this.biomes.set(k, b);
    return b;
  }

  surfaceBlock(x, z) {
    const b = this.biomeAt(x, z);
    const h = this.heightAt(x, z);
    if (h < WATER_Y) return SAND;
    if (b === 'beach') return SAND;
    if (b === 'snow') return SNOW;
    if (b === 'volcano') return h > 20 ? LAVA : STONE;
    if (b === 'mountain') return STONE;
    if (b === 'crystal') return CRYSTAL;
    if (b === 'neon') return PATH;
    // roads from spawn to major POIs
    for (const p of POIS) {
      if (p.kind !== 'city' && p.id !== 'temple' && p.id !== 'arena') continue;
      if (this._nearRoad(x, z, 0, 0, p.x, p.z, 1.35)) return PATH;
    }
    return GRASS;
  }

  _nearRoad(x, z, ax, az, bx, bz, half) {
    const dx = bx - ax, dz = bz - az;
    const len2 = dx * dx + dz * dz || 1;
    let t = ((x - ax) * dx + (z - az) * dz) / len2;
    t = clamp(t, 0, 1);
    const px = ax + dx * t, pz = az + dz * t;
    return Math.hypot(x - px, z - pz) < half;
  }

  getBlock(x, y, z) {
    x = x | 0; y = y | 0; z = z | 0;
    const o = this.blocks.get(this.key(x, y, z));
    if (o !== undefined) return o;
    const h = Math.floor(this.heightAt(x, z));
    if (y < 0) return STONE;
    if (y > h && y <= Math.floor(WATER_Y) && h < WATER_Y) return WATER;
    if (y > h) return AIR;
    if (y === h) return this.surfaceBlock(x, z);
    if (y > h - 3) return DIRT;
    return STONE;
  }

  setBlock(x, y, z, k) { this.blocks.set(this.key(x|0, y|0, z|0), k); }

  collide(x, y, z, w = 0.32, h = 1.65) {
    const x0 = Math.floor(x - w), x1 = Math.floor(x + w);
    const y0 = Math.floor(y + 0.001), y1 = Math.floor(y + h - 0.05);
    const z0 = Math.floor(z - w), z1 = Math.floor(z + w);
    for (let iy = y0; iy <= y1; iy++)
      for (let ix = x0; ix <= x1; ix++)
        for (let iz = z0; iz <= z1; iz++) {
          const b = this.getBlock(ix, iy, iz);
          if (SOLID.has(b) || b === LAVA) return true;
        }
    return false;
  }

  groundY(x, z) {
    let y = Math.ceil(this.heightAt(x, z)) + 4;
    for (let i = 0; i < 48; i++) {
      const below = this.getBlock(Math.floor(x), Math.floor(y - 0.01), Math.floor(z));
      if (!SOLID.has(below) && below !== LAVA) y -= 1;
      else break;
    }
    // snap to top of solid
    const by = Math.floor(y);
    if (SOLID.has(this.getBlock(Math.floor(x), by, Math.floor(z)))) return by + 1;
    return y;
  }

  poiAt(x, z) {
    let best = null, bd = 1e9;
    for (const p of POIS) {
      const d = dist2(x, z, p.x, p.z);
      if (d < p.discR && d < bd) { bd = d; best = p; }
    }
    return best;
  }

  _gen() {
    for (let x = -WORLD_R; x <= WORLD_R; x++) {
      for (let z = -WORLD_R; z <= WORLD_R; z++) {
        if (x * x + z * z > WORLD_R * WORLD_R) continue;
        this.height.set(this.hkey(x, z), this._computeHeight(x, z));
      }
    }
    this._buildCities();
    this._placeTrees();
    this._placeDetails();
  }

  _buildCities() {
    // Haven Plaza
    this._plaza(0, 0, 8);
    this._house(-7, -3, 5, 5, BRICK, ROOF);
    this._house(4, -4, 5, 5, PLANKS, ROOF);
    this._house(-5, 5, 4, 4, BRICK, ROOF);
    this._house(5, 5, 4, 4, PLANKS, ROOF);
    this._tower(0, -6, 8, COBBLE);
    // Market
    this._plaza(22, 8, 5);
    for (let i = 0; i < 4; i++) this._stall(20 + (i % 2) * 5, 6 + ((i / 2) | 0) * 4);
    // Docks
    for (let z = 22; z <= 34; z++)
      for (let x = 34; x <= 42; x++) this.setBlock(x, Math.floor(WATER_Y), z, PLANKS);
    this._house(36, 24, 4, 4, PLANKS, ROOF);
    // Farm
    for (let x = 24; x <= 36; x++)
      for (let z = -28; z <= -16; z++) {
        const y = Math.floor(this.heightAt(x, z));
        this.setBlock(x, y, z, DIRT);
        if ((x + z) % 2 === 0) this.setBlock(x, y + 1, z, CROPS);
      }
    this._house(28, -18, 4, 4, PLANKS, ROOF);
    // Ironbluff
    this._plaza(-48, 22, 5);
    this._tower(-48, 22, 12, STONE);
    this._house(-52, 20, 4, 4, STONE, METAL);
    this._house(-44, 24, 4, 4, STONE, METAL);
    // Old Kingdom ruins
    this._ruins(18, -48, 7);
    // Neon District
    this._plaza(8, 48, 6);
    this._house(4, 46, 4, 4, METAL, NEON);
    this._house(10, 50, 4, 4, METAL, NEON);
    this._tower(8, 48, 10, METAL);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      this.setBlock(8 + Math.cos(a) * 5 | 0, Math.floor(this.heightAt(8, 48)) + 1, 48 + Math.sin(a) * 5 | 0, NEON);
    }
    // Sky Arena ring
    for (let a = 0; a < 32; a++) {
      const ang = (a / 32) * Math.PI * 2;
      const x = Math.round(-8 + Math.cos(ang) * 8);
      const z = Math.round(-28 + Math.sin(ang) * 8);
      const y = Math.floor(this.heightAt(x, z));
      this.setBlock(x, y, z, COBBLE);
      this.setBlock(x, y + 1, z, COBBLE);
    }
    // Temple
    this._temple(0, -18);
    // Lighthouse
    this._tower(55, 18, 14, COBBLE);
    this.setBlock(55, Math.floor(this.heightAt(55, 18)) + 15, 18, GOLD);
    // Crystal spires
    for (let i = 0; i < 8; i++) {
      const a = this.rng() * Math.PI * 2;
      const r = 3 + this.rng() * 8;
      const x = Math.round(-22 + Math.cos(a) * r);
      const z = Math.round(52 + Math.sin(a) * r);
      const y0 = Math.floor(this.heightAt(x, z)) + 1;
      const h = 3 + (this.rng() * 5 | 0);
      for (let yy = 0; yy < h; yy++) this.setBlock(x, y0 + yy, z, CRYSTAL);
    }
  }

  _plaza(cx, cz, r) {
    for (let x = -r; x <= r; x++)
      for (let z = -r; z <= r; z++) {
        if (x * x + z * z > r * r) continue;
        const y = Math.floor(this.heightAt(cx + x, cz + z));
        this.setBlock(cx + x, y, cz + z, PATH);
        this.height.set(this.hkey(cx + x, cz + z), y);
      }
  }

  _house(cx, cz, w, d, wall, roof) {
    const y0 = Math.floor(this.heightAt(cx + w / 2, cz + d / 2));
    for (let x = 0; x < w; x++)
      for (let z = 0; z < d; z++) {
        this.setBlock(cx + x, y0, cz + z, PLANKS);
        for (let y = 1; y <= 3; y++) {
          const edge = x === 0 || x === w - 1 || z === 0 || z === d - 1;
          if (edge) {
            // door
            if (z === 0 && x === (w >> 1) && y <= 2) this.setBlock(cx + x, y0 + y, cz + z, AIR);
            // windows
            else if (y === 2 && (x === 0 || x === w - 1) && z === (d >> 1)) this.setBlock(cx + x, y0 + y, cz + z, GLASS);
            else this.setBlock(cx + x, y0 + y, cz + z, wall);
          }
        }
        this.setBlock(cx + x, y0 + 4, cz + z, roof);
      }
    for (let x = 1; x < w - 1; x++)
      for (let z = 1; z < d - 1; z++)
        this.setBlock(cx + x, y0 + 5, cz + z, roof);
  }

  _tower(cx, cz, h, mat) {
    const y0 = Math.floor(this.heightAt(cx, cz));
    for (let y = 0; y < h; y++) {
      for (let x = -1; x <= 1; x++)
        for (let z = -1; z <= 1; z++) {
          if (Math.abs(x) === 1 || Math.abs(z) === 1)
            this.setBlock(cx + x, y0 + y, cz + z, mat);
        }
    }
    for (let x = -2; x <= 2; x++)
      for (let z = -2; z <= 2; z++)
        this.setBlock(cx + x, y0 + h, cz + z, mat);
  }

  _stall(cx, cz) {
    const y0 = Math.floor(this.heightAt(cx, cz));
    this.setBlock(cx, y0 + 1, cz, WOOD);
    this.setBlock(cx + 1, y0 + 1, cz, WOOD);
    this.setBlock(cx, y0 + 2, cz, ROOF);
    this.setBlock(cx + 1, y0 + 2, cz, ROOF);
  }

  _ruins(cx, cz, r) {
    const y0 = Math.floor(this.heightAt(cx, cz));
    for (let x = -r; x <= r; x++)
      for (let z = -r; z <= r; z++) {
        this.setBlock(cx + x, y0, cz + z, COBBLE);
        if ((Math.abs(x) === r || Math.abs(z) === r) && (x + z + r) % 3 === 0) {
          this.setBlock(cx + x, y0 + 1, cz + z, COBBLE);
          if (this.rng() > 0.5) this.setBlock(cx + x, y0 + 2, cz + z, COBBLE);
        }
      }
    this.setBlock(cx, y0 + 1, cz, GOLD);
  }

  _temple(cx, cz) {
    const y0 = Math.floor(this.heightAt(cx, cz));
    for (let x = -3; x <= 3; x++)
      for (let z = -3; z <= 3; z++) {
        this.setBlock(cx + x, y0, cz + z, STONE);
        if (Math.abs(x) === 3 || Math.abs(z) === 3)
          this.setBlock(cx + x, y0 + 1, cz + z, STONE);
      }
    this.setBlock(cx, y0 + 1, cz, CRYSTAL);
    this.setBlock(cx, y0 + 2, cz, CRYSTAL);
    this.setBlock(cx, y0 + 3, cz, GOLD);
  }

  _placeTrees() {
    const rng = mulberry32(this.seed + 77);
    for (let i = 0; i < 1100; i++) {
      const ang = rng() * Math.PI * 2;
      const rad = 12 + rng() * (WORLD_R - 16);
      const x = Math.floor(Math.cos(ang) * rad);
      const z = Math.floor(Math.sin(ang) * rad);
      const b = this.biomeAt(x, z);
      if (b === 'ocean' || b === 'beach' || b === 'volcano' || b === 'neon') continue;
      // keep clear of plazas
      if (POIS.some(p => dist2(x, z, p.x, p.z) < p.r * 0.7 && (p.kind === 'city' || p.kind === 'arena'))) continue;
      const h = Math.floor(this.heightAt(x, z));
      if (h <= WATER_Y) continue;
      if (b !== 'forest' && rng() > 0.16) continue;
      if (b === 'forest' && rng() > 0.55) continue;
      this._tree(x, h + 1, z, b === 'snow' ? 'pine' : b === 'crystal' ? 'crystal' : 'oak', rng);
    }
  }

  _tree(x, y, z, type, rng) {
    const trunk = type === 'crystal' ? CRYSTAL : WOOD;
    const leaf = type === 'crystal' ? CRYSTAL : LEAF;
    const th = type === 'pine' ? 5 + (rng() * 3 | 0) : 3 + (rng() * 3 | 0);
    for (let i = 0; i < th; i++) this.setBlock(x, y + i, z, trunk);
    const top = y + th;
    for (let dy = -1; dy <= 2; dy++) {
      const r = type === 'pine' ? Math.max(0, 2 - Math.abs(dy)) : (dy === 2 ? 1 : 2);
      for (let dx = -r; dx <= r; dx++)
        for (let dz = -r; dz <= r; dz++) {
          if (dx * dx + dz * dz > r * r + 0.2) continue;
          if (dx === 0 && dz === 0 && dy < 1) continue;
          if (this.getBlock(x + dx, top + dy, z + dz) === AIR)
            this.setBlock(x + dx, top + dy, z + dz, leaf);
        }
    }
  }

  _placeDetails() {
    const rng = mulberry32(this.seed + 50);
    for (let i = 0; i < 280; i++) {
      const x = (30 + (rng() - 0.5) * 28) | 0;
      const z = (-22 + (rng() - 0.5) * 24) | 0;
      const y = Math.floor(this.heightAt(x, z)) + 1;
      if (this.getBlock(x, y - 1, z) === GRASS) this.setBlock(x, y, z, FLOWER);
    }
  }

  /** Greedy-ish chunk mesh around a point */
  buildChunkMesh(cx, cz, radius = 32) {
    const positions = [], colors = [], normals = [];
    const x0 = Math.floor(cx) - radius, x1 = Math.floor(cx) + radius;
    const z0 = Math.floor(cz) - radius, z1 = Math.floor(cz) + radius;

    const face = (x, y, z, nx, ny, nz, rgb, shade) => {
      const [r, g, b] = rgb;
      const s = shade;
      const cr = r * s, cg = g * s, cb = b * s;
      let verts;
      if (nx === 1) verts = [[1,0,0],[1,1,0],[1,1,1],[1,0,1]];
      else if (nx === -1) verts = [[0,0,1],[0,1,1],[0,1,0],[0,0,0]];
      else if (ny === 1) verts = [[0,1,1],[1,1,1],[1,1,0],[0,1,0]];
      else if (ny === -1) verts = [[0,0,0],[1,0,0],[1,0,1],[0,0,1]];
      else if (nz === 1) verts = [[0,0,1],[1,0,1],[1,1,1],[0,1,1]];
      else verts = [[1,0,0],[0,0,0],[0,1,0],[1,1,0]];
      for (const tri of [[0,1,2],[0,2,3]]) {
        for (const vi of tri) {
          const v = verts[vi];
          positions.push(x + v[0], y + v[1], z + v[2]);
          colors.push(cr, cg, cb, 1);
          normals.push(nx, ny, nz);
        }
      }
    };

    const opaque = (x, y, z) => {
      const b = this.getBlock(x, y, z);
      return b !== AIR && b !== WATER && b !== FLOWER && b !== CROPS && b !== GLASS && b !== LEAF;
    };

    for (let x = x0; x <= x1; x++) {
      for (let z = z0; z <= z1; z++) {
        if (x * x + z * z > (WORLD_R + 2) * (WORLD_R + 2)) continue;
        const h = Math.floor(this.heightAt(x, z));
        const yMin = Math.max(0, Math.min(h, Math.floor(WATER_Y)) - 1);
        const yMax = h + 16;
        for (let y = yMin; y <= yMax; y++) {
          const b = this.getBlock(x, y, z);
          if (b === AIR || b === WATER) continue;
          if (b === FLOWER || b === CROPS) {
            const rgb = BLOCK_COLOR[b];
            face(x, y, z, 0, 0, 1, rgb, 0.95);
            face(x, y, z, 0, 0, -1, rgb, 0.85);
            continue;
          }
          if (b === LEAF || b === GLASS) {
            // still emit faces but softer
          }
          const rgb = BLOCK_COLOR[b] || [1, 0, 1];
          const jitter = 0.90 + hash2(x, z + y * 3, this.seed) * 0.18;
          const col = [rgb[0] * jitter, rgb[1] * jitter, rgb[2] * jitter];
          if (!opaque(x + 1, y, z)) face(x, y, z, 1, 0, 0, col, 0.78);
          if (!opaque(x - 1, y, z)) face(x, y, z, -1, 0, 0, col, 0.78);
          if (!opaque(x, y + 1, z)) face(x, y, z, 0, 1, 0, col, 1.05);
          if (!opaque(x, y - 1, z)) face(x, y, z, 0, -1, 0, col, 0.50);
          if (!opaque(x, y, z + 1)) face(x, y, z, 0, 0, 1, col, 0.88);
          if (!opaque(x, y, z - 1)) face(x, y, z, 0, 0, -1, col, 0.68);
        }
        if (h < WATER_Y) {
          const rgb = BLOCK_COLOR[WATER];
          face(x, Math.floor(WATER_Y), z, 0, 1, 0, rgb, 0.9);
        }
      }
    }
    return {
      positions: new Float32Array(positions),
      colors: new Float32Array(colors),
      normals: new Float32Array(normals),
      count: positions.length / 3,
    };
  }
}
