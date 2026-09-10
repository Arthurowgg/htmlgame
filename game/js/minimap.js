// GRAND PIXEL GAME — mapa e minimapa
// O minimapa é desenhado na própria tela do jogo (mesma grade de pixels do
// mundo): terreno de verdade, estradas, pontos com ícone, bússola, cone de
// visão e marcador de destino. O mapa grande abre a ilha inteira em 1 pixel
// por célula do mundo.
import { CELLS, TS, P, REGIONS, REGION, ROADS } from './world.js';
import { drawIcon, ICON_SIZE } from './icons.js';
import { drawText } from './font.js';

export const MAP = {
  zoom: 0,               // índice em ZOOMS
  dest: null,            // {x, z, nome} destino marcado no mapa grande
  legend: 0,             // 0 terreno | 1 pontos | 2 missões
  sel: null,             // ponto selecionado no mapa grande (id)
  t: 0,                  // relógio do mapa (pulsos)
};
export const ZOOMS = [
  { u: 120, lab: '1x', nome: 'perto' },
  { u: 200, lab: '2x', nome: 'médio' },
  { u: 320, lab: '3x', nome: 'ilha' },
];
export const MAP_SIZE = CELLS;   // 1 pixel do mapa = 1 célula do mundo

// cor de cada região na mancha do mapa grande
const REGION_TINT = {
  vila: '#ffd76a', campo: '#8cd96a', clareira: '#7ad9e8', templo: '#b394f2',
  floresta: '#4f9b57', mina: '#a8b0bd', praia: '#ffe0a0', santuario: '#8ecbff',
  recife: '#5fe0d0', cripta: '#c58cf0',
};

// ---------------------------------------------------------------- cores ----
const C = {
  deep: [24, 52, 88], shallow: [43, 94, 138], foam: [96, 158, 178],
  sand: [226, 205, 138], path: [186, 158, 106],
  grass: [[104, 166, 84], [92, 154, 76], [80, 142, 68], [68, 128, 60]],
  stone: [138, 145, 152], wood: [150, 106, 60], woodD: [112, 76, 44],
  roof: [176, 74, 54], roofD: [128, 52, 40], moss: [64, 104, 60],
  door: [72, 48, 30], win: [110, 168, 184], dark: [18, 16, 32],
};

function mix(c, k) { return [c[0] * k, c[1] * k, c[2] * k]; }
function rgb(c) { return 'rgb(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ')'; }

// ------------------------------------------------------- imagem da ilha ----
// Um bitmap de 192x192 (1 pixel por célula) com relevo sombreado: é a base do
// minimapa e do mapa grande — nada de arte pré-feita, tudo do mundo real.
export function islandBitmap(worldObj) {
  if (worldObj._mapBmp) return worldObj._mapBmp;
  const n = CELLS;
  const cv = document.createElement('canvas');
  cv.width = n; cv.height = n;
  const g = cv.getContext('2d');
  g.imageSmoothingEnabled = false;
  const img = g.createImageData(n, n);
  const d = img.data;
  const H = worldObj.H, CT = worldObj.CT, RK = worldObj.RK;
  const hAt = (x, z) => (x < 0 || z < 0 || x >= n || z >= n) ? 0 : H[z * n + x];
  for (let z = 0; z < n; z++) {
    for (let x = 0; x < n; x++) {
      const i = z * n + x;
      const h = H[i], ct = CT[i];
      let col;
      if (h === 0) {
        // água: rasa perto da costa, funda no aberto
        let near = 0;
        for (let dz = -2; dz <= 2 && !near; dz++)
          for (let dx = -2; dx <= 2; dx++) if (hAt(x + dx, z + dz) > 0) { near = 1; break; }
        col = near ? C.shallow : C.deep;
      } else if (ct === P.SAND) col = C.sand;
      else if (ct === P.PATH) col = C.path;
      else if (ct === P.WOOD || ct === P.WOODD) col = ct === P.WOOD ? C.wood : C.woodD;
      else if (ct === P.ROOF || ct === P.ROOFD) col = ct === P.ROOF ? C.roof : C.roofD;
      else if (ct === P.DOOR) col = C.door;
      else if (ct === P.WIN) col = C.win;
      else if (ct === P.MOSS || ct === P.MOSS_D) col = mix(C.moss, ct === P.MOSS ? 1 : 0.8);
      else if (ct === P.STONE) col = mix(C.stone, 1.0);
      else if (ct === P.STONED) col = mix(C.stone, 0.78);
      else if (h >= 4) col = C.stone;
      else col = C.grass[Math.min(3, Math.max(0, h - 1))] || C.grass[0];
      // relevo: clareia encostas viradas para noroeste, escurece as outras
      if (h > 0) {
        const dz = h - hAt(x, z - 1), dx = h - hAt(x - 1, z);
        const shade = 1 + (dz * 0.10) - (dx * 0.12) + (h - 2) * 0.02;
        col = mix(col, Math.max(0.72, Math.min(1.22, shade)));
      }
      const o = i * 4;
      d[o] = col[0]; d[o + 1] = col[1]; d[o + 2] = col[2]; d[o + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);

  // estradas por cima: é o que faz o mapa "ler" como mapa de jogo
  g.strokeStyle = 'rgba(214,186,132,0.85)';
  g.lineWidth = 1;
  g.beginPath();
  for (const road of ROADS) {
    for (let i = 0; i < road.length - 1; i++) {
      const [ax, az] = road[i], [bx, bz] = road[i + 1];
      // mundo → pixel do mapa (1 pixel = 1 célula de 2 unidades)
      const sx = (ax + CELLS) / 2, sz = (az + CELLS) / 2;
      const ex = (bx + CELLS) / 2, ez = (bz + CELLS) / 2;
      g.moveTo(sx, sz);
      g.lineTo(ex, ez);
    }
  }
  g.stroke();
  // tracejado fino por cima dá a ideia de trilha batida
  g.strokeStyle = 'rgba(255,231,180,0.35)';
  g.beginPath();
  for (const road of ROADS) {
    for (let i = 0; i < road.length - 1; i++) {
      const [ax, az] = road[i], [bx, bz] = road[i + 1];
      const sx = (ax + CELLS) / 2, sz = (az + CELLS) / 2;
      const ex = (bx + CELLS) / 2, ez = (bz + CELLS) / 2;
      const n = Math.max(1, Math.round(Math.hypot(ex - sx, ez - sz)));
      for (let k = 0; k < n; k += 3) {
        const t = k / n;
        g.moveTo(sx + (ex - sx) * t, sz + (ez - sz) * t);
        g.lineTo(sx + (ex - sx) * t + 0.6, sz + (ez - sz) * t + 0.6);
      }
    }
  }
  g.stroke();

  worldObj._mapBmp = cv;
  return cv;
}

// célula (tile) de um ponto do mundo → pixel do bitmap
export function worldToMap(x, z) {
  const t = TS;
  return { x: Math.round((x + CELLS * t / 2) / t), z: Math.round((z + CELLS * t / 2) / t) };
}
export function mapToWorld(mx, mz) {
  const t = TS;
  return { x: mx * t - CELLS * t / 2, z: mz * t - CELLS * t / 2 };
}

// ------------------------------------------------------------ ícones ------
const KIND_ICON = {
  vila: 'casa', casa: 'casa', loja: 'casa', moinho: 'moinho', poco: 'poco',
  torre: 'torre', mirante: 'torre', porto: 'ancora', pier: 'ancora', barco: 'ancora',
  caverna: 'caverna', mina: 'caverna', cripta: 'cripta', ruina: 'cripta',
  montanha: 'montanha', cume: 'montanha', santuario: 'montanha',
  praia: 'palmeira', recife: 'palmeira', floresta: 'arvore', clareira: 'arvore',
  templo: 'templo', altar: 'altar', selo: 'selo', bau: 'bau', tesouro: 'bau',
  artefato: 'gema', chefe: 'caveira', inimigo: 'caveira', tenda: 'tenda',
  acampamento: 'tenda', ponte: 'ponte', farol: 'farol', portao: 'portao',
  fazenda: 'fazenda', agua: 'agua', lagoa: 'agua', ponte_rio: 'ponte',
  missao: 'missao', npc: 'npc', mirante2: 'torre',
};

export function kindIcon(kind) { return KIND_ICON[kind] || 'missao'; }

// tipo do ponto: usa p.kind quando existir, senão adivinha pelo id
export function poiKind(p) {
  if (p.kind) return p.kind;
  const id = (p.id || '') + ' ' + (p.nome || '');
  const has = (...ws) => ws.some(w => id.toLowerCase().includes(w));
  if (p.selo || has('selo')) return 'selo';
  if (has('poco', 'poço')) return 'poco';
  if (has('moinho')) return 'moinho';
  if (has('farol')) return 'farol';
  if (has('pier', 'porto')) return 'porto';
  if (has('naufrag')) return 'barco';
  if (has('recife')) return 'recife';
  if (has('minas', 'boca da mina')) return 'mina';
  if (has('gate', 'arco', 'portal')) return 'portao';
  if (has('cripta')) return 'cripta';
  if (has('templo')) return 'templo';
  if (has('altar')) return 'altar';
  if (has('cume', 'mirante')) return 'mirante';
  if (has('lagoa', 'torrente')) return 'lagoa';
  if (has('praia')) return 'praia';
  if (has('torre')) return 'torre';
  if (has('praca', 'praça', 'vila')) return 'vila';
  if (has('campo', 'clareira')) return 'floresta';
  return 'missao';
}

export function poiIconName(p) { return kindIcon(poiKind(p)); }

// ------------------------------------------------------------- quadros ----
function frame(ctx, x, y, w, h, opt = {}) {
  const border = opt.border || '#221c38';
  const hi = opt.hi || '#514879';
  const lo = opt.lo || '#0f0c1c';
  const bg = opt.bg || 'rgba(12,10,24,0.92)';
  ctx.fillStyle = lo;
  ctx.fillRect(x + 1, y + 1, w - 1, h - 1);
  ctx.fillStyle = bg;
  ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
  ctx.fillStyle = border;
  ctx.fillRect(x, y, w, 1); ctx.fillRect(x, y + h - 1, w, 1);
  ctx.fillRect(x, y, 1, h); ctx.fillRect(x + w - 1, y, 1, h);
  ctx.fillStyle = hi;
  ctx.fillRect(x + 1, y + 1, w - 2, 1);
  ctx.fillRect(x + 1, y + 1, 1, h - 2);
  ctx.fillStyle = lo;
  ctx.fillRect(x + 1, y + h - 2, w - 2, 1);
  ctx.fillRect(x + w - 2, y + 1, 1, h - 2);
  // cantos recortados: cara de painel de pixel
  ctx.fillStyle = bg;
  ctx.fillRect(x, y, 1, 1); ctx.fillRect(x + w - 1, y, 1, 1);
  ctx.fillRect(x, y + h - 1, 1, 1); ctx.fillRect(x + w - 1, y + h - 1, 1, 1);
}

// retângulo do minimapa na tela (pixels de jogo)
export function minimapBox(W, H) {
  const MW = 92, MH = 104;
  const x = W - MW - 6, y = 6;
  return { x, y, w: MW, h: MH, mapX: x + 2, mapY: y + 14, mapW: 88, mapH: 88 };
}

// desenha um ícone (tamanho em pixels do jogo) com contorno escuro opcional
function iconOn(ctx, name, x, y, size, dark) {
  if (dark) {
    ctx.fillStyle = dark;
    ctx.fillRect(Math.round(x) - 1, Math.round(y) - 1, size + 2, size + 2);
  }
  drawIcon(ctx, name, x, y, 1, size);
}

const MINI_ICON = 6;   // ícones do minimapa (o do mapa grande é 9)

// ------------------------------------------------------------ minimapa ----
// st = { player, cam, visited, hasLens, objective, world, dim }
export function drawMinimap(ctx, W, H, st) {
  const box = minimapBox(W, H);
  const bmp = islandBitmap(st.world);
  const z = ZOOMS[MAP.zoom] || ZOOMS[0];
  const inner = box.mapW;

  // ------ painel
  frame(ctx, box.x, box.y, box.w, box.h);
  const reg = REGION(regionOf(st, st.player.x, st.player.z));
  const zl = z.lab;
  const zlW = zl.length * 6 + 1;
  let nome = (reg && reg.name) || 'SOLARIA';
  const maxNome = Math.floor((box.w - 12 - zlW) / 6);   // fonte 5px + 1 de espaço
  if (nome.length > maxNome) nome = nome.slice(0, Math.max(3, maxNome - 1)) + '.';
  ctx.fillStyle = '#ffd76a';
  ctx.fillRect(box.x + 3, box.y + 3, 2, 9);
  drawText(ctx, nome, box.x + 7, box.y + 3, 1, '#f2e9d8');
  drawText(ctx, zl, box.x + box.w - 3, box.y + 3, 1, '#9a91b5', { align: 'right' });

  // ------ terreno
  const u2t = 1 / TS;                       // unidades de mundo → células
  const srcT = Math.max(8, z.u * u2t * 0.5); // meia largura em células
  const pxT = worldToMap(st.player.x, st.player.z);
  ctx.save();
  ctx.beginPath();
  ctx.rect(box.mapX, box.mapY, box.mapW, box.mapH);
  ctx.clip();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(bmp, pxT.x - srcT, pxT.z - srcT, srcT * 2, srcT * 2,
    box.mapX, box.mapY, inner, inner);

  // vinheta leve para o painel não brigar com o mundo
  ctx.fillStyle = 'rgba(8,6,18,0.18)';
  ctx.fillRect(box.mapX, box.mapY, inner, inner);

  const u2px = inner / (srcT * 2 * TS);     // unidades de mundo → pixel do mapa
  const cx = box.mapX + inner / 2, cy = box.mapY + inner / 2;
  const toMap = (wx, wz) => ({ x: cx + (wx - st.player.x) * u2px, y: cy + (wz - st.player.z) * u2px });
  const inside = (p, pad = 6) => p.x > box.mapX + pad && p.x < box.mapX + inner - pad &&
    p.y > box.mapY + pad && p.y < box.mapY + inner - pad;

  // ------ pontos de interesse
  const pts = (st.pois || []).filter(p => {
    if (p.oculto && !st.visited.has(p.id) && !st.hasLens) return false;
    return true;
  });
  const taken = [];
  const spots = pts.map(p => ({ p, m: toMap(p.x, p.z) })).filter(o => inside(o.m, 4));
  spots.sort((a, b) => (Math.hypot(a.m.x - cx, a.m.y - cy) - Math.hypot(b.m.x - cx, b.m.y - cy)));
  for (const { p, m } of spots) {
    if (taken.some(t => Math.abs(t.x - m.x) < 10 && Math.abs(t.y - m.y) < 10)) continue;
    taken.push(m);
    const seen = st.visited.has(p.id);
    iconOn(ctx, poiIconName(p), Math.round(m.x - MINI_ICON / 2), Math.round(m.y - MINI_ICON / 2),
      MINI_ICON, seen ? null : 'rgba(10,8,20,0.55)');
  }

  // ------ construções e marcos da ilha (pontinhos claros)
  const lms = (st.landmarks || []);
  for (const lm of lms) {
    const m = toMap(lm.x, lm.z);
    if (!inside(m, 3)) continue;
    const d = Math.hypot(lm.x - st.player.x, lm.z - st.player.z);
    if (d > z.u) continue;
    if (taken.some(t => Math.abs(t.x - m.x) < 8 && Math.abs(t.y - m.y) < 8)) continue;
    ctx.fillStyle = lm.cor || '#d8c38a';
    ctx.fillRect(Math.round(m.x) - 1, Math.round(m.y) - 1, 3, 3);
    ctx.fillStyle = 'rgba(20,16,34,0.8)';
    ctx.fillRect(Math.round(m.x) - 1, Math.round(m.y) - 1, 1, 1);
  }

  // ------ destino marcado no mapa grande
  if (MAP.dest) {
    const m = toMap(MAP.dest.x, MAP.dest.z);
    const near = inside(m, 5);
    const mx = Math.max(box.mapX + 5, Math.min(box.mapX + inner - 5, m.x));
    const my = Math.max(box.mapY + 5, Math.min(box.mapY + inner - 5, m.y));
    iconOn(ctx, 'marcador', Math.round(mx - 4), Math.round(my - 4), 9, near ? null : 'rgba(10,8,20,0.6)');
  }

  // ------ objetivo da missão
  const o = st.objective;
  if (o && o.x !== null && o.x !== undefined) {
    const m = toMap(o.x, o.z);
    if (inside(m, 4)) {
      const pulse = 1 + Math.sin(MAP.t * 4) * 0.5;
      ctx.fillStyle = o.cor || '#ffd76a';
      const s = 3 + Math.round(pulse);
      ctx.fillRect(Math.round(m.x) - s, Math.round(m.y) - 1, s * 2, 2);
      ctx.fillRect(Math.round(m.x) - 1, Math.round(m.y) - s, 2, s * 2);
      ctx.fillRect(Math.round(m.x) - 1, Math.round(m.y) - 1, 2, 2);
    } else {
      // fora da janela: seta na borda apontando o caminho
      const dx = o.x - st.player.x, dz = o.z - st.player.z;
      const a = Math.atan2(dz, dx);
      const rx = Math.min(inner / 2 - 6, Math.abs(Math.cos(a)) * (inner / 2 - 6)) * Math.sign(Math.cos(a));
      const ry = Math.min(inner / 2 - 6, Math.abs(Math.sin(a)) * (inner / 2 - 6)) * Math.sign(Math.sin(a));
      const px = Math.round(cx + rx), py = Math.round(cy + ry);
      ctx.fillStyle = o.cor || '#ffd76a';
      if (Math.abs(Math.cos(a)) > Math.abs(Math.sin(a))) {
        const s = Math.cos(a) > 0 ? 1 : -1;
        ctx.fillRect(px, py - 1, 2 * s, 2);
        ctx.fillRect(px - s, py - 3, 1 * s, 6);
      } else {
        const s = Math.sin(a) > 0 ? 1 : -1;
        ctx.fillRect(px - 1, py, 2, 2 * s);
        ctx.fillRect(px - 3, py - s, 6, 1 * s);
      }
    }
  }

  // ------ cone de visão + jogador
  const yaw = st.cam.yaw;
  const coneR = 22;
  ctx.fillStyle = 'rgba(255,239,180,0.13)';
  for (let i = -3; i <= 3; i++) {
    const a = yaw + Math.PI + i * 0.13;
    for (let r = 4; r < coneR; r += 1) {
      const px = Math.round(cx + Math.cos(a) * r), py = Math.round(cy + Math.sin(a) * r);
      if (px < box.mapX || px >= box.mapX + inner || py < box.mapY || py >= box.mapY + inner) continue;
      ctx.fillRect(px, py, 1, 1);
    }
  }
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(yaw + Math.PI / 2);   // 0 = olhando para -Z (norte)
  ctx.fillStyle = '#0a0814';       // contorno forte: o jogador sempre aparece
  ctx.fillRect(-5, -6, 10, 12);
  ctx.fillStyle = '#fff3d6';
  ctx.fillRect(-4, -5, 8, 10);
  ctx.fillStyle = '#ffd76a';
  ctx.fillRect(-2, -3, 4, 6);
  ctx.fillStyle = '#0a0814';
  ctx.fillRect(-1, -5, 2, 5);
  ctx.restore();

  ctx.restore();   // fim do clip

  // ------ bússola e distância
  const N = 'N';
  drawText(ctx, N, box.mapX + 3, box.mapY + 2, 1, '#e8607a');
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.fillRect(box.mapX + 3, box.mapY + 11, 6, 1);
  const oo = st.objective;
  if (oo && oo.x !== null && oo.x !== undefined) {
    const dist = Math.round(Math.hypot(oo.x - st.player.x, oo.z - st.player.z));
    const txt = 'obj ' + dist + 'm';
    drawText(ctx, txt, box.x + 4, box.y + box.h + 2, 1, '#d8cfa8');
  }
  return box;
}

function regionOf(st, x, z) {
  if (!st.regions) return 'vila';
  let best = st.regions[0], bd = 1e9;
  for (const r of st.regions) {
    const d = Math.hypot(r.x - x, r.z - z);
    if (d < bd) { bd = d; best = r; }
  }
  return best ? best.id : 'vila';
}

// -------------------------------------------------------- mapa grande -----
export function bigMapSize() { return { w: 208, h: 208, mapX: 8, mapY: 8, mapW: 192, mapH: 192 }; }

export function drawBigMap(ctx, st) {
  const cw = ctx.canvas.width, ch = ctx.canvas.height;
  const S = bigMapSize();
  const bmp = islandBitmap(st.world);
  frame(ctx, 0, 0, cw, ch, { bg: 'rgba(10,8,20,0.96)' });
  ctx.imageSmoothingEnabled = false;
  const ox = S.mapX, oy = S.mapY, mw = Math.min(S.mapW, bmp.width), mh = Math.min(S.mapH, bmp.height);
  ctx.drawImage(bmp, 0, 0, bmp.width, bmp.height, ox, oy, mw, mh);

  const toMap = (wx, wz) => {
    const m = worldToMap(wx, wz);
    return { x: ox + m.x, y: oy + m.z };
  };

  // regiões: mancha de cor suave (dá relevo ao mapa sem encher de texto)
  if (MAP.legend === 0) {
    for (const r of st.regions || []) {
      const m = toMap(r.x, r.z);
      const rr = Math.max(6, r.r / TS);
      const col = REGION_TINT[r.id] || '#ffffff';
      ctx.globalAlpha = 0.13;
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(m.x, m.y, rr, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.35;
      ctx.strokeStyle = col;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(m.x, m.y, rr, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  // marcos e pontos
  const showPts = MAP.legend !== 2;
  for (const lm of st.landmarks || []) {
    const m = toMap(lm.x, lm.z);
    ctx.fillStyle = lm.cor || '#d8c38a';
    ctx.fillRect(Math.round(m.x) - 1, Math.round(m.y) - 1, 3, 3);
  }
  const taken = [];
  for (const p of st.pois || []) {
    if (p.oculto && !st.visited.has(p.id) && !st.hasLens) continue;
    const m = toMap(p.x, p.z);
    if (taken.some(t => Math.abs(t.x - m.x) < 12 && Math.abs(t.y - m.y) < 12)) continue;
    taken.push(m);
    const seen = st.visited.has(p.id);
    const sel = MAP.sel === p.id;
    const w = showPts ? 1 : 1;
    iconOn(ctx, poiIconName(p), Math.round(m.x - ICON_SIZE / 2), Math.round(m.y - ICON_SIZE / 2 - 2),
      ICON_SIZE, seen ? null : 'rgba(8,6,16,0.6)');
    if (sel) {
      ctx.strokeStyle = '#ffd76a';
      ctx.lineWidth = 1;
      const s = ICON_SIZE / 2 + 2;
      ctx.strokeRect(Math.round(m.x - s) + 0.5, Math.round(m.y - s - 4) + 0.5, s * 2 - 1, s * 2 - 1);
    }
  }

  // objetivo e destino
  const o = st.objective;
  if (o && o.x !== null && o.x !== undefined) {
    const m = toMap(o.x, o.z);
    ctx.fillStyle = o.cor || '#ffd76a';
    ctx.fillRect(Math.round(m.x) - 4, Math.round(m.y) - 1, 8, 2);
    ctx.fillRect(Math.round(m.x) - 1, Math.round(m.y) - 4, 2, 8);
  }
  if (MAP.dest) {
    const m = toMap(MAP.dest.x, MAP.dest.z);
    iconOn(ctx, 'marcador', Math.round(m.x - 4), Math.round(m.y - 4), 9, null);
  }

  // jogador: seta branca
  const pm = toMap(st.player.x, st.player.z);
  ctx.save();
  ctx.translate(Math.round(pm.x), Math.round(pm.y));
  ctx.rotate(st.cam.yaw + Math.PI / 2);
  ctx.fillStyle = '#1a1428';
  ctx.fillRect(-5, -6, 10, 12);
  ctx.fillStyle = '#fff3d6';
  ctx.fillRect(-4, -5, 8, 10);
  ctx.fillStyle = '#ffd76a';
  ctx.fillRect(-2, -3, 4, 6);
  ctx.restore();
  return S;
}

// o que existe num ponto do mapa (para o aviso ao passar o mouse)
export function bigMapInfo(ix, iy, st) {
  const S = bigMapSize();
  const x = ix - S.mapX, y = iy - S.mapY;
  if (x < 0 || y < 0 || x > S.mapW || y > S.mapH) return null;
  const w = mapToWorld(x, y);
  let best = null, bd = 34;      // raio generoso: ícone é pequeno
  for (const p of st.pois || []) {
    if (p.oculto && !st.visited.has(p.id) && !st.hasLens) continue;
    const d = Math.hypot(p.x - w.x, p.z - w.z);
    if (d < bd) { bd = d; best = p; }
  }
  if (best) {
    const seen = st.visited.has(best.id);
    const dist = Math.round(Math.hypot(best.x - st.player.x, best.z - st.player.z));
    return { nome: best.nome, dist, visto: seen, x: best.x, z: best.z, poi: best };
  }
  // nenhum ponto: informa a região
  let reg = null, rd = 1e9;
  for (const r of st.regions || []) {
    const d = Math.hypot(r.x - w.x, r.z - w.z);
    if (d < r.r && d < rd) { rd = d; reg = r; }
  }
  return reg ? { nome: reg.name, regiao: true } : null;
}

// clique no mapa grande → ponto mais próximo (para marcar destino)
export function bigMapPick(cssX, cssY, st) {
  const S = bigMapSize();
  const x = cssX - S.mapX, y = cssY - S.mapY;
  if (x < 0 || y < 0 || x > S.mapW || y > S.mapH) return null;
  const w = mapToWorld(x, y);
  let best = null, bd = 60;
  for (const p of st.pois || []) {
    if (p.oculto && !st.visited.has(p.id) && !st.hasLens) continue;
    const d = Math.hypot(p.x - w.x, p.z - w.z);
    if (d < bd) { bd = d; best = p; }
  }
  return best ? { kind: 'poi', poi: best } : { kind: 'spot', x: w.x, z: w.z };
}
