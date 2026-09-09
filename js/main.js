// GRAND PIXEL GAME — o chamado da luz
// jogo principal: mundo aberto, 70 missões (11 capítulos + 59 secundárias),
// 10 artefatos míticos, chefes, lores e diário. Sem música externa.
import { World, TS, WORLD_HALF, WATER_Y, REGIONS, POIS } from './world.js';
import { Renderer, ART } from './renderer.js';
import { audio } from './audio.js';
import { clamp, lerp, smoothstep } from './math.js';
import { MAIN as MAIN_SRC, SIDE, SIDE_TOTAL, ARTIFACTS, have, rewText, whyLocked } from './quests.js';
// capítulos usam campos diretos (item/n/boss); normaliza para alvo único
const MAIN = MAIN_SRC.map(m => Object.assign({}, m, {
  alvo: m.alvo ? m.alvo : m.item ? { item: m.item, n: m.n } : m.boss ? { boss: m.boss } : null,
}));

const VERSION = '1.2.0';
const SEED = 20260908;
const world = new World(SEED);
const glCanvas = document.getElementById('gl');
const uiCanvas = document.getElementById('ui');
const ui = uiCanvas.getContext('2d');
const mini = document.getElementById('mini').getContext('2d');
const rdr = new Renderer(glCanvas, world);

// ---------------- configuração ----------------
const CFG = Object.assign({ sfx: 0.8, qual: 1 }, loadCfg());
function loadCfg() {
  const read = k => {
    try { const v = JSON.parse(localStorage.getItem(k) || 'null'); if (v && typeof v === 'object') return v; } catch (e) {}
    return null;
  };
  return read('grandpixel-cfg') || read('solaria-cfg') || {};
}
function saveCfg() {
  try { localStorage.setItem('grandpixel-cfg', JSON.stringify(CFG)); } catch (e) {}
}
function applyCfg() {
  audio.setSfxVol(CFG.sfx);
  const q = CFG.qual || 1;
  cam.fogA = q === 0 ? 45 : q === 1 ? 70 : 95;
  cam.fogB = q === 0 ? 120 : q === 1 ? 215 : 320;
}

// ---------------- estado ----------------
let phase = 'boot'; // boot | title | play | pause | log | dlg aberto dentro de play
let time = 0;
let last = performance.now();
const cam = { x: 0, y: 9, z: 30, yaw: 0, pitch: -0.4, tyaw: 0, fogA: 70, fogB: 215 };
const keys = {};
const input = { jx: 0, jy: 0, atk: false, jump: false };
const player = {
  x: 5.5, z: 5.5, y: 1, vy: 0, yaw: -Math.PI / 4,
  hp: 3, hpMax: 3, inv: 0, hurtT: 0, atk: 0, walkT: 0,
  onGround: true, swim: false, moving: false, kx: 0, kz: 0, jumped: 0, jumpBuf: 0,
};
const stateM = new Array(MAIN.length).fill(0);   // 0 futura | 1 ativa | 2 concluída
const side = new Array(SIDE_TOTAL).fill(0);       // 0 trancada | 1 ativa | 2 concluída
const arts = [];                                  // artefatos obtidos (ids)
const colN = {};                                  // coletados por tipo
const killN = {};                                 // mortes por área
const talked = { elder: 0, mira: 0, kael: 0 };    // nº de conversas
const visited = new Set();                        // ids de POIs visitados
const collected = new Set();                      // seeds de coletáveis
const chestsOpen = new Set();                     // ids de baús abertos
const bossKill = { golem: 0, matriarca: 0, guardian: 0 }; // nº de vitórias
let hearts = 0;          // baús de coração abertos
let dlg = null;          // diálogo atual
let dlgDone = false;
let dlgTxtFull = '';
let dlgTxtShown = '';
let banner = null;
let toast = null;
let redFx = 0;
let fade = 0, fadeIn = true;
let introShown = false;
let finaleShown = false;
let interacted = false;   // E consumido na moldura
let promptInfo = null;
let promptT = 0;
let winW = 1, winH = 1;
let hintVisible = false;

const NPC_POS = {};
for (const s of world.staticSprites) if (s.k === 'npc') NPC_POS[s.id] = s;
const NPC_NAME = { elder: 'Ori, o Ancião', mira: 'Mira, a Curandeira', kael: 'Kael, o Mineiro' };
const AREA_HINT = { elder: 'a praça de Solaria', mira: 'a cabana a oeste da praça', kael: 'a estrada próxima à praça' };

// ---------------- utilitários ----------------
const $ = id => document.getElementById(id);
const groundY = (x, z) => Math.max(0, world.heightAt(x, z));
const playerGround = () => groundY(player.x, player.z);
const dist2d = (a, b, c, d) => Math.hypot(a - c, b - d);
function bannerFx(text, cor = '#ffd76a') { banner = { text, cor, t: 0 }; audio.sfx('quest'); }
function toastFx(text) { toast = { text, t: 0 }; }
function burst(x, y, z, col, n = 8) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    fxParts.push({
      x, y, z, t: 0, life: 0.7 + Math.random() * 0.5,
      vx: Math.cos(a) * (2 + Math.random() * 2), vz: Math.sin(a) * (2 + Math.random() * 2),
      vy: 2.2 + Math.random() * 2.6, r: col[0], g: col[1], b: col[2],
    });
  }
}
const fxParts = [];
const ITEM_NAME = {
  crystal: 'cristais da memória', florete: 'flores de luz', berry: 'bagas dos sussurros',
  ore: 'minérios de alma', shell: 'conchas brilhantes', essence: 'essências de luz',
};
const ITEM_COL = {
  crystal: [1, 0.55, 1], florete: [0.5, 0.9, 1], berry: [1, 0.3, 0.35],
  ore: [0.5, 0.85, 1], shell: [1, 0.85, 0.5], essence: [0.6, 1, 1],
};
const pickupsTotal = k => world.staticSprites.filter(s => s.k === k && s.pickup).length;
const pickupsLeft = k => world.staticSprites.filter(s => s.k === k && s.pickup && !collected.has(s.seed)).length;
const artOf = id => ARTIFACTS.find(a => a.id === id);
const questBy = i => SIDE[i];

const POI_POS = {};
for (const p of POIS) POI_POS[p.id] = { ...p };
const POI_LIST = POIS;
const regionName = id => { const r = REGIONS.find(x => x.id === id); return r ? r.name : id; };

// ---------------- vida / corações ----------------
function computeHpMax() {
  let m = 3 + hearts;
  if (have(arts, 'a0')) m += 1;
  if (have(arts, 'a8')) m += 1;
  if (have(arts, 'a2')) m += 2;
  m += Math.floor(side.filter(v => v === 2).length / 8);
  return Math.min(14, m);
}
function refreshHp() {
  player.hpMax = computeHpMax();
  player.hp = Math.min(player.hp, player.hpMax);
}
function healFull(quiet = false) {
  refreshHp();
  player.hp = player.hpMax;
  if (!quiet) { audio.sfx('heal'); toastFx('você se sente renovado(a)'); }
}

// ---------------- missões: desbloqueio ----------------
function questDoneMain(i) { return stateM[i] === 2; }
function currentMain() {
  for (let i = 0; i < MAIN.length; i++) if (stateM[i] === 1) return i;
  return MAIN.every((_, i) => stateM[i] === 2) ? MAIN.length : 0;
}
function preMet(pre) {
  if (!pre) return true;
  if (pre.main !== undefined) return questDoneMain(pre.main);
  if (pre.side) return pre.side.every(j => side[j] === 2);
  if (pre.visit) return visited.has(pre.visit);
  if (pre.obtain) return have(arts, pre.obtain);
  if (pre.boss) return bossKill[pre.boss] > 0;
  if (pre.kill) return (killN[pre.kill] || 0) >= 1;
  if (pre.talk) return talked[pre.talk] >= 1;
  if (pre.open !== undefined) return chestsOpen.size >= pre.open;
  return true;
}
// progresso numérico de uma missão
function qProgress(q) {
  const a = q.alvo;
  if (q.tipo === 'collect') { const cur = colN[a.item] || 0; return { cur: Math.min(cur, a.n), need: a.n }; }
  if (q.tipo === 'kill') { const cur = killN[a.area] || 0; return { cur: Math.min(cur, a.n), need: a.n }; }
  if (q.tipo === 'open') { const cur = chestsOpen.size; return { cur: Math.min(cur, a.n), need: a.n }; }
  return null;
}
// qMeta guarda, por missão ativa, quantas mortes de chefe/conversas já existiam
// quando ela desbloqueou — para exigir ações NOVAS depois da ativação.
const qMeta = {};
function metaOf(q) {
  const key = q.i !== undefined ? 's' + q.i : 'm' + q.idx;
  return qMeta[key] || null;
}
function activateSide(i) {
  if (side[i] !== 0) return false;
  if (!preMet(SIDE[i].pre)) return false;
  side[i] = 1;
  const q = SIDE[i];
  if (q.tipo === 'boss' && q.alvo && q.alvo.boss) {
    const k = 's' + i;
    qMeta[k] = qMeta[k] || {};
    qMeta[k].boss = qMeta[k].boss || {};
    qMeta[k].boss[q.alvo.boss] = bossKill[q.alvo.boss] || 0;
  } else if (q.tipo === 'talk' && q.alvo && q.alvo.npc) {
    qMeta['s' + i] = qMeta['s' + i] || {};
    qMeta['s' + i].talk = talked[q.alvo.npc] || 0;
  }
  return true;
}
function rebuildMeta() {
  for (let i = 0; i < SIDE.length; i++) {
    if (side[i] !== 1) continue;
    const q = SIDE[i];
    const k = 's' + i;
    if (q.tipo === 'boss' && q.alvo && q.alvo.boss && !(qMeta[k] && qMeta[k].boss)) {
      qMeta[k] = qMeta[k] || {};
      qMeta[k].boss = qMeta[k].boss || {};
      qMeta[k].boss[q.alvo.boss] = bossKill[q.alvo.boss] || 0;
    } else if (q.tipo === 'talk' && q.alvo && q.alvo.npc && !(qMeta[k] && qMeta[k].talk !== undefined)) {
      qMeta[k] = qMeta[k] || {};
      qMeta[k].talk = talked[q.alvo.npc] || 0;
    }
  }
}
function qMet(q) {
  // capítulos de história do tipo "fale com alguém" (sem campo tipo)
  if (!q.tipo && q.npc) return worldFlags.has('mt' + q.idx);
  const a = q.alvo;
  if (!a) return false;
  switch (q.tipo) {
    case 'talk': {
      const m = metaOf(q);
      const base = m && m.talk !== undefined ? m.talk : -1;
      return (talked[a.npc] || 0) > base;
    }
    case 'visit': return visited.has(a.poi);
    case 'collect': return (colN[a.item] || 0) >= a.n;
    case 'kill': return (killN[a.area] || 0) >= a.n;
    case 'boss': {
      const m = metaOf(q);
      const base = m && m.boss ? (m.boss[a.boss] !== undefined ? m.boss[a.boss] : 0) : 0;
      return (bossKill[a.boss] || 0) > base;
    }
    case 'obtain': return have(arts, a.art);
    case 'open': return chestsOpen.size >= a.n;
    case 'interact': return a.flag !== undefined ? worldFlags.has(a.flag) : false;
    default: return false;
  }
}
const worldFlags = new Set(); // flags de mundo (selos acesos, portal aberto...)

function completeQuestLine(q, i, isMain) {
  const nome = q.nome;
  const r = q.recompensa;
  let msg = (isMain ? '★ CAPÍTULO CONCLUÍDO — ' : '★ MISSÃO CONCLUÍDA — ') + nome + ' ★';
  bannerFx(msg, isMain ? '#ffd76a' : (q.cor || '#9be89b'));
  audio.sfx('complete');
  if (r && r.art) {
    const a = artOf(r.art);
    if (a && !have(arts, r.art)) {
      arts.push(r.art);
      audio.sfx('artifact');
      refreshHp();
      bannerFx('✦ ARTEFATO: ' + a.nome + ' ✦', '#ffd76a');
      toastFx(a.desc);
    }
  }
  if (r && r.cura) healFull(true);
  refreshHp();
  saveGame();
}
function unlockSweep() {
  let changed = false;
  for (let i = 0; i < SIDE.length; i++) {
    if (activateSide(i)) {
      changed = true;
      bannerFx('NOVA MISSÃO: ' + SIDE[i].nome + '  [Q abre o diário]', '#a5f0ff');
    }
  }
  return changed;
}
function completeSweep() {
  let changed = false;
  for (let i = 0; i < SIDE.length; i++) {
    if (side[i] !== 1) continue;
    if (qMet(SIDE[i])) {
      side[i] = 2;
      changed = true;
      completeQuestLine(SIDE[i], i, false);
      // desbloqueia a próxima do grupo
      for (let j = 0; j < SIDE.length; j++) {
        if (activateSide(j)) {
          changed = true;
          bannerFx('NOVA MISSÃO: ' + SIDE[j].nome + '  [Q abre o diário]', '#a5f0ff');
        }
      }
    }
  }
  // capítulos da história
  const mi = currentMain();
  if (mi < MAIN.length && stateM[mi] === 1 && qMet(MAIN[mi])) {
    stateM[mi] = 2;
    if (mi === MAIN_LAST) endOfStory();
    else {
      stateM[mi + 1] = 1;
      changed = true;
      completeQuestLine(MAIN[mi], mi, true);
      if (MAIN[mi + 1]) {
        const nxt = MAIN[mi + 1];
        bannerFx('CAPÍTULO ' + (mi + 2) + ' — ' + nxt.nome, '#ff9de0');
      }
    }
  }
  if (changed) { unlockSweep(); refreshHp(); saveGame(); }
}
function questsTick() { unlockSweep(); completeSweep(); }
const MAIN_LAST = MAIN.length - 1;
function endOfStory() {
  saveGame();
  if (!finaleShown) {
    finaleShown = true;
    bannerFx('★ SOLARIA ESTÁ SALVA ★', '#ffd76a');
    toastFx('a luz voltou ao vale — e ainda há 59 missões por aí…');
    audio.sfx('seal');
    saveGame();
  }
}

// ---------------- diálogos ----------------
function finishTalk(npc) {
  talked[npc]++;
  const mi = currentMain();
  const m = mi < MAIN.length ? MAIN[mi] : null;
  if (m && !m.tipo && m.npc === npc && stateM[mi] === 1) worldFlags.add('mt' + m.idx);
  questsTick();
  saveGame();
}
function dlgLinesFor(npc) {
  const mi = currentMain();
  const L = [];
  const ch = mi < MAIN.length ? MAIN[mi] : null;
  const push = t => L.push({ who: (NPC_NAME[npc] || npc).toUpperCase(), t });
  // Capítulo ativo que pede esse NPC
  if (ch && ch.npc === npc) {
    const story = {
      elder: [
        'Você acordou como a luz… eu sabia que o vale chamaria alguém de novo.',
        'Há muito tempo Solaria brilhava. Os cristais do Campo Radiante guardavam essa luz — e ela se perdeu.',
      ],
      mira: [
        'Ah, você chegou… os cristais já cantam baixinho na praça. É um bom começo.',
        'As flores que choram luz nascem na Clareira das Lágrimas, a sudoeste. Traga cinco — elas lembram o vale do que ele era.',
      ],
      kael: [
        'Então é você, o escolhido da luz? Humpf. Eu só acredito no que minhas mãos tocam.',
        'Se quer abrir o caminho para a Cripta, vai precisar de minérios de alma — seis deles, das entranhas da mina a oeste.',
      ],
    }[npc] || [];
    for (const t of story) push(t);
    const nxt = MAIN[mi + 1];
    if (nxt) {
      push(nxt.npc && nxt.npc !== npc
        ? 'Siga para ' + (NPC_NAME[nxt.npc] || 'o próximo passo') + ' — ' + (nxt.texto || '').toLowerCase().replace(/\.$/, '') + '.'
        : 'Depois disso, ' + (nxt.texto || 'continue sua jornada.').toLowerCase().replace(/\.$/, '') + '.');
    }
    if (mi === 0 && !introShown) introShown = true;
    return L;
  }
  if (ch && ch.tipo === 'interact' && ch.selo && npc === 'elder') {
    push('Os selos acordam com a luz certa. O primeiro selo está aqui mesmo, junto do obelisco — toque nele quando os cristais cantarem.');
    return L;
  }
  if (ch && ch.tipo === 'collect' && npc === 'elder') {
    push(ch.item === 'crystal' ? 'Os cristais estão por todo o Campo Radiante, a leste. Cinco bastam para acender o primeiro selo.' : 'Você ainda tem uma coleta pendente… o vale lhe mostra o caminho no diário.');
    return L;
  }
  if (ch && ch.tipo === 'boss' && ch.boss === 'golem' && npc === 'kael') {
    push('Eu ouvi o chão roncar… o Golem acordou. Ele guarda o Núcleo de Pedra — e sem ele, ninguém abre o portal da Cripta.');
    return L;
  }
  if (ch && ch.tipo === 'boss' && ch.boss === 'guardian') {
    push(npc === 'kael'
      ? 'Você chegou até a Cripta Esquecida… então o que dizem sobre você é verdade. Que a luz te acompanhe lá dentro.'
      : 'A Cripta Esquecida engole até o eco. Volte inteiro(a) — o vale inteiro torce por você.');
    return L;
  }
  if (mi >= MAIN.length) {
    const ep = {
      elder: [
        'Você trouxe a luz de volta, criança. Eu vivi para ver Solaria brilhar de novo.',
        'Ainda há segredos pelo vale — a Ilha do Recife, os baús dos antigos… e histórias que merecem ser contadas. Volte sempre.',
      ],
      mira: ['O vale respira de novo. As flores da clareira nunca estiveram tão vivas.', 'Dizem que o mar devolve tesouros a quem insiste. A ilha no nordeste guarda o Faro antigo…'],
      kael: ['Eu duvidei de você, e fui tolo. A pedra que moveu o vale foi a sua luz.', 'Se for até o Recife, acenda o farol. Eu quero ver essa luz daqui da vila.'],
    }[npc] || [];
    for (const t of ep) push(t);
    return L;
  }
  // pools genéricos
  const pools = {
    elder: [
      ['O vale se lembra de você, andarilho.', 'Se precisar de direção, o diário [Q] mostra cada missão que acordou.'],
      ['A pousada ao sul guarda boas histórias — e a fogueira, boas noites.', 'Cuidado com o que brilha demais no escuro.'],
    ],
    mira: [
      ['Suas feridas contam histórias. Descanse — a cura é parte da jornada.', 'Coletei essências a vida toda. Elas flutuam perto das clareiras.'],
      ['O mar, ao sul, tem conchas que guardam o som da tempestade.', 'Se encontrar a Matriarca dos Sussurros, não hesite. Hesitar é morrer duas vezes.'],
    ],
    kael: [
      ['A mina é traiçoeira, mas honesta: o que você leva de lá, você conquista.', 'Slimes de pedra se partem como argila — bata sem medo.'],
      ['O arco da Cripta fica na encosta leste da mina. Estude os entalhes antes de tocar.', 'Minério bom canta quando você bate. Escute.'],
    ],
  }[npc] || [['…']];
  const pool = pools[talked[npc] % pools.length];
  for (const t of pool) push(t);
  return L;
}
function openDlg(npc) {
  const lines = dlgLinesFor(npc);
  if (!lines.length) return;
  dlg = { npc, lines, idx: 0 };
  dlgTxtFull = lines[0].t;
  dlgTxtShown = '';
  dlgDone = false;
  const nameEl = $('dlg-name');
  nameEl.textContent = lines[0].who;
  nameEl.style.color = npc === 'elder' ? '#ffd76a' : npc === 'mira' ? '#7de4ff' : '#8fd6ff';
  $('dlg').classList.remove('hidden');
  audio.sfx('talk');
  finishTalk(npc);
}
function advanceDlg() {
  if (!dlg) return;
  if (!dlgDone) { dlgDone = true; dlgTxtShown = dlgTxtFull; return; }
  dlg.idx++;
  if (dlg.idx >= dlg.lines.length) { closeDlg(); return; }
  dlgTxtFull = dlg.lines[dlg.idx].t;
  dlgTxtShown = '';
  dlgDone = false;
  audio.sfx('blip');
}
function closeDlg() {
  dlg = null;
  $('dlg').classList.add('hidden');
}

// ---------------- eventos de mundo ----------------
function onCollect(spr) {
  if (collected.has(spr.seed)) return;
  collected.add(spr.seed);
  colN[spr.k] = (colN[spr.k] || 0) + 1;
  audio.sfx('coin');
  const g = Math.max(WATER_Y, groundY(spr.x, spr.z)) + 0.8;
  burst(spr.x, g, spr.z, ITEM_COL[spr.k] || [1, 1, 1], 9);
  const left = pickupsLeft(spr.k);
  const tot = pickupsTotal(spr.k);
  toastFx((ITEM_NAME[spr.k] || spr.k) + '  ' + (tot - left) + '/' + tot);
  if (have(arts, 'a7')) { // Semente Estelar: coletar cura
    if (player.hp < player.hpMax) {
      player.hp = Math.min(player.hpMax, player.hp + 1);
      audio.sfx('heal');
    }
  }
  questsTick();
  saveGame();
  checkPrompt();
}
function onKill(areaKey, x, y, z, col) {
  killN[areaKey] = (killN[areaKey] || 0) + 1;
  burst(x, y, z, col, 13);
  audio.sfx('die');
  questsTick();
  saveGame();
}
function onBossKill(id, x, y, z) {
  bossKill[id] = (bossKill[id] || 0) + 1;
  burst(x, y, z, id === 'golem' ? [1, 0.75, 0.5] : id === 'guardian' ? [0.95, 0.45, 0.9] : [0.7, 0.85, 1], 26);
  audio.sfx('roar');
  questsTick();
  saveGame();
}
function onVisitPoi(id) {
  if (visited.has(id)) return;
  visited.add(id);
  const p = POI_POS[id];
  if (p) toastFx('descoberto: ' + p.nome);
  questsTick();
  saveGame();
  checkPrompt();
}
function onChestOpen(id) {
  if (chestsOpen.has(id)) return;
  chestsOpen.add(id);
  audio.sfx('chest');
  const spr = world.staticSprites.find(s => s.id === id);
  const cx = spr ? spr.x : 0, cz = spr ? spr.z : 0;
  burst(cx, groundY(cx, cz) + 1.1, cz, [1, 0.85, 0.4], 18);
  const give = spr ? spr.give : null;
  if (give === 'heart') { hearts++; refreshHp(); player.hp = player.hpMax; bannerFx('❤ +1 VIDA MÁXIMA  (' + player.hpMax + ')', '#ff7d8a'); audio.sfx('heal'); }
  else if (give === 'cura') { healFull(true); bannerFx('+ CURA TOTAL', '#7de4ff'); }
  else if (give && give[0] === 'a') {
    const a = artOf(give);
    if (a && !have(arts, give)) {
      arts.push(give);
      refreshHp();
      audio.sfx('artifact');
      bannerFx('✦ ' + a.nome.toUpperCase() + ' ✦', '#ffd76a');
      toastFx(a.desc);
    }
  }
  questsTick();
  saveGame();
  checkPrompt();
}
function canOpenChest(spr) {
  const id = spr.id;
  if (!id || chestsOpen.has(id)) return false;
  const give = spr.give;
  if (give === 'heart' || give === 'cura') return true;
  if (id === 'chest_a3') return side[24] === 1 || side[24] === 2;
  if (id === 'chest_golem') return side[39] === 1 || side[39] === 2;
  if (id === 'chest_arena') return stateM[10] === 2;
  if (id === 'chest_recife') return visited.has('segredo_recife');
  return false;
}
function sealOpenable(spr) {
  const mi = currentMain();
  if (!spr.id) return false;
  if (spr.id === 'selo_vila') return mi === 2 && MAIN[2] && MAIN[2].tipo === 'interact';
  if (spr.id === 'selo_clareira') return mi === 5 && MAIN[5] && MAIN[5].tipo === 'interact';
  return false;
}
function gateAction() {
  const mi = currentMain();
  if (mi === 9) {
    stateM[9] = 2;
    worldFlags.add('gate_open');
    bannerFx('★ O PORTAL DA CRIPTA SE ABRE ★', '#c9a0ff');
    audio.sfx('portal');
    fxPortalFx();
    travelToCripta();
    stateM[10] = 1;
    bannerFx('CAPÍTULO 11 — O GUARDIÃO SOMBRIO', '#ff5f9e');
    saveGame();
    questsTick();
  } else if (mi === 10 || stateM[10] === 2) {
    audio.sfx('portal');
    travelToCripta();
  }
}
function travelToCripta() {
  player.x = -150; player.z = 156; player.yaw = Math.PI;
  player.y = Math.max(groundY(player.x, player.z), 1);
  player.vy = 0; player.onGround = true; player.swim = false;
  cam.x = player.x + 8; cam.z = player.z + 8; cam.y = player.y + 3;
  cam.tyaw = player.yaw;
  fade = 1; fadeIn = false;
}
function portalBack() {
  audio.sfx('portal');
  player.x = -57; player.z = 12; player.yaw = -Math.PI / 2;
  player.y = Math.max(groundY(player.x, player.z), 1);
  player.vy = 0; player.onGround = true; player.swim = false;
  cam.x = player.x + 8; cam.z = player.z + 8; cam.y = player.y + 3;
  cam.tyaw = player.yaw;
  fade = 1; fadeIn = false;
}
function fxPortalFx() {
  for (let i = 0; i < 24; i++) {
    const a = Math.random() * Math.PI * 2;
    fxParts.push({
      x: player.x + Math.cos(a) * 2, y: player.y + 1, z: player.z + Math.sin(a) * 2,
      t: 0, life: 1 + Math.random(),
      vx: Math.cos(a) * 3, vz: Math.sin(a) * 3, vy: 2 + Math.random() * 3,
      r: 0.7, g: 0.5, b: 1,
    });
  }
}

// ---------------- interação ----------------
function nearestInteract() {
  const px = player.x, pz = player.z;
  let best = null, bd = 1e9;
  const add = (type, obj, dd) => { if (dd < bd) { bd = dd; best = { type, obj, dd }; } };
  for (const [id, npc] of Object.entries(NPC_POS)) {
    if (!npc) continue;
    const dd = dist2d(npc.x, npc.z, px, pz);
    if (dd < 2.8) add('npc', { id }, dd);
  }
  for (const s of world.staticSprites) {
    const dd = dist2d(s.x, s.z, px, pz);
    if (s.k === 'chest') {
      if (dd < 2.9 && !chestsOpen.has(s.id)) {
        if (canOpenChest(s)) add('chest', s, dd + 0.4);
        else if (dd < 1.8) add('locked', s, dd + 2.5);
      }
    } else if (s.k === 'selo') {
      if (dd < 3.0 && sealOpenable(s)) add('selo', s, dd + 0.5);
    } else if (s.k === 'gate') {
      const mi = currentMain();
      const usable = mi === 9 || mi === 10 || stateM[10] === 2;
      if (dd < 3.4 && usable) add('gate', s, dd + 0.2);
    } else if (s.k === 'portal' && s.id === 'portal_cripta_out') {
      if (dd < 3.4 && stateM[10] === 2) add('portal', s, dd + 0.2);
    } else if (s.k === 'sign') {
      if (dd < 2.8) add('sign', s, dd + 1.4);
    }
  }
  return best;
}
function act() {
  const n = nearestInteract();
  if (!n) { swing(); return; }
  if (n.type === 'npc') { openDlg(n.obj.id); return; }
  if (n.type === 'chest') { onChestOpen(n.obj.id); return; }
  if (n.type === 'locked') {
    const s = n.obj;
    if (s.id === 'chest_a3') toastFx('baú lacrado — algo exige força de quem já abriu outros baús…');
    else if (s.id === 'chest_golem') toastFx('baú lacrado — só se abre para quem derrotou o Golem');
    else if (s.id === 'chest_arena') toastFx('baú lacrado — o Guardião Sombrio ainda vigia');
    else if (s.id === 'chest_recife') toastFx('baú lacrado — o tesouro dos náufragos exige a Lente… ou o segredo da ilha');
    else toastFx('baú trancado…');
    audio.sfx('hurt');
    return;
  }
  if (n.type === 'selo') { lightSeal(n.obj); return; }
  if (n.type === 'gate') { gateAction(); return; }
  if (n.type === 'portal') { portalBack(); return; }
  if (n.type === 'sign') { toastFx(n.obj.msg || ''); audio.sfx('blip'); return; }
}
function lightSeal(spr) {
  const mi = currentMain();
  audio.sfx('seal');
  worldFlags.add('seal_' + spr.id);
  const g = groundY(spr.x, spr.z);
  burst(spr.x, g + 1.2, spr.z, [1, 0.95, 0.5], 26);
  burst(spr.x, g + 1.2, spr.z, [1, 0.7, 0.3], 14);
  for (let i = 0; i < 12; i++) {
    const a = Math.random() * Math.PI * 2;
    fxParts.push({ x: spr.x, z: spr.z, y: g + 0.6, t: 0, life: 1.6, vx: Math.cos(a) * 1.2, vz: Math.sin(a) * 1.2, vy: 3 + Math.random() * 2, r: 1, g: 0.9, b: 0.4 });
  }
  if (mi === 2) {
    stateM[2] = 2; stateM[3] = 1;
    bannerFx('★ O PRIMEIRO SELO ACENDEU ★', '#ffe9a8');
    toastFx('Mira quer falar com você — cabana a oeste');
    questsTick();
    saveGame();
  } else if (mi === 5) {
    stateM[5] = 2; stateM[6] = 1;
    bannerFx('★ O SEGUNDO SELO ACENDEU ★', '#ffe9a8');
    toastFx('Kael o espera na estrada oeste');
    questsTick();
    saveGame();
  }
  checkPrompt();
}
function checkPrompt() {
  const el = $('prompt');
  if (phase !== 'play' || dlg) { el.classList.add('hidden'); promptInfo = null; return; }
  const n = nearestInteract();
  if (!n) { el.classList.add('hidden'); promptInfo = null; return; }
  const label = n.type === 'npc' ? 'Falar com ' + (NPC_NAME[n.obj.id] || '') :
    n.type === 'chest' ? 'Abrir baú' :
    n.type === 'locked' ? 'Baú lacrado' :
    n.type === 'selo' ? 'Acender o selo' :
    n.type === 'gate' ? 'Atravessar o portal' :
    n.type === 'portal' ? 'Voltar para a mina' : 'Ler placa';
  promptInfo = { label, type: n.type, x: n.obj.x, z: n.obj.z };
  el.innerHTML = (isTouch ? '' : '<kbd>E</kbd> ') + label;
  el.classList.remove('hidden');
}

// ---------------- inimigos ----------------
const ENEMY_CFG = {
  slime: { hp: 2, speed: 2.6, art: ART.slime, w: 1.6, h: 1.05, hop: 3.4, col: [0.4, 0.95, 0.5], score: 'campo' },
  stone: { hp: 3, speed: 2.1, art: ART.slime, w: 1.7, h: 1.1, hop: 3.0, tint: [0.72, 0.78, 0.85], col: [0.7, 0.8, 0.9], score: 'mina' },
  moss: { hp: 2, speed: 2.4, art: ART.slime, w: 1.6, h: 1.05, tint: [0.45, 0.85, 0.55], col: [0.35, 0.8, 0.45], score: 'ruinas' },
  sand: { hp: 2, speed: 2.5, art: ART.slime, w: 1.55, h: 1.0, tint: [0.95, 0.85, 0.6], col: [0.95, 0.8, 0.5], score: 'praia' },
  silver: { hp: 3, speed: 2.3, art: ART.slime, w: 1.7, h: 1.1, tint: [0.8, 0.85, 0.95], col: [0.75, 0.85, 1], score: 'cume' },
  wisp: { hp: 2, speed: 2.1, art: ART.wisp, w: 1.1, h: 1.4, fly: true, col: [0.7, 0.9, 1], score: 'wisp' },
  wraith: { hp: 3, speed: 2.6, art: ART.wisp, w: 1.25, h: 1.6, fly: true, tint: [0.9, 0.8, 1], col: [0.9, 0.75, 1], score: 'recife' },
};
const SPAWN_AREAS = [
  { area: 'campo', x: 36, z: 9, r: 13, cap: 5, kind: 'slime' },
  { area: 'wisp', x: 4, z: -56, r: 16, cap: 5, kind: 'wisp', start: 1 },
  { area: 'ruinas', x: -27, z: -22, r: 14, cap: 3, kind: 'moss' },
  { area: 'mina', x: -68, z: 4, r: 15, cap: 4, kind: 'stone' },
  { area: 'praia', x: 18, z: 66, r: 17, cap: 3, kind: 'sand' },
  { area: 'cume', x: 74, z: -18, r: 13, cap: 3, kind: 'silver' },
  { area: 'clareira', x: -32, z: 28, r: 13, cap: 2, kind: 'moss' },
  { area: 'recife', x: 170, z: -160, r: 11, cap: 3, kind: 'wraith', needVisit: 'recife', start: 1 },
];
const BOSSES = {
  golem: {
    nome: 'GOLEM DO VALE', art: ART.golem, w: 3.5, h: 4.3, hp: 12, speed: 2.6, hop: 3.6,
    x: -70, z: 0, tint: [1, 1, 1], col: [1, 0.75, 0.5], score: 'golem',
  },
  matriarca: {
    nome: 'MATRIARCA DOS SUSSURROS', art: ART.wisp, w: 3.1, h: 3.9, hp: 9, speed: 3.0, fly: true,
    x: 4, z: -52, tint: [0.85, 0.62, 1], col: [0.85, 0.65, 1], score: 'matriarca',
  },
  guardian: {
    nome: 'GUARDIÃO SOMBRIO', art: ART.golem, w: 3.8, h: 4.7, hp: 16, speed: 2.8, hop: 3.8,
    x: -150, z: 150, tint: [0.85, 0.5, 0.95], col: [0.95, 0.5, 0.95], score: 'guardian',
  },
};
const enemies = []; // inimigos vivos: {key, cfg, x,y,z,hp,..}
function activeBossKeys() {
  const set = new Set();
  if (side[32] === 1) set.add('matriarca');       // A Matriarca ativa
  const mi = currentMain();
  if (mi === 8) set.add('golem');
  if (side[12] === 1 && stateM[8] === 2) set.add('golem'); // Bravo do Campo (2ª luta)
  if (mi === 10 || side[57] === 1) set.add('guardian');    // eco
  return set;
}
function spawnTick() {
  const playerNear = (x, z, d) => dist2d(x, z, player.x, player.z) > d;
  for (const a of SPAWN_AREAS) {
    if (a.needVisit && !visited.has(a.needVisit)) continue;
    // regiões de combate despertam após o capítulo do Golem (exceto campo/wisps)
    if (!a.start) {
      if (stateM[8] !== 2 && a.area !== 'campo') continue;
    }
    const cfg = ENEMY_CFG[a.kind];
    const n = enemies.filter(e => e.cfg === cfg && !e.dead && e.area === a.area).length;
    if (n >= a.cap) continue;
    for (let tries = 0; tries < 4; tries++) {
      const ang = Math.random() * Math.PI * 2;
      const rr = Math.sqrt(Math.random()) * a.r;
      const x = a.x + Math.cos(ang) * rr;
      const z = a.z + Math.sin(ang) * rr;
      const g = groundY(x, z);
      const mind = a.area === 'recife' ? 7 : 16; // ilha pequena: margem menor
      if (g <= 0 || dist2d(x, z, player.x, player.z) < mind) continue;
      spawnEnemy(a.area, a.kind, x, z, g);
      break;
    }
  }
  // chefes
  for (const k of activeBossKeys()) {
    const b = BOSSES[k];
    if (enemies.some(e => e.key === k && !e.dead)) continue;
    const g = groundY(b.x, b.z);
    if (g <= 0) continue;
    const boss = {
      key: k, cfg: b, x: b.x, z: b.z, y: g + (b.fly ? 1.6 : 0),
      hp: b.hp, vy: 0, vx: 0, vz: 0, hit: 0, cd: 1, t: 0,
      dead: false, area: b.score, homeX: b.x, homeZ: b.z,
    };
    enemies.push(boss);
    if (k === 'guardian') audio.sfx('boss');
  }
}
function spawnEnemy(area, kind, x, z, g) {
  const cfg = ENEMY_CFG[kind];
  enemies.push({
    key: null, cfg, area, x, z,
    y: g + (cfg.fly ? 1.6 : 0),
    hp: cfg.hp, vy: 0, vx: 0, vz: 0, hit: 0, cd: Math.random() * 2,
    t: Math.random() * 9, dead: false,
  });
}
function updateEnemies(dt) {
  const px = player.x, pz = player.z;
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    if (e.dead) { enemies.splice(i, 1); continue; }
    e.t += dt;
    if (e.hit > 0) e.hit -= dt;
    const g = groundY(e.x, e.z);
    const d = dist2d(e.x, e.z, px, pz);
    const cf = e.cfg;
    if (cf.fly) {
      // levita e persegue
      const targetY = Math.max(WATER_Y, g) + 1.5 + Math.sin(e.t * 2.2 + e.x) * 0.35;
      e.y += (targetY - e.y) * Math.min(1, dt * 5);
      e.cd -= dt;
      if (d < 13 && d > 1.5 && e.cd <= 0) {
        e.cd = 0.14;
        const sp = e.key ? 3.2 : cf.speed;
        e.vx = (px - e.x) / d * sp;
        e.vz = (pz - e.z) / d * sp;
      } else if (d <= 1.5) { e.vx = 0; e.vz = 0; }
      e.x += e.vx * dt; e.z += e.vz * dt;
    } else {
      // salta como slime
      if (e.vy > 0 || Math.abs(e.vx) > 0.01 || Math.abs(e.vz) > 0.01) {
        e.x += e.vx * dt; e.z += e.vz * dt;
        e.vy -= 16 * dt;
        e.y += e.vy * dt;
        if (e.y <= g) { e.y = g; e.vy = 0; e.vx = 0; e.vz = 0; }
      } else {
        e.cd -= dt;
        if (d < 12 && e.cd <= 0 && !player.swim && !dlg) {
          e.cd = (e.key ? 0.55 : 0.9) + Math.random() * 1.2;
          if (Math.random() < 0.6) {
            e.vy = cf.hop;
            const dd = Math.max(0.4, d);
            const sp = e.key ? cf.speed + 1.1 : cf.speed;
            e.vx = (px - e.x) / dd * sp;
            e.vz = (pz - e.z) / dd * sp;
          }
        }
      }
      // chefe preso à arena
      if (e.key && dist2d(e.x, e.z, e.homeX, e.homeZ) > 26) {
        const ang = Math.atan2(e.homeZ - e.z, e.homeX - e.x);
        e.x += Math.cos(ang) * dt * 4;
        e.z += Math.sin(ang) * dt * 4;
      }
    }
    e.x = clamp(e.x, -WORLD_HALF + 1, WORLD_HALF - 1);
    e.z = clamp(e.z, -WORLD_HALF + 1, WORLD_HALF - 1);
    const reach = 1.15 + (e.key ? 0.45 : 0);
    if (d < reach && player.inv <= 0 && !player.swim && !dlg && phase === 'play') {
      hurtPlayer(e.x, e.z, e.key ? 1 : 1);
    }
  }
}
// chefes vigiados por proximidade (guardião só luta na arena)
let bossWarn = {};

// ---------------- jogador ----------------
function hurtPlayer(srcX, srcZ) {
  if (player.inv > 0 || phase !== 'play') return;
  player.hp--;
  player.inv = 1.4;
  player.hurtT = 1;
  redFx = 1;
  audio.sfx('hurt');
  const dx = player.x - srcX, dz = player.z - srcZ;
  const d = Math.hypot(dx, dz) || 1;
  player.kx = dx / d * 7; player.kz = dz / d * 7;
  if (player.hp <= 0) {
    player.hp = player.hpMax;
    player.inv = 3;
    const nearCripta = dist2d(player.x, player.z, -150, 150) < 40;
    player.x = 5.5; player.z = 5.5; // a luz se reacende na praça
    if (nearCripta && stateM[10] === 1) {
      toastFx('a escuridão cegou você… a praça lhe acolhe de novo');
    } else {
      toastFx('a luz em você se reacendeu na praça de Solaria…');
    }
    player.yaw = -Math.PI / 4;
    player.kx = player.kz = 0;
    player.vy = 0;
    player.y = Math.max(1, playerGround());
    player.onGround = true;
    player.swim = false;
    audio.sfx('respawn');
    redFx = 1;
    saveGame();
  }
}
function controlPlayer(dt) {
  let ax = 0, ay = 0;
  if (!dlg) {
    if (keys.KeyW || keys.ArrowUp) ay += 1;
    if (keys.KeyS || keys.ArrowDown) ay -= 1;
    if (keys.KeyA || keys.ArrowLeft) ax -= 1;
    if (keys.KeyD || keys.ArrowRight) ax += 1;
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
    player.kx *= 0.88; player.kz *= 0.88;
    if (Math.abs(player.kx) < 0.03) player.kx = 0;
    if (Math.abs(player.kz) < 0.03) player.kz = 0;
  }
  let speed = 5.4;
  if (have(arts, 'a4')) speed *= 1.18; // Capa do Vento
  if (player.swim) speed = 3.4;
  const mxv = mvx * speed * dt;
  const mzv = mvz * speed * dt;
  if (mxv && !blockedAt(player.x + mxv, player.z)) player.x += mxv;
  if (mzv && !blockedAt(player.x, player.z + mzv)) player.z += mzv;
  const g = groundY(player.x, player.z);
  if (g <= 0) {
    if (!player.swim) {
      if (player.y > WATER_Y + 0.02) {
        player.vy -= 19 * dt;
        player.y += player.vy * dt;
        if (player.y <= WATER_Y + 0.02) { player.y = WATER_Y + 0.02; player.vy = 0; player.swim = true; audio.sfx('splash'); }
      } else { player.y = WATER_Y + 0.02; player.vy = 0; player.swim = true; }
    }
    if (player.swim) {
      player.y = WATER_Y + 0.06 + Math.sin(time * 3.1) * 0.05;
      if (input.jump && !dlg) { player.vy = 4.4; player.swim = false; input.jump = false; audio.sfx('swim'); }
    }
  } else {
    if (player.swim) {
      player.vy -= 18 * dt;
      player.y += player.vy * dt;
      if (player.y >= g) { player.y = g; player.vy = 0; player.swim = false; player.onGround = true; }
    }
    if (!player.swim) {
      if (input.jump && player.onGround) {
        player.vy = 8.0; player.onGround = false; player.jumped = 1; input.jump = false;
        audio.sfx('jump');
      } else if (input.jump && !player.onGround && player.jumped < 2 && have(arts, 'a1')) {
        player.vy = 7.3; player.jumped = 2; input.jump = false;
        audio.sfx('djump');
        burst(player.x, player.y - 0.2, player.z, [1, 0.9, 0.7], 8);
      } else if (input.jump && !player.onGround) {
        player.jumpBuf += dt;
        if (player.jumpBuf > 0.16) input.jump = false;
      }
    }
  }
  if (player.onGround && !input.jump) player.jumped = 0;
  player.vy -= 21 * dt;
  if (player.vy < -15) player.vy = -15;
  player.y += player.vy * dt;
  const wasOn = player.onGround;
  if (player.y <= g && !player.swim) {
    if (!wasOn && player.vy < -7 && player.onGround) audio.sfx('land');
    player.y = g; player.vy = 0; player.onGround = true;
  } else if (!player.swim) player.onGround = false;
  if (player.y < -6) { player.y = Math.max(1, groundY(player.x, player.z)); player.vy = 0; }
  player.walkT += dt * 8 * (player.moving ? 1 : 0);
  player.x = clamp(player.x, -WORLD_HALF + 1.5, WORLD_HALF - 1.5);
  player.z = clamp(player.z, -WORLD_HALF + 1.5, WORLD_HALF - 1.5);
}
function swing() {
  if (player.atk > 0 || phase !== 'play' || dlg) return;
  player.atk = 0.3;
  audio.sfx('slash');
  const fwx = Math.sin(player.yaw), fwz = -Math.cos(player.yaw);
  const reach = have(arts, 'a5') ? 3.6 : 2.5;    // Lâmina do Alvorecer
  const dmg = have(arts, 'a3') ? 2 : 1;          // Amuleto de Fúria
  for (const e of enemies) {
    if (e.dead) continue;
    const dx = e.x - player.x, dz = e.z - player.z;
    const d = Math.hypot(dx, dz);
    const rr = e.key ? reach + 0.8 : reach;
    if (d < rr) {
      const dot = (dx / (d || 1)) * fwx + (dz / (d || 1)) * fwz;
      if (dot > 0.05) {
        e.hp -= dmg;
        e.hit = 0.16;
        if (!e.cfg.fly) {
          e.vx = (dx / (d || 1)) * (e.key ? 1.6 : 5);
          e.vz = (dz / (d || 1)) * (e.key ? 1.6 : 5);
          e.vy = e.key ? 1.4 : 3.4;
        } else {
          e.vx = (dx / (d || 1)) * 2.2; e.vz = (dz / (d || 1)) * 2.2;
        }
        audio.sfx('hit');
        if (e.hp <= 0) {
          e.dead = true;
          if (e.key) {
            onBossKill(e.key, e.x, e.y, e.z);
            if (e.key === 'guardian') {
              bannerFx('★ O GUARDIÃO SOMBRIO CAIU ★', '#ffd76a');
              toastFx('um baú antigo se abriu no centro da arena');
            } else if (e.key === 'golem') {
              toastFx('o Núcleo de Pedra ficou para trás — baú na boca da mina');
            }
          } else {
            const gy = e.cfg.fly ? e.y : e.y + 0.6;
            onKill(e.area, e.x, gy, e.z, e.cfg.col);
          }
        }
      }
    }
  }
}
// colisão com terreno/obstáculos (mesmo padrão do antigo)
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

// ---------------- coletáveis próximos ----------------
function collectNearby() {
  if (dlg) return;
  const px = player.x, pz = player.z;
  for (const s of world.staticSprites) {
    const kinds = ['crystal', 'florete', 'berry', 'ore', 'shell', 'essence'];
    if (!kinds.includes(s.k) || !s.pickup || collected.has(s.seed)) continue;
    if (Math.hypot(s.x - px, s.z - pz) < 1.45) onCollect(s);
  }
}

// ---------------- POIs (visita) ----------------
function checkPoiVisits() {
  if (dlg) return;
  const px = player.x, pz = player.z;
  for (const p of POI_LIST) {
    if (visited.has(p.id)) continue;
    if (dist2d(p.x, p.z, px, pz) < 3.6) onVisitPoi(p.id);
  }
}

// ---------------- save ----------------
const SAVE_KEY = 'grandpixel-save';
const SAVE_LEGACY_SOLARIA = 'solaria-save'; // era do título provisório
function saveGame() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      v: 4,
      x: Math.round(player.x * 10) / 10, z: Math.round(player.z * 10) / 10,
      hp: player.hp,
      stateM, side, arts,
      colN, killN, talked,
      visited: [...visited], collected: [...collected],
      chests: [...chestsOpen], flags: [...worldFlags],
      bossKill, hearts, qMeta,
      introShown, finaleShown,
      t: time,
    }));
  } catch (e) {}
}
function migrateV3(old) {
    const migrate = {
      v: 4,
      x: old.x || 5.5, z: old.z || 5.5, hp: old.hpMax ? Math.min(old.hpMax, old.hp) : 3,
      stateM: new Array(MAIN.length).fill(0),
      side: new Array(SIDE_TOTAL).fill(0),
      arts: [], colN: old.colN || {}, killN: old.killN || {},
      talked: { elder: 0, mira: 0, kael: 0 },
      visited: [], collected: old.collected ? [...old.collected] : [],
      chests: old.chestOpen ? ['chest_vila'] : [],
      flags: [], bossKill: { golem: 0, matriarca: 0, guardian: 0 },
      hearts: old.hpBonus ? Math.min(4, old.hpBonus) : 0,
      introShown: true, finaleShown: false,
    };
    const q0 = old.q ? old.q[0] : 0;
    const q1 = old.q ? old.q[1] : 0;
    const q2 = old.q ? old.q[2] : 0;
    if (q0 > 0) { migrate.stateM[0] = 2; }
    if (q0 === 2) migrate.stateM[1] = 2;
    if (q0 === 2) migrate.stateM[2] = 2;
    if (q1 > 0) migrate.stateM[3] = 2;
    if (q1 === 2) { migrate.stateM[4] = 2; migrate.stateM[5] = 2; }
    if (q2 > 0 || old.chestOpen) migrate.stateM[6] = 2;
    let i = migrate.stateM.findIndex(v => v === 0);
    migrate.stateM[i < 0 ? 7 : i] = 1;
    return migrate;
}
function loadSave() {
  // chave canônica: v4+ usa direto; v3 (era anterior ao overhaul) migra
  try {
    const d = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
    if (d && d.v === 4) return d;
    if (d && d.v === 3) return migrateV3(d);
  } catch (e) {}
  // era do título provisório (saves v4 sob a chave solaria-save)
  try {
    const d = JSON.parse(localStorage.getItem(SAVE_LEGACY_SOLARIA) || 'null');
    if (d && d.v === 4) return d;
  } catch (e) {}
  return null;
}
function applySave(d) {
  if (!d) return;
  if (Array.isArray(d.stateM)) for (let i = 0; i < Math.min(d.stateM.length, stateM.length); i++) stateM[i] = d.stateM[i];
  if (Array.isArray(d.side)) for (let i = 0; i < Math.min(d.side.length, side.length); i++) side[i] = d.side[i];
  if (Array.isArray(d.arts)) for (const a of d.arts) if (!have(arts, a)) arts.push(a);
  if (d.colN) for (const k of Object.keys(d.colN)) colN[k] = d.colN[k];
  if (d.killN) for (const k of Object.keys(d.killN)) killN[k] = d.killN[k];
  if (d.talked) for (const k of Object.keys(d.talked)) talked[k] = d.talked[k];
  if (Array.isArray(d.visited)) d.visited.forEach(v => visited.add(v));
  if (Array.isArray(d.collected)) d.collected.forEach(v => collected.add(v));
  if (Array.isArray(d.chests)) d.chests.forEach(v => chestsOpen.add(v));
  if (Array.isArray(d.flags)) d.flags.forEach(v => worldFlags.add(v));
  if (d.bossKill) for (const k of Object.keys(d.bossKill)) bossKill[k] = d.bossKill[k];
  if (d.qMeta) for (const k of Object.keys(d.qMeta)) qMeta[k] = d.qMeta[k];
  hearts = d.hearts || 0;
  introShown = !!d.introShown;
  finaleShown = !!d.finaleShown;
  if (typeof d.x === 'number') { player.x = d.x; player.z = d.z; }
  refreshHp();
  if (typeof d.hp === 'number') player.hp = Math.max(1, Math.min(d.hp, player.hpMax));
  player.y = Math.max(1, playerGround());
  rebuildMeta();
}
function resetSave() {
  try { localStorage.removeItem(SAVE_KEY); } catch (e) {}
  try { localStorage.removeItem(SAVE_LEGACY_SOLARIA); } catch (e) {}
}
function newGame() {
  resetSave();
  location.reload();
}

// ---------------- telas ----------------
function showScreen(id) {
  for (const el of document.querySelectorAll('.screen')) el.classList.remove('on');
  if (id) $(id).classList.add('on');
}
function togglePause() {
  if (phase === 'play' && dlg) return;
  if (phase === 'play') { phase = 'pause'; showScreen('scr-pause'); }
  else if (phase === 'pause') { phase = 'play'; showScreen(null); }
}
function openLog(tab) {
  if (phase !== 'play' && phase !== 'pause') return;
  const prev = phase;
  phase = 'log';
  showScreen('scr-log');
  $('log-content').scrollTop = 0;
  setTab(tab || 'hist');
  audio.sfx('select');
  window.__logFrom = prev;
}
function closeLog() {
  phase = window.__logFrom === 'pause' ? 'pause' : 'play';
  if (phase === 'pause') showScreen('scr-pause');
  else showScreen(null);
  saveGame();
}
function setTab(name) {
  for (const b of document.querySelectorAll('.tab')) b.classList.toggle('on', b.dataset.tab === name);
  const c = $('log-content');
  if (name === 'hist') renderHist(c);
  else if (name === 'side') renderSide(c);
  else if (name === 'art') renderArt(c);
  else renderMap(c);
}
function qStateIcon(st) {
  return st === 2 ? '✓' : st === 1 ? '●' : '○';
}
function renderHist(c) {
  const done = stateM.filter(v => v === 2).length;
  $('log-progress').textContent = 'história ' + done + '/' + MAIN.length + ' · vale ' + side.filter(v => v === 2).length + '/' + SIDE_TOTAL;
  let h = '';
  h += '<div class="gr-title">A lenda de Solaria</div>';
  for (let i = 0; i < MAIN.length; i++) {
    const m = MAIN[i];
    const st = stateM[i] === 2 ? 'done' : stateM[i] === 1 ? 'active' : '';
    const ico = stateM[i] === 2 ? '✓' : stateM[i] === 1 ? '▶' : '·';
    const col = stateM[i] === 2 ? '#9be89b' : stateM[i] === 1 ? '#ffd76a' : '#8f86b8';
    h += '<div class="ql ' + st + '"><div class="ql-top"><span class="ql-ico" style="background:' + col + '22;color:' + col + '">' + ico + '</span>' +
      '<span class="ql-name ' + (stateM[i] === 1 ? '' : 'small') + '">' + (i + 1) + '. ' + m.nome + '</span>' +
      '<span class="ql-reg">' + regionName(m.regiao) + '</span></div>' +
      '<div class="ql-text">' + m.texto + '</div>' +
      (stateM[i] === 1 ? '<div class="ql-prog">' + (m.local ? m.local.txt : '') + '</div>' : '') +
      (stateM[i] === 0 ? '<div class="ql-why">conclua o capítulo anterior</div>' : '') +
      '</div>';
  }
  c.innerHTML = h;
}
function renderSide(c) {
  const done = side.filter(v => v === 2).length;
  $('log-progress').textContent = 'história ' + stateM.filter(v => v === 2).length + '/' + MAIN.length + ' · vale ' + done + '/' + SIDE_TOTAL;
  const byReg = {};
  for (const q of SIDE) (byReg[q.regiao] = byReg[q.regiao] || []).push(q);
  let h = '<div class="gr-title">Missões do Vale (' + done + '/' + SIDE_TOTAL + ')</div>';
  for (const rg of Object.keys(byReg)) {
    h += '<div class="gr-title" style="color:#ffd76a">' + regionName(rg) + '</div>';
    const doneR = byReg[rg].filter(q => side[q.i] === 2).length;
    h += '<div class="ql-reg" style="margin-left:0;margin-bottom:6px">' + doneR + '/' + byReg[rg].length + ' completas</div>';
    for (const q of byReg[rg]) {
      const st = side[q.i];
      const pr = qProgress(q);
      h += '<div class="ql ' + (st === 2 ? 'done' : st === 1 ? 'active' : 'locked') + '">' +
        '<div class="ql-top"><span class="ql-ico" style="background:' + (q.cor || '#ffd76a') + '22;color:' + (q.cor || '#ffd76a') + '">' + qStateIcon(st) + '</span>' +
        '<span class="ql-name small">' + q.nome + '</span></div>' +
        '<div class="ql-text">' + q.texto + '</div>' +
        (pr && st === 1 ? '<div class="ql-prog">' + pr.cur + '/' + pr.need + '</div>' : '') +
        (st === 2 && q.recompensa ? '<div class="ql-rew">' + rewText(q.recompensa) + ' — concluída</div>' : '') +
        (st === 0 ? '<div class="ql-why">🔒 ' + whyLocked(q.pre) + '</div>' : '') +
        '</div>';
    }
  }
  c.innerHTML = h;
}
function renderArt(c) {
  $('log-progress').textContent = 'artefatos ' + arts.length + '/' + ARTIFACTS.length;
  const ic = ['C', 'B', 'V', 'A', 'V', 'L', 'O', 'S', '♥', 'L'];
  let h = '<div class="gr-title">Artefatos Míticos (' + arts.length + '/' + ARTIFACTS.length + ')</div>';
  ARTIFACTS.forEach((a, i) => {
    const got = have(arts, a.id);
    h += '<div class="aq ' + (got ? 'got' : '') + '"><div class="aq-ico">' + (ic[i] || '?') + '</div>' +
      '<div><div class="aq-name">' + a.nome + '</div>' +
      '<div class="aq-desc">' + a.desc + '</div>' +
      '<div class="aq-stat">' + (got ? '◆ obtido' : 'ainda não encontrado') + '</div></div></div>';
  });
  c.innerHTML = h;
}
function renderMap(c) {
  const hasLens = have(arts, 'a9');
  const total = POI_LIST.length;
  const known = POI_LIST.filter(p => visited.has(p.id)).length;
  $('log-progress').textContent = 'lugares ' + known + '/' + total;
  const byReg = {};
  for (const p of POI_LIST) (byReg[p.regiao] = byReg[p.regiao] || []).push(p);
  let h = '<div class="gr-title">Exploração (' + known + '/' + total + ')</div>';
  for (const rg of Object.keys(byReg)) {
    h += '<div class="gr-title" style="color:#ffd76a">' + regionName(rg) + '</div>';
    for (const p of byReg[rg]) {
      const seen = visited.has(p.id);
      const show = seen || (p.oculto ? hasLens : true);
      if (!show) {
        h += '<div class="loc unknown"><div class="ico" style="background:#2a2740;color:#6a6390">?</div><div class="nm">lugar oculto…</div><div class="st">use a Lente da Verdade</div></div>';
        continue;
      }
      h += '<div class="loc"><div class="ico" style="background:' + (p.cor || '#ffd76a') + '">' + (seen ? (p.icone || '•') : (p.icone || '•')) + '</div>' +
        '<div class="nm">' + p.nome + '</div>' +
        '<div class="st">' + (seen ? 'visitado' : '') + '</div></div>';
    }
  }
  c.innerHTML = h;
}

// ---------------- HUD / desenho ----------------
function syncHud() {
  // corações
  const heartsEl = $('hearts');
  let hh = '';
  for (let i = 0; i < player.hpMax; i++) {
    const full = i < player.hp ? 'h' : i < player.hp + 0.5 ? 'h half' : 'b';
    hh += '<span class="heart"><span class="' + (full === 'h' ? 'h' : full === 'h half' ? 'h half' : 'b') + '">♥</span></span>';
  }
  if (heartsEl.innerHTML !== hh) heartsEl.innerHTML = hh;
  // artefatos
  const artsEl = $('arts');
  if (!artsEl.dataset.built) {
    artsEl.innerHTML = ARTIFACTS.map((a, i) =>
      '<div class="artslot off" title="' + a.nome + ' — ' + a.desc + '"><span>' + ['C', 'B', 'V', 'A', 'C', 'L', 'O', 'S', '♥', 'L'][i] + '</span><span class="artn">' + (i + 1) + '</span></div>'
    ).join('');
    artsEl.dataset.built = '1';
  }
  ARTIFACTS.forEach((a, i) => {
    const el = artsEl.children[i];
    if (!el) return;
    if (have(arts, a.id) && !el.classList.contains('on')) el.classList.remove('off'), el.classList.add('on');
  });
}
function objectiveLine() {
  const mi = currentMain();
  if (mi < MAIN.length) {
    const m = MAIN[mi];
    const pr = qProgress(m);
    let txt = (m.local && m.local.txt) || m.texto;
    const lc = m.local || {};
    return {
      txt: (mi + 1) + ' · ' + txt, cor: m.local ? m.local.cor : '#ffd76a',
      prog: pr ? pr.cur + '/' + pr.need : '',
      x: m.local ? m.local.x : null, z: m.local ? m.local.z : null,
    };
  }
  // pós-história: próxima missão do vale ativa
  const next = SIDE.find((q, i) => side[i] === 1);
  if (next) {
    const pr = qProgress(next);
    return {
      txt: '★ ' + next.nome.toUpperCase(), cor: next.cor || '#9be8ff',
      prog: pr ? pr.cur + '/' + pr.need : '',
      x: null, z: null,
    };
  }
  return {
    txt: 'O VALE ESTÁ EM PAZ — todas as missões concluídas!',
    cor: '#9be89b', prog: '', x: null, z: null,
  };
}
function syncObjective() {
  const o = objectiveLine();
  const el = $('obj');
  if (!o) { el.classList.add('hidden'); return; }
  el.classList.remove('hidden');
  $('objtxt').textContent = o.txt;
  $('objtxt').style.color = o.cor;
  $('objp').textContent = o.prog;
  $('objp').style.display = o.prog ? '' : 'none';
}
function bannerTick(dt) {
  if (banner) {
    banner.t += dt;
    const el = $('banner');
    if (banner.t < 4.6) {
      el.textContent = banner.text;
      el.style.color = banner.cor;
      el.classList.remove('hidden');
    } else { banner = null; el.classList.add('hidden'); }
  }
  if (toast) {
    toast.t += dt;
    const el = $('toast');
    if (toast.t < 3.4) {
      el.textContent = toast.text;
      el.classList.remove('hidden');
    } else { toast = null; el.classList.add('hidden'); }
  }
  if (redFx > 0) redFx = Math.max(0, redFx - dt * 1.4);
  if (fadeIn && fade > 0) fade = Math.max(0, fade - dt * 0.7);
  if (!fadeIn && fade < 1) fade = Math.min(1, fade + dt * 0.7);
  for (let i = fxParts.length - 1; i >= 0; i--) {
    const p = fxParts[i];
    p.t += dt;
    if (p.t >= p.life) fxParts.splice(i, 1);
  }
}
function updateDlgFx(dt) {
  if (!dlg) return;
  if (!dlgDone) {
    dlgTxtShown = dlgTxtFull.slice(0, Math.floor(dlgTxtShown.length + dt * 60));
    if (dlgTxtShown.length >= dlgTxtFull.length) dlgDone = true;
  }
  $('dlg-text').textContent = dlgTxtShown + (dlgDone ? '' : '▍');
}
// entidades para o renderer
function buildEntities(includeHero) {
  const list = [];
  const px = cam.x, pz = cam.z;
  const cull = (cam.fogB || 215) + 60;
  const bob = Math.sin(time * 3.4) * 0.05;
  const t = time;
  for (const s of world.staticSprites) {
    const dx = s.x - px, dz = s.z - pz;
    if (dx * dx + dz * dz > cull * cull) continue;
    const g = Math.max(0, groundY(s.x, s.z));
    let art, w, hh, yy = g;
    switch (s.k) {
      case 'tree': {
        if (s.tall) { art = ART['tree1']; w = 2.4; hh = 5.4; }   // palmeira alta
        else { art = ART['tree' + (s.v || 0)]; w = 3.15; hh = 3.6; }
        break;
      }
      case 'bush': art = ART.bush; w = 1.1; hh = 0.85; break;
      case 'rock': art = ART.rock; w = 2.0; hh = 1.45; break;
      case 'crystal': {
        if (s.pickup && collected.has(s.seed)) continue;
        art = s.pickup ? ART.crystalP : ART.crystal;
        w = 1.55 * (s.s || 1); hh = w * 12 / 9;
        if (s.tint) { list.push({ art, x: s.x, z: s.z, y: yy, w, h: hh, tint: s.tint, a: 0.92 }); continue; }
        break;
      }
      case 'florete': { if (s.pickup && collected.has(s.seed)) continue; art = ART.florete; w = 1.0; hh = 1.42; break; }
      case 'berry': { if (s.pickup && collected.has(s.seed)) continue; art = ART.berry; w = 0.8; hh = 0.95; break; }
      case 'ore': { if (s.pickup && collected.has(s.seed)) continue; art = ART.ore; w = 1.1; hh = 1.1; break; }
      case 'shell': { if (s.pickup && collected.has(s.seed)) continue; art = ART.shell; w = 0.9; hh = 0.75; break; }
      case 'essence': {
        if (s.pickup && collected.has(s.seed)) continue;
        art = ART.essence; w = 0.9; hh = 1.25; yy = g + Math.sin(t * 2 + s.seed) * 0.2;
        break;
      }
      case 'shrine': art = ART.shrine; w = 1.5; hh = 1.75; break;
      case 'chest': {
        const open = chestsOpen.has(s.id);
        art = open ? ART.chestOpen : ART.chest;
        w = 2.1; hh = open ? 1.8 : 1.4;
        break;
      }
      case 'sign': art = ART.sign; w = 1.2; hh = 1.5; break;
      case 'lantern': art = ART.lantern; w = 0.9; hh = 1.54; break;
      case 'torch': art = ART.torch; w = 0.7; hh = 1.68; break;
      case 'campfire': art = ART.fire; w = 1.35; hh = 0.9; yy = g + 0.1; break;
      case 'flower': art = ART['flower' + s.c]; w = 0.62; hh = 0.62; break;
      case 'npc': {
        art = s.id === 'elder' ? ART.npc0 : s.id === 'mira' ? ART.npc1 : ART.npc2;
        w = 1.3; hh = 1.9; yy = g + bob;
        break;
      }
      case 'selo': {
        const lit = worldFlags.has('seal_' + s.id);
        art = ART.selo; w = 1.6; hh = 1.15; yy = g + (lit ? 0.25 : 0);
        list.push({ art, x: s.x, z: s.z, y: yy, w, h: hh, tint: lit ? [1.5, 1.4, 1.05] : [1, 1, 1], a: 1 });
        continue;
      }
      case 'gate': {
        const mi = currentMain();
        const hot = mi === 9 || mi === 10 || stateM[10] === 2;
        art = ART.gate; w = 3.0; hh = 3.9; yy = g;
        const pulse = 1 + Math.sin(t * 3) * 0.05;
        list.push({ art, x: s.x, z: s.z, y: yy, w: w * pulse, h: hh * pulse, tint: hot ? [1.3, 1.15, 1.6] : [1, 1, 1], a: hot ? 1 : 0.85 });
        continue;
      }
      case 'portal': {
        art = ART.portal; w = 2.6; hh = 3.2; yy = g;
        const pulse = 1 + Math.sin(t * 4 + s.seed) * 0.06;
        list.push({ art, x: s.x, z: s.z, y: yy, w: w * pulse, h: hh * pulse, tint: [1.3, 1.2, 1.7], a: 0.95 });
        continue;
      }
      case 'ship': art = ART.ship; w = 4.4; hh = 2.3; yy = Math.max(g, WATER_Y) + 0.05; break;
      default: continue;
    }
    list.push({ art, x: s.x, z: s.z, y: yy, w, h: hh });
    if (s.k !== 'flower' && s.k !== 'campfire' && s.k !== 'essence' && s.k !== 'ship') {
      const sw = Math.min(3.4, w * 1.25);
      list.push({ art: ART.shadow, x: s.x, z: s.z, y: Math.max(WATER_Y, g) + 0.02, w: sw, h: sw * 4 / 12 });
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
    list.push({ art: ART.hero, x: player.x, z: player.z, y: py - bobWalk, w: 1.28, h: 1.92, a: alpha });
    const shScale = 1 - Math.min(0.5, inAir * 0.14);
    list.push({ art: ART.shadow, x: player.x, z: player.z, y: Math.max(WATER_Y, g) + 0.02, w: 1.7 * shScale, h: 1.7 * 4 / 12 * shScale });
  }
  for (const e of enemies) {
    if (e.dead) continue;
    const dx = e.x - px, dz = e.z - pz;
    if (dx * dx + dz * dz > cull * cull) continue;
    const cf = e.cfg;
    const base = cf.tint || [1, 1, 1];
    const tint = e.hit > 0 ? [base[0] * 2, base[1] * 1.3, base[2] * 1.3] : base;
    const g = Math.max(0, groundY(e.x, e.z));
    if (cf.fly) {
      const yBase = e.key ? e.y - cf.h * 0.6 : e.y - 0.85;
      list.push({ art: cf.art, x: e.x, z: e.z, y: yBase, w: cf.w, h: cf.h, tint, a: 0.88 + 0.12 * Math.sin(e.t * 5) });
      list.push({ art: ART.shadow, x: e.x, z: e.z, y: Math.max(WATER_Y, g) + 0.02, w: 1.2 * (e.key ? 1.6 : 1), h: 1.2 * (e.key ? 1.6 : 1) * 4 / 12 });
    } else {
      const inAir = e.y > g + 0.02;
      list.push({ art: cf.art, x: e.x, z: e.z, y: e.y - (inAir ? 0.25 : 0), w: cf.w, h: cf.h, tint });
      const sc = 1 - Math.min(0.4, Math.max(0, e.y - g) * 0.12);
      list.push({ art: ART.shadow, x: e.x, z: e.z, y: g + 0.02, w: 1.8 * sc, h: 1.8 * sc * 4 / 12 });
    }
  }
  // partículas
  for (const p of fxParts) {
    const a = 0.85 * (1 - p.t / p.life);
    list.push({ art: ART.shadow, x: p.x, z: p.z, y: p.y, w: 0.6, h: 0.6, a, tint: [p.r, p.g, p.b] });
  }
  list.sort((a, b) => ((b.x - px) ** 2 + (b.z - pz) ** 2) - ((a.x - px) ** 2 + (a.z - pz) ** 2));
  return list;
}
function buildGlows() {
  const out = [];
  const px = player.x, pz = player.z;
  const range = (cam.fogB || 215) * 0.7;
  const push = g => { if (dist2d(g.x, g.z, px, pz) < (g.range || 40)) out.push(g); };
  for (const s of world.staticSprites) {
    const g = Math.max(0, groundY(s.x, s.z));
    if (s.k === 'lantern') push({ x: s.x, y: g + 1.05, z: s.z, w: 1.6, h: 1.6, r: 1, g: 0.75, b: 0.35, a: 0.3, sp: 2.4, ph: s.seed, range: 12 });
    else if (s.k === 'torch') push({ x: s.x, y: g + 1.15, z: s.z, w: 1.2, h: 1.2, r: 1, g: 0.6, b: 0.22, a: 0.3, sp: 5, ph: s.seed, range: 9 });
    else if (s.k === 'campfire') push({ x: s.x, y: g + 0.6, z: s.z, w: 2.8, h: 2.8, r: 1, g: 0.55, b: 0.2, a: 0.34, sp: 2.6, ph: 1, range: 14 });
    else if (s.k === 'crystal' && !s.pickup) push({ x: s.x, y: g + 1.4, z: s.z, w: 2.2, h: 2.2, r: 0.8, g: 0.4, b: 1, a: 0.16, sp: 2.2, ph: s.seed, range: 20 });
    else if (s.k === 'essence' && !collected.has(s.seed)) push({ x: s.x, y: g + 0.9, z: s.z, w: 1.0, h: 1.0, r: 0.5, g: 0.9, b: 1, a: 0.3, sp: 3, ph: s.seed, range: 10 });
    else if (s.k === 'selo') {
      const lit = worldFlags.has('seal_' + s.id);
      push({ x: s.x, y: g + 0.7, z: s.z, w: lit ? 3.4 : 1.4, h: lit ? 3.4 : 1.4, r: 1, g: 0.88, b: 0.4, a: lit ? 0.32 : 0.1, sp: 2, ph: s.seed, range: 16 });
    } else if (s.k === 'gate') {
      const mi = currentMain();
      const hot = mi === 9 || mi === 10 || stateM[10] === 2;
      push({ x: s.x, y: g + 1.8, z: s.z, w: 3.2, h: 3.2, r: 0.7, g: 0.45, b: 1, a: hot ? 0.34 : 0.12, sp: 3.2, ph: s.seed, range: 20 });
    } else if (s.k === 'portal') {
      push({ x: s.x, y: g + 1.6, z: s.z, w: 3.0, h: 3.0, r: 0.7, g: 0.5, b: 1, a: 0.3, sp: 4, ph: s.seed, range: 20 });
    }
  }
  for (const e of enemies) {
    if (e.dead) continue;
    const g = Math.max(0, groundY(e.x, e.z));
    if (e.cfg.fly || e.key) {
      push({ x: e.x, y: e.y, z: e.z, w: e.key ? 4.4 : 2.0, h: e.key ? 4.4 : 2.0, r: e.cfg.col ? e.cfg.col[0] : 1, g: e.cfg.col ? e.cfg.col[1] : 1, b: e.cfg.col ? e.cfg.col[2] : 1, a: 0.14, sp: 3, ph: e.t, range: 30 });
    }
  }
  return out;
}
// ambiente (dia/noite + cripta)
function envFor() {
  const DAY = 300; // segundos por ciclo completo
  const ph = (time % DAY) / DAY; // 0..1
  const sun = 0.5 + 0.5 * Math.sin((ph - 0.25) * Math.PI * 2); // ~1 meio-dia, ~-1 meia-noite
  const day = clamp01((sun + 0.32) / 0.64);
  const dusk = clamp(1 - Math.abs(sun) * 1.8, 0, 1);
  const night = 1 - day;
  const lerp3 = (a, b, f) => [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
  const DAY_TOP = [0.16, 0.42, 0.95], DAY_MID = [0.55, 0.75, 1], DAY_BOT = [0.83, 0.88, 1];
  const NGT_TOP = [0.012, 0.011, 0.032], NGT_MID = [0.08, 0.09, 0.18], NGT_BOT = [0.16, 0.2, 0.34];
  let top = lerp3(NGT_TOP, DAY_TOP, day);
  let mid = lerp3(NGT_MID, DAY_MID, day);
  let bot = lerp3(NGT_BOT, DAY_BOT, day);
  if (dusk > 0.01) {
    const w = dusk * 0.55;
    top = lerp3(top, [0.5, 0.18, 0.4], w);
    mid = lerp3(mid, [0.98, 0.45, 0.38], w);
    bot = lerp3(bot, [1, 0.55, 0.4], w);
  }
  const discX = ph < 0.5 ? 0.78 : 0.22;
  const discY = 0.24 + Math.max(0, Math.sin(ph * Math.PI * 2)) * 0.6;
  const discA = day > 0.03 ? 1 : 0;
  const discCol = { r: 1, g: 0.96, b: 0.85, a: discA };
  const haloA = day > 0.03 ? 0.5 : 0;
  const discCol2 = { r: 1, g: 0.9, b: 0.6, a: haloA };
  // lua à noite
  if (day < 0.5) {
    discCol.r = 0.9; discCol.g = 0.92; discCol.b = 1; discCol.a = (0.5 - day) * 1.6;
    discCol2.r = 0.55; discCol2.g = 0.6; discCol2.b = 0.95; discCol2.a = (0.5 - day) * 0.9;
  }
  const stars = clamp01(1 - day * 3);
  const dCripta = dist2d(cam.x, cam.z, -150, 150);
  const criptaMix = clamp01(1 - dCripta / 150) * 0.92;
  if (criptaMix > 0.01) {
    top = lerp3(top, [0.02, 0.008, 0.06], criptaMix);
    mid = lerp3(mid, [0.09, 0.05, 0.2], criptaMix);
    bot = lerp3(bot, [0.22, 0.14, 0.34], criptaMix);
  }
  const tintAmt = (night * 0.55 + criptaMix * 0.75);
  const tint = [1 - tintAmt * 0.5, 1 - tintAmt * 0.55, 1 - tintAmt * 0.42];
  const fog = [bot[0] * 0.5, bot[1] * 0.5, bot[2] * 0.55];
  return {
    top, mid, bot, tint, fog, stars,
    disc: { x: discX, y: discY },
    discCol, discCol2,
  };
}
function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

// overlay (seta de objetivo, minimapa, vinheta)
function drawOverlay() {
  ui.setTransform(1, 0, 0, 1, 0, 0);
  ui.clearRect(0, 0, uiCanvas.width, uiCanvas.height);
  if (phase !== 'play' && phase !== 'pause') return;
  const W = uiCanvas.width, H = uiCanvas.height;
  // seta do objetivo
  const o = objectiveLine();
  if (o && o.x !== null && o.x !== undefined) {
    const p = [o.x, 0, o.z];
    const clip = rdr.project([o.x, groundY(o.x, o.z) + 2, o.z], p);
    if (clip && clip[2] > -0.9 && clip[2] < 0.9) {
      const sx = (clip[0] * 0.5 + 0.5) * W;
      const sy = (1 - clip[1] * 0.5 - 0.5) * H;
      const pulse = 1 + Math.sin(time * 5) * 0.12;
      drawMarker(sx, sy, 9 * pulse, o.cor || '#ffd76a');
    } else if (phase === 'play') {
      const angle = Math.atan2(o.z - player.z, o.x - player.x) - cam.yaw;
      const ex = W / 2 + Math.sin(angle) * (Math.min(W, H) * 0.30);
      const ey = H / 2 - Math.cos(angle) * (Math.min(W, H) * 0.30);
      drawMarker(ex, ey, 8, (o.cor || '#ffd76a'), true);
    }
  }
  // minimapa
  drawMini();
  // vinheta suave
  const v = ui.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.42, W / 2, H / 2, Math.max(W, H) * 0.72);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(5,2,14,0.34)');
  ui.fillStyle = v;
  ui.fillRect(0, 0, W, H);
}
function drawMarker(x, y, r, col, edge = false) {
  ui.save();
  ui.translate(x, y);
  ui.fillStyle = col;
  ui.shadowColor = col;
  ui.shadowBlur = 10;
  ui.beginPath();
  if (edge) {
    ui.moveTo(0, -r);
    ui.lineTo(r, 0);
    ui.lineTo(0, r);
    ui.lineTo(-r, 0);
  } else {
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 - Math.PI / 2;
      ui.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      const b = (i / 4 + 0.5) * Math.PI * 2 - Math.PI / 2;
      ui.lineTo(Math.cos(b) * r * 0.42, Math.sin(b) * r * 0.42);
    }
  }
  ui.closePath();
  ui.fill();
  ui.restore();
}
function drawMini() {
  const c = mini;
  const S = c.canvas.width;
  c.clearRect(0, 0, S, S);
  const R = S / 2 - 4;
  const scale = 3.1; // unidades de mundo por pixel
  const cx = S / 2, cy = S / 2;
  // fundo
  c.fillStyle = 'rgba(10,8,24,0.55)';
  c.beginPath(); c.arc(cx, cy, R, 0, Math.PI * 2); c.fill();
  c.save();
  c.beginPath(); c.arc(cx, cy, R, 0, Math.PI * 2); c.clip();
  const wx = player.x, wz = player.z;
  const sx = x => cx + (x - wx) / scale;
  const sz = z => cy + (z - wz) / scale;
  // POIs visitados / com lente
  const hasLens = have(arts, 'a9');
  for (const p of POI_LIST) {
    const seen = visited.has(p.id);
    if (!seen) continue;
    const dx = p.x - wx, dz = p.z - wz;
    const d = Math.hypot(dx, dz) / scale;
    if (d > R - 7) continue;
    const px = sx(p.x), py = sz(p.z);
    c.fillStyle = (p.cor || (p.selo ? '#ffe9a8' : '#ffd76a'));
    c.font = '700 8px system-ui';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(p.icone || '•', px, py + 0.5);
  }
  if (hasLens) {
    for (const p of POI_LIST) {
      if (!p.oculto || visited.has(p.id)) continue;
      const dx = p.x - wx, dz = p.z - wz;
      const d = Math.hypot(dx, dz) / scale;
      if (d > R - 7) continue;
      c.fillStyle = 'rgba(255,255,255,0.55)';
      c.beginPath(); c.arc(sx(p.x), sz(p.z), 1.7, 0, Math.PI * 2); c.fill();
    }
  }
  // objetivo
  const o = objectiveLine();
  if (o && o.x !== null) {
    const dx = (o.x - wx) / scale, dz = (o.z - wz) / scale;
    if (Math.hypot(dx, dz) < R - 6) {
      c.fillStyle = o.cor || '#ffd76a';
      c.shadowColor = o.cor; c.shadowBlur = 6;
      c.beginPath(); c.arc(cx + dx, cy + dz, 2.6, 0, Math.PI * 2); c.fill();
      c.shadowBlur = 0;
    }
  }
  // jogador
  c.fillStyle = '#fff';
  c.shadowColor = '#fff'; c.shadowBlur = 8;
  c.beginPath(); c.arc(cx, cy, 3, 0, Math.PI * 2); c.fill();
  c.shadowBlur = 0;
  c.fillStyle = '#ffd76a';
  c.beginPath();
  c.moveTo(cx, cy - 4.4);
  c.lineTo(cx + 3.2, cy + 3);
  c.lineTo(cx - 3.2, cy + 3);
  c.closePath(); c.fill();
  c.restore();
  // bússola
  c.fillStyle = 'rgba(255,255,255,0.4)';
  c.font = '700 7px system-ui';
  c.textAlign = 'center';
  c.fillText('N', cx, 8);
  c.strokeStyle = 'rgba(255,255,255,0.12)';
  c.beginPath(); c.arc(cx, cy, R, 0, Math.PI * 2); c.stroke();
}
function bossBarSync() {
  const el = $('bossbar');
  const b = enemies.find(e => e.key && !e.dead && dist2d(e.x, e.z, player.x, player.z) < 55);
  if (!b) { el.classList.add('hidden'); return; }
  el.classList.remove('hidden');
  $('bossname').textContent = b.cfg.nome;
  $('bossfill').style.width = Math.max(0, (b.hp / b.cfg.hp) * 100) + '%';
}
function vignetteFx() {
  if (redFx > 0) {
    ui.fillStyle = 'rgba(190,16,40,' + (redFx * 0.3).toFixed(3) + ')';
    ui.fillRect(0, 0, uiCanvas.width, uiCanvas.height);
  }
}

// ---------------- entrada ----------------
let isTouch = false;
function setupInput() {
  window.addEventListener('keydown', e => {
    const k = e.code;
    if (['Space', 'ArrowUp', 'ArrowDown', 'Tab'].includes(k)) e.preventDefault();
    keys[k] = true;
    audio.resume();
    if (phase === 'title') {
      if (k === 'Enter' || k === 'Space') continueGame();
      else if (k === 'KeyH' || k === 'KeyC') { openHowto(); }
      return;
    }
    if (phase === 'howto') {
      if (k === 'Escape' || k === 'KeyH' || k === 'KeyC') { goBackFromHowto(); }
      return;
    }
    if (phase === 'options') {
      if (k === 'Escape' || k === 'KeyO') { goBackFromOptions(); }
      return;
    }
    if (phase === 'pause') {
      if (k === 'Escape') togglePause();
      else if (k === 'KeyQ') openLog();
      return;
    }
    if (phase === 'log') {
      if (k === 'Escape' || k === 'KeyQ') closeLog();
      return;
    }
    if (phase === 'play') {
      if (k === 'Escape') { togglePause(); return; }
      if (k === 'KeyQ' && !dlg) { openLog(); return; }
      if (k === 'KeyE' && !e.repeat) { if (dlg) advanceDlg(); else act(); }
      if (k === 'Space') { if (dlg) advanceDlg(); else input.jump = true; }
      if (k === 'Enter') { if (dlg) advanceDlg(); }
      if (k === 'KeyF' || k === 'KeyJ') input.atk = true;
      if (k === 'KeyM') toggleMute();
      if (k === 'KeyC' && !dlg) toastFx('controles: WASD mover · E agir · F/J atacar · Q diário · M som · Esc pausa');
    }
  });
  window.addEventListener('keyup', e => {
    keys[e.code] = false;
    if (e.code === 'Space') input.jump = false;
    if (e.code === 'KeyF' || e.code === 'KeyJ') input.atk = false;
  });
  // toque
  isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  if (isTouch) {
    document.getElementById('touch').classList.remove('hidden');
    document.getElementById('khint').classList.add('hidden');
    document.getElementById('pause-btn').classList.remove('hidden');
    const stick = $('stick');
    const knob = $('stick-knob');
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
        const L = Math.hypot(dx, dy), mx = 40;
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
      const el = $(id);
      el.addEventListener('touchstart', e => { e.preventDefault(); audio.resume(); down(); }, { passive: false });
      el.addEventListener('touchend', e => { e.preventDefault(); if (up) up(); }, { passive: false });
      el.addEventListener('touchcancel', e => { if (up) up(); }, { passive: false });
    };
    bindBtn('btn-jump', () => { input.jump = true; }, () => { input.jump = false; });
    bindBtn('btn-atk', () => { input.atk = true; }, () => { input.atk = false; });
    bindBtn('btn-act', () => { if (dlg) advanceDlg(); else act(); });
  }
  glCanvas.addEventListener('pointerdown', e => {
    audio.resume();
    if (phase === 'title') { continueGame(); return; }
    if (phase === 'howto') { goBackFromHowto(); return; }
    if (phase === 'options') { goBackFromOptions(); return; }
    if (phase === 'pause') { togglePause(); return; }
    if (phase === 'log') { closeLog(); return; }
    if (phase === 'play' && dlg) { advanceDlg(); return; }
    if (phase === 'play') swing();
    e.preventDefault();
  });
  $('pause-btn').addEventListener('click', () => togglePause());
  $('btn-log').addEventListener('click', () => { if (phase === 'play' || phase === 'pause') openLog(); });
  // telas
  $('t-continue').addEventListener('click', () => continueGame());
  $('t-new').addEventListener('click', () => confirmAction('Nova Jornada?', 'Todo o progresso atual será apagado e Solaria renasce do zero.', () => newGame()));
  $('t-howto').addEventListener('click', () => openHowto());
  $('t-options').addEventListener('click', () => openOptions());
  $('t-reset').addEventListener('click', () => confirmAction('Zerar progresso', 'Todo o progresso será apagado. Esta ação não pode ser desfeita.', () => newGame()));
  $('howto-back').addEventListener('click', () => goBackFromHowto());
  $('o-back').addEventListener('click', () => goBackFromOptions());
  $('p-continue').addEventListener('click', () => togglePause());
  $('p-log').addEventListener('click', () => openLog());
  $('p-options').addEventListener('click', () => { phase = 'pause'; openOptions(); });
  $('p-howto').addEventListener('click', () => { phase = 'pause'; openHowto(); });
  $('p-title').addEventListener('click', () => { saveGame(); toTitle(); });
  $('p-reset').addEventListener('click', () => confirmAction('Zerar progresso', 'Todo o progresso será apagado. Esta ação não pode ser desfeita.', () => newGame()));
  $('log-close').addEventListener('click', () => closeLog());
  for (const b of document.querySelectorAll('.tab')) {
    b.addEventListener('click', () => setTab(b.dataset.tab));
  }
  $('o-mute').addEventListener('click', () => toggleMute());
  const sfxR = $('o-sfx');
  sfxR.value = CFG.sfx;
  sfxR.addEventListener('input', () => { CFG.sfx = parseFloat(sfxR.value); audio.setSfxVol(CFG.sfx); saveCfg(); });
  for (const b of $('o-qual').children) {
    b.addEventListener('click', () => {
      CFG.qual = parseInt(b.dataset.q, 10);
      saveCfg(); applyCfg(); syncQualUI();
    });
  }
  window.addEventListener('resize', onResize);
  document.addEventListener('visibilitychange', () => { if (document.hidden) saveGame(); });
}
function syncQualUI() {
  for (const b of $('o-qual').children) b.classList.toggle('on', parseInt(b.dataset.q, 10) === CFG.qual);
}
function openHowto() {
  window.__from = phase;
  if (phase === 'pause' || phase === 'title') { phase = 'howto'; showScreen('scr-howto'); }
}
function goBackFromHowto() {
  if (window.__from === 'pause') { phase = 'pause'; showScreen('scr-pause'); }
  else { phase = 'title'; showScreen('scr-title'); }
}
function openOptions() {
  window.__from = phase;
  syncQualUI();
  phase = 'options';
  showScreen('scr-options');
}
function goBackFromOptions() {
  saveCfg();
  if (window.__from === 'pause') { phase = 'pause'; showScreen('scr-pause'); }
  else { phase = 'title'; showScreen('scr-title'); }
}
function toggleMute() {
  audio.setMuted(!audio.isMuted);
  toastFx(audio.isMuted ? 'som desligado' : 'som ligado');
  $('o-mute').textContent = audio.isMuted ? 'desligado' : 'ligado';
  $('o-mute').classList.toggle('danger', audio.isMuted);
}
function confirmAction(title, text, fn) {
  $('confirm-title').textContent = title;
  $('confirm-text').textContent = text;
  $('confirm').classList.remove('hidden');
  $('confirm-yes').onclick = () => { $('confirm').classList.add('hidden'); fn(); };
  $('confirm-no').onclick = () => $('confirm').classList.add('hidden');
}
function toTitle() {
  phase = 'title';
  showScreen('scr-title');
  $('hud').classList.add('hidden');
  $('t-continue').style.display = hasSave() ? '' : 'none';
}
function hasSave() {
  try { return !!localStorage.getItem(SAVE_KEY) || !!localStorage.getItem(SAVE_LEGACY_SOLARIA); } catch (e) { return false; }
}
function continueGame() {
  const d = loadSave();
  if (hasSave() && d) {
    applySave(d);
    phase = 'play';
    showScreen(null);
    $('hud').classList.remove('hidden');
    if (stateM.every(v => v === 0)) stateM[0] = 1;
    refreshHp();
    unlockSweep();
    cam.x = player.x + 7; cam.z = player.z + 7; cam.y = player.y + 3;
    cam.tyaw = player.yaw;
    fade = 1; fadeIn = true;
    bannerFx('BEM-VINDO(A) DE VOLTA', '#7de4ff');
    toastFx('fale com Ori na praça para dicas [E]');
    saveGame();
    return;
  }
  startNew();
}
function clearState() {
  for (let i = 0; i < stateM.length; i++) stateM[i] = 0;
  for (let i = 0; i < side.length; i++) side[i] = 0;
  arts.length = 0;
  for (const k of Object.keys(colN)) delete colN[k];
  for (const k of Object.keys(killN)) delete killN[k];
  talked.elder = talked.mira = talked.kael = 0;
  visited.clear(); collected.clear(); chestsOpen.clear(); worldFlags.clear();
  bossKill.golem = bossKill.matriarca = bossKill.guardian = 0;
  for (const k of Object.keys(qMeta)) delete qMeta[k];
  hearts = 0;
  introShown = false; finaleShown = false;
  dlg = null;
  $('dlg').classList.add('hidden');
}
function startNew() {
  resetSave();
  clearState();
  stateM[0] = 1;
  player.x = 5.5; player.z = 5.5; player.yaw = -Math.PI / 4;
  player.hp = player.hpMax = 3;
  hearts = 0;
  player.y = Math.max(1, playerGround());
  refreshHp();
  unlockSweep();
  phase = 'play';
  showScreen(null);
  $('hud').classList.remove('hidden');
  cam.x = player.x + 8; cam.z = player.z + 8; cam.y = player.y + 3;
  cam.tyaw = player.yaw;
  fade = 1; fadeIn = true;
  bannerFx('CAPÍTULO 1 — O CHAMADO', '#ffd76a');
  toastFx('Ori espera por você na praça [E]');
  saveGame();
  // abre a conversa inicial
  setTimeout(() => { if (phase === 'play' && !dlg) openDlg('elder'); }, 400);
}
// estado de tela
function onResize() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = Math.max(320, Math.floor(window.innerWidth * dpr));
  const h = Math.max(240, Math.floor(window.innerHeight * dpr));
  glCanvas.width = w; glCanvas.height = h;
  uiCanvas.width = w; uiCanvas.height = h;
  winW = w; winH = h;
  rdr.resize(w, h);
}
let schedSpawn = 0;
let schedPrompt = 0;

// ---------------- loop ----------------
function loop(now) {
  requestAnimationFrame(loop);
  let dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  time += dt;
  if (phase === 'play') {
    bannerTick(dt);
    updateDlgFx(dt);
    if (player.inv > 0) player.inv -= dt;
    if (player.atk > 0) player.atk -= dt;
    if (player.hurtT > 0) player.hurtT -= dt;
    if (!dlg) {
      controlPlayer(dt);
      updateEnemies(dt);
      collectNearby();
      checkPoiVisits();
      if (input.atk) { swing(); input.atk = false; }
    }
    updateCam(dt);
    // prompts / spawns agendados
    schedPrompt -= dt;
    if (schedPrompt <= 0) { schedPrompt = 0.15; checkPrompt(); }
    if (!dlg) {
      schedSpawn -= dt;
      if (schedSpawn <= 0) { schedSpawn = 5; spawnTick(); }
      questsTick();
    }
    syncHud();
    syncObjective();
    bossBarSync();
    hintVisible = true;
    $('hud').classList.remove('hidden');
  } else if (phase === 'pause') {
    bannerTick(dt);
    syncHud();
    syncObjective();
    bossBarSync();
  } else if (phase === 'title') {
    const t = time * 0.05;
    const rr = 27;
    cam.x = Math.cos(t) * rr;
    cam.z = Math.sin(t) * rr;
    cam.y = 8.5 + Math.sin(t * 0.6) * 1.2;
    cam.yaw = Math.atan2(-cam.x, -cam.z) + Math.PI;
    cam.pitch = -0.42;
    cam.tyaw = cam.yaw;
    fade = 0;
  } else if (phase === 'howto' || phase === 'options') {
    // mantém a câmera atual
  }
  const inGame = phase === 'play' || phase === 'pause';
  {
    const entities = buildEntities(inGame);
    const glows = inGame ? buildGlows() : [];
    rdr.render(cam, time, entities, glows, envFor());
  }
  if (phase === 'play' || phase === 'pause') {
    drawOverlay();
    vignetteFx();
  }
  if (fade > 0.004) {
    ui.fillStyle = '#05030d';
    ui.globalAlpha = Math.min(1, fade);
    ui.fillRect(0, 0, uiCanvas.width, uiCanvas.height);
    ui.globalAlpha = 1;
  }
}
function boot() {
  onResize();
  applyCfg();
  player.y = Math.max(1, playerGround());
  loadObstacles();
  spawnTick();
  setupInput();
  syncQualUI();
  document.getElementById('loading').style.display = 'none';
  const ve = document.getElementById('ver');
  if (ve) ve.textContent = 'v' + VERSION;
  showScreen('scr-title');
  const cont = $('t-continue');
  cont.style.display = hasSave() ? '' : 'none';
  phase = 'title';
  requestAnimationFrame(loop);
}
boot();

// handle de depuração
if (typeof window !== 'undefined') {
  window.__solaria = {
    VERSION,
    get phase() { return phase; },
    player, side, stateM, colN, killN, arts, visited, collected, world, chestsOpen,
    questsTick, unlockSweep, saveGame, loadSave, resetSave, continueGame,
    openDlg, dlgLinesFor, spawnTick, objectiveLine,
    act, lightSeal, gateAction, swing, healFull, onChestOpen, canOpenChest,
    sealOpenable, finishTalk, bossKill, dlgLinesFor, advanceDlg, closeDlg,
    spawnTick, rebuildMeta, qMet,
    get hearts() { return hearts; },
    get banner() { return banner; }, get toast() { return toast; },
    get dlg() { return dlg; },
    get enemies() { return enemies; },
    applySave,
  };
}
