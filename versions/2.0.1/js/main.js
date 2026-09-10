import { clamp, lerp, angleWrap, dist2 } from './math.js';
import { World, WATER_Y, POIS, REGIONS, SOLID, FLOWER } from './world.js';
import { Renderer } from './renderer.js';
import { audio } from './audio.js';
import { Input } from './input.js';
import {
  createPlayer, EntitySystem, QUESTS, ARTIFACTS,
  questStatus, tryCompleteQuests, progressText, updateQuestProgress,
} from './entities.js';
import { loadCfg, saveCfg, saveGame, loadGame, clearGame, hasSave, applySave } from './save.js';

function readLauncherCfg() {
  if (window.__GPG__ && typeof window.__GPG__ === 'object') return window.__GPG__;
  try {
    const q = new URLSearchParams(location.search).get('gpg');
    if (q) return JSON.parse(decodeURIComponent(q));
  } catch {}
  return {};
}
const LAUNCHER_CFG = readLauncherCfg();
const VERSION = LAUNCHER_CFG.version || '2.0.1';

const cfg = loadCfg();
if (LAUNCHER_CFG.scale) cfg.scale = Number(LAUNCHER_CFG.scale) || cfg.scale;

const glCanvas = document.getElementById('gl');
const uiCanvas = document.getElementById('ui');
const ui = uiCanvas.getContext('2d');
ui.imageSmoothingEnabled = false;

let world, renderer, input, ents, player;
let state = 'title'; // title | play | pause | dialog | dead | map | quests | win
let dialog = null;
let toast = null; let toastT = 0;
let banner = null; let bannerT = 0;
let time = 0;
let dayT = 0.32;
let acc = 0;
let last = performance.now();
let stepAcc = 0;
let mapZoom = 1;
let bossRef = null;
let started = false;

const DIFF = {
  easy: { dmgMul: 0.7, spd: 1.05 },
  normal: { dmgMul: 1, spd: 1 },
  hard: { dmgMul: 1.4, spd: 0.95 },
};

function $(id) { return document.getElementById(id); }
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
  if (id) $(id)?.classList.remove('hidden');
}
function setToast(msg, t = 2.2) { toast = msg; toastT = t; }
function setBanner(msg, t = 3.5) { banner = msg; bannerT = t; audio.quest(); }

function boot() {
  try {
    world = new World(20260910);
    renderer = new Renderer(glCanvas);
    input = new Input(window);
    ents = new EntitySystem(world, 20260910);
    player = createPlayer({
      playerName: LAUNCHER_CFG.playerName || 'Player',
      playerColor: LAUNCHER_CFG.playerColor || '#5a9e6f',
      difficulty: LAUNCHER_CFG.difficulty || 'normal',
    });
    player.y = world.groundY(player.x, player.z);
    player.kills.bossTypes = {};

    $('ver').textContent = 'v' + VERSION;
    $('t-continue').disabled = !hasSave();
    showScreen('scr-title');
    $('hud').classList.add('hidden');
    resize();
    started = true;
    requestAnimationFrame(frame);
  } catch (err) {
    console.error(err);
    $('boot-err').classList.remove('hidden');
    $('boot-err-msg').textContent = String(err.message || err);
  }
}

function newGame() {
  player = createPlayer({
    playerName: LAUNCHER_CFG.playerName || player?.name || 'Player',
    playerColor: LAUNCHER_CFG.playerColor || player?.color || '#5a9e6f',
    difficulty: LAUNCHER_CFG.difficulty || cfg.diff || 'normal',
  });
  player.y = world.groundY(player.x, player.z);
  player.kills.bossTypes = {};
  ents = new EntitySystem(world, Date.now() & 0xffff);
  dayT = 0.32;
  state = 'play';
  showScreen(null);
  $('hud').classList.remove('hidden');
  audio.resume(); audio.startBed(); audio.level();
  renderer.maybeRebuild(world, player.x, player.z, true);
  setBanner('A new journey begins');
  saveGame(player);
  updateHUD();
}

function continueGame() {
  const data = loadGame();
  if (!data) return newGame();
  player = createPlayer(LAUNCHER_CFG);
  applySave(player, data.player);
  if (!player.kills.bossTypes) player.kills.bossTypes = {};
  player.y = world.groundY(player.x, player.z);
  ents = new EntitySystem(world, 4242);
  state = 'play';
  showScreen(null);
  $('hud').classList.remove('hidden');
  audio.resume(); audio.startBed();
  renderer.maybeRebuild(world, player.x, player.z, true);
  setBanner('Welcome back, ' + player.name);
  updateHUD();
}

function resize() {
  const stage = $('stage');
  const w = stage.clientWidth || window.innerWidth;
  const h = stage.clientHeight || window.innerHeight;
  const scale = Number(cfg.scale) || 2;
  if (renderer) renderer.resize(w, h, scale);
  uiCanvas.width = Math.max(320, Math.floor(w / scale));
  uiCanvas.height = Math.max(180, Math.floor(h / scale));
  uiCanvas.style.width = w + 'px';
  uiCanvas.style.height = h + 'px';
  ui.imageSmoothingEnabled = false;
}
window.addEventListener('resize', resize);

// ---------- input bindings for menus ----------
$('t-new').onclick = () => { audio.ui(); if (hasSave() && !confirm('Start a new journey? Current save will be overwritten.')) return; newGame(); };
$('t-continue').onclick = () => { audio.ui(); continueGame(); };
$('t-howto').onclick = () => { audio.ui(); showScreen('scr-howto'); };
$('t-options').onclick = () => { audio.ui(); openOptions(); };
$('t-reset').onclick = () => { if (confirm('Erase all progress?')) { clearGame(); $('t-continue').disabled = true; setToast('Save erased'); } };
$('h-back').onclick = () => { audio.ui(); showScreen(state === 'pause' ? 'scr-pause' : 'scr-title'); };
$('o-back').onclick = () => { audio.ui(); showScreen(state === 'pause' ? 'scr-pause' : 'scr-title'); };
$('o-save').onclick = () => {
  cfg.sfx = Number($('o-sfx').value);
  cfg.music = Number($('o-music').value);
  cfg.scale = Number($('o-scale').value);
  audio.setSfx(cfg.sfx); audio.setMusic(cfg.music);
  saveCfg(cfg); resize(); audio.ui(); setToast('Options saved');
};
$('p-continue').onclick = () => { audio.ui(); resume(); };
$('p-quests').onclick = () => { audio.ui(); openQuests(); };
$('p-map').onclick = () => { audio.ui(); openMap(); };
$('p-options').onclick = () => { audio.ui(); openOptions(); };
$('p-howto').onclick = () => { audio.ui(); showScreen('scr-howto'); };
$('p-title').onclick = () => { audio.ui(); saveGame(player); state = 'title'; showScreen('scr-title'); $('hud').classList.add('hidden'); $('t-continue').disabled = !hasSave(); };
$('p-reset').onclick = () => { if (confirm('Erase all progress?')) { clearGame(); state = 'title'; showScreen('scr-title'); $('hud').classList.add('hidden'); $('t-continue').disabled = true; } };
$('btn-map').onclick = () => { if (state === 'play') openMap(); };
$('btn-log').onclick = () => { if (state === 'play') openQuests(); };
$('pause-btn').onclick = () => { if (state === 'play') pause(); };
$('q-back').onclick = () => { audio.ui(); if (state === 'pause') showScreen('scr-pause'); else { state = 'play'; showScreen(null); } };
$('m-back').onclick = () => { audio.ui(); if (state === 'pause') showScreen('scr-pause'); else { state = 'play'; showScreen(null); } };
$('d-again').onclick = () => { audio.ui(); player.hp = player.maxHp; player.x = 0; player.z = 8; player.y = world.groundY(0, 8); player.invuln = 2; state = 'play'; showScreen(null); $('hud').classList.remove('hidden'); };
$('d-title').onclick = () => { audio.ui(); state = 'title'; showScreen('scr-title'); $('hud').classList.add('hidden'); };
$('w-title').onclick = () => { audio.ui(); state = 'title'; showScreen('scr-title'); $('hud').classList.add('hidden'); };
$('btn-retry').onclick = () => location.reload();

function openOptions() {
  $('o-sfx').value = cfg.sfx;
  $('o-music').value = cfg.music;
  $('o-scale').value = String(cfg.scale || 2);
  showScreen('scr-options');
}
function openQuests() {
  state = state === 'play' ? 'quests' : state;
  const box = $('quest-list');
  const mains = QUESTS.filter(q => !q.side);
  const sides = QUESTS.filter(q => q.side);
  const renderQ = (q) => {
    const st = questStatus(player, q);
    const prog = progressText(player, q);
    return `<div class="q-row ${st}">
      <div class="q-name">${esc(q.name)} <span class="q-st">${st}</span></div>
      <div class="q-desc">${esc(q.desc)}</div>
      <div class="q-prog">${prog ? 'Progress: ' + prog : ''}${q.reward?.art ? ' · Artifact reward' : ''}${q.reward?.gold ? ' · ' + q.reward.gold + 'g' : ''}</div>
    </div>`;
  };
  box.innerHTML = `<h3>Main story</h3>${mains.map(renderQ).join('')}<h3>Side quests</h3>${sides.map(renderQ).join('')}`;
  showScreen('scr-quests');
}
function openMap() {
  state = state === 'play' ? 'map' : state;
  showScreen('scr-map');
  drawBigMap();
}
function pause() {
  state = 'pause';
  showScreen('scr-pause');
  saveGame(player);
  audio.ui();
}
function resume() {
  state = 'play';
  showScreen(null);
  $('hud').classList.remove('hidden');
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

// ---------- gameplay ----------
function update(dt) {
  time += dt;
  dayT = (dayT + dt / 480) % 1; // full day ~8 min
  if (toastT > 0) toastT -= dt;
  if (bannerT > 0) bannerT -= dt;

  if (state !== 'play') {
    if (state === 'dialog' && (input.act() || input.attack() || input.down('Space') || input.down('Enter'))) {
      advanceDialog();
    }
    if (state === 'map' || state === 'quests') {
      if (input.pause() || input.down('KeyM') && state === 'map' || input.down('KeyQ') && state === 'quests') {
        state = 'play'; showScreen(null);
      }
    }
    if (state === 'pause' && input.pause()) resume();
    input.consume();
    return;
  }

  if (input.pause()) { pause(); input.consume(); return; }
  if (input.map()) { openMap(); input.consume(); return; }
  if (input.questLog()) { openQuests(); input.consume(); return; }

  // look
  const sens = 0.0022;
  player.yaw -= input.mdx * sens;
  player.pitch -= input.mdy * sens;
  player.pitch = clamp(player.pitch, -1.2, 1.2);

  // move
  const diff = DIFF[player.difficulty] || DIFF.normal;
  const [mx, mz] = input.moveVec();
  const sp = (input.pressed('ShiftLeft') ? 7.5 : 5.2) * diff.spd;
  const cy = Math.cos(player.yaw), sy = Math.sin(player.yaw);
  // camera forward is yaw on XZ: forward = (sin yaw, cos yaw)
  const fx = sy, fz = cy;
  const rx = cy, rz = -sy;
  let wishX = fx * -mz + rx * mx;
  let wishZ = fz * -mz + rz * mx;
  player.vx = wishX * sp;
  player.vz = wishZ * sp;

  // jump
  if (player.grounded && input.jump()) {
    player.vy = 8.2;
    player.grounded = false;
    audio.jump();
  }
  player.vy -= 22 * dt;

  // integrate with axis separation
  moveAxis(player, player.vx * dt, 0, 0);
  moveAxis(player, 0, player.vy * dt, 0);
  moveAxis(player, 0, 0, player.vz * dt);

  // keep above solid ground if slightly clipped
  if (!world.collide(player.x, Math.floor(player.y) - 0.01, player.z, 0.3, 0.1)) {
    // falling
  } else if (player.vy <= 0) {
    player.grounded = true;
  }

  // water bob / swim light
  if (player.y < WATER_Y - 0.4) {
    player.vy += 30 * dt;
    player.vx *= 0.9; player.vz *= 0.9;
  }

  // world bounds soft pull
  const br = Math.hypot(player.x, player.z);
  if (br > 94) {
    const k = 94 / br;
    player.x *= k; player.z *= k;
  }

  player.invuln = Math.max(0, player.invuln - dt);
  player.attackCd = Math.max(0, player.attackCd - dt);
  if (player.attackT > 0) player.attackT -= dt;

  // footsteps
  if (player.grounded && (Math.abs(player.vx) + Math.abs(player.vz)) > 1) {
    stepAcc += dt;
    if (stepAcc > 0.35) { stepAcc = 0; audio.step(); }
  } else stepAcc = 0;

  // attack
  if (input.attack() && player.attackCd <= 0) {
    player.attackCd = 0.38;
    player.attackT = 0.18;
    audio.swing();
    const hits = ents.attackHits(player, 2.4);
    for (const m of hits) {
      const dead = ents.hurtMob(m, 2);
      audio.hit();
      burst(m.x, m.y + 0.6, m.z, m.boss ? [1, 0.3, 0.5] : [1, 0.9, 0.4]);
      if (dead) {
        onKill(m);
      }
    }
  }

  // interact
  if (input.act()) {
    // flowers
    const fx_ = Math.floor(player.x + Math.sin(player.yaw) * 1.2);
    const fz_ = Math.floor(player.z + Math.cos(player.yaw) * 1.2);
    const fy = Math.floor(player.y + 0.5);
    if (world.getBlock(fx_, fy, fz_) === FLOWER) {
      world.setBlock(fx_, fy, fz_, 0);
      player.inventory.flower = (player.inventory.flower || 0) + 1;
      audio.pickup(); setToast('Flower +1');
      renderer.maybeRebuild(world, player.x, player.z, true);
    }
    const npc = ents.nearestNpc(player.x, player.z, 2.8);
    if (npc) startDialog(npc);
    // POI visit by proximity
    checkPois(true);
  }

  // entities
  ents.update(dt, player, onKill, (dmg) => hurtPlayer(dmg));

  // regions / pois passive
  checkPois(false);
  const reg = world.regionAt(player.x, player.z);
  if (reg && !player.visited.has(reg.id)) {
    player.visited.add(reg.id);
    setBanner(reg.name);
  }

  // quests
  updateQuestProgress(player, ents);
  const done = tryCompleteQuests(player);
  for (const q of done) {
    setBanner('Quest complete: ' + q.name);
    if (q.reward?.art) {
      const a = ARTIFACTS.find(x => x.id === q.reward.art);
      setToast('Artifact: ' + (a?.name || q.reward.art), 3);
      audio.level();
    }
    if (q.id === 'm18') {
      state = 'win';
      showScreen('scr-win');
      audio.level();
      saveGame(player);
    }
  }

  // rebuild mesh occasionally
  if (renderer.maybeRebuild(world, player.x, player.z)) { /* ok */ }

  // boss bar
  bossRef = ents.mobs.find(m => m.boss && m.alive && dist2(m.x, m.z, player.x, player.z) < 30) || null;

  player.timePlayed += dt;
  if (((player.timePlayed * 10) | 0) % 50 === 0) saveGame(player); // periodic

  updateHUD();
  input.consume();
}

function moveAxis(p, dx, dy, dz) {
  const nx = p.x + dx, ny = p.y + dy, nz = p.z + dz;
  const w = 0.3, h = 1.7;
  if (!world.collide(nx, ny, nz, w, h)) {
    p.x = nx; p.y = ny; p.z = nz;
    if (dy !== 0) p.grounded = false;
  } else {
    if (dy < 0) { p.grounded = true; p.vy = 0; }
    if (dy > 0) p.vy = 0;
  }
  // snap to ground soft
  if (dy === 0 && dx === 0 && dz === 0) return;
}

function hurtPlayer(dmg) {
  if (player.invuln > 0) return;
  const diff = DIFF[player.difficulty] || DIFF.normal;
  const d = Math.max(1, Math.round(dmg * diff.dmgMul));
  player.hp -= d;
  player.invuln = 1.0;
  audio.hurt();
  burst(player.x, player.y + 1, player.z, [1, 0.2, 0.2]);
  if (player.hp <= 0) {
    player.hp = 0;
    state = 'dead';
    showScreen('scr-dead');
    saveGame(player);
  }
  updateHUD();
}

function onKill(m) {
  ents.dropFrom(m);
  if (m.type === 'slime' || m.type === 'shade' || m.type === 'golem') {
    player.kills[m.type] = (player.kills[m.type] || 0) + 1;
  }
  if (m.boss) {
    player.kills.boss = (player.kills.boss || 0) + 1;
    player.kills.bossTypes = player.kills.bossTypes || {};
    player.kills.bossTypes[m.type] = true;
    setBanner(m.name + ' defeated!');
    audio.boss();
  }
  audio.pickup();
}

function burst(x, y, z, color) {
  for (let i = 0; i < 10; i++) {
    renderer.addParticle(
      x, y, z,
      (Math.random() - 0.5) * 4,
      Math.random() * 3 + 1,
      (Math.random() - 0.5) * 4,
      0.4 + Math.random() * 0.4,
      color
    );
  }
}

function checkPois(force) {
  for (const p of POIS) {
    if (player.visitedPois.has(p.id)) continue;
    if (dist2(player.x, player.z, p.x, p.z) < (force ? 3.5 : 4.5)) {
      player.visitedPois.add(p.id);
      // elder talk counts
      if (p.id === 'elder' || p.kind === 'town') player.visitedPois.add('elder');
      setToast(p.name, 2);
    }
  }
  // also mark elder when near npc
  const n = ents.nearestNpc(player.x, player.z, 3);
  if (n && n.id === 'elder') player.visitedPois.add('elder');
}

function startDialog(npc) {
  dialog = { npc, i: 0 };
  state = 'dialog';
  $('dlg').classList.remove('hidden');
  $('dlg-name').textContent = npc.name;
  $('dlg-text').textContent = npc.lines[0];
  if (npc.id === 'elder') player.visitedPois.add('elder');
  audio.ui();
}
function advanceDialog() {
  if (!dialog) return;
  dialog.i++;
  if (dialog.i >= dialog.npc.lines.length) {
    $('dlg').classList.add('hidden');
    dialog = null;
    state = 'play';
    audio.click();
  } else {
    $('dlg-text').textContent = dialog.npc.lines[dialog.i];
    audio.click();
  }
  input.consume();
}

function updateHUD() {
  // hearts
  const h = $('hearts');
  let html = '';
  for (let i = 0; i < player.maxHp; i++) {
    html += `<span class="heart ${i < player.hp ? 'on' : ''}"></span>`;
  }
  h.innerHTML = html;
  // arts
  $('arts').innerHTML = player.artifacts.map(id => {
    const a = ARTIFACTS.find(x => x.id === id);
    return `<span class="art" title="${esc(a?.name || id)}">◆</span>`;
  }).join('') + `<span class="gold">● ${player.gold}</span>`;
  // objective
  const q = QUESTS.find(x => x.id === player.activeQuest) || QUESTS.find(x => !x.side && questStatus(player, x) === 'active');
  if (q && !player.questsDone.has(q.id)) {
    $('obj').classList.remove('hidden');
    $('objtxt').textContent = q.name + ' — ' + q.desc;
    $('objp').textContent = progressText(player, q);
  } else {
    $('obj').classList.add('hidden');
  }
  // boss
  if (bossRef) {
    $('bossbar').classList.remove('hidden');
    $('bossname').textContent = bossRef.name || 'Boss';
    $('bossfill').style.width = clamp(bossRef.hp / bossRef.maxHp, 0, 1) * 100 + '%';
  } else $('bossbar').classList.add('hidden');

  // toast / banner
  const t = $('toast');
  if (toast && toastT > 0) { t.textContent = toast; t.classList.remove('hidden'); }
  else t.classList.add('hidden');
  const b = $('banner');
  if (banner && bannerT > 0) { b.textContent = banner; b.classList.remove('hidden'); }
  else b.classList.add('hidden');

  // prompt
  const npc = state === 'play' ? ents.nearestNpc(player.x, player.z, 2.8) : null;
  const pr = $('prompt');
  if (npc) { pr.textContent = `E — talk to ${npc.name}`; pr.classList.remove('hidden'); }
  else pr.classList.add('hidden');
}

// ---------- render ----------
function render() {
  if (!renderer || !player) return;
  const camDist = 4.2;
  const camH = 2.4;
  const fx = Math.sin(player.yaw) * Math.cos(player.pitch);
  const fy = Math.sin(player.pitch);
  const fz = Math.cos(player.yaw) * Math.cos(player.pitch);
  // third person chase cam
  let cam = {
    x: player.x - fx * camDist,
    y: player.y + camH - fy * camDist * 0.4,
    z: player.z - fz * camDist,
    fx, fy, fz,
  };
  // eye-level if too low
  if (cam.y < player.y + 0.5) cam.y = player.y + 0.5;

  renderer.begin(cam, time, dayT);

  // player sprite
  const pTint = hexToRgb(player.color);
  if (player.invuln > 0 && Math.sin(time * 30) > 0) {
    // blink
  } else {
    renderer.drawSprite(player.x, player.y, player.z, 0, 0.85, 1.5, [...pTint, 1], cam);
  }
  // attack arc indicator via particles already

  // npcs
  for (const n of ents.npcs) {
    renderer.drawSprite(n.x, n.y, n.z, n.tile, 0.8, 1.4, [1, 1, 1, 1], cam);
  }
  // mobs
  for (const m of ents.mobs) {
    if (!m.alive) continue;
    const flash = m.hurt > 0 ? [1, 0.4, 0.4, 1] : [1, 1, 1, 1];
    renderer.drawSprite(m.x, m.y, m.z, m.tile, 0.7 * m.scale, 0.7 * m.scale, flash, cam);
  }
  // pickups
  for (const p of ents.pickups) {
    renderer.drawSprite(p.x, p.y, p.z, p.tile || 6, 0.4, 0.4, [1, 1, 1, 1], cam);
  }

  renderer.updateParticles(1 / 60, cam);
  renderer.flushSprites(cam);

  // 2d ui overlay (crosshair + minimap)
  drawUIOverlay(cam);
}

function drawUIOverlay(cam) {
  const w = uiCanvas.width, h = uiCanvas.height;
  ui.clearRect(0, 0, w, h);
  if (state !== 'play' && state !== 'dialog') return;

  // crosshair
  ui.fillStyle = 'rgba(255,255,255,0.7)';
  ui.fillRect(w / 2 - 1, h / 2 - 4, 2, 8);
  ui.fillRect(w / 2 - 4, h / 2 - 1, 8, 2);

  // minimap
  const ms = Math.min(84, w * 0.22);
  const mx = w - ms - 8, my = 8;
  ui.fillStyle = 'rgba(8,12,20,0.75)';
  ui.fillRect(mx - 2, my - 2, ms + 4, ms + 4);
  ui.strokeStyle = '#3a4660';
  ui.strokeRect(mx - 2, my - 2, ms + 4, ms + 4);

  const range = 40;
  const scale = ms / (range * 2);
  // terrain dots
  for (let ix = -range; ix <= range; ix += 2) {
    for (let iz = -range; iz <= range; iz += 2) {
      const wx = player.x + ix, wz = player.z + iz;
      if (wx * wx + wz * wz > 96 * 96) continue;
      const hy = world.heightAt(wx, wz);
      let c = '#3d8a45';
      if (hy < WATER_Y) c = '#2a5a9a';
      else {
        const b = world.biomeAt(wx, wz);
        if (b === 'beach') c = '#c2b06a';
        else if (b === 'snow') c = '#dfe9ff';
        else if (b === 'volcano') c = '#8a3a2a';
        else if (b === 'mountain') c = '#7a8088';
        else if (b === 'forest') c = '#2a6a38';
        else if (b === 'crystal') c = '#4ab0d8';
      }
      const sx = mx + ms / 2 + ix * scale;
      const sy = my + ms / 2 + iz * scale;
      ui.fillStyle = c;
      ui.fillRect(sx, sy, 2, 2);
    }
  }
  // pois
  for (const p of POIS) {
    const dx = p.x - player.x, dz = p.z - player.z;
    if (Math.abs(dx) > range || Math.abs(dz) > range) continue;
    ui.fillStyle = player.visitedPois.has(p.id) ? '#e8b84a' : '#fff';
    ui.fillRect(mx + ms / 2 + dx * scale - 1, my + ms / 2 + dz * scale - 1, 3, 3);
  }
  // mobs
  ui.fillStyle = '#ff5d6c';
  for (const m of ents.mobs) {
    if (!m.alive) continue;
    const dx = m.x - player.x, dz = m.z - player.z;
    if (Math.abs(dx) > range || Math.abs(dz) > range) continue;
    ui.fillRect(mx + ms / 2 + dx * scale, my + ms / 2 + dz * scale, 2, 2);
  }
  // player
  ui.save();
  ui.translate(mx + ms / 2, my + ms / 2);
  ui.rotate(player.yaw);
  ui.fillStyle = '#5aa2ff';
  ui.beginPath();
  ui.moveTo(0, -5); ui.lineTo(4, 4); ui.lineTo(-4, 4);
  ui.closePath(); ui.fill();
  ui.restore();

  // compass
  ui.fillStyle = 'rgba(0,0,0,0.4)';
  ui.fillRect(mx, my + ms + 4, ms, 12);
  ui.fillStyle = '#e8edf7';
  ui.font = '9px monospace';
  ui.textAlign = 'center';
  const dirs = ['N', 'E', 'S', 'W'];
  // yaw 0 = +Z south-ish; treat cos/sin
  ui.fillText('N', mx + ms / 2 - Math.sin(player.yaw) * 0, my + ms + 13);
  ui.fillText(dirs[0], mx + ms / 2, my + ms + 13);

  // day icon
  const dayX = 8, dayY = h - 18;
  ui.fillStyle = 'rgba(0,0,0,0.35)';
  ui.fillRect(dayX, dayY, 60, 12);
  ui.fillStyle = dayT > 0.25 && dayT < 0.75 ? '#e8b84a' : '#8b95a8';
  ui.fillRect(dayX + 2, dayY + 2, 56 * ((dayT)), 8);
}

function drawBigMap() {
  const c = $('map-canvas');
  if (!c) return;
  const parent = c.parentElement;
  const size = Math.min(parent.clientWidth - 24, parent.clientHeight - 24, 640);
  c.width = size; c.height = size;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const R = 96;
  const sc = size / (R * 2);
  for (let x = -R; x < R; x++) {
    for (let z = -R; z < R; z++) {
      if (x * x + z * z > R * R) continue;
      const hy = world.heightAt(x, z);
      let col = '#3d8a45';
      if (hy < WATER_Y) col = '#2a5a9a';
      else {
        const b = world.biomeAt(x, z);
        if (b === 'beach') col = '#c2b06a';
        else if (b === 'snow') col = '#dfe9ff';
        else if (b === 'volcano') col = '#8a3a2a';
        else if (b === 'mountain') col = '#7a8088';
        else if (b === 'forest') col = '#2a6a38';
        else if (b === 'crystal') col = '#4ab0d8';
        else if (b === 'ruins') col = '#a09070';
        else if (b === 'swamp') col = '#3a6a48';
      }
      // shade by height
      ctx.fillStyle = col;
      ctx.fillRect((x + R) * sc, (z + R) * sc, sc + 0.5, sc + 0.5);
    }
  }
  // regions
  ctx.font = `${Math.max(10, size / 42)}px sans-serif`;
  ctx.textAlign = 'center';
  for (const r of REGIONS) {
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillText(r.name, (r.x + R) * sc + 1, (r.z + R) * sc + 1);
    ctx.fillStyle = r.color;
    ctx.fillText(r.name, (r.x + R) * sc, (r.z + R) * sc);
  }
  // pois
  for (const p of POIS) {
    ctx.fillStyle = player.visitedPois.has(p.id) ? '#e8b84a' : '#ffffff';
    const px = (p.x + R) * sc, pz = (p.z + R) * sc;
    ctx.fillRect(px - 2, pz - 2, 4, 4);
  }
  // player
  ctx.fillStyle = '#5aa2ff';
  const ppx = (player.x + R) * sc, ppz = (player.z + R) * sc;
  ctx.beginPath();
  ctx.arc(ppx, ppz, 4, 0, Math.PI * 2);
  ctx.fill();
  // legend
  $('map-legend').innerHTML = POIS.map(p =>
    `<div><span class="dot" style="background:${player.visitedPois.has(p.id) ? '#e8b84a' : '#fff'}"></span>${esc(p.name)}</div>`
  ).join('');
}

function hexToRgb(hex) {
  const n = hex.replace('#', '');
  const full = n.length === 3 ? n.split('').map(c => c + c).join('') : n;
  const num = parseInt(full, 16);
  return [(num >> 16 & 255) / 255, (num >> 8 & 255) / 255, (num & 255) / 255];
}

function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (started) {
    if (state === 'play' || state === 'dialog') update(dt);
    else {
      // still allow closing menus
      if (state === 'pause' && input.pause()) resume();
      input.consume();
    }
    render();
    if (state === 'map' && !$('scr-map').classList.contains('hidden')) {
      // map already drawn on open; redraw player blink
    }
  }
  requestAnimationFrame(frame);
}

// click dialog
$('dlg')?.addEventListener('click', () => { if (state === 'dialog') advanceDialog(); });

boot();
