import { clamp, dist2, mulberry32 } from './math.js';
import { World, WATER_Y, POIS, FLOWER, SOLID } from './world.js';
import { Renderer } from './renderer.js';
import { Input } from './input.js';

const VERSION = (window.__GPG__ && window.__GPG__.version) || '3.0.0';
const CFG = window.__GPG__ || {};
const SAVE_KEY = 'gpg.isle.v3';

const ITEMS = {
  flower: { name: 'Meadow Bloom', icon: '❀', stack: 99 },
  wood: { name: 'Timber', icon: '🪵', stack: 99 },
  crystal: { name: 'Prism Shard', icon: '◆', stack: 99 },
  gold: { name: 'Gold Coin', icon: '●', stack: 999 },
  potion: { name: 'Vita Flask', icon: '♥', stack: 20 },
  key: { name: 'Ruin Key', icon: '🗝️', stack: 10 },
  scrap: { name: 'Iron Scrap', icon: '▣', stack: 99 },
};

export class Game {
  constructor() {
    this.glCanvas = document.getElementById('gl');
    this.uiCanvas = document.getElementById('ui');
    this.ui = this.uiCanvas.getContext('2d');
    this.ui.imageSmoothingEnabled = false;
    this.state = 'title';
    this.time = 0;
    this.dayT = 0.32;
    this.last = performance.now();
    this.toast = null; this.toastT = 0;
    this.banner = null; this.bannerT = 0;
    this.discovered = new Set(['spawn']);
    this.mapOpen = false;
    this.invOpen = false;
    this.cfg = {
      scale: Number(CFG.scale) || 2,
      name: CFG.playerName || 'Player',
      color: CFG.playerColor || '#5a9e6f',
      difficulty: CFG.difficulty || 'normal',
    };
    this._bindUI();
  }

  boot() {
    try {
      this.world = new World(20260910);
      this.renderer = new Renderer(this.glCanvas);
      this.input = new Input();
      this.player = this._newPlayer();
      this.mobs = [];
      this.pickups = [];
      this.npcs = this._spawnNpcs();
      this._spawnMobs(36);
      this.resize();
      document.getElementById('ver').textContent = 'v' + VERSION;
      document.getElementById('t-continue').disabled = !this.hasSave();
      this.showScreen('scr-title');
      this.started = true;
      requestAnimationFrame((t) => this.frame(t));
    } catch (err) {
      console.error(err);
      const el = document.getElementById('boot-err');
      el?.classList.remove('hidden');
      const m = document.getElementById('boot-err-msg');
      if (m) m.textContent = String(err.message || err);
    }
  }

  _newPlayer() {
    const p = {
      x: 0, y: 10, z: 2,
      vx: 0, vy: 0, vz: 0,
      yaw: 0, pitch: 0.05,
      hp: 8, maxHp: 8,
      gold: 0,
      grounded: false,
      invuln: 0,
      attackCd: 0,
      attackT: 0,
      inv: { flower: 0, wood: 0, crystal: 0, potion: 2, key: 0, scrap: 0 },
      name: this.cfg.name,
      color: this.cfg.color,
      difficulty: this.cfg.difficulty,
      kills: 0,
      timePlayed: 0,
    };
    p.y = this.world.groundY(p.x, p.z);
    return p;
  }

  _spawnNpcs() {
    const list = [
      { id: 'guide', name: 'Scout Lyra', x: 2, z: 3, lines: [
        'Welcome to Lumina Isle, traveler.',
        'Cities, ruins, and wilds wait beyond Haven Plaza.',
        'Open the map with M — fog lifts as you explore.',
        'Inventory is I. Gather blooms, timber, prism shards.',
      ]},
      { id: 'merchant', name: 'Vendor Rex', x: 22, z: 8, lines: [
        'Sun Market buys blooms. I pay gold for rare shards.',
        'Press E near me after you gather goods.',
      ]},
      { id: 'captain', name: 'Captain Vee', x: 38, z: 28, lines: [
        'Tide Docks ferry the brave. Watch the waters at dusk.',
      ]},
    ];
    for (const n of list) n.y = this.world.groundY(n.x, n.z);
    return list;
  }

  _spawnMobs(n) {
    const rng = mulberry32(999);
    const types = [
      { type: 'slime', hp: 4, dmg: 1, spd: 3.4, tile: 1, scale: 0.75 },
      { type: 'shade', hp: 6, dmg: 1, spd: 4.2, tile: 2, scale: 0.9 },
      { type: 'golem', hp: 12, dmg: 2, spd: 2.4, tile: 3, scale: 1.2 },
    ];
    while (this.mobs.length < n) {
      const a = rng() * Math.PI * 2;
      const r = 20 + rng() * 70;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (Math.hypot(x, z) > 95) continue;
      const y = this.world.groundY(x, z);
      if (y <= WATER_Y) continue;
      const def = types[(rng() * types.length) | 0];
      this.mobs.push({
        ...def, x, y, z, vx: 0, vz: 0,
        hp: def.hp, maxHp: def.hp, cd: 0, hurt: 0, alive: true, phase: rng() * 10,
      });
    }
  }

  _bindUI() {
    const $ = (id) => document.getElementById(id);
    $('t-new')?.addEventListener('click', () => this.newGame());
    $('t-continue')?.addEventListener('click', () => this.continueGame());
    $('t-howto')?.addEventListener('click', () => this.showScreen('scr-howto'));
    $('t-options')?.addEventListener('click', () => this.showScreen('scr-options'));
    $('h-back')?.addEventListener('click', () => this.showScreen(this.state === 'pause' ? 'scr-pause' : 'scr-title'));
    $('o-back')?.addEventListener('click', () => this.showScreen(this.state === 'pause' ? 'scr-pause' : 'scr-title'));
    $('o-save')?.addEventListener('click', () => {
      const s = Number($('o-scale')?.value || 2);
      this.cfg.scale = s; this.resize(); this.toastMsg('Options saved');
    });
    $('p-continue')?.addEventListener('click', () => this.resume());
    $('p-map')?.addEventListener('click', () => this.openMap());
    $('p-inv')?.addEventListener('click', () => this.openInv());
    $('p-title')?.addEventListener('click', () => { this.save(); this.state = 'title'; this.showScreen('scr-title'); $('hud')?.classList.add('hidden'); });
    $('btn-map')?.addEventListener('click', () => { if (this.state === 'play') this.openMap(); });
    $('btn-inv')?.addEventListener('click', () => { if (this.state === 'play') this.openInv(); });
    $('pause-btn')?.addEventListener('click', () => { if (this.state === 'play') this.pause(); });
    $('m-back')?.addEventListener('click', () => this.resume());
    $('i-back')?.addEventListener('click', () => this.resume());
    $('d-again')?.addEventListener('click', () => {
      this.player.hp = this.player.maxHp;
      this.player.x = 0; this.player.z = 2;
      this.player.y = this.world.groundY(0, 2);
      this.player.invuln = 2;
      this.state = 'play'; this.showScreen(null); $('hud')?.classList.remove('hidden');
    });
    $('d-title')?.addEventListener('click', () => { this.state = 'title'; this.showScreen('scr-title'); $('hud')?.classList.add('hidden'); });
    $('btn-retry')?.addEventListener('click', () => location.reload());
    $('t-reset')?.addEventListener('click', () => {
      if (confirm('Erase save?')) { localStorage.removeItem(SAVE_KEY); $('t-continue').disabled = true; }
    });
    window.addEventListener('resize', () => this.resize());
  }

  showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
    if (id) document.getElementById(id)?.classList.remove('hidden');
  }
  toastMsg(m, t = 2) { this.toast = m; this.toastT = t; }
  bannerMsg(m, t = 3) { this.banner = m; this.bannerT = t; }

  resize() {
    const stage = document.getElementById('stage');
    const w = stage?.clientWidth || window.innerWidth;
    const h = stage?.clientHeight || window.innerHeight;
    const scale = this.cfg.scale || 2;
    this.renderer?.resize(w, h, scale);
    this.uiCanvas.width = Math.max(480, Math.floor(w / scale));
    this.uiCanvas.height = Math.max(270, Math.floor(h / scale));
    this.uiCanvas.style.width = w + 'px';
    this.uiCanvas.style.height = h + 'px';
    this.ui.imageSmoothingEnabled = false;
  }

  newGame() {
    this.player = this._newPlayer();
    this.discovered = new Set(['spawn']);
    this.mobs = []; this._spawnMobs(36);
    this.pickups = [];
    this.dayT = 0.32;
    this.state = 'play';
    this.showScreen(null);
    document.getElementById('hud')?.classList.remove('hidden');
    this.renderer.maybeRebuild(this.world, this.player.x, this.player.z, true);
    this.bannerMsg('Lumina Isle awaits');
    this.save();
    this.updateHUD();
    document.getElementById('stage')?.focus();
  }

  continueGame() {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return this.newGame();
    try {
      const data = JSON.parse(raw);
      this.player = this._newPlayer();
      Object.assign(this.player, data.player);
      this.player.inv = Object.assign({ flower:0, wood:0, crystal:0, potion:0, key:0, scrap:0 }, data.player?.inv || {});
      this.discovered = new Set(data.discovered || ['spawn']);
      this.dayT = data.dayT || 0.32;
      this.player.y = this.world.groundY(this.player.x, this.player.z);
      this.mobs = []; this._spawnMobs(36);
      this.state = 'play';
      this.showScreen(null);
      document.getElementById('hud')?.classList.remove('hidden');
      this.renderer.maybeRebuild(this.world, this.player.x, this.player.z, true);
      this.bannerMsg('Welcome back, ' + this.player.name);
      this.updateHUD();
      document.getElementById('stage')?.focus();
    } catch { this.newGame(); }
  }

  hasSave() { return !!localStorage.getItem(SAVE_KEY); }
  save() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        player: this.player,
        discovered: [...this.discovered],
        dayT: this.dayT,
      }));
    } catch {}
  }

  pause() { this.state = 'pause'; this.showScreen('scr-pause'); this.save(); }
  resume() { this.state = 'play'; this.showScreen(null); document.getElementById('hud')?.classList.remove('hidden'); this.mapOpen = false; this.invOpen = false; }
  openMap() {
    this.state = 'map'; this.mapOpen = true;
    this.showScreen('scr-map');
    this.drawBigMap();
  }
  openInv() {
    this.state = 'inv'; this.invOpen = true;
    this.showScreen('scr-inv');
    this.drawInv();
  }

  frame(now) {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    if (this.started) {
      if (this.state === 'play') this.update(dt);
      else {
        if (this.state === 'pause' && this.input.pause()) this.resume();
        if ((this.state === 'map' || this.state === 'inv') && (this.input.pause() || this.input.map() || this.input.inv())) this.resume();
        this.input.consume();
      }
      this.render();
    }
    requestAnimationFrame((t) => this.frame(t));
  }

  update(dt) {
    this.time += dt;
    this.dayT = (this.dayT + dt / 420) % 1;
    if (this.toastT > 0) this.toastT -= dt;
    if (this.bannerT > 0) this.bannerT -= dt;
    this.player.timePlayed += dt;

    if (this.input.pause()) { this.pause(); this.input.consume(); return; }
    if (this.input.map()) { this.openMap(); this.input.consume(); return; }
    if (this.input.inv()) { this.openInv(); this.input.consume(); return; }

    const p = this.player;
    // look — always works (pointer lock OR hold RMB OR always when playing with small gain without lock)
    const sens = 0.0024;
    // Always apply mouse delta if any; when not locked, still apply (user can drag with RMB)
    // Additionally give a gentle auto if locked-or-any-delta
    if (this.input.mdx || this.input.mdy) {
      p.yaw -= this.input.mdx * sens;
      p.pitch -= this.input.mdy * sens;
    }
    p.pitch = clamp(p.pitch, -1.35, 1.35);

    // movement — FIXED: camera-relative, no broken sign
    const [mx, mz] = this.input.moveVec();
    const sprint = this.input.sprint();
    const sp = (sprint ? 8.2 : 5.6);
    // yaw: 0 looks toward -Z? We use sin/cos consistently:
    // forward on XZ = (sin(yaw), cos(yaw))  — turning right increases yaw, moves right strafe
    const forwardX = Math.sin(p.yaw);
    const forwardZ = Math.cos(p.yaw);
    const rightX = Math.cos(p.yaw);
    const rightZ = -Math.sin(p.yaw);
    // mz: -1 = W (forward), +1 = S (back); mx: -1 = A, +1 = D
    const wishX = forwardX * (-mz) + rightX * mx;
    const wishZ = forwardZ * (-mz) + rightZ * mx;

    // accelerate instead of set (feels better, still responsive)
    const targetVx = wishX * sp;
    const targetVz = wishZ * sp;
    const accel = p.grounded ? 40 : 12;
    p.vx += (targetVx - p.vx) * Math.min(1, accel * dt);
    p.vz += (targetVz - p.vz) * Math.min(1, accel * dt);

    if (p.grounded && this.input.jump()) {
      p.vy = 8.6;
      p.grounded = false;
    }
    p.vy -= 24 * dt;

    this.moveAxis(p, p.vx * dt, 0, 0);
    this.moveAxis(p, 0, p.vy * dt, 0);
    this.moveAxis(p, 0, 0, p.vz * dt);

    // step-up assist: if blocked horizontally but a 1-block step is free
    // (already handled by separate axes + ground snap)

    if (p.y < WATER_Y - 0.2) {
      p.vy += 28 * dt;
      p.vx *= 0.92; p.vz *= 0.92;
    }
    // soft island bounds
    const br = Math.hypot(p.x, p.z);
    if (br > 100) {
      const k = 100 / br;
      p.x *= k; p.z *= k;
    }

    p.invuln = Math.max(0, p.invuln - dt);
    p.attackCd = Math.max(0, p.attackCd - dt);
    if (p.attackT > 0) p.attackT -= dt;

    // attack
    if (this.input.attack() && p.attackCd <= 0) {
      p.attackCd = 0.34;
      p.attackT = 0.16;
      const hits = this.attackHits(2.5);
      for (const m of hits) {
        m.hp -= 2; m.hurt = 0.2;
        this.burst(m.x, m.y + 0.5, m.z, [1, 0.9, 0.3]);
        if (m.hp <= 0) {
          m.alive = false;
          p.kills++;
          p.gold += 1 + ((Math.random() * 3) | 0);
          p.inv.scrap = (p.inv.scrap || 0) + (Math.random() < 0.4 ? 1 : 0);
          this.pickups.push({ kind: 'gold', n: 1, x: m.x, y: m.y + 0.4, z: m.z, t: 0 });
          if (Math.random() < 0.15) this.pickups.push({ kind: 'potion', n: 1, x: m.x + 0.3, y: m.y, z: m.z, t: 0 });
        }
      }
    }

    // interact
    if (this.input.act()) {
      // gather flower / crops / wood punch soft
      const fx = Math.floor(p.x + Math.sin(p.yaw) * 1.4);
      const fz = Math.floor(p.z + Math.cos(p.yaw) * 1.4);
      const fy = Math.floor(p.y + 0.4);
      const b = this.world.getBlock(fx, fy, fz);
      if (b === FLOWER) {
        this.world.setBlock(fx, fy, fz, 0);
        p.inv.flower = (p.inv.flower || 0) + 1;
        this.toastMsg('Meadow Bloom +1');
        this.renderer.maybeRebuild(this.world, p.x, p.z, true);
      }
      // npc
      const npc = this.nearestNpc(2.6);
      if (npc) this.startDialog(npc);
      // sell at merchant
      if (npc?.id === 'merchant' && (p.inv.flower || 0) >= 3) {
        p.inv.flower -= 3; p.gold += 12;
        this.toastMsg('Sold blooms +12g');
      }
    }

    // use potion with 1? skip — inventory button
    this.updateMobs(dt);
    this.updatePickups(dt);

    // discover POIs
    const poi = this.world.poiAt(p.x, p.z);
    if (poi && !this.discovered.has(poi.id)) {
      this.discovered.add(poi.id);
      this.bannerMsg('Discovered · ' + poi.name);
      this.save();
    }

    this.renderer.maybeRebuild(this.world, p.x, p.z);
    if (((p.timePlayed * 5) | 0) % 40 === 0) this.save();
    this.updateHUD();
    this.input.consume();
  }

  moveAxis(p, dx, dy, dz) {
    const nx = p.x + dx, ny = p.y + dy, nz = p.z + dz;
    const w = 0.28, h = 1.7;
    if (!this.world.collide(nx, ny, nz, w, h)) {
      p.x = nx; p.y = ny; p.z = nz;
      if (dy !== 0) p.grounded = false;
    } else {
      if (dy < 0) { p.grounded = true; p.vy = 0; }
      else if (dy > 0) p.vy = 0;
      else if (dx !== 0 || dz !== 0) {
        // try step-up 1 block
        if (!this.world.collide(nx, ny + 1.05, nz, w, h) && p.grounded) {
          p.x = nx; p.y = ny + 1.0; p.z = nz;
        }
      }
    }
  }

  attackHits(range) {
    const p = this.player;
    const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
    const hits = [];
    for (const m of this.mobs) {
      if (!m.alive) continue;
      const dx = m.x - p.x, dz = m.z - p.z;
      const d = Math.hypot(dx, dz);
      if (d > range + m.scale * 0.4) continue;
      const dot = (dx * fx + dz * fz) / (d || 1);
      if (dot > 0.15 || d < 1.2) hits.push(m);
    }
    return hits;
  }

  updateMobs(dt) {
    const p = this.player;
    for (const m of this.mobs) {
      if (!m.alive) continue;
      m.phase += dt; m.hurt = Math.max(0, m.hurt - dt); m.cd = Math.max(0, m.cd - dt);
      const d = dist2(m.x, m.z, p.x, p.z);
      if (d < 16 && d > 0.2) {
        const ang = Math.atan2(p.x - m.x, p.z - m.z);
        m.vx = Math.sin(ang) * m.spd;
        m.vz = Math.cos(ang) * m.spd;
      } else {
        m.vx = Math.sin(m.phase * 0.6) * m.spd * 0.25;
        m.vz = Math.cos(m.phase * 0.5) * m.spd * 0.25;
      }
      let nx = m.x + m.vx * dt, nz = m.z + m.vz * dt;
      if (!this.world.collide(nx, m.y, m.z, 0.3, m.scale)) m.x = nx;
      if (!this.world.collide(m.x, m.y, nz, 0.3, m.scale)) m.z = nz;
      m.y = this.world.groundY(m.x, m.z);
      if (d < 0.85 * m.scale + 0.35 && m.cd <= 0 && p.invuln <= 0) {
        m.cd = 0.85;
        this.hurtPlayer(m.dmg);
      }
    }
    this.mobs = this.mobs.filter(m => m.alive);
    if (this.mobs.length < 28) this._spawnMobs(32);
  }

  updatePickups(dt) {
    const p = this.player;
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const u = this.pickups[i];
      u.t += dt;
      u.y = this.world.groundY(u.x, u.z) + 0.35 + Math.sin(u.t * 4) * 0.08;
      if (Math.hypot(u.x - p.x, u.z - p.z) < 1.3) {
        if (u.kind === 'gold') p.gold += u.n || 1;
        else p.inv[u.kind] = (p.inv[u.kind] || 0) + (u.n || 1);
        this.pickups.splice(i, 1);
        this.toastMsg('Looted');
      }
    }
  }

  hurtPlayer(dmg) {
    const p = this.player;
    if (p.invuln > 0) return;
    const mul = p.difficulty === 'easy' ? 0.7 : p.difficulty === 'hard' ? 1.4 : 1;
    p.hp -= Math.max(1, Math.round(dmg * mul));
    p.invuln = 0.9;
    this.burst(p.x, p.y + 1, p.z, [1, 0.2, 0.2]);
    if (p.hp <= 0) {
      p.hp = 0;
      this.state = 'dead';
      this.showScreen('scr-dead');
      this.save();
    }
  }

  burst(x, y, z, color) {
    for (let i = 0; i < 10; i++) {
      this.renderer.addParticle(x, y, z,
        (Math.random() - 0.5) * 4, Math.random() * 3 + 1, (Math.random() - 0.5) * 4,
        0.35 + Math.random() * 0.35, color);
    }
  }

  nearestNpc(r = 2.5) {
    let best = null, bd = r;
    for (const n of this.npcs) {
      const d = dist2(this.player.x, this.player.z, n.x, n.z);
      if (d < bd) { bd = d; best = n; }
    }
    return best;
  }

  startDialog(npc) {
    this.dialog = { npc, i: 0 };
    this.state = 'dialog';
    const dlg = document.getElementById('dlg');
    dlg?.classList.remove('hidden');
    document.getElementById('dlg-name').textContent = npc.name;
    document.getElementById('dlg-text').textContent = npc.lines[0];
    const adv = () => {
      if (!this.dialog) return;
      this.dialog.i++;
      if (this.dialog.i >= npc.lines.length) {
        dlg?.classList.add('hidden');
        this.dialog = null;
        this.state = 'play';
      } else {
        document.getElementById('dlg-text').textContent = npc.lines[this.dialog.i];
      }
    };
    dlg.onclick = adv;
  }

  updateHUD() {
    const p = this.player;
    const h = document.getElementById('hearts');
    if (h) {
      let s = '';
      for (let i = 0; i < p.maxHp; i++) s += `<span class="heart ${i < p.hp ? 'on' : ''}"></span>`;
      h.innerHTML = s;
    }
    const arts = document.getElementById('arts');
    if (arts) {
      arts.innerHTML = `<span class="gold">● ${p.gold}</span>
        <span class="chip">DISCOVERED ${this.discovered.size}/${POIS.length}</span>`;
    }
    const obj = document.getElementById('obj');
    const undisc = POIS.find(x => !this.discovered.has(x.id));
    if (obj) {
      if (undisc) {
        obj.classList.remove('hidden');
        document.getElementById('objtxt').textContent = 'Explore · find ' + undisc.name;
        const d = dist2(p.x, p.z, undisc.x, undisc.z) | 0;
        document.getElementById('objp').textContent = d + 'm away';
      } else {
        obj.classList.remove('hidden');
        document.getElementById('objtxt').textContent = 'Isle fully charted';
        document.getElementById('objp').textContent = 'All ' + POIS.length + ' POIs discovered';
      }
    }
    const t = document.getElementById('toast');
    if (t) {
      if (this.toast && this.toastT > 0) { t.textContent = this.toast; t.classList.remove('hidden'); }
      else t.classList.add('hidden');
    }
    const b = document.getElementById('banner');
    if (b) {
      if (this.banner && this.bannerT > 0) { b.textContent = this.banner; b.classList.remove('hidden'); }
      else b.classList.add('hidden');
    }
    const pr = document.getElementById('prompt');
    const npc = this.state === 'play' ? this.nearestNpc(2.6) : null;
    if (pr) {
      if (npc) { pr.textContent = `E — talk to ${npc.name}`; pr.classList.remove('hidden'); }
      else pr.classList.add('hidden');
    }
    // advance dialog with E
    if (this.state === 'dialog' && (this.input.act() || this.input.down('Space', ' '))) {
      document.getElementById('dlg')?.click();
    }
  }

  render() {
    const p = this.player;
    if (!this.renderer || !p) return;
    // third-person chase cam
    const dist = 4.6, h = 2.6;
    const fx = Math.sin(p.yaw) * Math.cos(p.pitch);
    const fy = Math.sin(p.pitch);
    const fz = Math.cos(p.yaw) * Math.cos(p.pitch);
    let cam = {
      x: p.x - fx * dist,
      y: p.y + h - fy * dist * 0.35,
      z: p.z - fz * dist,
      fx, fy, fz,
    };
    if (cam.y < p.y + 0.6) cam.y = p.y + 0.6;

    this.renderer.begin(cam, this.time, this.dayT);

    // player
    const col = hexRgb(p.color);
    if (!(p.invuln > 0 && Math.sin(this.time * 28) > 0)) {
      this.renderer.drawSprite(p.x, p.y, p.z, 0, 0.85, 1.55, [...col, 1], cam);
    }
    for (const n of this.npcs) {
      this.renderer.drawSprite(n.x, n.y, n.z, 4, 0.8, 1.45, [1,1,1,1], cam);
    }
    for (const m of this.mobs) {
      if (!m.alive) continue;
      const t = m.hurt > 0 ? [1, 0.4, 0.4, 1] : [1,1,1,1];
      this.renderer.drawSprite(m.x, m.y, m.z, m.tile, 0.7 * m.scale, 0.7 * m.scale, t, cam);
    }
    for (const u of this.pickups) {
      this.renderer.drawSprite(u.x, u.y, u.z, u.kind === 'potion' ? 7 : 6, 0.4, 0.4, [1,1,1,1], cam);
    }
    this.renderer.updateParticles(1/60, cam);
    this.renderer.flushSprites();
    this.renderer.drawGodRays(cam);
    this.drawOverlay(cam);
  }

  drawOverlay(cam) {
    const ui = this.ui, w = this.uiCanvas.width, h = this.uiCanvas.height;
    ui.clearRect(0, 0, w, h);
    if (this.state !== 'play' && this.state !== 'dialog') return;

    // crosshair
    ui.fillStyle = 'rgba(255,255,255,0.75)';
    ui.fillRect(w/2 - 1, h/2 - 5, 2, 10);
    ui.fillRect(w/2 - 5, h/2 - 1, 10, 2);

    // minimap
    const ms = Math.min(96, w * 0.2);
    const mx = w - ms - 10, my = 10;
    ui.fillStyle = 'rgba(6,10,18,0.78)';
    ui.fillRect(mx - 3, my - 3, ms + 6, ms + 6);
    ui.strokeStyle = '#3a4660'; ui.strokeRect(mx - 3, my - 3, ms + 6, ms + 6);

    const range = 48;
    const sc = ms / (range * 2);
    const p = this.player;
    // fog of war style: only draw near player + discovered POI areas faintly
    for (let ix = -range; ix <= range; ix += 2) {
      for (let iz = -range; iz <= range; iz += 2) {
        const wx = p.x + ix, wz = p.z + iz;
        if (wx*wx + wz*wz > 110*110) continue;
        const hy = this.world.heightAt(wx, wz);
        let c = '#2f7a3a';
        if (hy < WATER_Y) c = '#1e4a8a';
        else {
          const b = this.world.biomeAt(wx, wz);
          if (b === 'beach') c = '#c2b06a';
          else if (b === 'snow') c = '#dfe9ff';
          else if (b === 'volcano') c = '#8a3a2a';
          else if (b === 'mountain') c = '#7a8088';
          else if (b === 'forest') c = '#1f5a30';
          else if (b === 'crystal') c = '#3aa8d0';
          else if (b === 'neon') c = '#1a6a6a';
        }
        ui.fillStyle = c;
        ui.fillRect(mx + ms/2 + ix*sc, my + ms/2 + iz*sc, 2, 2);
      }
    }
    for (const poi of POIS) {
      const dx = poi.x - p.x, dz = poi.z - p.z;
      if (Math.abs(dx) > range || Math.abs(dz) > range) continue;
      const known = this.discovered.has(poi.id);
      ui.fillStyle = known ? poi.color : '#ffffff55';
      ui.fillRect(mx + ms/2 + dx*sc - 1, my + ms/2 + dz*sc - 1, 3, 3);
    }
    // player arrow
    ui.save();
    ui.translate(mx + ms/2, my + ms/2);
    ui.rotate(p.yaw);
    ui.fillStyle = '#5aa2ff';
    ui.beginPath(); ui.moveTo(0,-5); ui.lineTo(4,4); ui.lineTo(-4,4); ui.fill();
    ui.restore();

    // day bar
    ui.fillStyle = 'rgba(0,0,0,0.4)';
    ui.fillRect(10, h - 16, 70, 8);
    ui.fillStyle = this.dayT > 0.25 && this.dayT < 0.75 ? '#e8b84a' : '#889';
    ui.fillRect(11, h - 15, 68 * this.dayT, 6);
  }

  drawBigMap() {
    const c = document.getElementById('map-canvas');
    if (!c) return;
    const parent = c.parentElement;
    const size = Math.min(parent.clientWidth - 20, 640, parent.clientHeight - 20 || 640);
    c.width = size; c.height = size;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    const R = 110;
    const sc = size / (R * 2);
    // fog: undisc covered dark
    for (let x = -R; x < R; x++) {
      for (let z = -R; z < R; z++) {
        if (x*x + z*z > R*R) continue;
        const hy = this.world.heightAt(x, z);
        let col = '#2f7a3a';
        if (hy < WATER_Y) col = '#1e4a8a';
        else {
          const b = this.world.biomeAt(x, z);
          if (b === 'beach') col = '#c2b06a';
          else if (b === 'snow') col = '#dfe9ff';
          else if (b === 'volcano') col = '#8a3a2a';
          else if (b === 'mountain') col = '#7a8088';
          else if (b === 'forest') col = '#1f5a30';
          else if (b === 'crystal') col = '#3aa8d0';
          else if (b === 'neon') col = '#1a6a6a';
        }
        // fog of war: darken if far from any discovered POI and far from player
        let known = dist2(x, z, this.player.x, this.player.z) < 28;
        if (!known) {
          for (const p of POIS) {
            if (this.discovered.has(p.id) && dist2(x, z, p.x, p.z) < p.discR + 6) { known = true; break; }
          }
        }
        if (!known) col = '#0a0e18';
        ctx.fillStyle = col;
        ctx.fillRect((x + R) * sc, (z + R) * sc, sc + 0.5, sc + 0.5);
      }
    }
    ctx.font = `${Math.max(10, size/48)}px sans-serif`;
    ctx.textAlign = 'center';
    for (const p of POIS) {
      const known = this.discovered.has(p.id);
      const px = (p.x + R) * sc, pz = (p.z + R) * sc;
      ctx.fillStyle = known ? p.color : '#445';
      ctx.fillRect(px - 3, pz - 3, 6, 6);
      if (known) {
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillText(p.name, px + 1, pz - 6);
        ctx.fillStyle = p.color;
        ctx.fillText(p.name, px, pz - 7);
      } else {
        ctx.fillStyle = '#556';
        ctx.fillText('???', px, pz - 7);
      }
    }
    // player
    ctx.fillStyle = '#5aa2ff';
    ctx.beginPath();
    ctx.arc((this.player.x + R) * sc, (this.player.z + R) * sc, 5, 0, Math.PI * 2);
    ctx.fill();

    const leg = document.getElementById('map-legend');
    if (leg) {
      leg.innerHTML = POIS.map(p => {
        const known = this.discovered.has(p.id);
        return `<div><span class="dot" style="background:${known ? p.color : '#445'}"></span>${known ? escapeHtml(p.name) : '???'}</div>`;
      }).join('');
    }
  }

  drawInv() {
    const box = document.getElementById('inv-list');
    if (!box) return;
    const p = this.player;
    const rows = Object.keys(ITEMS).map(id => {
      const it = ITEMS[id];
      const n = id === 'gold' ? p.gold : (p.inv[id] || 0);
      return `<div class="inv-row"><span class="ic">${it.icon}</span><span class="nm">${escapeHtml(it.name)}</span><span class="n">${n}</span></div>`;
    });
    box.innerHTML = rows.join('') + `
      <div class="inv-hint">Explore cities on the map (M). Gather blooms in Golden Fields. Talk to Vendor Rex at Sun Market.</div>`;
  }
}

function hexRgb(hex) {
  const n = hex.replace('#','');
  const full = n.length === 3 ? n.split('').map(c => c+c).join('') : n;
  const num = parseInt(full, 16);
  return [(num>>16&255)/255, (num>>8&255)/255, (num&255)/255];
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
