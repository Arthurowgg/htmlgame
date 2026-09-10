const KEY = 'gpg.save.v2';
const CFG_KEY = 'gpg.game.cfg';

export function loadCfg() {
  try {
    return Object.assign({ sfx: 0.7, music: 0.35, scale: 2 }, JSON.parse(localStorage.getItem(CFG_KEY) || '{}'));
  } catch { return { sfx: 0.7, music: 0.35, scale: 2 }; }
}
export function saveCfg(cfg) {
  try { localStorage.setItem(CFG_KEY, JSON.stringify(cfg)); } catch {}
}

export function serializePlayer(p) {
  return {
    x: p.x, y: p.y, z: p.z, yaw: p.yaw, pitch: p.pitch,
    hp: p.hp, maxHp: p.maxHp, gold: p.gold,
    name: p.name, color: p.color,
    artifacts: p.artifacts,
    inventory: p.inventory,
    kills: p.kills,
    visited: [...p.visited],
    visitedPois: [...p.visitedPois],
    questsDone: [...p.questsDone],
    questProgress: p.questProgress,
    activeQuest: p.activeQuest,
    timePlayed: p.timePlayed,
    difficulty: p.difficulty,
  };
}

export function applySave(p, data) {
  if (!data) return p;
  Object.assign(p, {
    x: data.x ?? p.x, y: data.y ?? p.y, z: data.z ?? p.z,
    yaw: data.yaw ?? 0, pitch: data.pitch ?? -0.15,
    hp: data.hp ?? p.hp, maxHp: data.maxHp ?? p.maxHp, gold: data.gold ?? 0,
    name: data.name ?? p.name, color: data.color ?? p.color,
    artifacts: data.artifacts || [],
    inventory: data.inventory || { flower: 0 },
    kills: data.kills || { slime: 0, shade: 0, golem: 0, boss: 0 },
    activeQuest: data.activeQuest || 'm1',
    timePlayed: data.timePlayed || 0,
    difficulty: data.difficulty || 'normal',
    questProgress: data.questProgress || {},
  });
  p.visited = new Set(data.visited || ['haven']);
  p.visitedPois = new Set(data.visitedPois || []);
  p.questsDone = new Set(data.questsDone || []);
  if (!p.kills.bossTypes) p.kills.bossTypes = {};
  return p;
}

export function saveGame(player) {
  try {
    localStorage.setItem(KEY, JSON.stringify({
      v: 2, at: Date.now(), player: serializePlayer(player),
    }));
    return true;
  } catch { return false; }
}

export function loadGame() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || !data.player) return null;
    return data;
  } catch { return null; }
}

export function clearGame() {
  try { localStorage.removeItem(KEY); } catch {}
}

export function hasSave() {
  return !!loadGame();
}
