import { dist2, dist3, clamp, rand, mulberry32, angleWrap, lerp } from './math.js';
import { WATER_Y } from './world.js';

export const ARTIFACTS = [
  { id: 'sunstone', name: 'Sunstone', desc: 'Warm light of the first dawn.' },
  { id: 'tidecall', name: 'Tidecall Shell', desc: 'Holds the song of the shore.' },
  { id: 'ironheart', name: 'Ironheart', desc: 'A core from the cliff forge.' },
  { id: 'leafwhisper', name: 'Leafwhisper', desc: 'Speaks with the old woods.' },
  { id: 'frostgem', name: 'Frostgem', desc: 'Cold that never melts.' },
  { id: 'embercore', name: 'Embercore', desc: 'Heart of Ember Peak.' },
  { id: 'ruinkey', name: 'Ruin Key', desc: 'Opens what was sealed.' },
  { id: 'crystaleye', name: 'Crystal Eye', desc: 'Sees paths through stone.' },
  { id: 'fenlantern', name: 'Fen Lantern', desc: 'Guides through mist.' },
  { id: 'lightcrown', name: 'Crown of Light', desc: 'The island remembers.' },
];

export const QUESTS = [
  // main
  { id: 'm1', chapter: 1, name: 'Awakening', desc: 'Speak with the Elder in Haven Village.', type: 'talk', target: 'elder', reward: { hp: 0 } },
  { id: 'm2', chapter: 1, name: 'Market Day', desc: 'Collect 5 flowers in Sun Meadow.', type: 'collect', item: 'flower', n: 5, reward: { gold: 20 } },
  { id: 'm3', chapter: 1, name: 'Path of Light', desc: 'Visit the Light Shrine south of town.', type: 'visit', target: 'shrine', reward: { art: 'sunstone' } },
  { id: 'm4', chapter: 2, name: 'Woodland Echo', desc: 'Find the Hunter Camp in Whisper Woods.', type: 'visit', target: 'camp', reward: { gold: 15 } },
  { id: 'm5', chapter: 2, name: 'Slime Cleanup', desc: 'Defeat 8 slimes anywhere on the island.', type: 'kill', enemy: 'slime', n: 8, reward: { gold: 30 } },
  { id: 'm6', chapter: 2, name: 'Tidecall', desc: 'Reach the Docks and claim the shell.', type: 'visit', target: 'dock', reward: { art: 'tidecall' } },
  { id: 'm7', chapter: 3, name: 'Cliff Road', desc: 'Climb to the Watchtower.', type: 'visit', target: 'tower', reward: { gold: 25 } },
  { id: 'm8', chapter: 3, name: 'Ironheart', desc: 'Reach the Cliff Forge.', type: 'visit', target: 'forge', reward: { art: 'ironheart' } },
  { id: 'm9', chapter: 4, name: 'Whisper', desc: 'Gather 6 wood spirits (defeat forest shades).', type: 'kill', enemy: 'shade', n: 6, reward: { art: 'leafwhisper' } },
  { id: 'm10', chapter: 4, name: 'Old Stones', desc: 'Explore the Ruined Temple.', type: 'visit', target: 'temple', reward: { art: 'ruinkey' } },
  { id: 'm11', chapter: 5, name: 'Crystal Path', desc: 'Enter Crystal Cave.', type: 'visit', target: 'cave', reward: { art: 'crystaleye' } },
  { id: 'm12', chapter: 5, name: 'Ember Ascent', desc: 'Stand on Ember Peak.', type: 'visit', target: 'boss1', reward: { art: 'embercore' } },
  { id: 'm13', chapter: 6, name: 'Shadow Lord', desc: 'Defeat the Shadow Den boss.', type: 'boss', boss: 'shadow', reward: { gold: 100 } },
  { id: 'm14', chapter: 6, name: 'Frost March', desc: 'Reach Frost Lair.', type: 'visit', target: 'boss2', reward: { art: 'frostgem' } },
  { id: 'm15', chapter: 7, name: 'Ice Tyrant', desc: 'Defeat the Frost Lair boss.', type: 'boss', boss: 'frost', reward: { gold: 120 } },
  { id: 'm16', chapter: 7, name: 'Mist Walk', desc: 'Cross into Mist Fen.', type: 'visit', target: 'boss3', reward: { art: 'fenlantern' } },
  { id: 'm17', chapter: 8, name: 'Deep Hollow', desc: 'Defeat the final boss in Deep Hollow.', type: 'boss', boss: 'hollow', reward: { art: 'lightcrown', gold: 200 } },
  { id: 'm18', chapter: 8, name: 'The Legend', desc: 'Return to the Light Shrine with the Crown.', type: 'visit', target: 'shrine', needArt: 'lightcrown', reward: { gold: 0 } },
  // side
  { id: 's1', side: true, name: 'Farm Help', desc: 'Visit Sunny Farm.', type: 'visit', target: 'farm', reward: { gold: 10 } },
  { id: 's2', side: true, name: 'Flower Crown', desc: 'Collect 12 flowers.', type: 'collect', item: 'flower', n: 12, reward: { gold: 25 } },
  { id: 's3', side: true, name: 'Market Stroll', desc: 'Visit the Market.', type: 'visit', target: 'market', reward: { gold: 10 } },
  { id: 's4', side: true, name: 'Slime Bounty', desc: 'Defeat 20 slimes.', type: 'kill', enemy: 'slime', n: 20, reward: { gold: 50 } },
  { id: 's5', side: true, name: 'Shade Hunt', desc: 'Defeat 10 shades.', type: 'kill', enemy: 'shade', n: 10, reward: { gold: 60 } },
  { id: 's6', side: true, name: 'Crystal Gather', desc: 'Defeat 5 crystal golems.', type: 'kill', enemy: 'golem', n: 5, reward: { gold: 70 } },
  { id: 's7', side: true, name: 'Explorer I', desc: 'Discover 5 regions.', type: 'regions', n: 5, reward: { gold: 40 } },
  { id: 's8', side: true, name: 'Explorer II', desc: 'Discover all 10 regions.', type: 'regions', n: 10, reward: { gold: 100 } },
  { id: 's9', side: true, name: 'Gold Rush', desc: 'Hold 200 gold at once.', type: 'gold', n: 200, reward: { hp: 1 } },
  { id: 's10', side: true, name: 'Artifact Hunter', desc: 'Collect 5 artifacts.', type: 'arts', n: 5, reward: { gold: 80 } },
];

export function createPlayer(cfg = {}) {
  return {
    x: 0, y: 8, z: 8,
    vx: 0, vy: 0, vz: 0,
    yaw: 0, pitch: -0.15,
    hp: 6, maxHp: 6,
    gold: 0,
    grounded: false,
    invuln: 0,
    attackCd: 0,
    attackT: 0,
    name: cfg.playerName || 'Player',
    color: cfg.playerColor || '#5a9e6f',
    artifacts: [],
    inventory: { flower: 0 },
    kills: { slime: 0, shade: 0, golem: 0, boss: 0 },
    visited: new Set(['haven']),
    visitedPois: new Set(),
    questsDone: new Set(),
    questProgress: {},
    activeQuest: 'm1',
    timePlayed: 0,
    difficulty: cfg.difficulty || 'normal',
  };
}

export class EntitySystem {
  constructor(world, seed = 1) {
    this.world = world;
    this.rng = mulberry32(seed + 777);
    this.mobs = [];
    this.npcs = [];
    this.pickups = [];
    this.spawnNpcs();
    this.spawnWave();
  }

  spawnNpcs() {
    this.npcs = [
      { id: 'elder', name: 'Elder Mira', x: -3.5, z: 4.5, tile: 4, lines: [
        'Child of the island… the light dims.',
        'Seek the Shrine south of Haven. The Sunstone waits.',
        'Seventy paths wind through this land. Walk them well.',
      ]},
      { id: 'merchant', name: 'Trader Bol', x: 5.5, z: 10.5, tile: 4, lines: [
        'Gold for flowers, steel for courage!',
        'Bring me blooms from the meadow and I will fill your purse.',
      ]},
      { id: 'hunter', name: 'Hunter Kael', x: -28, z: -18, tile: 4, lines: [
        'The woods whisper of shades after dusk.',
        'Strike true — F or left-click. Jump with Space.',
      ]},
      { id: 'farmer', name: 'Farmer Sue', x: 22, z: -6, tile: 4, lines: [
        'Crops grow slow, but the meadow flowers fast.',
        'Take what you need. Leave the bees.',
      ]},
    ];
    for (const n of this.npcs) {
      n.y = this.world.groundY(n.x, n.z);
      n.phase = this.rng() * Math.PI * 2;
    }
  }

  spawnWave() {
    // keep ~25 mobs alive
    const want = 28;
    while (this.mobs.length < want) this.spawnMob();
  }

  spawnMob(forceType, near) {
    const rng = this.rng;
    let x, z;
    if (near) {
      const a = rng() * Math.PI * 2;
      const r = 12 + rng() * 20;
      x = near.x + Math.cos(a) * r;
      z = near.z + Math.sin(a) * r;
    } else {
      const a = rng() * Math.PI * 2;
      const r = 18 + rng() * 70;
      x = Math.cos(a) * r;
      z = Math.sin(a) * r;
    }
    if (Math.hypot(x, z) > 90) return;
    const y = this.world.groundY(x, z);
    if (y <= WATER_Y) return;

    let type = forceType;
    if (!type) {
      const roll = rng();
      if (Math.hypot(x - 55, z + 35) < 18 || Math.hypot(x + 20, z - 50) < 14) type = 'golem';
      else if (roll < 0.55) type = 'slime';
      else if (roll < 0.85) type = 'shade';
      else type = 'golem';
    }

    // bosses placed once near POIs
    const def = {
      slime: { hp: 3, dmg: 1, spd: 3.2, tile: 1, scale: 0.7, gold: [1, 3] },
      shade: { hp: 5, dmg: 1, spd: 4.0, tile: 2, scale: 0.9, gold: [2, 5] },
      golem: { hp: 10, dmg: 2, spd: 2.2, tile: 3, scale: 1.2, gold: [4, 8] },
      shadow: { hp: 40, dmg: 2, spd: 3.5, tile: 5, scale: 2.0, gold: [40, 60], boss: true, name: 'Shadow Lord' },
      frost: { hp: 50, dmg: 2, spd: 3.2, tile: 5, scale: 2.2, gold: [50, 70], boss: true, name: 'Ice Tyrant' },
      hollow: { hp: 70, dmg: 3, spd: 3.8, tile: 5, scale: 2.4, gold: [80, 100], boss: true, name: 'Hollow King' },
    }[type];

    this.mobs.push({
      type, ...def,
      x, y, z, vx: 0, vz: 0,
      hp: def.hp, maxHp: def.hp,
      cd: 0, hurt: 0, alive: true,
      phase: rng() * 10,
    });
  }

  ensureBosses(player) {
    const bosses = [
      { type: 'shadow', poi: 'boss1', need: 'm13' },
      { type: 'frost', poi: 'boss2', need: 'm15' },
      { type: 'hollow', poi: 'boss3', need: 'm17' },
    ];
    for (const b of bosses) {
      if (player.questsDone.has(b.need.replace('m', 'm'))) { /* still allow */ }
      if (this.mobs.some(m => m.type === b.type && m.alive)) continue;
      // only spawn if player is near or quest active
      const pois = { boss1: [48, -40], boss2: [-52, -42], boss3: [8, 58] };
      const [bx, bz] = pois[b.poi];
      if (dist2(player.x, player.z, bx, bz) < 40) {
        if (!this.mobs.some(m => m.type === b.type)) {
          const y = this.world.groundY(bx, bz);
          const defMap = {
            shadow: { hp: 40, dmg: 2, spd: 3.5, tile: 5, scale: 2.0, gold: [40, 60], boss: true, name: 'Shadow Lord' },
            frost: { hp: 50, dmg: 2, spd: 3.2, tile: 5, scale: 2.2, gold: [50, 70], boss: true, name: 'Ice Tyrant' },
            hollow: { hp: 70, dmg: 3, spd: 3.8, tile: 5, scale: 2.4, gold: [80, 100], boss: true, name: 'Hollow King' },
          };
          const def = defMap[b.type];
          this.mobs.push({
            type: b.type, ...def,
            x: bx, y, z: bz, vx: 0, vz: 0,
            hp: def.hp, maxHp: def.hp,
            cd: 0, hurt: 0, alive: true, phase: 0,
          });
        }
      }
    }
  }

  update(dt, player, onKill, onHitPlayer) {
    this.ensureBosses(player);
    // mobs AI
    for (const m of this.mobs) {
      if (!m.alive) continue;
      m.phase += dt;
      m.hurt = Math.max(0, m.hurt - dt);
      m.cd = Math.max(0, m.cd - dt);
      const d = dist2(m.x, m.z, player.x, player.z);
      const aggro = m.boss ? 28 : 14;
      if (d < aggro && d > 0.01) {
        const ang = Math.atan2(player.x - m.x, player.z - m.z);
        m.vx = Math.sin(ang) * m.spd;
        m.vz = Math.cos(ang) * m.spd;
      } else {
        // wander
        m.vx = Math.sin(m.phase * 0.7) * m.spd * 0.3;
        m.vz = Math.cos(m.phase * 0.5) * m.spd * 0.3;
      }
      // move with simple collision
      let nx = m.x + m.vx * dt;
      let nz = m.z + m.vz * dt;
      if (!this.world.collide(nx, m.y, m.z, 0.3, m.scale)) m.x = nx;
      if (!this.world.collide(m.x, m.y, nz, 0.3, m.scale)) m.z = nz;
      m.y = this.world.groundY(m.x, m.z);

      // contact damage
      if (d < 0.9 * m.scale + 0.4 && m.cd <= 0 && player.invuln <= 0) {
        m.cd = m.boss ? 1.1 : 0.8;
        onHitPlayer(m.dmg, m);
      }
    }
    // remove dead mobs, keep bosses listed only while alive
    this.mobs = this.mobs.filter(m => m.alive);
    this.spawnWave();

    // pickups
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const p = this.pickups[i];
      p.t += dt;
      p.y = this.world.groundY(p.x, p.z) + 0.4 + Math.sin(p.t * 3) * 0.1;
      if (dist3(p.x, p.y, p.z, player.x, player.y + 0.8, player.z) < 1.2) {
        this.pickups.splice(i, 1);
        if (p.kind === 'gold') player.gold += p.n;
        if (p.kind === 'flower') player.inventory.flower = (player.inventory.flower || 0) + 1;
        if (p.kind === 'heart' && player.hp < player.maxHp) player.hp++;
        if (p.onPick) p.onPick();
      }
    }

    // bob npcs
    for (const n of this.npcs) {
      n.phase += dt;
      n.y = this.world.groundY(n.x, n.z);
    }
  }

  hurtMob(m, dmg) {
    if (!m.alive) return false;
    m.hp -= dmg;
    m.hurt = 0.25;
    if (m.hp <= 0) {
      m.alive = false;
      return true;
    }
    return false;
  }

  dropFrom(m) {
    const [g0, g1] = m.gold || [1, 2];
    const n = (g0 + Math.random() * (g1 - g0 + 1)) | 0;
    this.pickups.push({
      kind: 'gold', n, x: m.x, y: m.y + 0.5, z: m.z, t: 0, tile: 6,
    });
    if (Math.random() < 0.2) {
      this.pickups.push({ kind: 'heart', n: 1, x: m.x + 0.3, y: m.y, z: m.z, t: 0, tile: 7 });
    }
  }

  nearestNpc(px, pz, r = 2.5) {
    let best = null, bd = r;
    for (const n of this.npcs) {
      const d = dist2(px, pz, n.x, n.z);
      if (d < bd) { bd = d; best = n; }
    }
    return best;
  }

  attackHits(player, range = 2.2) {
    const hits = [];
    const fx = Math.sin(player.yaw);
    const fz = Math.cos(player.yaw);
    for (const m of this.mobs) {
      if (!m.alive) continue;
      const dx = m.x - player.x, dz = m.z - player.z;
      const d = Math.hypot(dx, dz);
      if (d > range + m.scale * 0.4) continue;
      const dot = (dx * fx + dz * fz) / (d || 1);
      if (dot > 0.25 || d < 1.1) hits.push(m);
    }
    return hits;
  }
}

export function questStatus(player, q) {
  if (player.questsDone.has(q.id)) return 'done';
  // main gated by previous chapter quests roughly by list order for mainline
  if (!q.side) {
    const mains = QUESTS.filter(x => !x.side);
    const idx = mains.findIndex(x => x.id === q.id);
    if (idx > 0 && !player.questsDone.has(mains[idx - 1].id)) return 'locked';
  }
  if (q.needArt && !player.artifacts.includes(q.needArt)) return 'locked';
  return 'active';
}

export function updateQuestProgress(player, ents) {
  const q = QUESTS.find(x => x.id === player.activeQuest) || QUESTS.find(x => questStatus(player, x) === 'active');
  // auto-track first incomplete main
  if (!player.activeQuest || player.questsDone.has(player.activeQuest)) {
    const next = QUESTS.find(x => !x.side && questStatus(player, x) === 'active');
    if (next) player.activeQuest = next.id;
  }
}

export function tryCompleteQuests(player) {
  const gained = [];
  for (const q of QUESTS) {
    if (player.questsDone.has(q.id)) continue;
    if (questStatus(player, q) === 'locked') continue;
    let ok = false;
    if (q.type === 'talk' && player.visitedPois.has(q.target)) ok = true;
    if (q.type === 'visit' && player.visitedPois.has(q.target)) ok = true;
    if (q.type === 'collect' && (player.inventory[q.item] || 0) >= q.n) ok = true;
    if (q.type === 'kill' && (player.kills[q.enemy] || 0) >= q.n) ok = true;
    if (q.type === 'boss' && (player.kills.bossTypes || {})[q.boss]) ok = true;
    if (q.type === 'regions' && player.visited.size >= q.n) ok = true;
    if (q.type === 'gold' && player.gold >= q.n) ok = true;
    if (q.type === 'arts' && player.artifacts.length >= q.n) ok = true;
    if (ok) {
      player.questsDone.add(q.id);
      if (q.reward?.gold) player.gold += q.reward.gold;
      if (q.reward?.hp) { player.maxHp += q.reward.hp; player.hp = player.maxHp; }
      if (q.reward?.art && !player.artifacts.includes(q.reward.art)) {
        player.artifacts.push(q.reward.art);
      }
      gained.push(q);
    }
  }
  return gained;
}

export function progressText(player, q) {
  if (!q) return '';
  if (q.type === 'collect') return `${player.inventory[q.item] || 0}/${q.n}`;
  if (q.type === 'kill') return `${player.kills[q.enemy] || 0}/${q.n}`;
  if (q.type === 'regions') return `${player.visited.size}/${q.n}`;
  if (q.type === 'arts') return `${player.artifacts.length}/${q.n}`;
  if (q.type === 'gold') return `${player.gold}/${q.n}`;
  if (q.type === 'visit' || q.type === 'talk') return player.visitedPois.has(q.target) ? '1/1' : '0/1';
  if (q.type === 'boss') return (player.kills.bossTypes || {})[q.boss] ? '1/1' : '0/1';
  return '';
}
