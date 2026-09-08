// SOLARIA — mundo voxel procedural (determinístico por seed)
// GRADE: 192x192 células; cada célula mede 2x2 unidades de mundo e 1 de altura.
// índice da célula = (0..191); célula c ocupa o mundo [2c-192, 2c-190).
// Funções de terreno usam célula; funções de layout convertem mundo↔célula.
import { mulberry32, fbm, valueNoise2D, clamp } from './math.js';

export const TS = 2;
export const CELLS = 192;
export const CHUNK = 16;                 // células por chunk de malha
export const WORLD_HALF = CELLS * TS / 2; // 192
export const WATER_Y = 0.38;

export const P = {
  G1: 0, G2: 1, G3: 2, G4: 3, PATH: 4, SAND: 5,
  STONE: 6, STONED: 7, WOOD: 8, WOODD: 9,
  ROOF: 10, ROOFD: 11, DOOR: 12, WIN: 13,
  MOSS: 14, MOSS_D: 15,
};
const PAL = [
  { t: [0.36, 0.75, 0.30], s: [0.46, 0.30, 0.16] },
  { t: [0.32, 0.69, 0.27], s: [0.46, 0.30, 0.16] },
  { t: [0.28, 0.62, 0.24], s: [0.41, 0.27, 0.15] },
  { t: [0.24, 0.55, 0.21], s: [0.36, 0.24, 0.14] },
  { t: [0.75, 0.57, 0.36], s: [0.59, 0.44, 0.27] },
  { t: [0.88, 0.78, 0.49], s: [0.77, 0.66, 0.40] },
  { t: [0.55, 0.58, 0.63], s: [0.47, 0.50, 0.54] },
  { t: [0.42, 0.45, 0.50], s: [0.36, 0.39, 0.43] },
  { t: [0.79, 0.56, 0.33], s: [0.62, 0.43, 0.24] },
  { t: [0.55, 0.37, 0.22], s: [0.44, 0.30, 0.17] },
  { t: [0.82, 0.31, 0.20], s: [0.61, 0.23, 0.15] },
  { t: [0.57, 0.19, 0.13], s: [0.43, 0.15, 0.11] },
  { t: [0.30, 0.19, 0.13], s: [0.26, 0.17, 0.12] },
  { t: [0.16, 0.43, 0.56], s: [0.12, 0.35, 0.47] },
  { t: [0.17, 0.36, 0.16], s: [0.28, 0.18, 0.10] }, // MOSS (floresta sombria)
  { t: [0.13, 0.29, 0.13], s: [0.22, 0.14, 0.09] }, // MOSS_D
];
function col(i, top) { const c = PAL[i] || PAL[0]; return top ? c.t : c.s; }
const SH = { top: 1.04, xp: 0.60, xn: 0.78, zp: 0.90, zn: 0.70 };

// ---------- REGIÕES (mundo) ----------
// Cada região vira terra firme garantida; usadas por quests/HUD/geradores.
export const REGIONS = [
  { id: 'vila',       name: 'VILA SOLARIA',    x: 0, z: 0, r: 21 },
  { id: 'campo',      name: 'CAMPO RADIANTE',  x: 36, z: 9, r: 15 },
  { id: 'clareira',   name: 'CLAREIRA DAS LAGRIMAS', x: -32, z: 28, r: 15 },
  { id: 'templo',     name: 'TEMPLO ANTIGO',   x: -27, z: -22, r: 16 },
  { id: 'floresta',   name: 'FLORESTA DOS SUSSURROS', x: 4, z: -56, r: 20 },
  { id: 'mina',       name: 'PENHASCOS DA MINA', x: -68, z: 4, r: 18 },
  { id: 'praia',      name: 'PRAIA DAS CONCHAS', x: 18, z: 66, r: 19 },
  { id: 'santuario',  name: 'SANTUARIO DO CUME', x: 74, z: -18, r: 14 },
  { id: 'recife',     name: 'ILHA DO RECIFE',    x: 170, z: -160, r: 14 },
  { id: 'cripta',     name: 'CRIPTA ESQUECIDA',  x: -150, z: 150, r: 26 },
];
const MAP = (() => { const m = {}; for (const r of REGIONS) m[r.id] = r; return m; })();
export const REGION = id => MAP[id] || { x: 0, z: 0, r: 1 };

// ---------- pontos de interesse (POIs) do vale ----------
// Referenciados pelas missões (visite/descubra). oculto = só aparece no mapa
// depois de visitado ou com a Lente da Verdade.
export const POIS = [
  { id: 'praca',      nome: 'Praça de Solaria',       icone: 'F', x: 2.4, z: -7.4, regiao: 'vila' },
  { id: 'poco',       nome: 'Poço dos Desejos',       icone: 'P', x: -1, z: -1, regiao: 'vila' },
  { id: 'moinho',     nome: 'Moinho de Vento',        icone: 'M', x: 17, z: -11, regiao: 'vila' },
  { id: 'selo_vila',  nome: 'Selo de Solaria',        icone: 'S', x: 7, z: -5, regiao: 'vila', selo: true },
  { id: 'campo',      nome: 'Campo Radiante',         icone: 'C', x: 36, z: 9, regiao: 'campo' },
  { id: 'lagoa',      nome: 'Lagoa das Rãs',          icone: '~', x: 46, z: 40, regiao: 'campo' },
  { id: 'selo_campo', nome: 'Selo do Campo',          icone: 'S', x: 36, z: 6, regiao: 'campo', selo: true },
  { id: 'clareira',   nome: 'Clareira das Lágrimas',  icone: 'C', x: -32, z: 28, regiao: 'clareira' },
  { id: 'selo_clareira', nome: 'Selo da Clareira',    icone: 'S', x: -33, z: 24, regiao: 'clareira', selo: true },
  { id: 'templo',     nome: 'Templo Antigo',          icone: 'T', x: -23, z: -19, regiao: 'templo' },
  { id: 'altar_templo', nome: 'Altar do Templo',      icone: 'A', x: -15, z: -17, regiao: 'templo' },
  { id: 'clareira_verde', nome: 'Clareira Verde',     icone: 'V', x: 4, z: -52, regiao: 'floresta' },
  { id: 'boca_mina',  nome: 'Boca da Mina',           icone: 'M', x: -64, z: 4, regiao: 'mina' },
  { id: 'gate_cripta', nome: 'Arco da Cripta',        icone: 'G', x: -58, z: 11, regiao: 'mina' },
  { id: 'pier',       nome: 'Píer das Conchas',       icone: 'P', x: 25, z: 68, regiao: 'praia' },
  { id: 'naufragio',  nome: 'O Naufrágio',            icone: 'N', x: 44, z: 58, regiao: 'praia', oculto: true },
  { id: 'cume',       nome: 'Santuário do Cume',      icone: 'C', x: 74, z: -16, regiao: 'santuario' },
  { id: 'mirante',    nome: 'Mirante do Vento',       icone: 'M', x: 84, z: -12, regiao: 'santuario' },
  { id: 'torrente',   nome: 'Torrente Sagrada',       icone: '~', x: 66, z: -10, regiao: 'santuario', oculto: true },
  { id: 'recife',     nome: 'Ilha do Recife',         icone: 'R', x: 170, z: -160, regiao: 'recife' },
  { id: 'farol_recife', nome: 'Faro do Recife',       icone: 'L', x: 172, z: -162, regiao: 'recife' },
  { id: 'segredo_recife', nome: 'Tesouro dos Náufragos', icone: '?', x: 166, z: -154, regiao: 'recife', oculto: true },
  { id: 'cripta',     nome: 'Cripta Esquecida',       icone: 'C', x: -150, z: 150, regiao: 'cripta' },
];
export const REGION_COLOR = {
  vila: '#e8c766', campo: '#8fd48a', clareira: '#7dd6c9', templo: '#b9a8ff',
  floresta: '#5aa76a', mina: '#a7b0bd', praia: '#ffd98a', santuario: '#9ad9ff',
  recife: '#7fe3d4', cripta: '#c28aff',
};
export const REGION_ICON = { vila: 'V', campo: 'C', clareira: 'L', templo: 'T', floresta: 'F', mina: 'M', praia: 'P', santuario: 'S', recife: 'R', cripta: 'X' };

// estradas: polilinhas (mundo) saindo da vila
const ROADS = [
  [[6, 6], [22, 7], [34, 9]],                          // leste → campo
  [[-4, 7], [-14, 14], [-24, 22], [-31, 27]],          // sudoeste → clareira
  [[-4, -6], [-12, -12], [-20, -18], [-26, -22]],      // noroeste → templo
  [[0, -10], [2, -26], [3, -44], [4, -54]],            // norte → floresta
  [[-8, 2], [-22, 3], [-38, 3], [-54, 4], [-66, 5]],   // oeste → mina
  [[4, 10], [8, 26], [12, 44], [16, 60], [18, 65]],    // sul → praia
  [[12, 7], [30, 4], [48, -2], [64, -12], [72, -17]],  // leste/norte → santuário
];

export class World {
  constructor(seed) {
    this.seed = seed;
    this.rng = mulberry32(seed);
    this.CELLS = CELLS;
    this.CHUNKS = CELLS / CHUNK;
    const n = CELLS;
    this.H = new Uint8Array(n * n);
    this.CT = new Uint8Array(n * n);
    this.CS = new Uint8Array(n * n);
    this.RK = new Uint8Array(n * n); // 1 = não é terreno natural (construção)
    this.build();
    this.staticSprites = this.buildSprites();
    this._cache = {};
  }
  idx(x, z) { return z * CELLS + x; }
  hOf(x, z) { return (x < 0 || z < 0 || x >= CELLS || z >= CELLS) ? 0 : this.H[this.idx(x, z)]; }
  tileAt(w) { return Math.floor((w + WORLD_HALF) / TS); }
  tileCenter(t) { return t * TS - WORLD_HALF + 1; }
  heightAt(wx, wz) { return this.hOf(this.tileAt(wx), this.tileAt(wz)); }
  isWaterAt(wx, wz) { return this.heightAt(wx, wz) <= 0; }
  setCell(x, z, h, ct, cs) {
    if (x < 0 || z < 0 || x >= CELLS || z >= CELLS) return;
    const i = this.idx(x, z);
    this.H[i] = h;
    if (ct !== undefined) this.CT[i] = ct;
    if (cs !== undefined) this.CS[i] = cs;
  }
  placeBlock(x, z, h, ct, rock = 1, cs) {
    if (x < 0 || z < 0 || x >= CELLS || z >= CELLS) return;
    const i = this.idx(x, z);
    this.H[i] = Math.max(this.H[i], h);
    this.CT[i] = ct;
    this.CS[i] = cs !== undefined ? cs : ct;
    if (rock) this.RK[i] = 1;
  }

  // ================= GERAÇÃO =================
  build() {
    const no = valueNoise2D(mulberry32(this.seed));
    const n2 = valueNoise2D(mulberry32(this.seed ^ 0x51AB));
    const n3 = valueNoise2D(mulberry32(this.seed ^ 0x77AA));
    for (let z = 0; z < CELLS; z++) {
      for (let x = 0; x < CELLS; x++) {
        const wx = this.tileCenter(x), wz = this.tileCenter(z);
        const r = Math.hypot(wx, wz);
        const t = fbm(no, wx / 46, wz / 46, 3);
        const wob = 0.14 * n2(wx / 12, wz / 12) - 0.04;
        const bump = 0.25 * fbm(n3, wx / 26 + 7.7, wz / 26 - 3.3, 2); // colinas grandes
        const fall = clamp((r - 150) / 85, 0, 1);
        const v = t + wob + bump - fall * 0.5;
        let h = v < 0.42 ? 0 : v < 0.66 ? 1 : v < 0.84 ? 2 : 3;
        if (v > 0.93) h = 4; // cumes altos
        if (r > 205) h = 0;
        this.setCell(x, z, h, h ? P.G2 : 0, h ? P.G2 : 0);
      }
    }
    // 1) terra firme das regiões + corredores das estradas
    for (const reg of REGIONS) this.protectCircle(reg.x, reg.z, reg.r);
    for (const road of ROADS)
      for (let i = 0; i < road.length - 1; i++) {
        const [ax, az] = road[i], [bx, bz] = road[i + 1];
        this.protectLine(ax, az, bx, bz, 4.2);
      }
    // 2) aplainar áreas de jogo
    this.flattenCircle(0, 0, 17);                 // praça da vila
    this.flattenCircle(36, 9, 8);                 // campo radiante
    this.flattenCircle(-32, 28, 8);               // clareira
    this.flattenCircle(-24, -20, 8);              // núcleo do templo
    this.flattenCircle(4, -52, 10);               // clareira da floresta
    this.flattenCircle(-64, 4, 9);                // boca da mina
    this.flattenCircle(18, 60, 9);                // areal da praia
    this.flattenCircle(74, -16, 7);               // cume do santuário
    // 3) água: lago da vila (decoração) e lagoa da praia
    this.lakeCircle(40, 40, 4.5);                 // lagoa nordeste (perto do campo)
    this.lakeCircle(24, 76, 9);                   // lagoa da praia
    // 4) biomas (pintura do terreno natural)
    this.paintBiomes(n2);
    // 5) estradas (só pintam onde há terra natural)
    for (const road of ROADS) this.roadW(road);
    // 6) construções
    this.wellCell(95, 95);                        // poço central
    this.obeliskCell(98, 92);                     // obelisco ao norte do poço
    this.hutCell(88, 94);                         // cabana oeste (Mira)
    this.hutCell(92, 86);                         // cabana norte
    this.hutCell(106, 92);                        // cabana leste (Kael)
    this.hutCell(99, 101);                        // pousada sul
    this.ruinsCell(84, 86);                       // templo antigo (núcleo aberto)
    this.pedestalCell(88, 87);                    // altar do baú
    this.minePortalCell(70, 92);                  // portal da mina (oeste)
    this.pierCell(108, 129);                      // píer da praia
    this.millCell(104, 90);                       // moinho (nordeste da vila)
    // acesso das portas (pequenos caminhos)
    this.roadC([[90, 98], [93, 98], [95, 97]]);
    this.roadC([[95, 90], [95, 92], [94, 94]]);
    this.roadC([[108, 98], [105, 98], [103, 97]]);
    this.roadC([[100, 102], [98, 101]]);
    // 7) terrenos especiais (ilha, cripta) — por cima de tudo, com tipos fixos
    this.extraTerrain();
  }
  // ---- ilha do recife (nordeste) e cripta (sudoeste) ----
  extraTerrain() {
    const raise = (wx, wz, r, h, ct, cs, ring = 0) => {
      const cx = this.tileAt(wx), cz = this.tileAt(wz);
      const R = Math.ceil((r + ring) / 2) + 2;
      for (let dz = -R; dz <= R; dz++)
        for (let dx = -R; dx <= R; dx++) {
          const x = cx + dx, z = cz + dz;
          if (x < 0 || z < 0 || x >= CELLS || z >= CELLS) continue;
          const i = this.idx(x, z);
          const d = Math.hypot((x - cx) * 2, (z - cz) * 2);
          if (d <= r) this.setCell(x, z, h, ct, cs);
          else if (ring > 0 && d <= r + ring && this.H[i] <= 0) this.setCell(x, z, 1, P.SAND, P.SAND);
        }
    };
    // Ilha do Recife: anel de areia + grama, colina com o farol
    raise(170, -160, 9, 1, P.G1, P.G1, 5);
    raise(170, -160, 4, 2, P.G3, P.G3, 0);
    // base do farol (2x2 células de pedra até h6)
    for (const [dx, dz] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
      for (let h = 3; h <= 6; h++) this.placeBlock(181 + dx, 16 + dz, h, P.STONE, 1, P.STONE);
    }
    // Cripta Esquecida: meseta alta no sudoeste do oceano
    raise(-150, 150, 24, 5, P.STONE, P.STONED, 0);
    raise(-150, 150, 26, 5, P.STONE, P.STONED, 0); // engrossa a borda
    // piso interno mais claro
    const cxi = this.tileAt(-150), czi = this.tileAt(150);
    for (let dz = -12; dz <= 12; dz++)
      for (let dx = -12; dx <= 12; dx++) {
        const x = cxi + dx, z = czi + dz;
        const d = Math.hypot(dx * 2, dz * 2);
        if (d <= 20) this.setCell(x, z, 5, P.STONED, P.STONE);
      }
  }
  // ---- terreno ----
  protectCircle(wx, wz, r) {
    const cx = this.tileAt(wx), cz = this.tileAt(wz);
    const R = Math.ceil(r / 2) + 2;
    for (let dz = -R; dz <= R; dz++)
      for (let dx = -R; dx <= R; dx++) {
        const x = cx + dx, z = cz + dz;
        if (x < 0 || z < 0 || x >= CELLS || z >= CELLS) continue;
        if (this.H[this.idx(x, z)] === 0) {
          const d = Math.hypot((x - cx) * 2, (z - cz) * 2);
          if (d <= r) this.setCell(x, z, 1, P.G1, P.G1);
        }
      }
  }
  protectLine(x0, z0, x1, z1, w) {
    const n = Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 3);
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      this.protectCircle(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t, w);
    }
  }
  flattenCircle(wx, wz, r) {
    const cx = this.tileAt(wx), cz = this.tileAt(wz);
    const R = Math.ceil(r / 2) + 2;
    for (let dz = -R; dz <= R; dz++)
      for (let dx = -R; dx <= R; dx++) {
        const x = cx + dx, z = cz + dz;
        if (x < 0 || z < 0 || x >= CELLS || z >= CELLS) continue;
        const i = this.idx(x, z);
        const d = Math.hypot((x - cx) * 2, (z - cz) * 2);
        if (d <= r && this.H[i] > 0 && !this.RK[i]) {
          this.H[i] = 1; this.CT[i] = P.G1; this.CS[i] = P.G1;
        }
      }
  }
  lakeCircle(wx, wz, r) {
    const cx = this.tileAt(wx), cz = this.tileAt(wz);
    const R = Math.ceil((r + 4) / 2) + 2;
    for (let dz = -R; dz <= R; dz++)
      for (let dx = -R; dx <= R; dx++) {
        const x = cx + dx, z = cz + dz;
        if (x < 0 || z < 0 || x >= CELLS || z >= CELLS) continue;
        const i = this.idx(x, z);
        const d = Math.hypot((x - cx) * 2, (z - cz) * 2);
        if (d <= r) this.setCell(x, z, 0, 0, 0);
        else if (d <= r + 3 && this.H[i] > 0 && !this.RK[i]) {
          this.H[i] = 1; this.CT[i] = P.SAND; this.CS[i] = P.SAND;
        }
      }
  }
  paintBiomes(n2) {
    for (let z = 0; z < CELLS; z++) {
      for (let x = 0; x < CELLS; x++) {
        const i = this.idx(x, z);
        if (this.RK[i] || this.H[i] <= 0) continue;
        const wx = this.tileCenter(x), wz = this.tileCenter(z);
        const dMina = Math.hypot(wx + 64, wz - 4);
        const dFlor = Math.hypot(wx - 4, wz + 56);
        const dPraia = Math.hypot(wx - 18, wz - 60);
        const dSant = Math.hypot(wx - 74, wz + 18);
        const h = this.H[i];
        const g = n2(x * 0.3, z * 0.3);
        // bioma rochoso (mina)
        if (dMina < 26) {
          const rocky = dMina < 15 || (dMina < 26 && g > 0.45);
          this.CT[i] = rocky ? (g > 0.8 ? P.STONED : P.STONE) : (h === 1 ? P.G3 : P.G4);
          this.CS[i] = rocky ? P.STONE : P.G1;
          continue;
        }
        // bioma santuário (picos altos de pedra)
        if (dSant < 22) {
          const rocky = dSant < 13 || g > 0.35;
          this.CT[i] = rocky ? (g > 0.75 ? P.STONED : P.STONE) : P.G4;
          this.CS[i] = rocky ? P.STONE : P.G1;
          continue;
        }
        // bioma floresta sombria (musgo escuro)
        if (dFlor < 30) {
          this.CT[i] = g > 0.5 ? P.MOSS : P.MOSS_D;
          this.CS[i] = h <= 1 ? P.G4 : P.G1;
          continue;
        }
        // bioma praia (areia)
        if (dPraia < 26) {
          if (dPraia < 13) { this.CT[i] = P.SAND; this.CS[i] = P.SAND; continue; }
          this.CT[i] = h === 1 ? P.SAND : P.G1;
          this.CS[i] = P.SAND;
          continue;
        }
        // terreno natural comum
        if (h <= 2) {
          this.CT[i] = h === 1 ? (g < 0.4 ? P.G1 : g < 0.85 ? P.G2 : P.G3) : (g < 0.5 ? P.G2 : P.G3);
          this.CS[i] = P.G1;
        } else {
          this.CT[i] = g < 0.6 ? P.G3 : P.G4;
          this.CS[i] = P.G1;
        }
      }
    }
  }
  roadW(pts) {
    const cs = [];
    for (let i = 0; i < pts.length; i += 2) cs.push(this.tileAt(pts[i]), this.tileAt(pts[i + 1]));
    this.roadC(cs);
  }
  roadC(cs) {
    for (let p = 0; p < cs.length - 3; p += 2) this.lineC(cs[p], cs[p + 1], cs[p + 2], cs[p + 3]);
  }
  lineC(x0, z0, x1, z1) {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(z1 - z0)) * 2 + 1;
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      this.stamp(Math.round(x0 + (x1 - x0) * t), Math.round(z0 + (z1 - z0) * t));
    }
  }
  stamp(x, z) {
    if (x < 0 || z < 0 || x >= CELLS || z >= CELLS) return;
    const i = this.idx(x, z);
    if (this.RK[i] || this.H[i] <= 0) return;
    if (this.H[i] > 2) this.H[i] = 2;
    this.CT[i] = P.PATH; this.CS[i] = P.PATH;
  }
  // ---- construções (coordenadas de célula) ----
  box(cx, cz, w, d, h, ct, cs, fill) {
    for (let dz = 0; dz < d; dz++)
      for (let dx = 0; dx < w; dx++) {
        const x = cx + dx, z = cz + dz;
        if (x < 0 || z < 0 || x >= CELLS || z >= CELLS) continue;
        const edge = dx === 0 || dx === w - 1 || dz === 0 || dz === d - 1;
        if (!edge && !fill) continue;
        this.placeBlock(x, z, h, ct, 1, cs !== undefined ? cs : ct);
      }
  }
  wellCell(cx, cz) {
    for (let dz = 0; dz < 3; dz++)
      for (let dx = 0; dx < 3; dx++) {
        const x = cx + dx, z = cz + dz;
        if (dx === 1 && dz === 1) this.placeBlock(x, z, 1, P.STONED, 1, P.STONE);
        else this.placeBlock(x, z, 2, P.STONE, 1, P.STONE);
      }
  }
  obeliskCell(cx, cz) {
    this.box(cx, cz, 2, 2, 1, P.STONE);
    this.placeBlock(cx, cz, 5, P.STONED, 1, P.STONE);
  }
  hutCell(cx, cz) {
    for (let dz = 0; dz < 3; dz++)
      for (let dx = 0; dx < 3; dx++) {
        const x = cx + dx, z = cz + dz;
        const isDoor = dz === 2 && dx === 1;
        const isCenter = dx === 1 && dz === 1;
        if (isCenter) this.placeBlock(x, z, 4, P.ROOFD, 1, P.WOODD);
        else this.placeBlock(x, z, 3, P.ROOF, 1, isDoor ? P.DOOR : P.WOOD);
      }
  }
  millCell(cx, cz) {
    // moinho: torre circular de pedra com telhado cônico de madeira
    for (let dz = -1; dz <= 1; dz++)
      for (let dx = -1; dx <= 1; dx++) {
        if (Math.abs(dx) === 1 && Math.abs(dz) === 1) continue; // octógono
        this.placeBlock(cx + dx, cz + dz, 3, P.STONE);
        this.placeBlock(cx + dx, cz + dz, 4, P.WOOD, 0, P.WOOD);
      }
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      if (Math.abs(dx) === 1 && Math.abs(dz) === 1) continue;
      this.placeBlock(cx + dx, cz + dz, 5, P.WOODD, 0, P.WOODD);
    }
    this.placeBlock(cx, cz, 6, P.ROOFD, 0, P.WOODD);
    // hélice (4 braços de madeira saindo da torre, no eixo x)
    for (let i = 1; i <= 3; i++) {
      this.placeBlock(cx + 2 + i, cz, 4, P.WOOD, 0, P.WOOD);
      this.placeBlock(cx - 2 - i, cz, 4, P.WOOD, 0, P.WOOD);
    }
  }
  ruinsCell(cx, cz) {
    // templo antigo: colunas quebradas ao redor de piso aberto de lajes
    const cols = [[-3, -1, 3], [3, -1, 2], [0, -4, 3], [0, 4, 2], [-2, -3, 2], [2, -3, 2], [-2, 3, 2]];
    for (const [dx, dz, h] of cols) {
      const x = cx + dx, z = cz + dz;
      this.placeBlock(x, z, h, h > 1 ? P.STONE : P.STONED, 1, P.STONE);
    }
    const slabs = [[-2, 0], [-2, 1], [2, -1], [0, 2], [1, 0], [-1, -2], [2, 2], [1, 3], [-1, 3]];
    for (const [dx, dz] of slabs) this.placeBlock(cx + dx, cz + dz, 1, P.STONED, 1, P.STONED);
  }
  pedestalCell(cx, cz) {
    this.placeBlock(cx, cz, 2, P.STONED, 1, P.STONE);
    this.placeBlock(cx - 1, cz, 1, P.STONE);
  }
  minePortalCell(cx, cz) {
    // portal de pedra na encosta
    this.placeBlock(cx, cz, 4, P.STONE);
    this.placeBlock(cx + 2, cz, 4, P.STONE);
    this.placeBlock(cx + 1, cz, 3, P.STONED);
    this.placeBlock(cx + 1, cz, 4, P.STONED);
    this.placeBlock(cx, cz - 1, 3, P.STONE);
    this.placeBlock(cx + 2, cz - 1, 3, P.STONE);
  }
  pierCell(cx, cz) {
    // píer de madeira sobre a lagoa da praia (z cresce para dentro da água)
    for (let i = 0; i < 7; i++) {
      this.placeBlock(cx, cz + i, 1, P.WOOD, 0, P.WOODD);
      if (i === 6) { // ponta com lanternas baixas
        this.placeBlock(cx - 1, cz + i, 1, P.WOOD, 0, P.WOODD);
        this.placeBlock(cx + 1, cz + i, 1, P.WOOD, 0, P.WOODD);
      }
    }
  }

  // ================= SPRITES ESTÁTICOS =================
  buildSprites() {
    const s = [];
    const n2 = valueNoise2D(mulberry32(this.seed + 31));
    const n3 = valueNoise2D(mulberry32(this.seed + 977));
    const mk = o => s.push(o);
    const rng = mulberry32(this.seed + 555);
    // regiões onde não nascem vegetação natural (cidade/áreas desenhadas)
    const inSpecial = (x, z) => {
      for (const reg of REGIONS) {
        if (Math.hypot(x - reg.x, z - reg.z) < reg.r + 6) return true;
      }
      return false;
    };
    // 1) vegetação rasteira longe das rotas (relvado)
    for (let z = 4; z < CELLS - 4; z++) {
      for (let x = 4; x < CELLS - 4; x++) {
        const i = this.idx(x, z);
        if (this.H[i] <= 0 || this.RK[i]) continue;
        const wx = this.tileCenter(x), wz = this.tileCenter(z);
        const na = n2(x * 0.11, z * 0.11);
        const nb = n3(x * 0.16, z * 0.16);
        if (this.CT[i] === P.PATH || this.CT[i] === P.SAND) continue;
        if (inSpecial(wx, wz)) continue;
        if (na > 0.955) {
          mk({ k: 'tree', x: wx, z: wz, seed: Math.floor(na * 1e4), v: Math.floor(nb * 3) % 3 });
        } else if (na < 0.02) {
          mk({ k: 'rock', x: wx, z: wz, seed: Math.floor(nb * 1e4) });
        } else if (na > 0.56 && na < 0.585) {
          mk({ k: 'bush', x: wx, z: wz, seed: Math.floor(nb * 1e4) });
        } else if (na > 0.45 && na < 0.458) {
          mk({ k: 'flower', x: wx + (nb - 0.5) * 0.8, z: wz + (na - 0.45) * 0.8, c: Math.floor(nb * 5) % 5 });
        }
      }
    }
    // 2) árvores ornamentais da vila
    const orn = [[84, 84], [108, 84], [84, 108], [110, 108], [90, 82], [104, 108], [92, 110], [88, 102]];
    for (const [tx, tz] of orn) {
      const wx = this.tileCenter(tx), wz = this.tileCenter(tz);
      mk({ k: 'tree', x: wx, z: wz, seed: tx * 7 + tz, v: (tx + tz) % 3 });
    }
    // 3) floresta dos sussurros: densa de pinheiros e bagas
    const rF = REGION('floresta');
    for (let i = 0; i < 64; i++) {
      const a = rng() * Math.PI * 2, rr = Math.sqrt(rng()) * (rF.r - 3);
      const wx = rF.x + Math.cos(a) * rr, wz = rF.z + Math.sin(a) * rr;
      if (this.heightAt(wx, wz) > 0) {
        const onPath = ROADS.some(() => false);
        void onPath;
        if (Math.abs(wx - rF.x) > 2.5 || Math.abs(wz + 52) > 5) // evita a clareira central
          mk({ k: 'tree', x: wx, z: wz, seed: Math.floor(rng() * 1e5), v: Math.floor(rng() * 3) });
      }
    }
    // 4) coletáveis espalhados por região
    const pick = (k, cx, cz, n, spread, seed0, scale0) => {
      for (let i = 0; i < n; i++) {
        let wx = 0, wz = 0, ok = false;
        for (let tr = 0; tr < 16 && !ok; tr++) {
          const a = rng() * Math.PI * 2, rr = Math.sqrt(rng()) * spread;
          wx = cx + Math.cos(a) * rr; wz = cz + Math.sin(a) * rr;
          if (this.heightAt(wx, wz) === 1) ok = true;
        }
        if (ok) mk({ k, x: wx, z: wz, seed: seed0 + i, pickup: true, s: (scale0 || 1) + (i % 3) * 0.12 });
      }
    };
    // cristais do campo radiante (16 coletáveis) + 3 enfeites
    pick('crystal', 36, 9, 16, 12, 0, 1.25);
    for (const [dx, dz, sc] of [[30, 2, 1.0], [42, 16, 1.3], [38, 0.5, 0.8]]) {
      mk({ k: 'crystal', x: 36 + dx - 36, z: 9 + dz - 9, s: sc, seed: 100 + (dx * 3 + dz), pickup: false });
    }
    // floretes da clareira (16)
    pick('florete', -32, 28, 16, 11, 0, 1);
    // bagas da floresta (18)
    pick('berry', 4, -52, 18, 14, 0, 1);
    // minérios da mina (18)
    pick('ore', -68, 4, 18, 13, 0, 1);
    // conchas da praia (16)
    pick('shell', 18, 64, 20, 15, 0, 1);
    pick('shell', 40, 40, 4, 5, 20, 0.9); // lagoa nordeste
    // essências na floresta (10) — só acesas por perto (glow)
    pick('essence', 4, -48, 10, 16, 0, 0.9);
    // 5) santuários (marcos de visita)
    mk({ k: 'shrine', x: 74, z: -16, seed: 1 });
    mk({ k: 'shrine', x: -68, z: 4, seed: 2 });
    mk({ k: 'shrine', x: 4, z: -56, seed: 3 });
    mk({ k: 'shrine', x: 18, z: 66, seed: 4 });
    // 6) baú do templo (altar) — guarda o Amuleto de Fúria (a3)
    mk({ k: 'chest', id: 'chest_a3', x: -15, z: -17, seed: 2, give: 'a3', locked: true });
    // 7) placas
    mk({ k: 'sign', x: 20, z: 6, seed: 0, msg: 'LESTE: campo radiante' });
    mk({ k: 'sign', x: -12, z: 10, seed: 1, msg: 'SUDOESTE: clareira das lagrimas' });
    mk({ k: 'sign', x: -13, z: -10, seed: 2, msg: 'NOROESTE: templo antigo' });
    mk({ k: 'sign', x: 4, z: -16, seed: 3, msg: 'NORTE: floresta dos sussurros' });
    mk({ k: 'sign', x: -18, z: 4, seed: 4, msg: 'OESTE: penhascos da mina' });
    mk({ k: 'sign', x: 12, z: 18, seed: 5, msg: 'SUL: praia das conchas' });
    mk({ k: 'sign', x: 22, z: 3, seed: 6, msg: 'NORDESTE: santuario do cume' });
    // 8) lanternas da praça
    const lant = [[-8, -8], [14, -8], [-8, 14], [14, 14], [0, -14], [0, 16]];
    for (const [x, z] of lant) mk({ k: 'lantern', x, z, seed: (x * 7 + z * 13) & 15 });
    // 9) NPCs
    mk({ k: 'npc', id: 'elder', x: 7.6, z: -2.8, seed: 0 });
    mk({ k: 'npc', id: 'mira', x: -12.6, z: 3.6, seed: 1 });
    mk({ k: 'npc', id: 'kael', x: -4.8, z: -5.2, seed: 2 });
    // 10) fogueira central
    mk({ k: 'campfire', x: 2.4, z: -7.4, seed: 1 });
    // 11) tochas do templo e da mina
    const tochas = [[-26, -26], [-31, -20], [-19, -19], [-28, -18], [-64, 7], [-72, 1], [-62, 0]];
    for (const [x, z] of tochas) mk({ k: 'torch', x, z, seed: (x * 11 + z * 17) & 15 });
    // 12) rochas decorativas perto do píer
    mk({ k: 'rock', x: 20, z: 56, seed: 90 });
    mk({ k: 'rock', x: 13, z: 62, seed: 91 });
    // 13) selos acesos (interação da história) e portal da cripta
    mk({ k: 'selo', id: 'selo_vila', x: 7, z: -5, seed: 700 });
    mk({ k: 'shrine', x: -33, z: 27, seed: 701 });
    mk({ k: 'selo', id: 'selo_clareira', x: -32.6, z: 25.6, seed: 702 });
    mk({ k: 'selo', id: 'selo_campo', x: 36, z: 6, seed: 703 });
    mk({ k: 'gate', id: 'gate_cripta', x: -58, z: 11, seed: 704 });
    mk({ k: 'portal', id: 'portal_cripta_in', x: -150, z: 166, seed: 705 });
    mk({ k: 'portal', id: 'portal_cripta_out', x: -150, z: 134, seed: 706 });
    // 14) ilha do recife: palmeiras (árvores altas esguias), arbustos, conchas
    const palms = [[163, -152], [176, -154], [169, -147], [177, -165], [162, -166], [165, -156], [175, -158], [168, -170]];
    for (const [x, z] of palms) {
      const wx = x, wz = z;
      if (this.heightAt(wx, wz) > 0) mk({ k: 'tree', x: wx, z: wz, seed: 800 + (x * 3 + z), v: 0, tall: 1 });
    }
    mk({ k: 'lantern', x: 172, z: -158, seed: 810 });
    mk({ k: 'crystal', x: 166, z: -154, s: 1.4, seed: 820, pickup: false, tint: [0.6, 1, 0.9] });
    // 15) naufrágio (casca de barco na água rasa do sul)
    mk({ k: 'ship', x: 44, z: 58, seed: 830 });
    // 16) cripta: tocheiras e cristais escuros em volta da arena
    const crip = [[-158, 142], [-142, 142], [-142, 158], [-158, 158], [-150, 166], [-150, 134]];
    for (const [x, z] of crip) mk({ k: 'torch', x, z, seed: (x * 5 + z) & 15 });
    for (const [x, z] of [[-144, 156], [-156, 156], [-144, 144], [-158, 150]]) {
      mk({ k: 'crystal', x, z, s: 1.6, seed: 900 + (x + z), pickup: false, tint: [0.95, 0.6, 1] });
    }
    // 17) baús de artefatos (conteúdo definido no jogo)
    mk({ k: 'chest', id: 'chest_golem', x: -70, z: 4, seed: 4, give: 'a1' });
    mk({ k: 'chest', id: 'chest_recife', x: 163, z: -156, seed: 5, give: 'heart', hard: true });
    mk({ k: 'chest', id: 'chest_arena', x: -150, z: 150, seed: 6, give: 'a8', hard: true });
    mk({ k: 'chest', id: 'chest_cume', x: 76, z: -14, seed: 7, give: 'heart' });
    mk({ k: 'chest', id: 'chest_floresta', x: 8, z: -48, seed: 8, give: 'heart' });
    mk({ k: 'chest', id: 'chest_vila', x: 1, z: -9, seed: 9, give: 'cura' });
    // 18) flores e detalhes extras da clareira (poi visual)
    for (let i = 0; i < 10; i++) {
      const a = rng() * Math.PI * 2, rr = rng() * 7;
      mk({ k: 'flower', x: -32 + Math.cos(a) * rr, z: 28 + Math.sin(a) * rr, c: Math.floor(rng() * 5) % 5 });
    }
    // 19) mais coletáveis para as missões grandes
    const more = (k, cx, cz, n, spread) => {
      for (let i = 0; i < n; i++) {
        let wx = 0, wz = 0, ok = false;
        for (let tr = 0; tr < 18 && !ok; tr++) {
          const a = rng() * Math.PI * 2, rr = Math.sqrt(rng()) * spread;
          wx = cx + Math.cos(a) * rr; wz = cz + Math.sin(a) * rr;
          if (this.heightAt(wx, wz) === 1) ok = true;
        }
        if (ok) mk({ k, x: wx, z: wz, seed: 5000 + i + (k.charCodeAt(0) * 97), pickup: true });
      }
    };
    more('crystal', 36, 9, 6, 14);   // total 22
    more('florete', -32, 28, 6, 13); // total 22
    more('berry', 4, -52, 10, 18);   // total 28
    more('shell', 18, 64, 6, 17);    // total 26 +4 lagoa
    more('essence', 4, -48, 4, 20);  // total 14
    more('ore', -68, 4, 4, 15);      // total 22
    return s;
  }
  solidCircles() {
    const r = [];
    for (const sp of this.staticSprites) {
      if (sp.k === 'tree') r.push({ x: sp.x, z: sp.z, r: 0.45 });
      else if (sp.k === 'rock') r.push({ x: sp.x, z: sp.z, r: 0.62 });
      else if (sp.k === 'bush') r.push({ x: sp.x, z: sp.z, r: 0.38 });
      else if (sp.k === 'crystal' || sp.k === 'ore' || sp.k === 'berry' || sp.k === 'essence') r.push({ x: sp.x, z: sp.z, r: 0.45 });
      else if (sp.k === 'shell') r.push({ x: sp.x, z: sp.z, r: 0.3 });
      else if (sp.k === 'chest') r.push({ x: sp.x, z: sp.z, r: 0.55 });
      else if (sp.k === 'sign') r.push({ x: sp.x, z: sp.z, r: 0.45 });
      else if (sp.k === 'shrine') r.push({ x: sp.x, z: sp.z, r: 0.6 });
      else if (sp.k === 'lantern' || sp.k === 'torch') r.push({ x: sp.x, z: sp.z, r: 0.35 });
      else if (sp.k === 'selo' || sp.k === 'gate') r.push({ x: sp.x, z: sp.z, r: 0.5 });
    }
    return r;
  }

  // ================= MALHAS =================
  bandMesh(cx, cz, band) {
    const key = 'b' + cx + '_' + cz + '_' + band;
    if (this._cache[key]) return this._cache[key];
    const A = [];
    const z0 = cz * CHUNK + band * 4;
    for (let lz = 0; lz < 4; lz++) {
      const z = z0 + lz;
      for (let x = cx * CHUNK; x < cx * CHUNK + CHUNK; x++) {
        if (x >= CELLS || z >= CELLS) continue;
        const h = this.H[this.idx(x, z)];
        if (h > 0) this.cellMesh(x, z, h, A);
      }
    }
    const buf = new Float32Array(A);
    this._cache[key] = buf;
    return buf;
  }
  cellMesh(x, z, h, A) {
    const c0 = x * TS - WORLD_HALF, c1 = c0 + TS;
    const d0 = z * TS - WORLD_HALF, d1 = d0 + TS;
    const i = this.idx(x, z);
    const ct = this.CT[i], cs = this.CS[i];
    const nxp = this.hOf(x + 1, z), nxn = this.hOf(x - 1, z);
    const nzp = this.hOf(x, z + 1), nzn = this.hOf(x, z - 1);
    const tc = col(ct, true), sc = col(cs, false);
    const mul = (c, m) => [c[0] * m, c[1] * m, c[2] * m];
    // topo
    this.q(A, [c0, h, d0], [c1, h, d0], [c1, h, d1], [c0, h, d1], mul(tc, SH.top));
    if (nxn < h) this.q(A, [c0, Math.max(0, nxn), d0], [c0, Math.max(0, nxn), d1], [c0, h, d1], [c0, h, d0], mul(sc, SH.xn));
    if (nxp < h) this.q(A, [c1, Math.max(0, nxp), d0], [c1, Math.max(0, nxp), d1], [c1, h, d1], [c1, h, d0], mul(sc, SH.xp));
    if (nzn < h) this.q(A, [c0, Math.max(0, nzn), d0], [c1, Math.max(0, nzn), d0], [c1, h, d0], [c0, h, d0], mul(sc, SH.zn));
    if (nzp < h) this.q(A, [c0, Math.max(0, nzp), d1], [c1, Math.max(0, nzp), d1], [c1, h, d1], [c0, h, d1], mul(sc, SH.zp));
  }
  q(A, a, b, c, d, rgb) {
    A.push(a[0], a[1], a[2], rgb[0], rgb[1], rgb[2], 1);
    A.push(b[0], b[1], b[2], rgb[0], rgb[1], rgb[2], 1);
    A.push(c[0], c[1], c[2], rgb[0], rgb[1], rgb[2], 1);
    A.push(a[0], a[1], a[2], rgb[0], rgb[1], rgb[2], 1);
    A.push(c[0], c[1], c[2], rgb[0], rgb[1], rgb[2], 1);
    A.push(d[0], d[1], d[2], rgb[0], rgb[1], rgb[2], 1);
  }
}
