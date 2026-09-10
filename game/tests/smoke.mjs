// Teste de fumaça do Grand Pixel Game: abre o jogo num DOM de verdade (jsdom),
// simula WebGL/áudio, joga alguns passos e confere o que a versão promete.
//
//   cd game && npm install --no-save jsdom && node tests/smoke.mjs
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM, VirtualConsole } from 'jsdom';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

let fails = 0, passes = 0;
const errors = [];
function check(what, ok, info = '') {
  if (ok) { passes++; console.log('  ok   ' + what); }
  else { fails++; console.log('  FALHA ' + what + (info ? '  ->  ' + info : '')); }
}

// ---------------------------------------------------------------- ambiente --
const glStub = new Proxy({}, {
  get(_, k) {
    if (k === 'getParameter') return () => 4096;
    if (k === 'getExtension') return () => null;
    if (k === 'getShaderParameter' || k === 'getProgramParameter') return () => true;
    if (k === 'getShaderInfoLog' || k === 'getProgramInfoLog') return () => '';
    if (k === 'createShader' || k === 'createProgram' || k === 'createBuffer' ||
        k === 'createTexture' || k === 'createFramebuffer' || k === 'createRenderbuffer') return () => ({});
    if (k === 'getUniformLocation' || k === 'getAttribLocation') return () => 0;
    if (typeof k === 'string' && k.startsWith('GL_')) return 1;
    return () => undefined;
  },
});

const html = readFileSync(resolve(root, 'index.html'), 'utf8');
const vc = new VirtualConsole();
vc.on('jsdomError', e => errors.push(String(e.message || e)));
vc.on('error', (...a) => errors.push(a.join(' ')));
const dom = new JSDOM(html, {
  runScripts: 'outside-only',
  pretendToBeVisual: true,
  virtualConsole: vc,
  url: 'http://127.0.0.1:8137/',
});
const { window } = dom;
window.HTMLCanvasElement.prototype.getContext = function (kind) {
  if (kind === 'webgl2' || kind === 'webgl' || kind === 'experimental-webgl') return glStub;
  return new Proxy({}, {
    get(_, k) {
      if (k === 'canvas') return this;
      if (k === 'measureText') return () => ({ width: 40 });
      if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop() {} });
      if (k === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) });
      return () => undefined;
    },
    set() { return true; },
  });
};
window.AudioContext = window.webkitAudioContext = class {
  constructor() { this.currentTime = 0; this.destination = {}; this.sampleRate = 44100; }
  createGain() {
    const param = { value: 0, setValueAtTime() {}, linearRampToValueAtTime() {},
                    exponentialRampToValueAtTime() {}, cancelScheduledValues() {} };
    return { gain: param, connect() {}, disconnect() {} };
  }
  createOscillator() {
    const param = { value: 0, setValueAtTime() {}, linearRampToValueAtTime() {},
                    exponentialRampToValueAtTime() {}, cancelScheduledValues() {} };
    return { type: '', frequency: param, detune: param, connect() {}, start() {}, stop() {},
             disconnect() {}, onended: null };
  }
  createBufferSource() { return { buffer: null, connect() {}, start() {}, stop() {}, disconnect() {} }; }
  createBiquadFilter() {
    const param = { value: 0, setValueAtTime() {}, linearRampToValueAtTime() {},
                    exponentialRampToValueAtTime() {} };
    return { type: '', frequency: param, Q: param, gain: param, connect() {}, disconnect() {} };
  }
  createBuffer(a, b) { return { getChannelData: () => new Float32Array(b) }; }
  createStereoPanner() { return { pan: { value: 0 }, connect() {}, disconnect() {} }; }
  resume() { return Promise.resolve(); }
};
let rafQueue = [];
window.requestAnimationFrame = cb => { rafQueue.push(cb); return rafQueue.length; };

// executa o jogo como módulo (os imports precisam resolver para os arquivos reais)
const files = ['js/math.js', 'js/audio.js', 'js/world.js', 'js/font.js', 'js/renderer.js', 'js/quests.js', 'js/main.js'];
const sources = {};
for (const f of files) sources[f] = readFileSync(resolve(root, f), 'utf8');
const moduleCache = {};

// Converte um módulo ES em código comum: resolve os imports relativos pelos
// módulos já carregados e troca "export" por uma tabela de nomes exportados.
function instantiate(name) {
  if (moduleCache[name]) return moduleCache[name];
  const src = sources[name];
  const imported = [];
  let body = src.replace(/import\s*{([^}]*)}\s*from\s*'\.\/([a-z]+)\.js';?/g, (m, names, dep) => {
    const depName = 'js/' + dep + '.js';
    instantiate(depName);
    // "X as Y" vira "X: Y" (renomeação do destructuring)
    const importAs = names.split(',').map(part => {
      const bits = part.trim().split(/\s+as\s+/);
      return bits.length > 1 ? `${bits[0]}: ${bits[1]}` : bits[0];
    }).filter(Boolean).join(', ');
    imported.push({ names: names.trim(), dep: depName, importAs });
    return '';
  });

  // nomes exportados
  const exported = [];
  body = body.replace(/export\s+(const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/g, (m, kind, id) => {
    exported.push([id, id]);
    return kind + ' ' + id;
  });
  body = body.replace(/export\s*{([^}]*)}\s*;?/g, (m, list) => {
    for (const part of list.split(',')) {
      const bits = part.trim().split(/\s+as\s+/);
      if (!bits[0]) continue;
      exported.push([bits[1] || bits[0], bits[0]]);
    }
    return '';
  });

  const deps = imported.map(i => `const { ${i.importAs} } = __mods['${i.dep}'];`).join('\n');
  const table = exported.map(([out, local]) => `${JSON.stringify(out)}: ${local}`).join(', ');
  const code = deps + '\n' + body + `\n;__mods[${JSON.stringify(name)}] = { ${table} };`;
  moduleCache[name] = {};
  try {
    const factory = new window.Function('__mods', 'window', 'document', 'localStorage',
      'performance', 'requestAnimationFrame', code);
    factory(moduleCache, window, window.document, window.localStorage, window.performance,
            window.requestAnimationFrame);
  } catch (e) {
    delete moduleCache[name];
    throw e;
  }
  return moduleCache[name];
}

console.log('== Grand Pixel Game — teste de fumaça ==');
try {
  instantiate('js/main.js');
} catch (e) {
  console.log('  FALHA ao carregar o jogo: ' + e.message);
  console.log(e.stack.split('\n').slice(0, 4).join('\n'));
  process.exit(1);
}
check('o jogo carrega sem estourar', true);
check('sem erros de script', errors.length === 0, errors.slice(0, 2).join(' | '));

const g = window.__solaria;
check('API interna exposta', !!g);
if (g) {
  check('versão 1.1.0', g.VERSION === '1.1.0', g.VERSION);
  check('tela inicial', g.phase === 'title', g.phase);
  check('elemento de versão no menu', window.document.getElementById('ver').textContent === 'v1.1.0',
        window.document.getElementById('ver').textContent);
  check('70 missões carregadas', g.stateM.length + g.side.length === 70,
        String(g.stateM.length + g.side.length));

  // anda alguns quadros do laço principal
  const step = (n = 30) => {
    for (let i = 0; i < n; i++) {
      const q = rafQueue; rafQueue = [];
      for (const cb of q) cb(window.performance.now() + i * 16);
    }
  };
  g.continueGame ? g.continueGame() : (window.document.getElementById('t-continue').click());
  step(20);
  check('entrou no jogo', g.phase === 'play', g.phase);

  // registro de jornada
  const snap = g.statsSnapshot();
  check('registro com totais certos', snap.capsTotal === 11 && snap.sidesTotal === 59 &&
        snap.artsTotal === 10, JSON.stringify({ c: snap.capsTotal, s: snap.sidesTotal, a: snap.artsTotal }));
  check('conquistas listadas', snap.medalsTotal === 9 && snap.medals.length === 9);
  check('nenhuma conquista de graça', snap.earned === 0, String(snap.earned));

  // a missão inicial está ativa e o tempo corre
  const t0 = g.playTime;
  step(40);
  check('tempo de jogo acumula', g.playTime > t0, `${t0} -> ${g.playTime}`);

  // conquista por visitar pontos e coletar
  for (const p of Object.keys(g.colN)) g.colN[p] = 0;
  check('conquista de itens', (() => {
    Object.keys(g.colN).forEach(k => { g.colN[k] = 0; });
    g.colN.crystal = 120;   // itens coletados
    return !!g.checkMedals(true) || g.medals().includes('colecao');
  })(), g.medals().join(','));
  check('conquista guardada', g.medals().includes('colecao'), g.medals().join(','));

  // abrir e voltar do registro
  g.openStats();
  step(2);
  check('tela de registro abre', g.phase === 'stats', g.phase);
  const body = window.document.getElementById('stats-body').innerHTML;
  check('registro desenha as conquistas', body.includes('Colecionador') && body.includes('st-medal'),
        body.slice(0, 80));
  g.closeStats();
  check('volta do registro', g.phase === 'play' || g.phase === 'pause', g.phase);

  // salvar e recarregar
  g.saveGame();
  const saved = JSON.parse(window.localStorage.getItem('grandpixel-save'));
  check('save é v5', saved.v === 5, String(saved.v));
  check('save guarda tempo e mortes', typeof saved.play === 'number' && typeof saved.deaths === 'number');
  check('save guarda conquistas', Array.isArray(saved.medals) && saved.medals.includes('colecao'));
  check('save antigo (v4) continua legível', (() => {
    const old = Object.assign({}, saved, { v: 4 });
    delete old.play; delete old.deaths; delete old.medals;
    window.localStorage.setItem('grandpixel-save', JSON.stringify(old));
    const loaded = g.loadSave();
    g.applySave(loaded);
    return loaded && loaded.v === 4 && g.playTime === 0;
  })());
}

console.log(`\n== ${passes} passaram, ${fails} falharam ==`);
if (errors.length) console.log('erros de console:', errors.slice(0, 3).join(' | '));
process.exit(fails ? 1 : 0);
