/* ============================================================
   Grand Pixel Game Launcher 2.0
   Minecraft-style version picker · install · play
   ============================================================ */

const LAUNCHER_VERSION = '2.0.0';
const DB_NAME = 'gpg-launcher';
const DB_VER = 1;
const STORE = 'installs';
const LS = {
  profile: 'gpg.profile',
  settings: 'gpg.settings',
  stats: 'gpg.stats',
};

const NEWS = [
  {
    date: '2026-09-10',
    title: 'Launcher 2.0 — full rebuild',
    body: 'Brand-new Minecraft-style launcher. Pick a version, install it locally, and play instantly. Old broken releases were retired.',
  },
  {
    date: '2026-09-10',
    title: 'Grand Pixel Game 2.0.0',
    body: 'Completely remade island adventure: smoother voxels, day/night cycle, combat, quests, artifacts, bosses, and a polished HUD.',
  },
  {
    date: '2026-09-10',
    title: 'How installs work',
    body: 'Versions are cached in your browser (IndexedDB). Once installed you can play offline. Uninstall anytime from the Installations tab.',
  },
];

const SWATCHES = [
  '#5a9e6f', '#3d8bfd', '#e8b84a', '#c47a3a',
  '#ff5d6c', '#a78bfa', '#22d3ee', '#f472b6',
  '#94a3b8', '#84cc16',
];

// ---------- state ----------
const state = {
  catalog: [],
  selected: null,
  installs: new Map(), // id -> { id, installedAt, size, files }
  profile: loadJSON(LS.profile, { name: 'Player', color: SWATCHES[0] }),
  settings: loadJSON(LS.settings, {
    anim: true, sound: true, auto: true, lang: 'en', scale: '2', diff: 'normal',
  }),
  stats: loadJSON(LS.stats, { launches: 0, playMinutes: 0, installs: 0 }),
  installing: false,
};

// ---------- utils ----------
function loadJSON(k, fallback) {
  try {
    const v = JSON.parse(localStorage.getItem(k) || 'null');
    return v && typeof v === 'object' ? { ...fallback, ...v } : { ...fallback };
  } catch { return { ...fallback }; }
}
function saveJSON(k, v) {
  try { localStorage.setItem(k, JSON.stringify(v)); } catch {}
}
function $(sel) { return document.querySelector(sel); }
function $$(sel) { return [...document.querySelectorAll(sel)]; }
function fmtBytes(n) {
  if (!n && n !== 0) return '—';
  if (n < 1024) return n + ' B';
  if (n < 1048576) return (n / 1024).toFixed(1) + ' KB';
  return (n / 1048576).toFixed(2) + ' MB';
}
function fmtDate(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  } catch { return iso; }
}
function status(msg) { $('#status-text').textContent = msg; }
function beep(ok = true) {
  if (!state.settings.sound) return;
  try {
    const ac = beep._ac || (beep._ac = new (window.AudioContext || window.webkitAudioContext)());
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = 'square';
    o.frequency.value = ok ? 660 : 220;
    g.gain.value = 0.03;
    o.connect(g); g.connect(ac.destination);
    o.start();
    g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.08);
    o.stop(ac.currentTime + 0.09);
  } catch {}
}

// ---------- IndexedDB ----------
function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function dbGetAll() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}
async function dbPut(record) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
async function dbDelete(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
async function dbClear() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ---------- catalog ----------
async function loadCatalog() {
  status('Fetching version catalog…');
  // Prefer local catalog (always works offline / in preview)
  let local = null;
  try {
    const r = await fetch('versions/catalog.json', { cache: 'no-store' });
    if (r.ok) local = await r.json();
  } catch {}

  // Optionally enrich from GitHub releases (game-v* tags)
  let remote = [];
  try {
    const r = await fetch('https://api.github.com/repos/Arthurowgg/htmlgame/releases?per_page=50', {
      headers: { Accept: 'application/vnd.github+json' },
    });
    if (r.ok) {
      const releases = await r.json();
      remote = releases
        .filter(x => /^game-v/i.test(x.tag_name))
        .map(x => {
          const ver = x.tag_name.replace(/^game-v/i, '');
          const asset = (x.assets || []).find(a => /web\.zip$/i.test(a.name) || /\.zip$/i.test(a.name));
          return {
            id: x.tag_name,
            version: ver,
            name: x.name || `Grand Pixel Game ${ver}`,
            type: x.prerelease ? 'snapshot' : 'release',
            date: x.published_at || x.created_at,
            changelog: (x.body || '').split('\n').filter(Boolean).slice(0, 8),
            path: `versions/${ver}/`,
            zip: asset ? asset.browser_download_url : null,
            size: asset ? asset.size : null,
            latest: false,
            source: 'github',
          };
        });
    }
    $('#online-dot').classList.remove('off');
  } catch {
    $('#online-dot').classList.add('off');
  }

  const byId = new Map();
  if (local && Array.isArray(local.versions)) {
    for (const v of local.versions) byId.set(v.id, { ...v, source: v.source || 'local' });
  }
  // Local catalog wins on path; remote fills gaps / adds new
  for (const v of remote) {
    if (!byId.has(v.id)) byId.set(v.id, v);
    else {
      const cur = byId.get(v.id);
      byId.set(v.id, { ...cur, zip: v.zip || cur.zip, size: v.size || cur.size, date: v.date || cur.date });
    }
  }

  let list = [...byId.values()];
  list.sort((a, b) => {
    // semver-ish
    const pa = a.version.split('.').map(Number);
    const pb = b.version.split('.').map(Number);
    for (let i = 0; i < 3; i++) {
      const d = (pb[i] || 0) - (pa[i] || 0);
      if (d) return d;
    }
    return 0;
  });
  if (list.length) {
    const latestRel = list.find(v => v.type === 'release') || list[0];
    list = list.map(v => ({ ...v, latest: v.id === latestRel.id }));
  }
  state.catalog = list;
  status(list.length ? `Catalog ready · ${list.length} version(s)` : 'No versions found');
  return list;
}

// ---------- install / play ----------
async function refreshInstalls() {
  const rows = await dbGetAll();
  state.installs.clear();
  for (const r of rows) state.installs.set(r.id, r);
}

function isInstalled(id) { return state.installs.has(id); }

async function fetchText(url) {
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
  return r.text();
}
async function fetchBuf(url) {
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
  return r.arrayBuffer();
}

/** Install a version by fetching its file manifest and caching blobs in IDB */
async function installVersion(entry, { force = false } = {}) {
  if (state.installing) return;
  if (isInstalled(entry.id) && !force) {
    status(`${entry.version} already installed`);
    return;
  }
  state.installing = true;
  showProgress(true);
  setProgress(0, `Installing ${entry.version}…`, 'Reading manifest');
  $('#btn-install').disabled = true;
  $('#btn-play').disabled = true;

  try {
    const base = entry.path.endsWith('/') ? entry.path : entry.path + '/';
    // Manifest lists relative paths to cache
    let manifest;
    try {
      const txt = await fetchText(base + 'manifest.json');
      manifest = JSON.parse(txt);
    } catch {
      // Fallback: known file set for bundled versions
      manifest = {
        version: entry.version,
        files: [
          'index.html',
          'css/style.css',
          'js/main.js', 'js/math.js', 'js/world.js', 'js/renderer.js',
          'js/audio.js', 'js/entities.js', 'js/ui.js', 'js/input.js', 'js/save.js',
        ],
      };
    }

    const files = {};
    const list = manifest.files || [];
    let done = 0;
    let totalSize = 0;

    for (const rel of list) {
      setProgress((done / Math.max(list.length, 1)) * 90, `Installing ${entry.version}…`, rel);
      const url = base + rel;
      const buf = await fetchBuf(url);
      // Store as base64 to keep IDB simple & structured-clone friendly
      const b64 = arrayBufferToBase64(buf);
      const mime = mimeOf(rel);
      files[rel] = { b64, mime, size: buf.byteLength };
      totalSize += buf.byteLength;
      done++;
      // yield to UI
      await new Promise(r => setTimeout(r, 0));
    }

    setProgress(95, `Installing ${entry.version}…`, 'Writing to library…');
    const record = {
      id: entry.id,
      version: entry.version,
      name: entry.name,
      installedAt: new Date().toISOString(),
      size: totalSize,
      files,
      entry: manifest.entry || 'index.html',
    };
    await dbPut(record);
    state.installs.set(entry.id, record);
    state.stats.installs = (state.stats.installs || 0) + 1;
    saveJSON(LS.stats, state.stats);

    setProgress(100, 'Installed', entry.version);
    beep(true);
    status(`Installed ${entry.version} (${fmtBytes(totalSize)})`);
    await new Promise(r => setTimeout(r, 400));
  } catch (err) {
    console.error(err);
    beep(false);
    status('Install failed: ' + (err.message || err));
    alert('Install failed:\n' + (err.message || err));
  } finally {
    state.installing = false;
    showProgress(false);
    renderAll();
  }
}

async function uninstallVersion(id) {
  await dbDelete(id);
  state.installs.delete(id);
  status(`Uninstalled ${id}`);
  beep(true);
  renderAll();
}

function arrayBufferToBase64(buf) {
  const bytes = new Uint8Array(buf);
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}
function base64ToBlob(b64, mime) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime || 'application/octet-stream' });
}
function mimeOf(path) {
  if (path.endsWith('.html')) return 'text/html; charset=utf-8';
  if (path.endsWith('.css')) return 'text/css; charset=utf-8';
  if (path.endsWith('.js')) return 'text/javascript; charset=utf-8';
  if (path.endsWith('.json')) return 'application/json';
  if (path.endsWith('.png')) return 'image/png';
  if (path.endsWith('.svg')) return 'image/svg+xml';
  if (path.endsWith('.woff2')) return 'font/woff2';
  return 'application/octet-stream';
}

function launcherBridgeCfg(entry) {
  return {
    playerName: state.profile.name,
    playerColor: state.profile.color,
    scale: Number(state.settings.scale) || 2,
    difficulty: state.settings.diff || 'normal',
    version: entry.version,
    launcher: LAUNCHER_VERSION,
  };
}

/** Launch game — prefer same-origin path (reliable); fall back to IDB blob pack */
async function playVersion(entry) {
  if (!isInstalled(entry.id)) {
    await installVersion(entry);
    if (!isInstalled(entry.id)) return;
  }

  status(`Launching ${entry.version}…`);
  const frame = $('#game-frame');
  if (frame._gpgUrls) {
    frame._gpgUrls.forEach(u => URL.revokeObjectURL(u));
    frame._gpgUrls = null;
  }

  const cfg = launcherBridgeCfg(entry);
  const cfgQ = encodeURIComponent(JSON.stringify(cfg));

  // Fast path: play from hosted version folder (best ES-module support)
  if (entry.path) {
    const base = entry.path.endsWith('/') ? entry.path : entry.path + '/';
    try {
      const head = await fetch(base + 'index.html', { method: 'GET', cache: 'no-store' });
      if (head.ok) {
        frame.src = base + 'index.html?gpg=' + cfgQ;
        openGameChrome(entry);
        return;
      }
    } catch { /* fall through to blob pack */ }
  }

  // Offline / cached path: rebuild from IndexedDB blobs
  await playFromInstall(entry, cfg);
}

function openGameChrome(entry) {
  $('#game-title').textContent = `Grand Pixel Game ${entry.version}`;
  $('#game-overlay').classList.remove('hidden');
  state.stats.launches = (state.stats.launches || 0) + 1;
  saveJSON(LS.stats, state.stats);
  renderProfileStats();
  beep(true);
  status(`Playing ${entry.version}`);
}

async function playFromInstall(entry, cfg) {
  const rec = state.installs.get(entry.id);
  if (!rec) throw new Error('Version not installed');

  const urlMap = {};
  for (const [rel, meta] of Object.entries(rec.files)) {
    urlMap[rel] = URL.createObjectURL(base64ToBlob(meta.b64, meta.mime));
  }

  const rewrittenJs = {};
  for (const [rel, meta] of Object.entries(rec.files)) {
    if (!rel.endsWith('.js')) continue;
    let code = new TextDecoder().decode(Uint8Array.from(atob(meta.b64), c => c.charCodeAt(0)));
    const dir = rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/') + 1) : '';
    code = code.replace(/(from\s+['"])(\.?\.?\/[^'"]+)(['"])/g, (m, a, spec, b) => {
      let resolved = spec;
      if (spec.startsWith('./')) resolved = dir + spec.slice(2);
      else if (spec.startsWith('../')) {
        const parts = dir.split('/').filter(Boolean);
        const sp = spec.split('/');
        for (const s of sp) {
          if (s === '..') parts.pop();
          else if (s !== '.') parts.push(s);
        }
        resolved = parts.join('/');
      } else if (spec.startsWith('/')) resolved = spec.slice(1);
      if (urlMap[resolved]) return a + urlMap[resolved] + b;
      return m;
    });
    if (rel.endsWith('main.js') || rel === 'js/main.js') {
      code = `window.__GPG__=${JSON.stringify(cfg)};\n` + code;
    }
    rewrittenJs[rel] = URL.createObjectURL(new Blob([code], { type: 'text/javascript;charset=utf-8' }));
  }

  const htmlRel = rec.entry || 'index.html';
  let html = new TextDecoder().decode(Uint8Array.from(atob(rec.files[htmlRel].b64), c => c.charCodeAt(0)));

  html = html.replace(/(?:src|href)=["']([^"']+)["']/g, (m, path) => {
    const clean = path.replace(/^\.\//, '');
    const attr = m.startsWith('src') ? 'src' : 'href';
    if (rewrittenJs[clean]) return `${attr}="${rewrittenJs[clean]}"`;
    if (urlMap[clean]) return `${attr}="${urlMap[clean]}"`;
    return m;
  });

  // inject config early in case main rewrite missed
  html = html.replace('<head>', `<head><script>window.__GPG__=${JSON.stringify(cfg)}</script>`);

  const pageUrl = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
  const frame = $('#game-frame');
  frame._gpgUrls = [pageUrl, ...Object.values(urlMap), ...Object.values(rewrittenJs)];
  frame.src = pageUrl;
  openGameChrome(entry);
}

function closeGame() {
  const frame = $('#game-frame');
  frame.src = 'about:blank';
  if (frame._gpgUrls) {
    frame._gpgUrls.forEach(u => URL.revokeObjectURL(u));
    frame._gpgUrls = null;
  }
  $('#game-overlay').classList.add('hidden');
  status('Ready');
}

// ---------- UI render ----------
function showProgress(on) {
  $('#install-progress').classList.toggle('hidden', !on);
}
function setProgress(pct, label, detail) {
  $('#prog-fill').style.width = Math.max(0, Math.min(100, pct)) + '%';
  $('#prog-pct').textContent = Math.round(pct) + '%';
  if (label) $('#prog-label').textContent = label;
  if (detail != null) $('#prog-detail').textContent = detail;
}

function renderNews() {
  $('#news-list').innerHTML = NEWS.map(n => `
    <article class="news-item">
      <div class="date">${fmtDate(n.date)}</div>
      <div class="title">${esc(n.title)}</div>
      <div class="body">${esc(n.body)}</div>
    </article>
  `).join('');
}

function renderSelect() {
  const sel = $('#version-select');
  const cur = state.selected;
  sel.innerHTML = state.catalog.map(v => {
    const mark = isInstalled(v.id) ? ' ★' : '';
    const latest = v.latest ? ' (latest)' : '';
    return `<option value="${esc(v.id)}" ${cur && cur.id === v.id ? 'selected' : ''}>${esc(v.version)} — ${esc(v.type)}${latest}${mark}</option>`;
  }).join('') || '<option value="">No versions</option>';

  if (!state.catalog.length) {
    state.selected = null;
  } else if (!state.selected || !state.catalog.find(v => v.id === state.selected.id)) {
    state.selected = state.settings.auto
      ? (state.catalog.find(v => v.latest) || state.catalog[0])
      : state.catalog[0];
    sel.value = state.selected.id;
  }
  renderSelectedMeta();
}

function renderSelectedMeta() {
  const v = state.selected;
  const meta = $('#select-meta');
  const tags = $('#version-tags');
  const info = $('#quick-info');
  const btnPlay = $('#btn-play');
  const btnInst = $('#btn-install');
  const btnUn = $('#btn-uninstall');

  if (!v) {
    meta.textContent = 'No version selected';
    tags.innerHTML = '';
    info.textContent = '';
    btnPlay.disabled = true;
    btnInst.disabled = true;
    btnUn.classList.add('hidden');
    $('#btn-play-label').textContent = 'PLAY';
    $('#btn-play-sub').textContent = 'Select a version';
    return;
  }

  const installed = isInstalled(v.id);
  const rec = state.installs.get(v.id);
  meta.textContent = `${v.name || 'Grand Pixel Game'} · released ${fmtDate(v.date)}${v.size ? ' · ' + fmtBytes(v.size) : ''}${installed && rec ? ' · installed ' + fmtBytes(rec.size) : ''}`;

  tags.innerHTML = [
    `<span class="tag ${v.type}">${v.type}</span>`,
    v.latest ? `<span class="tag latest">latest</span>` : '',
    installed ? `<span class="tag installed">installed</span>` : `<span class="tag">not installed</span>`,
  ].filter(Boolean).join('');

  const notes = (v.changelog || []).slice(0, 4).map(l => `• ${esc(l.replace(/^[-*]\s*/, ''))}`).join('<br>');
  info.innerHTML = notes || `<span class="muted">Version ${esc(v.version)} ready to ${installed ? 'play' : 'install'}.</span>`;

  btnPlay.disabled = state.installing;
  btnInst.disabled = state.installing || installed;
  btnUn.classList.toggle('hidden', !installed);

  if (installed) {
    $('#btn-play-label').textContent = 'PLAY';
    $('#btn-play-sub').textContent = `Version ${v.version}`;
    btnInst.textContent = 'Installed';
  } else {
    $('#btn-play-label').textContent = 'INSTALL & PLAY';
    $('#btn-play-sub').textContent = `Version ${v.version}`;
    btnInst.textContent = 'Install';
  }
}

function renderStats() {
  $('#stat-versions').textContent = state.catalog.length;
  $('#stat-installed').textContent = state.installs.size;
  let size = 0;
  for (const r of state.installs.values()) size += r.size || 0;
  $('#stat-size').textContent = fmtBytes(size);
}

function renderInstallTable() {
  const body = $('#inst-body');
  if (!state.catalog.length) {
    body.innerHTML = `<tr><td colspan="6" style="color:var(--muted);padding:24px">No versions in catalog.</td></tr>`;
    return;
  }
  body.innerHTML = state.catalog.map(v => {
    const inst = state.installs.get(v.id);
    return `<tr data-id="${esc(v.id)}">
      <td class="ver-cell">${esc(v.version)}${v.latest ? ' <span class="tag latest">latest</span>' : ''}</td>
      <td><span class="tag ${v.type}">${v.type}</span></td>
      <td>${fmtDate(v.date)}</td>
      <td>${inst ? '<span class="status-pill ok">Installed</span>' : '<span class="status-pill no">Not installed</span>'}</td>
      <td>${inst ? fmtBytes(inst.size) : (v.size ? fmtBytes(v.size) : '—')}</td>
      <td><div class="row-actions">
        ${inst
          ? `<button data-act="play">Play</button><button class="danger" data-act="uninstall">Uninstall</button>`
          : `<button data-act="install">Install</button>`}
      </div></td>
    </tr>`;
  }).join('');
}

function renderProfile() {
  $('#username').textContent = state.profile.name || 'Player';
  paintAvatar($('#avatar'), state.profile.color);
  paintAvatar($('#big-avatar'), state.profile.color);
  $('#name-input').value = state.profile.name || '';
  const sw = $('#swatches');
  sw.innerHTML = SWATCHES.map(c =>
    `<button type="button" class="swatch ${c === state.profile.color ? 'active' : ''}" data-color="${c}" style="background:${c}" title="${c}"></button>`
  ).join('');
  renderProfileStats();
}

function renderProfileStats() {
  const s = state.stats;
  $('#local-stats').innerHTML = `
    <div class="stat-row"><span>Launches</span><b>${s.launches || 0}</b></div>
    <div class="stat-row"><span>Versions installed (lifetime)</span><b>${s.installs || 0}</b></div>
    <div class="stat-row"><span>Currently installed</span><b>${state.installs.size}</b></div>
    <div class="stat-row"><span>Player</span><b>${esc(state.profile.name || 'Player')}</b></div>
  `;
}

function paintAvatar(el, color) {
  // tiny pixel face via CSS gradients
  el.style.background = `
    linear-gradient(180deg, ${color} 0 55%, ${shade(color, -30)} 55% 100%)
  `;
  el.style.position = 'relative';
  el.innerHTML = `<span style="
    position:absolute;inset:0;display:block;
    background:
      linear-gradient(#1a1008,#1a1008) 30% 40%/18% 18% no-repeat,
      linear-gradient(#1a1008,#1a1008) 70% 40%/18% 18% no-repeat,
      linear-gradient(#1a1008,#1a1008) 40% 68%/20% 8% no-repeat;
    image-rendering:pixelated;
  "></span>`;
}
function shade(hex, amt) {
  const n = hex.replace('#', '');
  const num = parseInt(n.length === 3 ? n.split('').map(c => c + c).join('') : n, 16);
  let r = (num >> 16) + amt, g = ((num >> 8) & 0xff) + amt, b = (num & 0xff) + amt;
  r = Math.max(0, Math.min(255, r)); g = Math.max(0, Math.min(255, g)); b = Math.max(0, Math.min(255, b));
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

function renderSettings() {
  $('#set-anim').checked = !!state.settings.anim;
  $('#set-sound').checked = !!state.settings.sound;
  $('#set-auto').checked = !!state.settings.auto;
  $('#set-lang').value = state.settings.lang || 'en';
  $('#set-scale').value = state.settings.scale || '2';
  $('#set-diff').value = state.settings.diff || 'normal';
  document.body.classList.toggle('no-anim', !state.settings.anim);
  $('#launcher-ver').textContent = LAUNCHER_VERSION;
  $('#bb-ver').textContent = 'launcher ' + LAUNCHER_VERSION;
}

function renderAll() {
  renderSelect();
  renderStats();
  renderInstallTable();
  renderProfile();
  renderSettings();
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}

// ---------- events ----------
function bind() {
  // tabs
  $$('.tab').forEach(t => t.addEventListener('click', () => {
    $$('.tab').forEach(x => x.classList.remove('active'));
    t.classList.add('active');
    $$('.view').forEach(v => v.classList.remove('active'));
    $('#view-' + t.dataset.tab).classList.add('active');
    beep(true);
  }));

  $('#version-select').addEventListener('change', e => {
    state.selected = state.catalog.find(v => v.id === e.target.value) || null;
    renderSelectedMeta();
  });

  $('#btn-play').addEventListener('click', async () => {
    if (!state.selected || state.installing) return;
    const v = state.selected;
    if (!isInstalled(v.id)) await installVersion(v);
    if (isInstalled(v.id)) await playVersion(v);
  });

  $('#btn-install').addEventListener('click', async () => {
    if (!state.selected || state.installing) return;
    await installVersion(state.selected);
  });

  $('#btn-uninstall').addEventListener('click', async () => {
    if (!state.selected || !isInstalled(state.selected.id)) return;
    if (!confirm(`Uninstall ${state.selected.version}?`)) return;
    await uninstallVersion(state.selected.id);
  });

  $('#btn-refresh').addEventListener('click', async () => {
    await loadCatalog();
    renderAll();
    beep(true);
  });

  $('#btn-clear-cache').addEventListener('click', async () => {
    if (!confirm('Remove all installed versions from this browser?')) return;
    await dbClear();
    state.installs.clear();
    status('Library cleared');
    renderAll();
    beep(true);
  });

  $('#inst-body').addEventListener('click', async e => {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const tr = btn.closest('tr');
    const id = tr?.dataset.id;
    const entry = state.catalog.find(v => v.id === id);
    if (!entry) return;
    if (btn.dataset.act === 'install') await installVersion(entry);
    if (btn.dataset.act === 'uninstall') {
      if (confirm(`Uninstall ${entry.version}?`)) await uninstallVersion(id);
    }
    if (btn.dataset.act === 'play') {
      state.selected = entry;
      renderSelect();
      await playVersion(entry);
    }
  });

  $('#swatches').addEventListener('click', e => {
    const b = e.target.closest('.swatch');
    if (!b) return;
    state.profile.color = b.dataset.color;
    renderProfile();
  });

  $('#btn-save-profile').addEventListener('click', () => {
    state.profile.name = ($('#name-input').value || 'Player').trim().slice(0, 16);
    saveJSON(LS.profile, state.profile);
    renderProfile();
    status('Profile saved');
    beep(true);
  });

  $('#btn-save-settings').addEventListener('click', () => {
    state.settings.anim = $('#set-anim').checked;
    state.settings.sound = $('#set-sound').checked;
    state.settings.auto = $('#set-auto').checked;
    state.settings.lang = $('#set-lang').value;
    state.settings.scale = $('#set-scale').value;
    state.settings.diff = $('#set-diff').value;
    saveJSON(LS.settings, state.settings);
    renderSettings();
    status('Settings saved');
    beep(true);
  });

  $('#btn-back').addEventListener('click', closeGame);
  $('#btn-reload-game').addEventListener('click', async () => {
    if (state.selected && isInstalled(state.selected.id)) await playVersion(state.selected);
  });
  $('#btn-fullscreen').addEventListener('click', () => {
    const ov = $('#game-overlay');
    if (!document.fullscreenElement) ov.requestFullscreen?.();
    else document.exitFullscreen?.();
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !$('#game-overlay').classList.contains('hidden')) {
      closeGame();
    }
  });
}

// ---------- boot ----------
async function boot() {
  renderNews();
  renderSettings();
  renderProfile();
  bind();
  try {
    await refreshInstalls();
    await loadCatalog();
  } catch (e) {
    console.error(e);
    status('Boot error: ' + e.message);
  }
  renderAll();
  status('Ready');
}

boot();
