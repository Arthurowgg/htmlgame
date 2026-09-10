import { fbm, hash2, mulberry32, clamp, dist2 } from './math.js';

export const TS = 1;                 // tile size
export const WORLD_R = 96;           // island radius in tiles
export const WATER_Y = 3.2;
export const CHUNK = 16;

// block kinds
export const AIR = 0;
export const GRASS = 1;
export const DIRT = 2;
export const SAND = 3;
export const STONE = 4;
export const WATER = 5;
export const WOOD = 6;
export const LEAF = 7;
export const FLOWER = 8;
export const SNOW = 9;
export const COBBLE = 10;
export const PLANKS = 11;
export const ROOF = 12;
export const IRON = 13;
export const GOLD = 14;
export const CRYSTAL = 15;
export const LAVA = 16;
export const PATH = 17;
export const CROPS = 18;

export const BLOCK_COLOR = {
  [GRASS]:   [0.35, 0.72, 0.32],
  [DIRT]:    [0.45, 0.30, 0.18],
  [SAND]:    [0.90, 0.82, 0.55],
  [STONE]:   [0.55, 0.58, 0.62],
  [WATER]:   [0.15, 0.40, 0.75],
  [WOOD]:    [0.45, 0.28, 0.12],
  [LEAF]:    [0.22, 0.55, 0.25],
  [FLOWER]:  [0.95, 0.45, 0.70],
  [SNOW]:    [0.92, 0.95, 1.00],
  [COBBLE]:  [0.48, 0.48, 0.50],
  [PLANKS]:  [0.62, 0.48, 0.28],
  [ROOF]:    [0.70, 0.22, 0.18],
  [IRON]:    [0.75, 0.78, 0.85],
  [GOLD]:    [0.95, 0.78, 0.25],
  [CRYSTAL]: [0.45, 0.85, 1.00],
  [LAVA]:    [0.95, 0.35, 0.08],
  [PATH]:    [0.62, 0.55, 0.38],
  [CROPS]:   [0.55, 0.75, 0.25],
};

export const SOLID = new Set([
  GRASS, DIRT, SAND, STONE, WOOD, SNOW, COBBLE, PLANKS, ROOF, IRON, GOLD, CRYSTAL, PATH,
]);

export const REGIONS = [
  { id: 'haven',   name: 'Haven Village',  x: 0,   z: 8,  r: 18, color: '#e8b84a' },
  { id: 'meadow',  name: 'Sun Meadow',     x: 28,  z: -10,r: 16, color: '#7dce6a' },
  { id: 'forest',  name: 'Whisper Woods',  x: -30, z: -20,r: 20, color: '#2f8a4e' },
  { id: 'beach',   name: 'Golden Shore',   x: 40,  z: 30, r: 14, color: '#e8d48a' },
  { id: 'cliffs',  name: 'Iron Cliffs',    x: -45, z: 25, r: 16, color: '#8a909a' },
  { id: 'ruins',   name: 'Old Ruins',      x: 15,  z: -45,r: 14, color: '#a09070' },
  { id: 'crystal', name: 'Crystal Vale',   x: -20, z: 50, r: 14, color: '#5ec8ff' },
  { id: 'volcano', name: 'Ember Peak',     x: 55,  z: -35,r: 16, color: '#ff6a3d' },
  { id: 'snow',    name: 'Frost Crown',    x: -55, z: -40,r: 16, color: '#dfe9ff' },
  { id: 'swamp',   name: 'Mist Fen',       x: 5,   z: 55, r: 14, color: '#4a7a55' },
];

export const POIS = [
  { id: 'spawn',   name: 'Town Square',   x: 0,  z: 6,  kind: 'town' },
  { id: 'elder',   name: 'Elder House',   x: -4, z: 4,  kind: 'house' },
  { id: 'market',  name: 'Market',        x: 5,  z: 10, kind: 'market' },
  { id: 'dock',    name: 'Docks',         x: 12, z: 22, kind: 'dock' },
  { id: 'farm',    name: 'Sunny Farm',    x: 22, z: -6, kind: 'farm' },
  { id: 'tower',   name: 'Watchtower',    x: -18,z: 12, kind: 'tower' },
  { id: 'cave',    name: 'Crystal Cave',  x: -22,z: 48, kind: 'cave' },
  { id: 'temple',  name: 'Ruined Temple', x: 14, z: -48,kind: 'ruins' },
  { id: 'forge',   name: 'Cliff Forge',   x: -42,z: 28, kind: 'forge' },
  { id: 'shrine',  name: 'Light Shrine',  x: 0,  z: -20,kind: 'shrine' },
  { id: 'camp',    name: 'Hunter Camp',   x: -28,z: -18,kind: 'camp' },
  { id: 'boss1',   name: 'Shadow Den',    x: 48, z: -40,kind: 'boss' },
  { id: 'boss2',   name: 'Frost Lair',    x: -52,z: -42,kind: 'boss' },
  { id: 'boss3',   name: 'Deep Hollow',   x: 8,  z: 58, kind: 'boss' },
];

export class World {
  constructor(seed = 20260910) {
    this.seed = seed;
    this.rng = mulberry32(seed);
    this.height = new Map();   // "x,z" -> surface y
    this.blocks = new Map();   // "x,y,z" -> kind (overrides)
    this.biomes = new Map();
    this.trees = [];
    this.structures = [];
    this._gen();
  }

  key(x, y, z) { return (x|0) + ',' + (y|0) + ',' + (z|0); }
  hkey(x, z) { return (x|0) + ',' + (z|0); }

  heightAt(x, z) {
    const k = this.hkey(x, z);
    if (this.height.has(k)) return this.height.get(k);
    return this._computeHeight(x, z);
  }

  _computeHeight(x, z) {
    const d = Math.hypot(x, z) / WORLD_R;
    // island falloff
    const fall = clamp(1 - d * d, 0, 1);
    if (fall <= 0.02) return 0;

    let h = fbm(x * 0.03, z * 0.03, this.seed, 5);
    h = h * 14 + 4;

    // biome bumps
    const mountain = fbm(x * 0.02 + 40, z * 0.02 + 40, this.seed + 7, 3);
    if (mountain > 0.62) h += (mountain - 0.62) * 40;
    const crater = Math.hypot(x - 55, z + 35);
    if (crater < 14) h += (1 - crater / 14) * 18 - 4;
    const frost = Math.hypot(x + 55, z + 40);
    if (frost < 16) h += (1 - frost / 16) * 12;

    h *= fall;
    // flatten village
    const village = Math.hypot(x, z - 6);
    if (village < 14) h = lerpH(h, 6.5, clamp(1 - village / 14, 0, 1));

    return Math.max(0, h);
  }

  biomeAt(x, z) {
    const k = this.hkey(x, z);
    if (this.biomes.has(k)) return this.biomes.get(k);
    const d = Math.hypot(x, z) / WORLD_R;
    const h = this.heightAt(x, z);
    let b = 'grass';
    if (d > 0.88) b = 'ocean';
    else if (h < WATER_Y + 0.6) b = 'beach';
    else if (Math.hypot(x - 55, z + 35) < 16) b = 'volcano';
    else if (Math.hypot(x + 55, z + 40) < 18) b = 'snow';
    else if (Math.hypot(x + 5, z - 55) < 16) b = 'swamp';
    else if (Math.hypot(x + 20, z - 50) < 14) b = 'crystal';
    else if (Math.hypot(x - 15, z + 45) < 14) b = 'ruins';
    else if (h > 16) b = 'mountain';
    else if (Math.hypot(x + 30, z + 20) < 22) b = 'forest';
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
    if (b === 'volcano') return h > 18 ? LAVA : STONE;
    if (b === 'mountain') return STONE;
    if (b === 'crystal') return CRYSTAL;
    if (b === 'ruins') return COBBLE;
    if (b === 'swamp') return DIRT;
    // paths near village
    if (Math.hypot(x, z - 6) < 12 && (Math.abs(x) < 1.2 || Math.abs(z - 6) < 1.2 || Math.abs(x - (z - 6)) < 1.1))
      return PATH;
    return GRASS;
  }

  getBlock(x, y, z) {
    x = x|0; y = y|0; z = z|0;
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

  setBlock(x, y, z, k) {
    this.blocks.set(this.key(x|0, y|0, z|0), k);
  }

  /** solid collision for AABB feet */
  collide(x, y, z, w = 0.35, h = 1.6) {
    const x0 = Math.floor(x - w), x1 = Math.floor(x + w);
    const y0 = Math.floor(y), y1 = Math.floor(y + h - 0.01);
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
    // walk down from high
    let y = Math.ceil(this.heightAt(x, z)) + 2;
    for (let i = 0; i < 40; i++) {
      if (!SOLID.has(this.getBlock(Math.floor(x), y - 1, Math.floor(z))) &&
          this.getBlock(Math.floor(x), y - 1, Math.floor(z)) !== LAVA) {
        y--;
      } else break;
    }
    return y;
  }

  regionAt(x, z) {
    let best = null, bd = 1e9;
    for (const r of REGIONS) {
      const d = dist2(x, z, r.x, r.z);
      if (d < r.r && d < bd) { bd = d; best = r; }
    }
    return best;
  }

  _gen() {
    // precompute height ring + place structures
    for (let x = -WORLD_R; x <= WORLD_R; x++) {
      for (let z = -WORLD_R; z <= WORLD_R; z++) {
        if (x * x + z * z > WORLD_R * WORLD_R) continue;
        const h = this._computeHeight(x, z);
        this.height.set(this.hkey(x, z), h);
      }
    }
    this._placeTrees();
    this._placeVillage();
    this._placeSpecials();
  }

  _placeTrees() {
    const rng = mulberry32(this.seed + 99);
    for (let i = 0; i < 900; i++) {
      const ang = rng() * Math.PI * 2;
      const rad = 10 + rng() * (WORLD_R - 14);
      const x = Math.floor(Math.cos(ang) * rad);
      const z = Math.floor(Math.sin(ang) * rad);
      const b = this.biomeAt(x, z);
      if (b === 'ocean' || b === 'beach' || b === 'volcano') continue;
      const h = Math.floor(this.heightAt(x, z));
      if (h <= WATER_Y) continue;
      if (b !== 'forest' && rng() > 0.18) continue;
      if (b === 'forest' && rng() > 0.55) continue;
      this._tree(x, h + 1, z, b === 'snow' ? 'pine' : b === 'crystal' ? 'crystal' : 'oak', rng);
    }
  }

  _tree(x, y, z, type, rng) {
    const trunk = type === 'crystal' ? CRYSTAL : WOOD;
    const leaf = type === 'crystal' ? CRYSTAL : type === 'pine' ? LEAF : LEAF;
    const th = type === 'pine' ? 5 + (rng() * 3 | 0) : 3 + (rng() * 3 | 0);
    for (let i = 0; i < th; i++) this.setBlock(x, y + i, z, trunk);
    const top = y + th;
    const rad = type === 'pine' ? 2 : 2;
    for (let dy = -1; dy <= 2; dy++) {
      const r = type === 'pine' ? Math.max(0, 2 - Math.abs(dy)) : (dy === 2 ? 1 : rad);
      for (let dx = -r; dx <= r; dx++)
        for (let dz = -r; dz <= r; dz++) {
          if (dx * dx + dz * dz > r * r + 0.2) continue;
          if (dx === 0 && dz === 0 && dy < 1) continue;
          if (this.getBlock(x + dx, top + dy, z + dz) === AIR)
            this.setBlock(x + dx, top + dy, z + dz, leaf);
        }
    }
    this.trees.push({ x, y, z, type });
  }

  _placeVillage() {
    // plaza
    for (let x = -5; x <= 5; x++)
      for (let z = 2; z <= 10; z++) {
        const y = Math.floor(this.heightAt(x, z));
        this.setBlock(x, y, z, PATH);
        this.height.set(this.hkey(x, z), y);
      }
    // houses
    this._house(-6, 3, 5, 4);
    this._house(4, 4, 5, 4);
    this._house(-3, 12, 4, 4);
    this._house(6, 12, 4, 4);
    // tower
    this._tower(-18, 12);
    // farm
    for (let x = 18; x <= 26; x++)
      for (let z = -10; z <= -4; z++) {
        const y = Math.floor(this.heightAt(x, z));
        this.setBlock(x, y, z, DIRT);
        if ((x + z) % 2 === 0) this.setBlock(x, y + 1, z, CROPS);
      }
    // dock
    for (let z = 18; z <= 26; z++) {
      for (let x = 10; x <= 14; x++) {
        this.setBlock(x, Math.floor(WATER_Y), z, PLANKS);
      }
    }
    // shrine
    this._shrine(0, -20);
  }

  _house(cx, cz, w, d) {
    const y0 = Math.floor(this.heightAt(cx, cz));
    for (let x = 0; x < w; x++)
      for (let z = 0; z < d; z++) {
        this.setBlock(cx + x, y0, cz + z, PLANKS);
        for (let y = 1; y <= 3; y++) {
          const wall = x === 0 || x === w - 1 || z === 0 || z === d - 1;
          if (wall) {
            if (y === 2 && ((x === (w / 2 | 0) && z === 0) || (z === (d / 2 | 0) && x === 0))) {
              // window / door gap
              if (!(y === 1 && z === 0 && x === (w / 2 | 0))) this.setBlock(cx + x, y0 + y, cz + z, PLANKS);
            } else this.setBlock(cx + x, y0 + y, cz + z, PLANKS);
          }
        }
        // door
        if (z === 0 && x === (w / 2 | 0)) {
          this.setBlock(cx + x, y0 + 1, cz + z, AIR);
          this.setBlock(cx + x, y0 + 2, cz + z, AIR);
        }
        this.setBlock(cx + x, y0 + 4, cz + z, ROOF);
      }
    // roof peak
    for (let x = 1; x < w - 1; x++)
      for (let z = 1; z < d - 1; z++)
        this.setBlock(cx + x, y0 + 5, cz + z, ROOF);
    this.structures.push({ kind: 'house', x: cx + w / 2, z: cz + d / 2, y: y0 });
  }

  _tower(cx, cz) {
    const y0 = Math.floor(this.heightAt(cx, cz));
    for (let y = 0; y < 10; y++) {
      for (let x = -1; x <= 1; x++)
        for (let z = -1; z <= 1; z++) {
          if (Math.abs(x) === 1 || Math.abs(z) === 1)
            this.setBlock(cx + x, y0 + y, cz + z, COBBLE);
        }
    }
    for (let x = -2; x <= 2; x++)
      for (let z = -2; z <= 2; z++)
        this.setBlock(cx + x, y0 + 10, cz + z, COBBLE);
    this.structures.push({ kind: 'tower', x: cx, z: cz, y: y0 });
  }

  _shrine(cx, cz) {
    const y0 = Math.floor(this.heightAt(cx, cz));
    for (let x = -2; x <= 2; x++)
      for (let z = -2; z <= 2; z++)
        this.setBlock(cx + x, y0, cz + z, STONE);
    this.setBlock(cx, y0 + 1, cz, CRYSTAL);
    this.setBlock(cx, y0 + 2, cz, CRYSTAL);
    this.setBlock(cx, y0 + 3, cz, GOLD);
    this.structures.push({ kind: 'shrine', x: cx, z: cz, y: y0 });
  }

  _placeSpecials() {
    // crystal cave marker
    const cave = POIS.find(p => p.id === 'cave');
    if (cave) {
      const y0 = Math.floor(this.heightAt(cave.x, cave.z));
      for (let i = 0; i < 5; i++) this.setBlock(cave.x, y0 + i, cave.z, CRYSTAL);
    }
    // ruins
    const temple = POIS.find(p => p.id === 'temple');
    if (temple) {
      const y0 = Math.floor(this.heightAt(temple.x, temple.z));
      for (let x = -3; x <= 3; x++)
        for (let z = -3; z <= 3; z++) {
          this.setBlock(temple.x + x, y0, temple.z + z, COBBLE);
          if ((x === -3 || x === 3 || z === -3 || z === 3) && (x + z) % 2 === 0)
            this.setBlock(temple.x + x, y0 + 1, temple.z + z, COBBLE);
        }
      this.setBlock(temple.x, y0 + 1, temple.z, GOLD);
    }
    // flowers around meadow
    const rng = mulberry32(this.seed + 50);
    for (let i = 0; i < 200; i++) {
      const x = (28 + (rng() - 0.5) * 24) | 0;
      const z = (-10 + (rng() - 0.5) * 20) | 0;
      const y = Math.floor(this.heightAt(x, z)) + 1;
      if (this.getBlock(x, y - 1, z) === GRASS) this.setBlock(x, y, z, FLOWER);
    }
  }

  /** Build mesh for a chunk of terrain around a point */
  buildChunkMesh(cx, cz, radius = 28) {
    const positions = [];
    const colors = [];
    const x0 = Math.floor(cx) - radius;
    const x1 = Math.floor(cx) + radius;
    const z0 = Math.floor(cz) - radius;
    const z1 = Math.floor(cz) + radius;

    const face = (x, y, z, nx, ny, nz, rgb, shade) => {
      // quad as 2 tris, axis-aligned from normal
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

      const idx = [[0,1,2],[0,2,3]];
      for (const tri of idx) {
        for (const vi of tri) {
          const v = verts[vi];
          positions.push(x + v[0], y + v[1], z + v[2]);
          colors.push(cr, cg, cb, 1);
        }
      }
    };

    const isOpaque = (x, y, z) => {
      const b = this.getBlock(x, y, z);
      return b !== AIR && b !== WATER && b !== FLOWER && b !== CROPS;
    };

    for (let x = x0; x <= x1; x++) {
      for (let z = z0; z <= z1; z++) {
        if (x * x + z * z > (WORLD_R + 2) * (WORLD_R + 2)) continue;
        const h = Math.floor(this.heightAt(x, z));
        const yMin = Math.max(0, Math.min(h, Math.floor(WATER_Y)) - 1);
        const yMax = h + 8; // structures
        for (let y = yMin; y <= yMax; y++) {
          const b = this.getBlock(x, y, z);
          if (b === AIR || b === WATER) continue;
          if (b === FLOWER || b === CROPS) {
            // cross sprite-like thin quads
            const rgb = BLOCK_COLOR[b] || [1,1,1];
            const s = 0.9;
            // simple X billboard as two faces
            face(x, y, z, 0, 0, 1, rgb, s);
            face(x, y, z, 0, 0, -1, rgb, s * 0.85);
            continue;
          }
          const rgb = BLOCK_COLOR[b] || [1, 0, 1];
          // variation
          const jitter = 0.92 + hash2(x, z + y * 3, this.seed) * 0.16;
          const col = [rgb[0] * jitter, rgb[1] * jitter, rgb[2] * jitter];

          if (!isOpaque(x + 1, y, z)) face(x, y, z, 1, 0, 0, col, 0.80);
          if (!isOpaque(x - 1, y, z)) face(x, y, z, -1, 0, 0, col, 0.80);
          if (!isOpaque(x, y + 1, z)) face(x, y, z, 0, 1, 0, col, 1.00);
          if (!isOpaque(x, y - 1, z)) face(x, y, z, 0, -1, 0, col, 0.55);
          if (!isOpaque(x, y, z + 1)) face(x, y, z, 0, 0, 1, col, 0.90);
          if (!isOpaque(x, y, z - 1)) face(x, y, z, 0, 0, -1, col, 0.70);
        }

        // water surface
        if (h < WATER_Y) {
          const wy = Math.floor(WATER_Y);
          const rgb = BLOCK_COLOR[WATER];
          face(x, wy, z, 0, 1, 0, rgb, 0.85);
        }
      }
    }
    return {
      positions: new Float32Array(positions),
      colors: new Float32Array(colors),
      count: positions.length / 3,
    };
  }
}

function lerpH(a, b, t) { return a + (b - a) * t; }
