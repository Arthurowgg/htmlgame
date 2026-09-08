// GRAND PIXEL GAME — jogo principal: menu, cutscene, mundo aberto, 30+ missões
import { World, TS, WORLD_HALF, WATER_Y, REGIONS, REGION } from './world.js';
import { Renderer, ART } from './renderer.js';
import { audio } from './audio.js';
import { drawText, wrapText, textWidth } from './font.js';
import { clamp, lerp, smoothstep } from './math.js';
import { dialogFor, NPC_INFO, SIDE, SIDE_TOTAL } from './quests.js';

const W = 512, H = 288;
const glCanvas = document.getElementById('gl');
const uiCanvas = document.getElementById('ui');
const ui = uiCanvas.getContext('2d');
glCanvas.width = W; glCanvas.height = H;
uiCanvas.width = W; uiCanvas.height = H;
ui.imageSmoothingEnabled = false;
const SEED = 20260908;
const world = new World(SEED);
const rdr = new Renderer(glCanvas, world);
rdr.resize(W, H);

// ---------------- configuração ----------------
const CFG = Object.assign({ mus: 0.9, sfx: 0.8, qual: 1 }, loadCfg());
function loadCfg() {
  try { return JSON.parse(localStorage.getItem('grandpixel-cfg') || 'null') || {}; } catch (e) { return {}; }
}
function saveCfg() {
  try { localStorage.setItem('grandpixel-cfg', JSON.stringify(CFG)); } catch (e) {}
}
function applyCfg() {
  audio.setMusicVol(CFG.mus);
  audio.setSfxVol(CFG.sfx);
  const q = CFG.qual || 1;
  cam.fogA = q === 0 ? 45 : q === 1 ? 70 : 95;
  cam.fogB = q === 0 ? 120 : q === 1 ? 215 : 320;
}

// ---------------- estado ----------------
let phase = 'boot';     // boot | title | howto | options | cut | play | pause | log
let time = 0;
let last = performance.now();
const cam = { x: 0, y: 9, z: 30, yaw: 0, pitch: -0.4, tyaw: 0, fogA: 70, fogB: 215 };
const keys = {};
const input = { jx: 0, jy: 0, atk: false, jump: false, act: false };
const player = {
  x: 5.5, z: 5.5, y: 1, vy: 0, yaw: -Math.PI / 4,
  hp: 3, hpMax: 3, inv: 0, hurtT: 0, atk: 0, walkT: 0,
  onGround: true, swim: false, moving: false, kx: 0, kz: 0, jumpBuf: 0,
};
const q = [0, 0, 0];                 // 0 bloqueada | 1 ativa | 2 concluída
const collected = new Set();         // seeds coletados (todos os tipos de pickup)
const colN = {};                     // total coletado por tipo de item
const killN = { campo: 0, mina: 0, ruinas: 0, wisp: 0, todos: 0 };
const side = new Array(SIDE_TOTAL).fill(0);  // 0 bloqueada | 1 ativa | 2 concluída
let chestOpen = false;
let hpBonus = 0;                     // corações extras por missões
const fx = { fade: 0, fadeIn: true, fadeCol: '#000', banner: null, toast: null, red: 0, parts: [] };
let dlg = null;
let cut = null;
let logPage = 0;
let menuSel = 0;                     // item selecionado no menu de pausa
let optionsFrom = 'title', howtoFrom = 'title';

const NAME = 'GRAND PIXEL GAME';

// NPCs
const NPC_SPR = {};
for (const s of world.staticSprites) if (s.k === 'npc') NPC_SPR[s.id] = s;
const ELDER = NPC_SPR.elder, MIRA = NPC_SPR.mira, KAEL = NPC_SPR.kael;

// ---------------- inimigos ----------------
const SLIMES = [
  // campo radiante (verdes)
  { x: 36, z: 13, area: 'campo' }, { x: 33, z: 7, area: 'campo' }, { x: 39, z: 10, area: 'campo' },
  { x: 34, z: 12, area: 'campo' }, { x: 38, z: 6, area: 'campo' }, { x: 31, z: 9, area: 'campo' }, { x: 37, z: 5, area: 'campo' },
  // templo antigo (verde musgo)
  { x: -24, z: -19, area: 'ruinas' }, { x: -23, z: -22, area: 'ruinas' },
  { x: -22, z: -18, area: 'ruinas' }, { x: -21, z: -21, area: 'ruinas' },
  // penhascos da mina (cinza-pedra)
  { x: -66, z: 7, area: 'mina', tint: [0.72, 0.78, 0.85] }, { x: -71, z: 2, area: 'mina', tint: [0.72, 0.78, 0.85] },
  { x: -63, z: 1, area: 'mina', tint: [0.72, 0.78, 0.85] }, { x: -69, z: 8, area: 'mina', tint: [0.72, 0.78, 0.85] },
  { x: -64, z: 6, area: 'mina', tint: [0.72, 0.78, 0.85] },
];
for (const s of SLIMES) {
  s.g = groundY(s.x, s.z);
  s.hp = s.area === 'mina' ? 3 : 2;
  s.vy = 0; s.vx = 0; s.vz = 0; s.hit = 0; s.cd = Math.random() * 2; s.alive = true;
  s.t = Math.random() * 9;
}
// wisps da floresta (levitam)
const WISPS = [
  { x: 2, z: -58 }, { x: 8, z: -53 }, { x: 0, z: -50 }, { x: 6, z: -60 },
  { x: -2, z: -54 }, { x: 9, z: -49 }, { x: 5, z: -47 },
];
for (const s of WISPS) {
  s.g = Math.max(WATER_Y, groundY(s.x, s.z));
  s.y = s.g + 1.6;
  s.hp = 2; s.hit = 0; s.cd = 1 + Math.random() * 2; s.alive = true; s.t = Math.random() * 9;
  s.vx = 0; s.vz = 0;
}

// ---------------- utilitários ----------------
function groundY(x, z) { return Math.max(0, world.heightAt(x, z)); }
const stripCol = t => t.replace(/#[0-9A-Fa-f]{6}/g, '');
function playerGround() { return Math.max(0, groundY(player.x, player.z)); }
function banner(text, cor = '#ffd76a') { fx.banner = { text, cor, t: 0 }; audio.sfx('quest'); }
function toast(text) { fx.toast = { text, t: 0 }; }
function burst(x, y, z, col, n = 8) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    fx.parts.push({
      x, y, z, t: 0, life: 0.7 + Math.random() * 0.5,
      vx: Math.cos(a) * (2 + Math.random() * 2), vz: Math.sin(a) * (2 + Math.random() * 2),
      vy: 2.2 + Math.random() * 2.6, r: col[0], g: col[1], b: col[2],
    });
  }
}
const pickupName = k => k === 'crystal' ? 'cristais' : k === 'florete' ? 'flores de luz'
  : k === 'berry' ? 'bagas' : k === 'ore' ? 'minerios' : k === 'shell' ? 'conchas' : 'essencias';

// ---------------- missões secundárias ----------------
function sideActive() {
  const list = [];
  for (let i = 0; i < SIDE.length; i++) if (side[i] === 1) list.push(i);
  return list;
}
function sideProgress(i) {
  const s = SIDE[i];
  if (s.tipo === 'c') {
    const cur = colN[s.item] || 0;
    return Math.min(cur, s.need);
  }
  if (s.tipo === 'k') {
    const cur = s.area === 'todos' ? (killN.campo + killN.mina + killN.ruinas)
      : s.area === 'wisp' ? killN.wisp : killN[s.area] || 0;
    return Math.min(cur, s.need);
  }
  return 0;
}
function sideDoneCount() { return side.filter(v => v === 2).length; }
function sideTotalDone() { return 3 + sideDoneCount(); }
function objectiveNow() {
  // história primeiro
  if (q[0] === 0) return { txt: 'FALE COM ORI  [norte da praca, junto ao obelisco]', x: ELDER.x, z: ELDER.z, cor: '#ffd76a' };
  if (q[0] === 1) {
    const got = Math.min(colN.crystal || 0, 5);
    return { txt: 'CRISTAIS DA MEMORIA  ' + got + '/5  [campo radiante: leste]', x: 36, z: 9, cor: '#ff9de0' };
  }
  if (q[1] === 0) return { txt: 'FALE COM MIRA  [cabana a oeste da praca]', x: MIRA.x, z: MIRA.z, cor: '#7de4ff' };
  if (q[1] === 1) {
    const got = Math.min(colN.florete || 0, 5);
    return { txt: 'FLORES DE LUZ  ' + got + '/5  [clareira: sudoeste]', x: -32, z: 28, cor: '#7de4ff' };
  }
  if (q[2] === 0) return { txt: 'FALE COM KAEL  [estrada noroeste]', x: KAEL.x, z: KAEL.z, cor: '#8fd6ff' };
  if (q[2] === 1) {
    const n = SLIMES.filter(s => s.alive && s.area === 'ruinas').length;
    return { txt: 'O BAU DO TEMPLO  slimes: ' + n + '  [templo: noroeste]', x: -23, z: -19, cor: '#ffd76a' };
  }
  // história completa: rastreia a primeira missão secundária ativa
  for (const i of sideActive()) {
    const s = SIDE[i];
    const pr = sideProgress(i);
    const alvo = s.tipo === 'v' ? ' [visite o local]' : ' ' + pr + '/' + s.need;
    return { txt: (s.nome + alvo).toUpperCase(), x: s.x, z: s.z, cor: s.cor, side: true };
  }
  return null;
}
function checkSideQuests() {
  let changed = false;
  for (let i = 0; i < SIDE.length; i++) {
    if (side[i] !== 1) continue;
    const s = SIDE[i];
    let done = false;
    if (s.tipo === 'c') done = (colN[s.item] || 0) >= s.need;
    else if (s.tipo === 'k') {
      const cur = s.area === 'todos' ? (killN.campo + killN.mina + killN.ruinas)
        : s.area === 'wisp' ? killN.wisp : killN[s.area] || 0;
      done = cur >= s.need;
    } else if (s.tipo === 'v') {
      const d = Math.hypot(player.x - s.x, player.z - s.z);
      done = d < 4.5;
    }
    if (done) {
      side[i] = 2;
      changed = true;
      banner('★ MISSÃO ' + (i + 4) + ' CONCLUÍDA: ' + s.nome + ' ★', '#9be89b');
      audio.sfx('complete');
      const n = sideDoneCount();
      if (n % 5 === 0 && n > 0) {
        hpBonus++;
        player.hpMax = Math.min(10, 3 + hpBonus);
        player.hp = player.hpMax;
        banner('❤ +1 VIDA MAXIMA  (total: ' + player.hpMax + ')', '#ff7d8a');
      }
      saveGame();
      // desbloqueia o próximo estágio do grupo
      for (let j = 0; j < SIDE.length; j++) {
        if (side[j] === 0 && SIDE[j].req === i) {
          side[j] = 1;
          banner('NOVA MISSÃO: ' + SIDE[j].nome + '  [Q abre a lista]', '#a5f0ff');
        }
      }
    }
  }
  if (changed) saveGame();
}
function unlockInitialSide() {
  for (let i = 0; i < SIDE.length; i++) if (SIDE[i].req < 0 && side[i] === 0) side[i] = 1;
}

// ---------------- áudio ----------------
function playMusic() {
  audio.resume();
  audio.startMusic();
}

// ---------------- save ----------------
const SAVE_KEY = 'grandpixel-save';
const SAVE_LEGACY = 'innerlight-save';
function saveGame() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      v: 3, q, collected: [...collected], chestOpen,
      side, colN, killN, hpBonus,
      slimesDead: SLIMES.filter(s => !s.alive).map(s => s.x + ',' + s.z),
      wispsDead: WISPS.filter(s => !s.alive).map(s => s.x + ',' + s.z),
      hpMax: player.hpMax, hp: player.hp, x: player.x, z: player.z,
    }));
  } catch (e) {}
}
function loadSave() {
  try {
    let d = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
    if (!d) d = JSON.parse(localStorage.getItem(SAVE_LEGACY) || 'null');
    if (d && d.v !== 3) return null; // saves de versões antigas não são compatíveis
    return d;
  } catch (e) { return null; }
}
function applySave(d) {
  if (!d) return;
  if (Array.isArray(d.q)) for (let i = 0; i < 3; i++) q[i] = d.q[i];
  if (Array.isArray(d.collected)) d.collected.forEach(id => collected.add(id));
  if (d.colN) for (const k of Object.keys(d.colN)) colN[k] = d.colN[k];
  if (d.killN) for (const k of Object.keys(d.killN)) killN[k] = d.killN[k];
  if (Array.isArray(d.side)) for (let i = 0; i < Math.min(d.side.length, side.length); i++) side[i] = d.side[i];
  if (d.chestOpen) chestOpen = true;
  hpBonus = d.hpBonus || 0;
  player.hpMax = Math.min(10, 3 + hpBonus);
  if (typeof d.hp === 'number') player.hp = Math.min(d.hp, player.hpMax);
  const dead = new Set((d.slimesDead || []).concat(d.wispsDead || []));
  if (d.slimesDead || d.wispsDead) {
    for (const s of SLIMES) if (dead.has(s.x + ',' + s.z)) s.alive = false;
    for (const s of WISPS) if (dead.has(s.x + ',' + s.z)) s.alive = false;
  } else if (typeof d.slimesDefeated === 'number') {
    // legado aproximado: ignora (mundo mudou)
  }
  if (typeof d.x === 'number') { player.x = d.x; player.z = d.z; }
  player.y = playerGround();
}
function resetSave() {
  try { localStorage.removeItem(SAVE_KEY); localStorage.removeItem(SAVE_LEGACY); } catch (e) {}
}

// ---------------- cutscene ----------------
// câmeras em yaw ABSOLUTO do chão: frente = (sin yaw, -cos yaw)
const CUTSCENE = [
  {
    d: 11,
    keys: [
      { t: 0, x: 30, z: -24, y: 8.5, ya: -2.32, pi: -0.3 },
      { t: 11, x: 13, z: -13, y: 6.2, ya: -2.42, pi: -0.25 },
    ],
    subs: [
      { at: 1.0, dur: 4.4, who: 'NARRADOR', text: 'O vale adormeceu quando a #ff9de0LUZ#ffd76a se perdeu...' },
      { at: 5.6, dur: 5.2, who: 'NARRADOR', text: 'Mas em Solaria, pequena vila de pedra, algo ainda resiste.' },
    ],
  },
  {
    d: 12,
    keys: [
      { t: 0, x: -9, z: 9, y: 3.8, ya: 0.95, pi: -0.22 },
      { t: 12, x: -4, z: 5, y: 3.0, ya: 0.9, pi: -0.18 },
    ],
    subs: [
      { at: 0.5, dur: 4.0, who: 'ORI, O ANCIao', text: 'Voce acordou... como a luz. Eu sabia que viria.' },
      { at: 4.9, dur: 5.2, who: 'ORI, O ANCIao', text: 'Os cristais guardavam a #ff9de0Luz Interior#ffd76a deste vale. Sem eles, a escuridao avanca.' },
      { at: 10.3, dur: 1.6, who: 'ORI, O ANCIao', text: 'Venha. Preciso mostrar uma coisa.' },
    ],
  },
  {
    d: 11,
    keys: [
      { t: 0, x: 13, z: 1, y: 3.6, ya: -0.92, pi: -0.2 },
      { t: 11, x: 8, z: -5, y: 3.2, ya: -0.98, pi: -0.16 },
    ],
    subs: [
      { at: 0.6, dur: 4.4, who: 'NARRADOR', text: 'Este obelisco guarda o pacto entre a luz e os guardioes.' },
      { at: 5.4, dur: 5.2, who: 'ORI, O ANCIao', text: 'A #ff9de0Luz Interior#ffd76a vive em todos nos. Mas alguem precisa reaces-la.' },
    ],
  },
  {
    d: 12.5,
    keys: [
      { t: 0, x: 50, z: 22, y: 7.6, ya: -0.88, pi: -0.3 },
      { t: 12.5, x: 40, z: 13, y: 5.2, ya: -0.95, pi: -0.26 },
    ],
    subs: [
      { at: 0.8, dur: 4.6, who: 'ORI, O ANCIao', text: 'O #ff9de0Campo Radiante#ffd76a, a leste... ja foi pura luz.' },
      { at: 5.8, dur: 5.6, who: 'ORI, O ANCIao', text: 'Encontre os fragmentos que ainda brilham. Eles estao chamando por voce.' },
    ],
  },
  {
    d: 7,
    keys: [
      { t: 0, x: 88, z: -28, y: 10, ya: -2.3, pi: -0.32 },
      { t: 7, x: 78, z: -18, y: 6.4, ya: -2.1, pi: -0.24 },
    ],
    subs: [
      { at: 0.6, dur: 5.6, who: '', text: 'GRAND PIXEL GAME - a jornada comeca.' },
    ],
  },
];
function startCutscene() {
  phase = 'cut';
  cut = { i: 0, t: 0 };
  fx.fade = 1; fx.fadeIn = true; fx.fadeCol = '#000';
  cam.x = CUTSCENE[0].keys[0].x; cam.z = CUTSCENE[0].keys[0].z;
  cam.y = CUTSCENE[0].keys[0].y; cam.yaw = CUTSCENE[0].keys[0].ya; cam.pitch = CUTSCENE[0].keys[0].pi;
}
function updateCut(dt) {
  if (!cut) return;
  cut.t += dt;
  const shot = CUTSCENE[cut.i];
  if (cut.t >= shot.d) {
    cut.i++; cut.t = 0;
    if (cut.i >= CUTSCENE.length) { endCutscene(); return; }
    const k0 = CUTSCENE[cut.i].keys[0];
    cam.x = k0.x; cam.z = k0.z; cam.y = k0.y; cam.yaw = k0.ya; cam.pitch = k0.pi;
    return;
  }
  const ks = shot.keys;
  const a = cut.t;
  let k0 = ks[0], k1 = ks[ks.length - 1];
  if (a >= ks[ks.length - 1].t) { k0 = k1 = ks[ks.length - 1]; }
  else {
    let i0 = 0;
    for (let i = 0; i < ks.length - 1; i++) {
      if (a >= ks[i].t && a < ks[i + 1].t) { i0 = i; break; }
    }
    k0 = ks[i0]; k1 = ks[i0 + 1];
    const f = smoothstep(k0.t, k1.t, a);
    cam.x = lerp(k0.x, k1.x, f); cam.z = lerp(k0.z, k1.z, f);
    cam.y = lerp(k0.y, k1.y, f);
    cam.yaw = lerp(k0.ya, k1.ya, f);
    cam.pitch = lerp(k0.pi, k1.pi, f);
  }
  if (a >= ks[ks.length - 1].t) {
    cam.x = k1.x; cam.z = k1.z; cam.y = k1.y; cam.yaw = k1.ya; cam.pitch = k1.pi;
  }
  const lastShot = cut.i === CUTSCENE.length - 1;
  if (lastShot && cut.t > shot.d - 2 && !fx.fadeIn) {
    fx.fade = Math.min(1, (cut.t - (shot.d - 2)) / 2);
  }
}
function endCutscene() {
  cut = null;
  fx.fade = 1; fx.fadeIn = true; fx.fadeCol = '#000';
  phase = 'play';
  player.x = 5.5; player.z = 5.5; player.yaw = -Math.PI / 4;
  player.y = playerGround();
  player.hp = player.hpMax = 3;
  cam.x = player.x + 8; cam.z = player.z + 8;
  cam.tyaw = player.yaw; cam.yaw = player.yaw;
  banner('MISSÃO 1 - CRISTAIS DA MEMORIA', '#ff9de0');
  toast('fale com ORI ao norte da praca [E]');
  unlockInitialSide();
  saveGame();
}

// ---------------- entrada ----------------
function setupInput() {
  window.addEventListener('keydown', e => { keys[e.code] = true; });
  window.addEventListener('keyup', e => { keys[e.code] = false; });
  window.addEventListener('keydown', e => {
    const k = e.code;
    if (['Space', 'Enter', 'ArrowUp', 'ArrowDown', 'Tab'].includes(k)) e.preventDefault();
    if (phase === 'title' || phase === 'howto' || phase === 'options') {
      if (k === 'Enter' || k === 'Space') {
        e.preventDefault();
        if (phase === 'title') startGame();
        else if (phase === 'howto') phase = howtoFrom || 'title';
        else { phase = optionsFrom || 'title'; saveCfg(); }
        return;
      }
      if (phase === 'title') {
        if (k === 'KeyC') { howtoFrom = 'title'; phase = 'howto'; audio.sfx('select'); }
        else if (k === 'KeyO') { optionsFrom = 'title'; phase = 'options'; audio.sfx('select'); }
        else if (k === 'KeyM') toggleMute();
        else if (k === 'KeyR') { resetSave(); toast('progresso zerado'); }
      } else if (phase === 'howto') {
        if (k === 'Escape' || k === 'KeyC') phase = howtoFrom || 'title';
      } else if (phase === 'options') {
        if (k === 'Escape' || k === 'KeyO') { phase = optionsFrom || 'title'; saveCfg(); }
        else if (k === 'ArrowLeft' || k === 'KeyA') { optionsMove(-1); }
        else if (k === 'ArrowRight' || k === 'KeyD') { optionsMove(1); }
        else if (k === 'ArrowUp' || k === 'ArrowDown' || k === 'KeyW' || k === 'KeyS') { optionsSel(); }
        else if (k === 'KeyM') toggleMute();
      }
      return;
    }
    if (phase === 'cut') {
      if (k === 'Enter' || k === 'Space' || k === 'Escape') { e.preventDefault(); endCutscene(); }
      return;
    }
    if (phase === 'pause') {
      if (k === 'Escape') { togglePause(); return; }
      if (k === 'Enter') { pausePick(); return; }
      if (k === 'ArrowUp' || k === 'KeyW') { menuSel = (menuSel + 4) % 5; audio.sfx('select'); }
      else if (k === 'ArrowDown' || k === 'KeyS') { menuSel = (menuSel + 1) % 5; audio.sfx('select'); }
      else if (k === 'KeyM') toggleMute();
      else if (k === 'KeyR' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); resetSave(); location.reload(); }
      return;
    }
    if (phase === 'log') {
      if (k === 'Escape' || k === 'KeyQ' || k === 'Enter') { phase = 'play'; audio.sfx('select'); }
      else if (k === 'ArrowDown' || k === 'KeyS' || k === 'KeyJ') { logPage = (logPage + 1) % 3; audio.sfx('select'); }
      else if (k === 'ArrowUp' || k === 'KeyW' || k === 'KeyK') { logPage = (logPage + 2) % 3; audio.sfx('select'); }
      else if (k === 'KeyM') toggleMute();
      return;
    }
    if (phase === 'play') {
      if (k === 'Escape') { togglePause(); return; }
      if (k === 'KeyQ') { openLog(); return; }
      if (k === 'KeyE') act();
      if (k === 'Space') input.jump = true;
      if (k === 'KeyF' || k === 'KeyJ') input.atk = true;
      if (k === 'KeyM') toggleMute();
      if (k === 'KeyC') toast('controles: WASD mover, E agir, Q missoes, F atacar, M som, ESC pausa');
    }
  });
  window.addEventListener('keyup', e => {
    if (e.code === 'Space') input.jump = false;
    if (e.code === 'KeyF' || e.code === 'KeyJ') input.atk = false;
  });
  const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  if (isTouch) {
    const el = document.getElementById('touch');
    if (el) el.classList.remove('hidden');
    const stick = document.getElementById('stick');
    const knob = document.getElementById('stick-knob');
    let sid = null;
    const rect = () => stick.getBoundingClientRect();
    const onStart = e => { sid = e.changedTouches[0].identifier; e.preventDefault(); };
    const onMove = e => {
      if (sid === null) return;
      for (const t of e.changedTouches) {
        if (t.identifier !== sid) continue;
        const r = rect();
        const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        let dx = t.clientX - cx, dy = t.clientY - cy;
        const L = Math.hypot(dx, dy), mx = 44;
        if (L > mx) { dx = dx / L * mx; dy = dy / L * mx; }
        input.jx = dx / mx; input.jy = dy / mx;
        knob.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
      }
      e.preventDefault();
    };
    const onEnd = e => {
      for (const t of e.changedTouches) if (t.identifier === sid) {
        sid = null; input.jx = 0; input.jy = 0;
        knob.style.transform = 'translate(0,0)';
      }
    };
    stick.addEventListener('touchstart', onStart, { passive: false });
    stick.addEventListener('touchmove', onMove, { passive: false });
    stick.addEventListener('touchend', onEnd, { passive: false });
    stick.addEventListener('touchcancel', onEnd, { passive: false });
    const bindBtn = (id, down, up) => {
      const el = document.getElementById(id);
      el.addEventListener('touchstart', e => { e.preventDefault(); down(); }, { passive: false });
      el.addEventListener('touchend', e => { e.preventDefault(); if (up) up(); }, { passive: false });
      el.addEventListener('touchcancel', e => { if (up) up(); }, { passive: false });
    };
    bindBtn('btn-jump', () => { input.jump = true; }, () => { input.jump = false; });
    bindBtn('btn-atk', () => { input.atk = true; }, () => { input.atk = false; });
    bindBtn('btn-act', () => act());
  }
  glCanvas.addEventListener('pointerdown', e => {
    if (phase === 'title') { startGame(); return; }
    if (phase === 'cut') { endCutscene(); return; }
    if (phase === 'howto') { phase = howtoFrom || 'title'; return; }
    if (phase === 'options') { phase = optionsFrom || 'title'; saveCfg(); return; }
    if (phase === 'pause') { togglePause(); return; }
    if (phase === 'log') { phase = 'play'; return; }
    if (phase === 'play' && dlg) { advanceDlg(); return; }
    if (phase === 'play') { swing(); }
    e.preventDefault();
  });
  const pb = document.getElementById('pause-btn');
  if (pb) pb.addEventListener('click', () => togglePause());
}
function startGame() {
  const d = loadSave();
  const hasProgress = d && Array.isArray(d.q) && d.q.some(v => v > 0);
  playMusic();
  if (hasProgress) {
    applySave(d);
    unlockInitialSide();
    phase = 'play';
    banner('BEM-VINDO DE VOLTA', '#7de4ff');
    cam.x = player.x + 7; cam.z = player.z + 7; cam.y = player.y + 3;
  } else {
    if (d && d.chestOpen) chestOpen = true;
    startCutscene();
  }
}
function togglePause() {
  if (phase === 'play') { phase = 'pause'; menuSel = 0; }
  else if (phase === 'pause') phase = 'play';
}
function pausePick() {
  if (menuSel === 0) { phase = 'play'; }
  else if (menuSel === 1) { optionsFrom = 'pause'; phase = 'options'; }
  else if (menuSel === 2) toggleMute();
  else if (menuSel === 3) { howtoFrom = 'pause'; phase = 'howto'; }
  else if (menuSel === 4) { resetSave(); location.reload(); }
}
function openLog() { phase = 'log'; logPage = 0; audio.sfx('select'); }
function toggleMute() {
  audio.setMuted(!audio.isMuted);
  toast(audio.isMuted ? 'som desligado' : 'som ligado');
}
let optIdx = 0;
function optionsSel() {
  optIdx = (optIdx + 1) % 4;
  audio.sfx('select');
  applyCfg();
}
function optionsMove(dir) {
  const opts = ['mus', 'sfx', 'qual', null];
  const k = opts[optIdx];
  if (k === 'mus') CFG.mus = Math.max(0, Math.min(1, Math.round((CFG.mus + dir * 0.1) * 10) / 10));
  else if (k === 'sfx') CFG.sfx = Math.max(0, Math.min(1, Math.round((CFG.sfx + dir * 0.1) * 10) / 10));
  else if (k === 'qual') CFG.qual = Math.max(0, Math.min(2, CFG.qual + dir));
  applyCfg();
  audio.sfx('select');
  saveCfg();
}
function act() {
  if (phase !== 'play' || dlg) return;
  const n = nearestInteract();
  if (n && n.type === 'npc') { openDlg(n.obj); return; }
  if (n && n.type === 'chest') { openChest(); return; }
  if (n && n.type === 'sign') { toast(n.obj.msg || ''); audio.sfx('blip'); return; }
  swing();
}
function nearestInteract() {
  let best = null, bd = 1e9;
  const px = player.x, pz = player.z;
  const cand = [];
  for (const [id, npc] of Object.entries(NPC_SPR)) {
    if (!npc) continue;
    const dd = Math.hypot(npc.x - px, npc.z - pz);
    if (dd < 2.8) cand.push({ type: 'npc', id, obj: npc, dd });
  }
  if (q[2] === 1 && !chestOpen) {
    const chest = world.staticSprites.find(s => s.k === 'chest');
    if (chest) {
      const dd = Math.hypot(chest.x - px, chest.z - pz);
      if (dd < 3.0) cand.push({ type: 'chest', obj: chest, dd });
    }
  }
  for (const s of world.staticSprites) {
    if (s.k !== 'sign') continue;
    const dd = Math.hypot(s.x - px, s.z - pz);
    if (dd < 2.8) cand.push({ type: 'sign', obj: s, dd });
  }
  for (const c of cand) if (c.dd < bd) { bd = c.dd; best = c; }
  return best;
}

// ---------------- diálogo ----------------
function openDlg(npcObj) {
  const lines = dialogFor(npcObj.id, q, { sideDone: sideDoneCount(), sideTotal: SIDE_TOTAL });
  if (!lines.length) return;
  dlg = { npc: npcObj.id, info: NPC_INFO[npcObj.id], lines, idx: 0, done: false, action: lines.action };
  audio.sfx('talk');
}
function advanceDlg() {
  if (!dlg) return;
  if (!dlg.done) { dlg.done = true; return; }
  dlg.idx++;
  if (dlg.idx >= dlg.lines.length) { closeDlg(); return; }
  dlg.done = false;
  dlg._t = 0;
  audio.sfx('blip');
}
function closeDlg() {
  if (!dlg) return;
  const act = dlg.action;
  dlg = null;
  if (act === 'q1' && q[0] === 0) { q[0] = 1; banner('MISSÃO 1 - CRISTAIS DA MEMORIA', '#ff9de0'); saveGame(); }
  else if (act === 'q2' && q[1] === 0) { q[1] = 1; banner('MISSÃO 2 - FLORES DE LUZ', '#7de4ff'); saveGame(); }
  else if (act === 'q3' && q[2] === 0) { q[2] = 1; banner('MISSÃO 3 - O BAU DO TEMPLO', '#ffd76a'); saveGame(); }
}
function updateDlg(dt) {
  if (!dlg || dlg.done) return;
  dlg._t = (dlg._t || 0) + dt;
  const full = dlg.lines[dlg.idx].text;
  if (Math.floor(dlg._t * 46) >= full.length) dlg.done = true;
}

// ---------------- ações de mundo ----------------
function collect(spr) {
  if (collected.has(spr.seed)) return;
  collected.add(spr.seed);
  colN[spr.k] = (colN[spr.k] || 0) + 1;
  audio.sfx('coin');
  const g = groundY(spr.x, spr.z) + 1;
  const cols = { crystal: [1, 0.55, 1], florete: [0.5, 0.9, 1], berry: [1, 0.3, 0.35], ore: [0.5, 0.85, 1], shell: [1, 0.85, 0.5], essence: [0.6, 1, 1] };
  burst(spr.x, g, spr.z, cols[spr.k] || [1, 1, 1], 10);
  const total = world.staticSprites.filter(s => s.k === spr.k && s.pickup).length;
  const left = total - world.staticSprites.filter(s => s.k === spr.k && s.pickup && !collected.has(s.seed)).length;
  toast(pickupName(spr.k) + ' ' + left + '/' + total);
  saveGame();
  if (spr.k === 'crystal' && q[0] === 1 && (colN.crystal || 0) >= 5) { q[0] = 2; banner('★ MISSÃO 1 CONCLUÍDA - fale com ORI ★', '#ffd76a'); saveGame(); }
  if (spr.k === 'florete' && q[1] === 1 && (colN.florete || 0) >= 5) { q[1] = 2; banner('★ MISSÃO 2 CONCLUÍDA - fale com MIRA ★', '#ffd76a'); saveGame(); }
  checkSideQuests();
}
function swing() {
  if (player.atk > 0) return;
  player.atk = 0.3;
  audio.sfx('slash');
  const fwx = Math.sin(player.yaw), fwz = -Math.cos(player.yaw);
  let hitAny = false;
  for (const s of SLIMES) {
    if (!s.alive) continue;
    const dx = s.x - player.x, dz = s.z - player.z;
    const d = Math.hypot(dx, dz);
    if (d < 2.5) {
      const dot = (dx / (d || 1)) * fwx + (dz / (d || 1)) * fwz;
      if (dot > 0.1) {
        hitAny = true;
        s.hp--; s.hit = 0.18;
        s.vx = (dx / (d || 1)) * 5; s.vz = (dz / (d || 1)) * 5; s.vy = 3.4;
        audio.sfx('hit');
        if (s.hp <= 0) {
          s.alive = false;
          killN[s.area] = (killN[s.area] || 0) + 1;
          burst(s.x, s.y + 0.7, s.z, s.tint ? [0.7, 0.8, 0.9] : [0.4, 0.95, 0.5], 14);
          audio.sfx('die');
          if (s.area === 'ruinas' && q[2] === 1) {
            const left = SLIMES.filter(x => x.alive && x.area === 'ruinas').length;
            if (left === 0) toast('todos os slimes do templo cairam! abra o bau [E]');
          }
          saveGame();
          checkSideQuests();
        }
      }
    }
  }
  for (const s of WISPS) {
    if (!s.alive) continue;
    const dx = s.x - player.x, dz = s.z - player.z;
    const d = Math.hypot(dx, dz);
    if (d < 2.6) {
      const dot = (dx / (d || 1)) * fwx + (dz / (d || 1)) * fwz;
      if (dot > 0) {
        hitAny = true;
        s.hp--; s.hit = 0.18;
        s.vx = (dx / (d || 1)) * 3; s.vz = (dz / (d || 1)) * 3;
        audio.sfx('hit');
        if (s.hp <= 0) {
          s.alive = false;
          killN.wisp++;
          burst(s.x, s.y, s.z, [0.7, 0.9, 1], 12);
          audio.sfx('die');
          saveGame();
          checkSideQuests();
        }
      }
    }
  }
  if (hitAny && player.atk > 0.1) player.atk = Math.min(player.atk, 0.15);
}
function openChest() {
  if (q[2] !== 1 || chestOpen) return;
  const chest = world.staticSprites.find(s => s.k === 'chest');
  const cx = chest ? chest.x : -15, cz = chest ? chest.z : -17;
  const near = SLIMES.filter(s => s.alive && s.area === 'ruinas' && Math.hypot(s.x - cx, s.z - cz) < 14).length;
  if (near > 0) { toast('os slimes ainda protegem o templo! (' + near + ')'); audio.sfx('hurt'); return; }
  chestOpen = true;
  audio.sfx('complete');
  burst(cx, groundY(cx, cz) + 1.2, cz, [1, 0.85, 0.4], 20);
  q[2] = 2;
  banner('★ MISSÃO 3 CONCLUÍDA - A LUZ INTERIOR BRILHA ★', '#ffd76a');
  toast('a reliquia do templo agora e sua. Q abre as missoes do vale!');
  saveGame();
  checkSideQuests();
}
function hurtPlayer(srcX, srcZ) {
  if (player.inv > 0 || phase !== 'play') return;
  player.hp--;
  player.inv = 1.4;
  player.hurtT = 1;
  fx.red = 1;
  audio.sfx('hurt');
  const dx = player.x - srcX, dz = player.z - srcZ;
  const d = Math.hypot(dx, dz) || 1;
  player.kx = dx / d * 7; player.kz = dz / d * 7;
  if (player.hp <= 0) {
    player.hp = player.hpMax;
    player.inv = 3;
    player.x = 5.5; player.z = 5.5;
    player.kx = player.kz = 0;
    player.vy = 0;
    player.y = Math.max(1, playerGround());
    player.onGround = true;
    toast('a luz em voce se reacendeu na praca...');
    fx.red = 1;
  }
}

// ---------------- física ----------------
let OBSTACLES = [];
function loadObstacles() { OBSTACLES = world.solidCircles(); }
function circleHit(x, z, r) {
  for (const o of OBSTACLES) {
    const dx = x - o.x, dz = z - o.z;
    if (dx * dx + dz * dz < (o.r + r) * (o.r + r)) return true;
  }
  return false;
}
function blockedAt(x, z) {
  const r = 0.42;
  const t0 = Math.floor((x - r + WORLD_HALF) / TS), t1 = Math.floor((x + r + WORLD_HALF) / TS);
  const u0 = Math.floor((z - r + WORLD_HALF) / TS), u1 = Math.floor((z + r + WORLD_HALF) / TS);
  const feet = player.y;
  for (let tx = t0; tx <= t1; tx++)
    for (let tz = u0; tz <= u1; tz++) {
      const h = world.hOf(tx, tz);
      if (h > 0 && h > feet + 1.35) return true;
    }
  return circleHit(x, z, r);
}
function controlPlayer(dt) {
  let ax = 0, ay = 0;
  if (!dlg) {
    if (keys['KeyW'] || keys['ArrowUp']) ay += 1;
    if (keys['KeyS'] || keys['ArrowDown']) ay -= 1;
    if (keys['KeyA'] || keys['ArrowLeft']) ax -= 1;
    if (keys['KeyD'] || keys['ArrowRight']) ax += 1;
    if (input.jx || input.jy) { ax = input.jx; ay = -input.jy; }
  }
  let mvx = 0, mvz = 0;
  if (ax || ay) {
    const fwx = Math.sin(cam.yaw), fwz = -Math.cos(cam.yaw);
    const rtx = Math.cos(cam.yaw), rtz = Math.sin(cam.yaw);
    mvx = fwx * ay + rtx * ax;
    mvz = fwz * ay + rtz * ax;
    const l = Math.hypot(mvx, mvz);
    if (l > 0) { mvx /= l; mvz /= l; }
    player.yaw = Math.atan2(mvx, -mvz);
    player.moving = true;
  } else player.moving = false;
  if (player.kx || player.kz) {
    mvx = player.kx; mvz = player.kz;
    player.kx *= 0.9; player.kz *= 0.9;
    if (Math.abs(player.kx) < 0.03) player.kx = 0;
    if (Math.abs(player.kz) < 0.03) player.kz = 0;
  }
  const speed = player.swim ? 3.2 : 5.4;
  const mxv = mvx * speed * dt;
  const mzv = mvz * speed * dt;
  const wasOn = player.onGround;
  if (mxv && !blockedAt(player.x + mxv, player.z)) player.x += mxv;
  if (mzv && !blockedAt(player.x, player.z + mzv)) player.z += mzv;
  const g = groundY(player.x, player.z);
  if (g <= 0) {
    if (!player.swim) {
      if (player.y > WATER_Y + 0.02) {
        player.vy -= 19 * dt;
        player.y += player.vy * dt;
        if (player.y <= WATER_Y + 0.02) { player.y = WATER_Y + 0.02; player.vy = 0; player.swim = true; audio.sfx('land'); }
      } else { player.y = WATER_Y + 0.02; player.vy = 0; player.swim = true; }
    }
    if (player.swim) {
      player.y = WATER_Y + 0.06 + Math.sin(time * 3.1) * 0.05;
      if (input.jump) { player.vy = 4.4; player.swim = false; input.jump = false; }
    }
  } else {
    if (player.swim) {
      player.vy -= 18 * dt;
      player.y += player.vy * dt;
      if (player.y >= g) { player.y = g; player.vy = 0; player.swim = false; player.onGround = true; }
    }
    if (!player.swim) {
      if (input.jump && player.onGround) {
        player.vy = 8.0; player.onGround = false; player.jumpBuf = 0; input.jump = false;
        audio.sfx('jump');
      } else if (input.jump && !player.onGround) {
        if (player.jumpBuf <= 0) { player.jumpBuf = 0.18; input.jump = false; }
      }
      if (player.onGround && player.jumpBuf > 0) {
        player.vy = 8.0; player.onGround = false; player.jumpBuf = 0;
        audio.sfx('jump');
      }
      player.vy -= 21 * dt;
      if (player.vy < -15) player.vy = -15;
      player.y += player.vy * dt;
      if (player.y <= g) {
        if (!wasOn && player.vy < -7) audio.sfx('land');
        player.y = g; player.vy = 0; player.onGround = true;
      } else player.onGround = false;
      if (player.onGround && g > player.y && g - player.y <= 1.0) player.y = g;
      player.walkT += dt * 8;
    }
  }
  if (player.jumpBuf > 0) player.jumpBuf -= dt;
  player.x = clamp(player.x, -WORLD_HALF + 1.5, WORLD_HALF - 1.5);
  player.z = clamp(player.z, -WORLD_HALF + 1.5, WORLD_HALF - 1.5);
  if (player.y < -2) { player.y = Math.max(1, groundY(player.x, player.z)); player.swim = false; player.vy = 0; }
  if (!dlg) {
    for (const s of world.staticSprites) {
      if ((s.k === 'crystal' || s.k === 'florete' || s.k === 'berry' || s.k === 'ore' || s.k === 'shell' || s.k === 'essence') && s.pickup && !collected.has(s.seed)) {
        if (Math.hypot(s.x - player.x, s.z - player.z) < 1.5) collect(s);
      }
    }
  }
  if (player.inv > 0) player.inv -= dt;
  if (player.atk > 0) player.atk -= dt;
  if (player.hurtT > 0) player.hurtT -= dt;
}
function updateEnemies(dt) {
  for (const s of SLIMES) {
    if (!s.alive) continue;
    s.t += dt;
    if (s.hit > 0) s.hit -= dt;
    const px = player.x, pz = player.z;
    const d = Math.hypot(s.x - px, s.z - pz);
    const g = groundY(s.x, s.z);
    if (s.vy > 0 || Math.abs(s.vx) > 0.01 || Math.abs(s.vz) > 0.01) {
      s.x += s.vx * dt; s.z += s.vz * dt;
      s.vy -= 15 * dt;
      s.y += s.vy * dt;
      if (s.y <= g) { s.y = g; s.vy = 0; s.vx = 0; s.vz = 0; }
      s.x = clamp(s.x, -WORLD_HALF + 1, WORLD_HALF - 1);
      s.z = clamp(s.z, -WORLD_HALF + 1, WORLD_HALF - 1);
    } else {
      s.cd -= dt;
      if (d < 10 && s.cd <= 0 && !player.swim) {
        s.cd = 0.9 + Math.random() * 1.5;
        if (Math.random() < 0.55) {
          s.vy = 3.4;
          const dd = Math.max(0.3, d);
          s.vx = (px - s.x) / dd * (2.4 + Math.random() * 1.4);
          s.vz = (pz - s.z) / dd * (2.4 + Math.random() * 1.4);
        }
      }
    }
    if (d < 1.05 && player.inv <= 0 && !player.swim && !dlg) hurtPlayer(s.x, s.z);
  }
  // wisps levitam e flutuam em direção ao jogador
  for (const s of WISPS) {
    if (!s.alive) continue;
    s.t += dt;
    if (s.hit > 0) s.hit -= dt;
    const px = player.x, pz = player.z;
    const d = Math.hypot(s.x - px, s.z - pz);
    s.y = Math.max(WATER_Y, groundY(s.x, s.z)) + 1.5 + Math.sin(s.t * 2.2 + s.x) * 0.35;
    s.cd -= dt;
    if (d < 11 && d > 1.4 && s.cd <= 0) {
      s.cd = 0.16;
      const spd = 2.1;
      s.vx = (px - s.x) / d * spd;
      s.vz = (pz - s.z) / d * spd;
    } else if (d <= 1.4) { s.vx = 0; s.vz = 0; }
    s.x += s.vx * dt; s.z += s.vz * dt;
    s.x = clamp(s.x, -WORLD_HALF + 1, WORLD_HALF - 1);
    s.z = clamp(s.z, -WORLD_HALF + 1, WORLD_HALF - 1);
    if (d < 1.1 && player.inv <= 0 && !dlg) hurtPlayer(s.x, s.z);
  }
}
function updateCam(dt) {
  if (phase !== 'play') return;
  let dy = player.yaw - cam.tyaw;
  while (dy > Math.PI) dy -= Math.PI * 2;
  while (dy < -Math.PI) dy += Math.PI * 2;
  cam.tyaw += dy * Math.min(1, dt * 8);
  cam.yaw = cam.tyaw;
  const fwx = Math.sin(cam.yaw), fwz = -Math.cos(cam.yaw);
  const dist = 7.0, hgt = 2.8;
  const tx = player.x - fwx * dist;
  const tz = player.z - fwz * dist;
  const tgtY = Math.max(player.y + hgt, groundY(tx, tz) + 0.7);
  cam.x = lerp(cam.x, tx, 1 - Math.exp(-dt * 7));
  cam.z = lerp(cam.z, tz, 1 - Math.exp(-dt * 7));
  cam.y = lerp(cam.y, tgtY, 1 - Math.exp(-dt * 7));
  cam.pitch = lerp(cam.pitch, -0.33, 1 - Math.exp(-dt * 3));
}

// ---------------- entidades para o renderer ----------------
function buildEntities(includeHero) {
  const list = [];
  const px = cam.x, pz = cam.z;
  const cull = (cam.fogB || 215) + 60;
  const bob = Math.sin(time * 3.4) * 0.05;
  for (const s of world.staticSprites) {
    const dx = s.x - px, dz = s.z - pz;
    if (dx * dx + dz * dz > cull * cull) continue;
    const g = groundY(s.x, s.z);
    let art, w, h, yy = g;
    switch (s.k) {
      case 'tree': art = ART['tree' + (s.v || 0)]; w = 3.15; h = 3.6; break;
      case 'bush': art = ART.bush; w = 1.1; h = 0.85; break;
      case 'rock': art = ART.rock; w = 2.0; h = 1.45; break;
      case 'crystal': {
        if (s.pickup && collected.has(s.seed)) continue;
        art = s.pickup ? ART.crystalP : ART.crystal;
        w = 1.55 * (s.s || 1); h = w * 12 / 9; break;
      }
      case 'florete': {
        if (s.pickup && collected.has(s.seed)) continue;
        art = ART.florete; w = 1.0; h = 1.42; break;
      }
      case 'berry': {
        if (s.pickup && collected.has(s.seed)) continue;
        art = ART.berry; w = 0.8; h = 0.95; break;
      }
      case 'ore': {
        if (s.pickup && collected.has(s.seed)) continue;
        art = ART.ore; w = 1.1; h = 1.1; break;
      }
      case 'shell': {
        if (s.pickup && collected.has(s.seed)) continue;
        art = ART.shell; w = 0.9; h = 0.75; break;
      }
      case 'essence': {
        if (s.pickup && collected.has(s.seed)) continue;
        art = ART.essence; w = 0.9; h = 1.25; yy = g + Math.sin(time * 2 + s.seed) * 0.2; break;
      }
      case 'shrine': art = ART.shrine; w = 1.5; h = 1.75; break;
      case 'chest': art = chestOpen ? ART.chestOpen : ART.chest; w = 2.1; h = chestOpen ? 1.8 : 1.4; break;
      case 'sign': art = ART.sign; w = 1.2; h = 1.5; break;
      case 'lantern': art = ART.lantern; w = 0.9; h = 1.54; break;
      case 'torch': art = ART.torch; w = 0.7; h = 1.68; break;
      case 'campfire': art = ART.fire; w = 1.35; h = 0.9; yy = g + 0.1; break;
      case 'flower': art = ART['flower' + s.c]; w = 0.62; h = 0.62; break;
      case 'npc': {
        art = s.id === 'elder' ? ART.npc0 : s.id === 'mira' ? ART.npc1 : ART.npc2;
        w = 1.3; h = 1.9; yy = g + bob;
        break;
      }
      default: continue;
    }
    list.push({ art, x: s.x, z: s.z, y: yy, w, h });
    if (s.k !== 'flower' && s.k !== 'campfire' && s.k !== 'essence') {
      const sw = Math.min(3.4, w * 1.3);
      list.push({ art: ART.shadow, x: s.x, z: s.z, y: g + 0.02, w: sw, h: sw * 4 / 12 });
    }
  }
  if (includeHero) {
    const g = playerGround();
    const inAir = Math.max(0, player.y - g);
    let py;
    if (player.swim) py = WATER_Y - 0.15;
    else py = g + inAir;
    const bobWalk = player.moving && player.onGround && !player.swim ? Math.abs(Math.sin(player.walkT)) * 0.08 : 0;
    const alpha = player.hurtT > 0 ? 0.55 + 0.4 * Math.sin(time * 38) : 1;
    list.push({ art: ART.hero, x: player.x, z: player.z, y: py - bobWalk, w: 1.28, h: 1.92, a: alpha, tint: [1, 1, 1] });
    const shScale = 1 - Math.min(0.5, inAir * 0.14);
    list.push({ art: ART.shadow, x: player.x, z: player.z, y: Math.max(WATER_Y, g) + 0.02, w: 1.7 * shScale, h: 1.7 * 4 / 12 * shScale });
  }
  for (const s of SLIMES) {
    if (!s.alive) continue;
    const dx = s.x - px, dz = s.z - pz;
    if (dx * dx + dz * dz > cull * cull) continue;
    const inAir = s.y > groundY(s.x, s.z) + 0.02;
    const sw = inAir ? 1.35 : 1.6;
    const sh = inAir ? 1.5 : 1.05;
    const base = s.tint || [1, 1, 1];
    const tint = s.hit > 0 ? [base[0] * 2.2, base[1] * 1.1, base[2] * 1.1] : base;
    list.push({ art: ART.slime, x: s.x, z: s.z, y: s.y - (inAir ? 0.25 : 0), w: sw, h: sh, tint });
    const g = groundY(s.x, s.z);
    const sc = 1 - Math.min(0.4, Math.max(0, s.y - g) * 0.12);
    list.push({ art: ART.shadow, x: s.x, z: s.z, y: g + 0.02, w: 1.8 * sc, h: 1.8 * 4 / 12 * sc });
  }
  for (const s of WISPS) {
    if (!s.alive) continue;
    const dx = s.x - px, dz = s.z - pz;
    if (dx * dx + dz * dz > cull * cull) continue;
    const tint = s.hit > 0 ? [2.4, 2.2, 2.2] : [1, 1, 1];
    list.push({ art: ART.wisp, x: s.x, z: s.z, y: s.y - 0.7, w: 1.1, h: 1.4, tint, a: 0.85 + 0.15 * Math.sin(s.t * 5) });
    list.push({ art: ART.shadow, x: s.x, z: s.z, y: Math.max(WATER_Y, groundY(s.x, s.z)) + 0.02, w: 1.1, h: 1.1 * 4 / 12 });
  }
  list.sort((a, b) => ((b.x - px) ** 2 + (b.z - pz) ** 2) - ((a.x - px) ** 2 + (a.z - pz) ** 2));
  return list;
}
function buildGlows() {
  const out = [];
  const px = player.x, pz = player.z;
  const dist = (x, z) => Math.hypot(x - px, z - pz);
  const range = (cam.fogB || 215) * 0.7;
  for (const s of world.staticSprites) {
    const g = groundY(s.x, s.z);
    if (s.k === 'lantern' && dist(s.x, s.z) < 34) {
      out.push({ x: s.x, y: g + 1.05, z: s.z, w: 1.6, h: 1.6, r: 1, g: 0.75, b: 0.35, a: 0.3, sp: 2.4, ph: s.seed, range: 12 });
    } else if (s.k === 'torch' && dist(s.x, s.z) < 30) {
      out.push({ x: s.x, y: g + 1.15, z: s.z, w: 1.2, h: 1.2, r: 1, g: 0.6, b: 0.22, a: 0.3, sp: 5, ph: s.seed, range: 9 });
    } else if (s.k === 'campfire' && dist(s.x, s.z) < 34) {
      out.push({ x: s.x, y: g + 0.6, z: s.z, w: 2.8, h: 2.8, r: 1, g: 0.55, b: 0.2, a: 0.34, sp: 2.6, ph: 1, range: 14 });
      out.push({ x: s.x + 0.2, y: g + 0.5, z: s.z, w: 1.2, h: 1.2, r: 1, g: 0.85, b: 0.5, a: 0.22, sp: 8, ph: 2, range: 8 });
    } else if (s.k === 'crystal' && !(s.pickup && collected.has(s.seed)) && dist(s.x, s.z) < range) {
      out.push({ x: s.x, y: g + 1.0, z: s.z, w: s.pickup ? 3.0 : 1.8, h: s.pickup ? 3.0 : 1.8, r: 1, g: 0.55, b: 1, a: s.pickup ? 0.34 : 0.13, sp: 2.4, ph: s.seed, range: 18 });
    } else if (s.k === 'florete' && !(s.pickup && collected.has(s.seed)) && dist(s.x, s.z) < range) {
      out.push({ x: s.x, y: g + 1.0, z: s.z, w: s.pickup ? 2.0 : 1.3, h: s.pickup ? 2.0 : 1.3, r: 0.4, g: 0.9, b: 1, a: s.pickup ? 0.3 : 0.12, sp: 3.2, ph: s.seed, range: 14 });
    } else if (s.k === 'essence' && !(s.pickup && collected.has(s.seed)) && dist(s.x, s.z) < range) {
      out.push({ x: s.x, y: g + 1.0, z: s.z, w: 1.9, h: 1.9, r: 0.6, g: 0.95, b: 1, a: 0.25, sp: 2.8, ph: s.seed, range: 13 });
    } else if (s.k === 'ore' && !(s.pickup && collected.has(s.seed)) && dist(s.x, s.z) < range) {
      out.push({ x: s.x, y: g + 0.7, z: s.z, w: 1.2, h: 1.2, r: 0.5, g: 0.9, b: 1, a: 0.2, sp: 2, ph: s.seed, range: 10 });
    } else if (s.k === 'berry' && !(s.pickup && collected.has(s.seed)) && dist(s.x, s.z) < 26) {
      out.push({ x: s.x, y: g + 0.5, z: s.z, w: 1.1, h: 1.1, r: 1, g: 0.4, b: 0.45, a: 0.14, sp: 1.6, ph: s.seed, range: 9 });
    } else if (s.k === 'shrine' && dist(s.x, s.z) < 40) {
      out.push({ x: s.x, y: g + 1.5, z: s.z, w: 2.6, h: 2.6, r: 0.5, g: 0.9, b: 1, a: 0.2, sp: 1.8, ph: s.seed, range: 12 });
    } else if (s.k === 'chest' && q[2] === 1 && !chestOpen && dist(s.x, s.z) < 24) {
      out.push({ x: s.x, y: g + 1.1, z: s.z, w: 2.4, h: 2.4, r: 1, g: 0.85, b: 0.35, a: 0.14, sp: 2, ph: 3, range: 11 });
    }
  }
  for (const s of WISPS) {
    if (s.alive && dist(s.x, s.z) < 26) {
      out.push({ x: s.x, y: s.y, z: s.z, w: 1.5, h: 1.5, r: 0.7, g: 0.9, b: 1, a: 0.22, sp: 4, ph: s.t, range: 8 });
    }
  }
  if (phase === 'play' && player.atk > 0) {
    const fwx = Math.sin(player.yaw), fwz = -Math.cos(player.yaw);
    const k = Math.sin((0.3 - player.atk) / 0.3 * Math.PI);
    out.push({
      x: player.x + fwx * 1.5, y: player.y + 1.1, z: player.z + fwz * 1.5,
      w: 1.7 * (0.4 + k), h: 2.1 * (0.4 + k), r: 0.75, g: 0.9, b: 1, a: 0.55 * k, sp: 0, ph: 0, range: 999,
    });
  }
  for (const p of fx.parts) {
    const a = 0.85 * (1 - p.t / p.life);
    out.push({ x: p.x + p.vx * p.t, y: p.y + p.vy * p.t - 4 * p.t * p.t, z: p.z + p.vz * p.t, w: 0.55, h: 0.55, r: p.r, g: p.g, b: p.b, a, sp: 0, ph: 0, range: 999 });
  }
  return out;
}
function updateFx(dt) {
  if (fx.banner) { fx.banner.t += dt; if (fx.banner.t > 4.6) fx.banner = null; }
  if (fx.toast) { fx.toast.t += dt; if (fx.toast.t > 3.4) fx.toast = null; }
  if (fx.red > 0) fx.red = Math.max(0, fx.red - dt * 1.5);
  if (fx.fadeIn && fx.fade > 0) fx.fade = Math.max(0, fx.fade - dt * 0.6);
  if (!fx.fadeIn && fx.fade < 1) fx.fade = Math.min(1, fx.fade + dt * 0.6);
  for (let i = fx.parts.length - 1; i >= 0; i--) {
    const p = fx.parts[i];
    p.t += dt;
    if (p.t >= p.life) fx.parts.splice(i, 1);
  }
}

// ---------------- HUD ----------------
function heart(x, y) {
  const c = ui;
  const p = (dx, dy, w2, h2) => c.fillRect(x + dx, y + dy, w2, h2);
  p(0, 2, 2, 1); p(7, 2, 2, 1); p(1, 1, 2, 1); p(6, 1, 2, 1);
  p(2, 0, 2, 1); p(5, 0, 2, 1);
  p(3, 1, 3, 1);
  p(1, 3, 7, 1); p(2, 4, 5, 1); p(3, 5, 3, 1); p(4, 6, 1, 1);
  p(2, -1, 2, 1); p(5, -1, 2, 1); p(3, -2, 3, 1); p(4, -3, 1, 1);
}
function drawHearts() {
  for (let i = 0; i < player.hpMax; i++) {
    ui.fillStyle = i < player.hp ? '#ff5f6e' : '#2c1a26';
    heart(16 + i * 20, 16);
    ui.fillStyle = 'rgba(255,255,255,0.25)';
    heart(16 + i * 20, 15);
  }
  const nm = NAME;
  drawText(ui, nm, 14, 34, 1, 'rgba(255,255,255,0.4)', {});
  drawText(ui, 'missoes: ' + sideDoneCount() + '/31', 14 + textWidth(nm, 1) + 10, 34, 1, 'rgba(160,255,180,0.55)', {});
}
function drawObjectiveHUD() {
  const obj = objectiveNow();
  if (!obj) return;
  const sc = 2;
  const t = stripCol(obj.txt);
  const g = groundY(obj.x, obj.z);
  const clip = rdr.project([obj.x, g + 2.4, obj.z], [0, 0, 0]);
  if (clip) {
    const sx = (clip[0] + 1) * 0.5 * W, sy = (1 - clip[1]) * 0.5 * H;
    const off = sx < -40 || sx > W + 40 || sy < -40 || sy > H + 40;
    if (!off) {
      const pulse = Math.sin(time * 5.2) > -0.5;
      ui.save();
      ui.translate(sx, sy + Math.sin(time * 3) * 4);
      ui.fillStyle = pulse ? obj.cor : '#ffffff';
      ui.beginPath();
      ui.moveTo(0, -8); ui.lineTo(6, 2); ui.lineTo(0, -1); ui.lineTo(-6, 2);
      ui.closePath(); ui.fill();
      ui.restore();
    } else {
      const cx = W / 2, cy = H * 0.4;
      const ang = Math.atan2(sy - cy, sx - cx);
      const ex = cx + Math.cos(ang) * W * 0.47;
      const ey = cy + Math.sin(ang) * H * 0.42;
      ui.save();
      ui.translate(ex, ey);
      ui.rotate(ang);
      ui.fillStyle = obj.cor;
      ui.beginPath();
      ui.moveTo(8, 0); ui.lineTo(-4, -5); ui.lineTo(-1, 0); ui.lineTo(-4, 5);
      ui.closePath(); ui.fill();
      ui.restore();
    }
  }
  const s2 = obj.txt.length > 34 ? 1 : 2;
  const tw = textWidth(t, s2);
  ui.fillStyle = 'rgba(6,5,14,0.78)';
  ui.fillRect(8, H - 32, Math.min(W - 16, tw + 22), 24);
  ui.fillStyle = obj.cor;
  ui.fillRect(10, H - 30, 4, 20);
  drawText(ui, t, 20, H - 28, s2, obj.cor, {});
}
function miniMap() {
  const c = ui;
  const R = 56, ox = W - R - 8, oy = 6;
  c.fillStyle = 'rgba(6,5,14,0.62)';
  c.fillRect(ox - 3, oy - 3, R + 6, R + 6);
  const scale = R / 28;
  const ptx = Math.floor((player.x + WORLD_HALF) / TS), ptz = Math.floor((player.z + WORLD_HALF) / TS);
  for (let tz = ptz - 14; tz <= ptz + 14; tz++) {
    for (let tx = ptx - 14; tx <= ptx + 14; tx++) {
      if (tx < 0 || tz < 0 || tx >= world.CELLS || tz >= world.CELLS) continue;
      const h = world.hOf(tx, tz);
      const i = tz * world.CELLS + tx;
      const ct = world.CT[i];
      const col = h <= 0 ? 'rgb(12,26,58)'
        : ct <= 3 ? (h === 1 ? '#54a43e' : h === 2 ? '#418a36' : '#31702c')
          : ct === 4 ? '#b98a55' : ct === 5 ? '#d4c07e'
            : ct === 6 || ct === 7 ? '#8a8f98'
              : ct === 14 || ct === 15 ? '#245f2c' : ct <= 11 ? '#d26a52' : '#7a5a42';
      c.fillStyle = col;
      c.fillRect(ox + (tx - ptx) * scale, oy + (tz - ptz) * scale, scale + 0.5, scale + 0.5);
    }
  }
  const mm = (wx, wz) => [ox + R / 2 + (wx - player.x) * scale, oy + R / 2 + (wz - player.z) * scale];
  const dot = (wx, wz, col, r = 1.5) => {
    const [mx, my] = mm(wx, wz);
    if (mx < ox - 4 || mx > ox + R + 4 || my < oy - 4 || my > oy + R + 4) return;
    c.fillStyle = col;
    c.fillRect(mx - r, my - r, r * 2, r * 2);
  };
  dot(ELDER.x, ELDER.z, '#ffd76a', 2);
  dot(MIRA.x, MIRA.z, '#7de4ff', 2);
  dot(KAEL.x, KAEL.z, '#8fd6ff', 2);
  dot(36, 9, '#ff9de0');
  dot(-32, 28, '#7de4ff');
  dot(-23, -19, '#ffd76a');
  const obj = objectiveNow();
  if (obj) dot(obj.x, obj.z, '#ffffff', 1.2);
  const [mx, my] = mm(player.x, player.z);
  c.save();
  c.translate(mx, my);
  c.rotate(-player.yaw);
  c.fillStyle = '#ffffff';
  c.beginPath();
  c.moveTo(0, -4.5); c.lineTo(3.4, 3.5); c.lineTo(0, 1.8); c.lineTo(-3.4, 3.5);
  c.closePath(); c.fill();
  c.restore();
  c.strokeStyle = 'rgba(255,215,106,0.6)';
  c.strokeRect(ox - 3.5, oy - 3.5, R + 7, R + 7);
}
function worldMap() {
  // mapa-múndi (usado no log de missões)
  const c = ui;
  const mw = W - 40, mh = mw * (world.CELLS / world.CELLS) * 0.78, mx0 = 20, my0 = 60;
  const scale = mh / world.CELLS;
  c.fillStyle = 'rgba(8,6,18,0.85)';
  c.fillRect(mx0 - 4, my0 - 4, mw + 8, mh + 8);
  for (let tz = 0; tz < world.CELLS; tz += 2) {
    for (let tx = 0; tx < world.CELLS; tx += 2) {
      const i = tz * world.CELLS + tx;
      const h = world.H[i];
      if (h <= 0) continue;
      const ct = world.CT[i];
      c.fillStyle = ct <= 3 ? '#3e8a33' : ct === 4 ? '#a5834e' : ct === 5 ? '#d4c07e'
        : ct === 6 || ct === 7 ? '#777c85' : ct === 14 || ct === 15 ? '#1e5226'
          : ct === 8 || ct === 9 ? '#9c6b3f' : '#c45c4a';
      c.fillRect(mx0 + tx * scale, my0 + tz * scale, scale * 2 + 0.4, scale * 2 + 0.4);
    }
  }
  for (const s of world.staticSprites) {
    if (s.k !== 'npc' && s.k !== 'shrine' && s.k !== 'chest' && s.k !== 'campfire' && !(s.k === 'sign')) continue;
    const col = s.k === 'npc' ? (s.id === 'elder' ? '#ffd76a' : s.id === 'mira' ? '#7de4ff' : '#8fd6ff')
      : s.k === 'shrine' ? '#a5f0ff' : s.k === 'chest' ? '#ffd76a' : s.k === 'campfire' ? '#ffb35c' : '#fff';
    const wx = (s.x + WORLD_HALF) / TS, wz = (s.z + WORLD_HALF) / TS;
    c.fillStyle = col;
    c.fillRect(mx0 + wx * scale - 1, my0 + wz * scale - 1, 2.5, 2.5);
  }
  for (const r of REGIONS) {
    const rx = (r.x + WORLD_HALF) / TS, rz = (r.z + WORLD_HALF) / TS;
    c.fillStyle = 'rgba(255,255,255,0.5)';
    c.fillRect(mx0 + rx * scale - 2, my0 + rz * scale - 2, 4, 4);
  }
  const px = (player.x + WORLD_HALF) / TS, pz = (player.z + WORLD_HALF) / TS;
  c.fillStyle = '#ffffff';
  c.fillRect(mx0 + px * scale - 2, my0 + pz * scale - 2, 5, 5);
  c.strokeStyle = 'rgba(255,255,255,0.4)';
  c.strokeRect(mx0 - 4, my0 - 4, mw + 8, mh + 8);
}
function drawDlgBox() {
  const c = ui;
  c.fillStyle = 'rgba(0,0,0,0.62)';
  c.fillRect(0, 0, W, 44);
  c.fillRect(0, H - 100, W, 100);
  const px0 = 10, py0 = H - 90, pw = W - 20, ph = 82;
  c.fillStyle = '#120e20';
  c.fillRect(px0, py0, pw, ph);
  c.fillStyle = 'rgba(255,215,106,0.75)';
  c.fillRect(px0, py0, 3, ph);
  c.fillRect(px0 + pw - 3, py0, 3, ph);
  c.fillStyle = '#090614';
  c.fillRect(px0 + 8, py0 + 10, 62, 62);
  const port = dlg.info.port;
  const u2 = 62 / 8;
  for (let i = 0; i < 8; i++) {
    for (let j = 0; j < 8; j++) {
      let col = '#0d0a1a';
      const hd = i >= 1 && i <= 6 && (j === 0 || j === 1 || (j === 2 && (i <= 1 || i >= 6)));
      const fc = i >= 1 && i <= 6 && j >= 2 && j <= 5 && !(i <= 1 || i >= 6);
      if (hd) col = port[0];
      else if (fc) col = port[1];
      if (j === 3 && (i === 2 || i === 5)) col = '#14101e';
      if (j === 4 && (i === 2 || i === 5)) col = '#14101e';
      if (j === 5 && i >= 3 && i <= 4) col = port[2];
      c.fillStyle = col;
      c.fillRect(px0 + 8 + i * u2, py0 + 10 + j * u2, Math.ceil(u2), Math.ceil(u2));
    }
  }
  const nm = dlg.info.nome + ' - ' + dlg.info.titulo;
  drawText(ui, nm, px0 + 84, py0 + 4, 1, '#ffd76a', {});
  const full = dlg.lines[dlg.idx].text;
  const shown = dlg.done ? full : full.slice(0, Math.floor((dlg._t || 0) * 46));
  const lines = wrapText(stripCol(shown), 360, 2);
  drawText(ui, lines.join('\n'), px0 + 84, py0 + 20, 2, '#f2ecff', {});
  if (dlg.done) {
    const bl = Math.sin(time * 6) > -0.5;
    if (bl) drawText(ui, 'v', W - 26, H - 24, 2, '#ffd76a', { shadow: false });
  }
}
function drawHud() {
  const c = ui;
  c.clearRect(0, 0, W, H);
  drawHearts();
  drawObjectiveHUD();
  miniMap();
  if (fx.toast) {
    const t = fx.toast.t;
    const a = t < 0.25 ? t / 0.25 : t > 2.6 ? Math.max(0, (3.4 - t) / 0.8) : 1;
    c.globalAlpha = a;
    const sc = 2;
    const s = stripCol(fx.toast.text);
    drawText(ui, s, W / 2 - textWidth(s, sc) / 2, 70, sc, '#cfeaff', {});
    c.globalAlpha = 1;
  }
  if (fx.banner) {
    const t = fx.banner.t;
    const a = t < 0.4 ? t / 0.4 : t > 4.0 ? Math.max(0, (4.6 - t) / 0.6) : 1;
    c.globalAlpha = a;
    const sc = 2;
    const s = stripCol(fx.banner.text);
    const tw = textWidth(s, sc);
    const bx = W / 2 - tw / 2 - 12;
    c.fillStyle = 'rgba(8,5,18,0.9)';
    c.fillRect(bx, 92, tw + 24, 30);
    c.fillStyle = fx.banner.cor;
    c.fillRect(bx, 92, 3, 30);
    c.fillRect(bx + tw + 21, 92, 3, 30);
    drawText(ui, fx.banner.text, W / 2 - tw / 2, 100, sc, fx.banner.cor, {});
    c.globalAlpha = 1;
  }
  if (dlg) drawDlgBox();
  else {
    const n = nearestInteract();
    if (n) {
      const label = n.type === 'chest' ? 'abrir bau [E]' : n.type === 'sign' ? 'ler placa [E]' : 'falar com ' + NPC_INFO[n.id].nome + ' [E]';
      const sc = 2;
      drawText(ui, label, W / 2 - textWidth(label, sc) / 2, H - 60, sc, '#ffffff', {});
    }
  }
  if (phase === 'play' && time > 8) {
    drawText(ui, 'WASD mover | E falar | Q missoes | F atacar | M som | ESC pausa', 10, H - 8, 1, 'rgba(255,255,255,0.35)', { shadow: false });
  }
}
// log de missões (fase 'log')
function drawLog() {
  const c = ui;
  c.clearRect(0, 0, W, H);
  c.fillStyle = 'rgba(5,4,14,0.92)';
  c.fillRect(0, 0, W, H);
  const done = sideDoneCount();
  drawText(ui, 'MISSOES DO VALE   (' + done + '/31 secundarias)', W / 2 - textWidth('MISSOES DO VALE   (' + done + '/31 secundarias)', 2) / 2, 12, 2, '#ffd76a', {});
  drawText(ui, 'HISTORIA', 20, 40, 1, '#9be89b', { shadow: false });
  const hs = ['1. Cristais da Memoria', '2. Flores de Luz', '3. O Bau do Templo'];
  hs.forEach((h, i) => {
    const st = q[i] === 2 ? 'FEITA' : q[i] === 1 ? 'EM ANDAMENTO' : q[i] === 0 ? 'DISPONIVEL' : '--';
    drawText(ui, (i + 1) + '. ' + hs[i].slice(3) + '  [' + st + ']', 28, 40 + 14 * (i + 1), 1, q[i] === 2 ? '#9be89b' : q[i] === 1 ? '#ffe9a8' : '#8a86a0', { shadow: false });
  });
  drawText(ui, 'SECUNDARIAS  (Q fecha | W/S ou setas mudam pagina)', 20, 92, 1, '#9be89b', { shadow: false });
  const per = 11;
  const start = logPage * per;
  let y = 108;
  for (let i = start; i < Math.min(SIDE.length, start + per); i++) {
    const s = SIDE[i];
    const st = side[i];
    const nome = (i + 4) + '. ' + s.nome;
    let rest = '';
    let cor = '#8a86a0';
    if (st === 2) { rest = 'FEITA'; cor = '#9be89b'; }
    else if (st === 1) {
      cor = s.cor;
      if (s.tipo === 'c') rest = 'colete ' + sideProgress(i) + '/' + s.need;
      else if (s.tipo === 'k') rest = 'derrote ' + sideProgress(i) + '/' + s.need;
      else rest = 'visite o local';
    } else { rest = 'bloqueada'; }
    drawText(ui, nome, 28, y, 1, cor, { shadow: false });
    drawText(ui, rest, W - 150, y, 1, rest === 'FEITA' ? '#9be89b' : '#cfeaff', { shadow: false });
    y += 14;
  }
  drawText(ui, 'pagina ' + (logPage + 1) + '/3   (historia + 31 secundarias = 34 no total)', 20, H - 16, 1, 'rgba(255,255,255,0.4)', { shadow: false });
  // mapa-múndi embutido ao lado
  worldMap();
}
function drawCutOverlay() {
  const c = ui;
  c.clearRect(0, 0, W, H);
  if (!cut) return;
  const shot = CUTSCENE[cut.i];
  const bar = 40;
  c.fillStyle = '#000';
  c.fillRect(0, 0, W, bar);
  c.fillRect(0, H - bar, W, bar);
  const st = shot.subs.find(s2 => cut.t >= s2.at && cut.t < s2.at + s2.dur);
  if (st) {
    const a = Math.min(1, Math.min((cut.t - st.at) / 0.4, Math.max(0, (st.at + st.dur) - cut.t) / 0.6));
    c.globalAlpha = Math.max(0, a);
    if (st.who) drawText(ui, st.who, W / 2 - textWidth(st.who, 1) / 2, H - bar + 8, 1, '#ffd76a', {});
    const sc = 2;
    const lines = wrapText(stripCol(st.text), W - 60, sc);
    lines.forEach((ln, i) => drawText(ui, ln, W / 2 - textWidth(ln, sc) / 2, H - bar + 20 + i * 18, sc, '#ffffff', {}));
    c.globalAlpha = 1;
  }
  if (cut.i === 0 && cut.t < 3) {
    const a = cut.t < 0.9 ? cut.t / 0.9 : cut.t > 2.2 ? Math.max(0, (3 - cut.t) / 0.8) : 1;
    c.globalAlpha = a;
    const t = NAME;
    const sc = 4;
    drawText(ui, t, W / 2 - textWidth(t, sc) / 2, 56, sc, '#ffd76a', {});
    c.globalAlpha = 1;
  }
  if (cut.i === CUTSCENE.length - 1) {
    const t = NAME;
    const a = Math.min(1, cut.t / 1.2);
    c.globalAlpha = a;
    drawText(ui, t, W / 2 - textWidth(t, 3) / 2, H / 2 - 20, 3, '#ffd76a', {});
    c.globalAlpha = 1;
  }
  drawText(ui, 'ENTER pula a cena', W - 170, 6, 1, 'rgba(255,255,255,0.3)', { shadow: false });
}
function panelBox(x, y, w, h) {
  const c = ui;
  c.fillStyle = 'rgba(10,7,24,0.92)';
  c.fillRect(x, y, w, h);
  c.fillStyle = 'rgba(255,215,106,0.8)';
  c.fillRect(x, y, w, 2);
  c.fillRect(x, y + h - 2, w, 2);
  c.fillRect(x, y, 2, h);
  c.fillRect(x + w - 2, y, 2, h);
}
function drawTitleOverlay() {
  const c = ui;
  c.fillStyle = 'rgba(8,5,20,0.5)';
  c.fillRect(0, 0, W, H);
  // logo
  const t1 = 'GRAND', t2 = 'PIXEL GAME';
  const sc = 5;
  drawText(ui, t1, W / 2 - textWidth(t1, sc) / 2 + 3, 33, sc, 'rgba(0,0,0,0.6)', { shadow: false });
  drawText(ui, t1, W / 2 - textWidth(t1, sc) / 2, 30, sc, '#ffd76a', { shadow: false });
  const sc2 = 3;
  drawText(ui, t2, W / 2 - textWidth(t2, sc2) / 2 + 2, 30 + 8 * sc + 4, sc2, 'rgba(0,0,0,0.6)', { shadow: false });
  drawText(ui, t2, W / 2 - textWidth(t2, sc2) / 2, 30 + 8 * sc + 2, sc2, '#fff3c0', { shadow: false });
  // painel de menu
  panelBox(W / 2 - 130, 128, 260, 74);
  const has = !!loadSave();
  const label = has ? '[ENTER] CONTINUAR' : '[ENTER] COMECAR';
  if (Math.sin(time * 3) > -0.3) {
    drawText(ui, label, W / 2 - textWidth(label, 2) / 2, 140, 2, '#ffffff', {});
  }
  drawText(ui, '[C] como jogar   [O] opcoes   [M] som: ' + (audio.isMuted ? 'off' : 'on'), W / 2 - textWidth('[C] como jogar   [O] opcoes   [M] som: on', 1) / 2, 168, 1, 'rgba(255,255,255,0.75)', {});
  drawText(ui, '[R] zerar progresso', W / 2 - textWidth('[R] zerar progresso', 1) / 2, 184, 1, 'rgba(255,255,255,0.45)', {});
  drawText(ui, 'mundo aberto em blocos  -  3 missoes + 31 secundarias', W / 2 - textWidth('mundo aberto em blocos  -  3 missoes + 31 secundarias', 1) / 2, 216, 1, '#d8ccff', {});
  drawText(ui, 'musica da intro: assets/music/inner-light.mp3 (se existir) ou tema sintetizado', W / 2 - textWidth('musica da intro: assets/music/inner-light.mp3 (se existir) ou tema sintetizado', 1) / 2, 246, 1, 'rgba(255,255,255,0.4)', {});
  drawText(ui, 'WASD mover | E agir | F atacar | Q missoes | Esc pausa', W / 2 - textWidth('WASD mover | E agir | F atacar | Q missoes | Esc pausa', 1) / 2, 262, 1, 'rgba(255,255,255,0.6)', {});
}
function drawHowtoOverlay() {
  const c = ui;
  c.fillStyle = 'rgba(5,4,14,0.92)';
  c.fillRect(0, 0, W, H);
  drawText(ui, 'COMO JOGAR', W / 2 - textWidth('COMO JOGAR', 3) / 2, 24, 3, '#ffd76a', {});
  const rows = [
    '#ffd76a MOVIMENTO#ffffff   WASD ou setas (camera acompanha)',
    '#ffd76a FALAR / AGIR#ffffff   E perto de NPC, placa ou bau',
    '#ffd76a ATACAR#ffffff   F ou J (espada na direcao do olhar)',
    '#ffd76a PULAR#ffffff   Espaco (segure na agua para nadar)',
    '#ffd76a MISSOES#ffffff   Q abre a lista + mapa do vale',
    '#ffd76a SOM / PAUSA#ffffff   M e Esc',
    '',
    '#9be89b DICAS#ffffff   - Coisas que brilham podem ser coletadas.',
    '   - Slimes pulam ao seu redor: bata antes de chegar.',
    '   - Wisps levitam na Floresta dos Sussurros (norte).',
    '   - Complete 5 missoes para ganhar +1 coracao.',
    '   - Ctrl+R (pausa) zera o progresso.',
  ];
  rows.forEach((r, i) => drawText(ui, r, 30, 84 + i * 15, 1, '#ffffff', {}));
  drawText(ui, 'ENTER ou C volta', W / 2 - textWidth('ENTER ou C volta', 2) / 2, H - 30, 2, '#ffffff', {});
}
function drawOptionsOverlay() {
  const c = ui;
  c.fillStyle = 'rgba(5,4,14,0.92)';
  c.fillRect(0, 0, W, H);
  drawText(ui, 'OPCOES', W / 2 - textWidth('OPCOES', 3) / 2, 24, 3, '#ffd76a', {});
  const row = (label, i, help) => {
    const sel = optIdx === i;
    drawText(ui, (sel ? '> ' : '  ') + label, 60, 84 + i * 26, 2, sel ? '#ffd76a' : '#c8c2e0', {});
    if (help) drawText(ui, help, 300, 84 + i * 26, 1, 'rgba(255,255,255,0.5)', { shadow: false });
  };
  row('VOLUME DA MUSICA: ' + Math.round(CFG.mus * 100) + '%', 0, 'A/D');
  row('VOLUME DOS EFEITOS: ' + Math.round(CFG.sfx * 100) + '%', 1, 'A/D');
  row('DISTANCIA DE VISAO: ' + (CFG.qual === 0 ? 'BAIXA' : CFG.qual === 1 ? 'MEDIA' : 'ALTA'), 2, 'A/D');
  row('GRAVAR E VOLTAR', 3, '');
  drawText(ui, 'W/S: muda item | A/D: ajusta | ENTER: salva e volta | M: som geral ' + (audio.isMuted ? 'OFF' : 'ON'),
    W / 2 - textWidth('W/S: muda item | A/D: ajusta | ENTER: salva e volta', 1) / 2, H - 24, 1, 'rgba(255,255,255,0.55)', {});
}
function drawPauseOverlay() {
  const c = ui;
  c.fillStyle = 'rgba(5,4,14,0.85)';
  c.fillRect(0, 0, W, H);
  drawText(ui, 'PAUSA', W / 2 - textWidth('PAUSA', 5) / 2, 40, 5, '#ffd76a', {});
  const items = ['CONTINUAR', 'OPCOES', 'SOM: ' + (audio.isMuted ? 'DESLIGADO' : 'LIGADO'), 'COMO JOGAR', 'ZERAR PROGRESSO'];
  items.forEach((it, i) => {
    const sel = menuSel === i;
    drawText(ui, (sel ? '> ' : '  ') + it, W / 2 - textWidth(it, 2) / 2 - (sel ? 8 : 0), 100 + i * 26, 2, sel ? '#ffd76a' : '#d8ccff', {});
  });
  drawText(ui, 'setas: escolher | Enter: confirmar | Esc: voltar | missoes concluidas: ' + sideTotalDone() + '/34', W / 2 - textWidth('setas: escolher | Enter: confirmar | Esc: voltar', 1) / 2, H - 18, 1, 'rgba(255,255,255,0.5)', {});
}
function vignette() {
  ui.fillStyle = 'rgba(4,2,12,0.34)';
  ui.fillRect(0, 0, W, 6);
  ui.fillRect(0, H - 6, W, 6);
  ui.fillStyle = 'rgba(0,0,0,0.25)';
  ui.fillRect(0, 0, 5, H);
  ui.fillRect(W - 5, 0, 5, H);
}

// ---------------- loop ----------------
function loop(now) {
  requestAnimationFrame(loop);
  let dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  time += dt;
  audio.update(dt);
  if (phase === 'play') {
    updateFx(dt);
    updateDlg(dt);
    if (!dlg) { controlPlayer(dt); updateEnemies(dt); }
    updateCam(dt);
    checkSideQuests();
    if (player.y < -4) player.y = Math.max(1, groundY(player.x, player.z));
    if (input.atk && !dlg) { swing(); input.atk = false; }
  } else if (phase === 'cut') {
    updateCut(dt);
    updateFx(dt);
  } else if (phase === 'title') {
    const t = time * 0.07;
    const rr = 27;
    cam.x = Math.cos(t) * rr;
    cam.z = Math.sin(t) * rr;
    cam.y = 8.5 + Math.sin(t * 0.6) * 1.2;
    cam.yaw = Math.atan2(-cam.x, -cam.z) + Math.PI;
    cam.pitch = -0.42;
    cam.tyaw = cam.yaw;
    fx.fade = 0;
  } else if (phase === 'pause') {
    // mantém a câmera do jogo
  } else if (phase === 'cut') {
    // updateCut já cuidou
  }
  const inGame = phase === 'play' || phase === 'pause';
  const showWorld = phase !== 'log';
  if (showWorld) {
    const entities = buildEntities(inGame);
    const glows = (phase === 'play' || phase === 'cut') ? buildGlows() : [];
    rdr.render(cam, time, entities, glows);
  }
  if (phase === 'play') { drawHud(); vignette(); }
  else if (phase === 'pause') { drawHud(); drawPauseOverlay(); }
  else if (phase === 'cut') drawCutOverlay();
  else if (phase === 'title') drawTitleOverlay();
  else if (phase === 'howto') drawHowtoOverlay();
  else if (phase === 'options') drawOptionsOverlay();
  else if (phase === 'log') drawLog();
  if (fx.red > 0) {
    ui.fillStyle = 'rgba(190,16,40,' + (fx.red * 0.32).toFixed(3) + ')';
    ui.fillRect(0, 0, W, H);
  }
  if (fx.fade > 0.004) {
    ui.fillStyle = fx.fadeCol;
    ui.globalAlpha = Math.min(1, fx.fade);
    ui.fillRect(0, 0, W, H);
    ui.globalAlpha = 1;
  }
  const pb = document.getElementById('pause-btn');
  if (pb) pb.classList.toggle('hidden', phase !== 'play' && phase !== 'pause');
}
function boot() {
  applyCfg();
  player.y = playerGround();
  player.hp = player.hpMax = 3;
  cam.x = player.x + 7; cam.z = player.z + 7; cam.y = player.y + 3;
  loadObstacles();
  setupInput();
  document.getElementById('loading').style.display = 'none';
  phase = 'title';
  const musicNames = ['inner-light', 'intro', 'grand-pixel-game', 'music', 'ost'];
  const musicExts = ['mp3', 'ogg', 'm4a', 'wav'];
  const candidates = [];
  for (const n of musicNames) for (const e of musicExts) candidates.push('assets/music/' + n + '.' + e);
  audio.tryLoadExternal(candidates).then(() => {});
  requestAnimationFrame(loop);
}
boot();

// handle de debug (console do navegador / testes)
if (typeof window !== 'undefined') {
  window.__gpg = {
    player, side, colN, killN, q, collected, world, SLIMES, WISPS, CFG,
    get phase() { return phase; },
    unlockInitialSide, checkSideQuests, collect, saveGame, loadSave,
    startGame, endCutscene, togglePause,
  };
}
