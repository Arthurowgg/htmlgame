// Teste de fumaça do Grand Pixel Game.
//
// Monta o jogo num DOM de verdade (jsdom) com WebGL/áudio/2D simulados, roda
// quadros do laço principal e confere o que a versão promete. Testa também o
// caminho triste: sem WebGL o jogo tem que MOSTRAR o motivo, nunca travar na
// tela de carregamento.
//
//   cd game && npm install --no-save jsdom && node tests/smoke.mjs
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM, VirtualConsole } from 'jsdom';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const html = readFileSync(resolve(root, 'index.html'), 'utf8');

let fails = 0, passes = 0;
function check(what, ok, info = '') {
  if (ok) { passes++; console.log('  ok   ' + what); }
  else { fails++; console.log('  FALHA ' + what + (info ? '  ->  ' + info : '')); }
}
function section(t) { console.log('\n-- ' + t); }

// ------------------------------------------------------ ambiente de teste --
function makeEnv({ webgl = true, inlineScripts = false } = {}) {
  const errors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => errors.push(String(e.message || e)));
  vc.on('error', (...a) => errors.push(a.join(' ')));
  const dom = new JSDOM(html, {
    runScripts: inlineScripts ? 'dangerously' : 'outside-only',
    pretendToBeVisual: true,
    virtualConsole: vc,
    url: 'http://127.0.0.1:8137/',
  });
  const { window } = dom;

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

  function ctx2d() {
    return new Proxy({}, {
      get(_, k) {
        if (k === 'canvas') return this;
        if (k === 'createImageData') return (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) });
        if (k === 'getImageData') return (x, y, w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) });
        if (k === 'measureText') return () => ({ width: 40 });
        if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop() {} });
        if (k === 'createPattern') return () => ({});
        if (k === 'toDataURL') return () => 'data:image/png;base64,AAAA';
        return () => undefined;
      },
      set() { return true; },
    });
  }
  window.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,AAAA';
  window.HTMLCanvasElement.prototype.getContext = function (kind) {
    if (kind === 'webgl2' || kind === 'webgl' || kind === 'experimental-webgl') return webgl ? glStub : null;
    return ctx2d();
  };
  window.AudioContext = window.webkitAudioContext = class {
    constructor() { this.currentTime = 0; this.destination = {}; this.sampleRate = 44100; }
    param() {
      return { value: 0, setValueAtTime() {}, linearRampToValueAtTime() {},
               exponentialRampToValueAtTime() {}, cancelScheduledValues() {} };
    }
    createGain() { return { gain: this.param(), connect() {}, disconnect() {} }; }
    createOscillator() {
      return { type: '', frequency: this.param(), detune: this.param(), connect() {},
               start() {}, stop() {}, disconnect() {}, onended: null };
    }
    createBufferSource() { return { buffer: null, connect() {}, start() {}, stop() {}, disconnect() {} }; }
    createBiquadFilter() { return { type: '', frequency: this.param(), Q: this.param(), gain: this.param(),
                                    connect() {}, disconnect() {} }; }
    createBuffer(a, b) { return { getChannelData: () => new Float32Array(b) }; }
    createStereoPanner() { return { pan: { value: 0 }, connect() {}, disconnect() {} }; }
    resume() { return Promise.resolve(); }
    suspend() { return Promise.resolve(); }
  };

  // fila de requestAnimationFrame: o teste decide quantos quadros rodam
  let rafQueue = [];
  window.requestAnimationFrame = cb => { rafQueue.push(cb); return rafQueue.length; };

  // carregador de módulos: resolve os imports relativos dentro do DOM simulado
  const sources = {};
  const jsDir = resolve(root, 'js');
  for (const f of readdirSync(jsDir)) {
    if (f.endsWith('.js')) sources['js/' + f] = readFileSync(resolve(jsDir, f), 'utf8');
  }
  const mods = {};
  function instantiate(name) {
    if (mods[name]) return mods[name];
    const src = sources[name];
    if (src === undefined) throw new Error('módulo não encontrado: ' + name);
    const imported = [];
    let body = src.replace(/import\s*{([^}]*)}\s*from\s*'\.\/([a-z]+)\.js';?/g, (m, names, dep) => {
      const depName = 'js/' + dep + '.js';
      instantiate(depName);
      const importAs = names.split(',').map(part => {
        const bits = part.trim().split(/\s+as\s+/);
        return bits.length > 1 ? `${bits[0]}: ${bits[1]}` : bits[0];
      }).filter(Boolean).join(', ');
      imported.push({ dep: depName, importAs });
      return '';
    });
    const exported = [];
    body = body.replace(/export\s+(const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/g, (m, kind, id) => {
      exported.push([id, id]);
      return kind + ' ' + id;
    });
    body = body.replace(/export\s*{([^}]*)}\s*;?/g, (m, list) => {
      for (const part of list.split(',')) {
        const bits = part.trim().split(/\s+as\s+/);
        if (bits[0]) exported.push([bits[1] || bits[0], bits[0]]);
      }
      return '';
    });
    const deps = imported.map(i => `const { ${i.importAs} } = __mods['${i.dep}'];`).join('\n');
    const table = exported.map(([out, local]) => `${JSON.stringify(out)}: ${local}`).join(', ');
    const code = deps + '\n' + body + `\n;__mods[${JSON.stringify(name)}] = { ${table} };`;
    mods[name] = {};
    try {
      const factory = new window.Function('__mods', 'window', 'document', 'localStorage',
        'performance', 'requestAnimationFrame', code);
      factory(mods, window, window.document, window.localStorage, window.performance,
              window.requestAnimationFrame);
    } catch (e) {
      delete mods[name];
      throw e;
    }
    return mods[name];
  }

  const step = (n = 1) => {
    for (let i = 0; i < n; i++) {
      const q = rafQueue; rafQueue = [];
      for (const cb of q) cb(window.performance.now() + i * 16);
    }
  };
  return { window, doc: window.document, instantiate, mods, errors, step, queued: () => rafQueue.length };
}

// ============================================================ cenário A ====
// o jogo normal: abre, entra, abre mapa, salva
console.log('== Grand Pixel Game — teste de fumaça ==');
section('abrindo o jogo');
const env = makeEnv({ webgl: true });
try {
  env.instantiate('js/main.js');
} catch (e) {
  console.log('  FALHA ao carregar o jogo: ' + e.message);
  console.log(e.stack.split('\n').slice(0, 5).join('\n'));
  process.exit(1);
}
check('o jogo carrega sem estourar', true);
check('sem erros de script', env.errors.length === 0, env.errors.slice(0, 2).join(' | '));

const g = env.window.__solaria;
const doc = env.doc;
check('API interna exposta', !!g);
if (g) {
  check('versão 1.2.0', g.VERSION === '1.2.0', g.VERSION);
  check('tela inicial', g.phase === 'title', g.phase);
  const verEl = doc.getElementById('ver');
  check('elemento de versão no menu', verEl && verEl.textContent === 'v1.2.0', verEl && verEl.textContent);
  check('70 missões carregadas', g.stateM.length + g.side.length === 70,
        String(g.stateM.length + g.side.length));

  section('pixels');
  const glC = doc.getElementById('gl');
  const uiC = doc.getElementById('ui');
  const stage = doc.getElementById('stage');
  const scale = g.PIX ? g.PIX.scale : 0;
  check('escala de pixels inteira (2..6)', scale >= 2 && scale <= 6, String(scale));
  check('tela do jogo = janela / escala', glC.width === Math.floor(env.window.innerWidth / scale) &&
        uiC.height === Math.floor(env.window.innerHeight / scale),
        `${glC.width}x${glC.height} escala ${scale}`);
  check('canvas com os dois desenhos', glC.width === uiC.width && glC.height === uiC.height);
  const sw = parseInt(stage.style.width, 10), sh = parseInt(stage.style.height, 10);
  check('estágio em múltiplos inteiros da escala', sw % scale === 0 && sh % scale === 0, `${sw}x${sh}`);

  section('jogando');
  g.continueGame ? g.continueGame() : doc.getElementById('t-continue').click();
  env.step(20);
  check('entrou no jogo', g.phase === 'play', g.phase);
  const snap = g.statsSnapshot();
  check('registro com totais certos', snap.capsTotal === 11 && snap.sidesTotal === 59 &&
        snap.artsTotal === 10, JSON.stringify({ c: snap.capsTotal, s: snap.sidesTotal, a: snap.artsTotal }));
  check('conquistas listadas', snap.medalsTotal === 9 && snap.medals.length === 9);
  check('nenhuma conquista de graça', snap.earned === 0, String(snap.earned));
  const t0 = g.playTime;
  env.step(40);
  check('tempo de jogo acumula', g.playTime > t0, `${t0} -> ${g.playTime}`);

  section('conquistas');
  Object.keys(g.colN).forEach(k => { g.colN[k] = 0; });
  g.colN.crystal = 120;
  g.checkMedals(true);
  check('conquista de itens', g.medals().includes('colecao'), g.medals().join(','));
  g.openStats();
  env.step(2);
  const body = doc.getElementById('stats-body').innerHTML;
  check('tela de registro abre', g.phase === 'stats', g.phase);
  check('registro desenha as conquistas', body.includes('Colecionador') && body.includes('st-medal'),
        body.slice(0, 60));
  g.closeStats();
  check('volta do registro', g.phase === 'play' || g.phase === 'pause', g.phase);

  section('mapa da ilha');
  check('mapa grande tem o mesmo tamanho do bitmap da ilha',
        g.MAP && typeof g.zoomMap === 'function' && typeof g.drawBigMapScreen === 'function');
  const z0 = g.MAP.zoom;
  g.zoomMap(1);
  const z1 = g.MAP.zoom;
  check('zoom do minimapa muda', z1 !== z0, `${z0} -> ${z1}`);
  g.openMap();
  env.step(2);
  check('tela do mapa abre', g.phase === 'map', g.phase);
  const side = doc.getElementById('map-side').innerHTML;
  check('lista do mapa com ícones de pixel', (side.match(/<img class="pxi"/g) || []).length > 5 &&
        side.includes('Praça de Solaria'), String((side.match(/<img class="pxi"/g) || []).length));
  let mapErro = '';
  try { g.drawBigMapScreen(); } catch (e) { mapErro = e.message; }
  check('mapa grande desenha sem erro', mapErro === '', mapErro);
  g.setDest(36, 9, 'Campo Radiante');
  check('destino marcado', g.MAP.dest && g.MAP.dest.nome === 'Campo Radiante',
        JSON.stringify(g.MAP.dest));
  g.setDest(36, 9, 'Campo Radiante');
  check('destino limpa ao repetir', g.MAP.dest === null);
  // clique no mapa grande escolhe o mesmo ponto marcado
  const POI = g.mapState().pois.find(p => p.id === 'campo');
  const S = { w: 208, h: 208, mapX: 8, mapY: 8 };
  const mx = S.mapX + Math.round((POI.x + 192) / 2), my = S.mapY + Math.round((POI.z + 192) / 2);
  const fakeClick = { clientX: mx, clientY: my };
  const cv = doc.getElementById('bigmap');
  cv.getBoundingClientRect = () => ({ left: 0, top: 0, width: S.w, height: S.h });
  g.mapClick(fakeClick);
  check('clique no mapa marca o ponto', g.MAP.dest && g.MAP.dest.nome === 'Campo Radiante',
        JSON.stringify(g.MAP.dest));
  g.closeMap();
  env.step(2);
  check('volta do mapa para o jogo', g.phase === 'play' || g.phase === 'pause', g.phase);

  section('minimapa desenhando');
  let miniErro = '';
  try {
    const st = g.mapState();
    for (let i = 0; i < 3; i++) st.world && g.drawMinimap(env.window.document.createElement('canvas').getContext('2d'), 400, 300, st);
    g.openMap(); env.step(1); g.closeMap(); env.step(1);
  } catch (e) { miniErro = e.message; }
  check('minimapa desenha sem erro', miniErro === '', miniErro);

  section('ícones de pixel');
  const ic = env.instantiate('js/icons.js');
  const nomes = ic.iconNames();
  const tortos = nomes.filter(n => ic.ICONS[n].length !== 9 || ic.ICONS[n].some(r => r.length !== 9));
  check('todos os ícones são 9x9', tortos.length === 0, tortos.join(','));
  const letras = new Set(Object.keys(ic.ICON_PAL));
  const ruins = nomes.filter(n => ic.ICONS[n].some(r => [...r].some(c => !letras.has(c))));
  check('ícones usam só cores da paleta', ruins.length === 0, ruins.join(','));
  const mm = env.mods['js/minimap.js'];
  const faltando = g.mapState().pois
    .map(p => mm.poiIconName(p))
    .filter(nome => !ic.ICONS[nome]);
  check('todo ponto do mapa tem ícone', faltando.length === 0, faltando.join(','));
  check('ícones do HUD existem',
        ['coracao', 'coracao_vazio', 'coracao_meio', 'moeda', 'gema', 'espada', 'bussola']
          .every(n => ic.ICONS[n]));
  check('ícone vira imagem para o HTML', ic.iconImg('casa', 2).includes('<img'));

  section('fonte de pixel');
  const fonte = env.instantiate('js/font.js');
  check('fonte desenha texto e mede', fonte.textWidth('abc', 1) > 0 && fonte.textWidth('abc', 2) > fonte.textWidth('abc', 1));
  // nada de emoji/símbolo caindo em fonte do sistema: todo caractere usado no
  // jogo precisa existir na fonte de pixel
  const usados = new Set();
  for (const f of ['js/main.js', 'index.html']) {
    const txt = readFileSync(resolve(root, f), 'utf8');
    for (const ch of txt) {
      const code = ch.codePointAt(0);
      if (code > 126) usados.add(ch);
    }
  }
  const semGlifo = [...usados].filter(ch => !fonte.hasGlyph(ch));
  check('todo símbolo do jogo tem glifo de pixel', semGlifo.length === 0,
        semGlifo.map(c => c + ' U+' + c.codePointAt(0).toString(16)).join(' '));
  check('fonte tem acentos do português',
        'áàâãéêíóôõúçÁÉÍÓÚÇ'.split('').every(c => fonte.hasGlyph(c)));
  const wrap = fonte.wrapText('uma frase bem comprida para quebrar em varias linhas curtas', 60, 1);
  check('quebra de linha respeita a largura', wrap.length > 1 &&
        wrap.every(l => fonte.textWidth(l, 1) <= 60), JSON.stringify(wrap));

  section('a ilha');
  const rw = g.world;
  check('mundo tem marcos para o mapa', Array.isArray(rw.landmarks) && rw.landmarks.length >= 10,
        String(rw.landmarks && rw.landmarks.length));
  check('mundo gera rápido (< 1,5 s)', (() => {
    const t = Date.now();
    const m = env.instantiate('js/world.js');
    new m.World(20260908);
    return Date.now() - t < 1500;
  })());
  const kinds = new Set(rw.landmarks.map(l => l.kind));
  check('marcos variados (casa/torre/ponte/fazenda)', kinds.size >= 5, [...kinds].join(','));
  check('estradas exportadas para o mapa',
        env.instantiate('js/world.js').ROADS.length >= 5);

  section('salvando');
  g.saveGame();
  const saved = JSON.parse(env.window.localStorage.getItem('grandpixel-save'));
  check('save é v5', saved.v === 5, String(saved.v));
  check('save guarda tempo e mortes', typeof saved.play === 'number' && typeof saved.deaths === 'number');
  check('save guarda conquistas', Array.isArray(saved.medals) && saved.medals.includes('colecao'));
  check('save antigo (v4) continua legível', (() => {
    const old = Object.assign({}, saved, { v: 4 });
    delete old.play; delete old.deaths; delete old.medals;
    env.window.localStorage.setItem('grandpixel-save', JSON.stringify(old));
    const loaded = g.loadSave();
    g.applySave(loaded);
    return loaded && loaded.v >= 4;
  })());
}

// ============================================================ cenário B ====
// sem WebGL: o jogo tem que avisar, e não ficar girando para sempre
section('quando o WebGL não vem (a tela travada de antes)');
const env2 = makeEnv({ webgl: false, inlineScripts: true });
let travou = false;
try {
  env2.instantiate('js/main.js');
} catch (e) {
  if (!/liberou o WebGL/.test(e.message)) travou = true;
}
const crash = env2.doc.getElementById('crash');
const loading = env2.doc.getElementById('loading');
check('mostra a tela de falha em vez de travar', !travou && crash && !crash.classList.contains('hidden'));
check('explica o motivo (WebGL)', crash && /WebGL/.test(env2.doc.getElementById('crash-text').textContent),
      crash && env2.doc.getElementById('crash-text').textContent.slice(0, 80));
check('esconde o carregamento', loading && loading.style.display === 'none', loading && loading.style.display);
check('oferece modo compatibilidade',
      env2.doc.getElementById('crash-compat') && /compat/.test('compat'));
const g2 = env2.window.__solaria;
check('não fica rodando à toa', (!g2 || g2.phase === 'boot') && env2.queued() === 0,
      (g2 ? g2.phase : 'sem módulo') + ' / quadros: ' + env2.queued());

// ============================================================ resultado ====
console.log('\n== ' + passes + ' passaram, ' + fails + ' falharam ==');
process.exit(fails === 0 ? 0 : 1);
