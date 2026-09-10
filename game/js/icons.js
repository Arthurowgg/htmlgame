// GRAND PIXEL GAME — ícones pixel
// Cada ícone é uma arte de 9x9 desenhada com letras (uma letra = uma cor da
// paleta). São desenhados uma única vez num atlas e depois "carimbados" no
// mapa e na HUD sem nenhuma suavização.
//
//   . = transparente   k = contorno escuro   w = branco/brilho
//   y dourado  o laranja  b madeira  B madeira escura
//   g verde    G verde escuro
//   c água/azul  C azul forte  D azul escuro
//   s pedra    S pedra escura
//   r vermelho R vermelho escuro
//   p roxo     P roxo escuro

export const ICON_SIZE = 9;

export const ICON_PAL = {
  '.': null,
  k: '#191426',
  w: '#fff3d6',
  y: '#ffd76a',
  o: '#ff9a4d',
  b: '#8a5a2b',
  B: '#5a3a1c',
  g: '#6fc94f',
  G: '#3d8433',
  c: '#77dcea',
  C: '#3f86d8',
  D: '#25436e',
  s: '#9aa3b0',
  S: '#5f6875',
  r: '#e8607a',
  R: '#8f2c3f',
  p: '#a98cf0',
  P: '#5b4a94',
};

export const ICONS = {
  casa: [
    '....k....',
    '...kok...',
    '..koook..',
    '.koooook.',
    'koooooook',
    'kkkkkkkkk',
    'kwwkckwwk',
    'kwwkbkwwk',
    'kkkkbkkkk',
  ],
  torre: [
    '.k.k.k.k.',
    '.ksksksk.',
    '.ksssssk.',
    '.kswsssk.',
    '.ksssssk.',
    '.kswsssk.',
    '.ksssssk.',
    'ksssssssk',
    'kkkkkkkkk',
  ],
  arvore: [
    '...ggg...',
    '..ggggg..',
    '.ggGgggg.',
    '.ggggGgg.',
    '..ggGgg..',
    '...gbg...',
    '...gbg...',
    '..kGbGk..',
    '..kkkkk..',
  ],
  palmeira: [
    '.g.....g.',
    '..g.g.g..',
    '.ggggggg.',
    '..gGgGg..',
    '...gbg...',
    '..gbg....',
    '..gbg....',
    '.gbg.....',
    '.kbk.....',
  ],
  montanha: [
    '....w....',
    '...www...',
    '..wwsww..',
    '..wwsww..',
    '.sssssss.',
    '.sssSsss.',
    'sssSsssss',
    'sssssssss',
    'kkkkkkkkk',
  ],
  caverna: [
    '....k....',
    '...ksk...',
    '..ksssk..',
    '.ksssssk.',
    'ksssssssk',
    'ksskkkssk',
    'kskkkkksk',
    'kkkkkkkkk',
    '.........',
  ],
  agua: [
    '....c....',
    '...ccc...',
    '..ccccc..',
    '.cccDccc.',
    'cccDDDccc',
    'cccDDDccc',
    '.ccDDDcc.',
    '..ccccc..',
    '...ccc...',
  ],
  selo: [
    '....y....',
    '...yyy...',
    'k..yyy..k',
    '.kyyyyyk.',
    'yyyyyyyyy',
    '.kyyyyyk.',
    'k..yyy..k',
    '...yyy...',
    '....y....',
  ],
  bau: [
    '.........',
    '..kkkkk..',
    '.kyyyyyk.',
    'kkkkkkkkk',
    'kyyyyyyyk',
    'kyyykkyyk',
    'kyyykkyyk',
    'kkkkkkkkk',
    '.........',
  ],
  gema: [
    '..ccccc..',
    '.cCcccCc.',
    'ccCcccCcc',
    '.cCcccCc.',
    '..cCcCc..',
    '...cCc...',
    '....c....',
    '....k....',
    '.........',
  ],
  espada: [
    '.......w.',
    '......wwk',
    '.....wwk.',
    '....wwk..',
    '...wwk...',
    '..wwk....',
    'kyywk....',
    'kykk.....',
    'k........',
  ],
  caveira: [
    '..kkkkk..',
    '.kwwwwwk.',
    'kwkwwwkwk',
    'kwkwwwkwk',
    'kwwwwwwwk',
    '.kwwkwwk.',
    '..kkkkk..',
    '..k.k.k..',
    '.........',
  ],
  tenda: [
    '....o....',
    '...ooo...',
    '..ooooo..',
    '.ooooooo.',
    'oooo.oooo',
    'ooo...ooo',
    'oo.....oo',
    'kk.....kk',
    '.........',
  ],
  farol: [
    '...wcw...',
    '..kwwwk..',
    '..kkkkk..',
    '..krrrk..',
    '..kwwwk..',
    '..krrrk..',
    '.kwwwwk..',
    '.krrrrk..',
    '.kkkkkk..',
  ],
  ancora: [
    '..cccc...',
    '.cc..cc..',
    '.cc..cc..',
    '...ccc...',
    '.ccccccc.',
    '...ccc...',
    '...ccc...',
    'c..ccc..c',
    '.ccccccc.',
  ],
  templo: [
    '....k....',
    '..kkkkk..',
    '.kwwwwwk.',
    'kkkkkkkkk',
    'ksswsswsk',
    'ksswsswsk',
    'ksswsswsk',
    'ksswsswsk',
    'kkkkkkkkk',
  ],
  ponte: [
    '.........',
    '.........',
    'kkkkkkkkk',
    'wwwwwwwww',
    'kkkkkkkkk',
    '.b.....b.',
    '.b.....b.',
    '.b.....b.',
    'kk.....kk',
  ],
  portao: [
    '..kkkkk..',
    '.kbbbbbk.',
    'kbb.k.bbk',
    'kbb...bbk',
    'kbb...bbk',
    'kbb...bbk',
    'kbb...bbk',
    'kbb...bbk',
    'kkk...kkk',
  ],
  cripta: [
    '..kkkkk..',
    '.ksssssk.',
    'ksssssssk',
    'ksskkkssk',
    'ksskkkssk',
    'ksskkkssk',
    'kss...ssk',
    'kss...ssk',
    'kkkkkkkkk',
  ],
  moinho: [
    'y...k...y',
    '.y..k..y.',
    '..y.k.y..',
    '..kkskk..',
    '..ksssk..',
    '..kswsk..',
    '..ksssk..',
    '..ksssk..',
    '..kkkkk..',
  ],
  fazenda: [
    '.........',
    '.bbbbbbb.',
    'bgbgbgbgb',
    '.bbbbbbb.',
    'bgbgbgbgb',
    '.bbbbbbb.',
    'bgbgbgbgb',
    '.bbbbbbb.',
    '.........',
  ],
  poco: [
    '...kkk...',
    '..kbbbk..',
    '.kbbbbbk.',
    'kkkkkkkkk',
    'ksscccssk',
    'ksscccssk',
    'kkkkkkkkk',
    '.........',
    '.........',
  ],
  altar: [
    '....o....',
    '...oyo...',
    '....y....',
    '..kkkkk..',
    '.ksssssk.',
    'ksssssssk',
    '.ksssssk.',
    '..kkkkk..',
    '.........',
  ],
  missao: [
    '..kkk....',
    '.kyyyk...',
    '.kyyyk...',
    '.kyyyk...',
    '.kyyyk...',
    '.kyyyk...',
    '..kkk....',
    '..kyk....',
    '..kkk....',
  ],
  npc: [
    '..kkk....',
    '.kwwwk...',
    '.kwkwk...',
    '..kkk....',
    '.kyyyk...',
    'kyyyyyk..',
    '.kyyyk...',
    '..k.k....',
    '..k.k....',
  ],
  marcador: [
    '.kkkk....',
    '.krrk....',
    '.krrk....',
    '.krrk....',
    '.kkkk....',
    '.kbk.....',
    '.kbk.....',
    '.kbk.....',
    'kkbkkk...',
  ],
  coracao: [
    '.........',
    '.kk.kk...',
    'krrkrrk..',
    'krrrrrk..',
    'krrrrrk..',
    '.krrrk...',
    '..krk....',
    '...k.....',
    '.........',
  ],
  coracao_vazio: [
    '.........',
    '.kk.kk...',
    'k..k..k..',
    'k.....k..',
    'k.....k..',
    '.k...k...',
    '..k.k....',
    '...k.....',
    '.........',
  ],
  coracao_meio: [
    '.........',
    '.kk.kk...',
    'krrk..k..',
    'krrr..k..',
    'krrr..k..',
    '.krr.k...',
    '..krk....',
    '...k.....',
    '.........',
  ],
  moeda: [
    '..kkkkk..',
    '.kyyyyyk.',
    'kyywwwyyk',
    'kywyyywyk',
    'kywyyywyk',
    'kyywwwyyk',
    '.kyyyyyk.',
    '..kkkkk..',
    '.........',
  ],
  bussola: [
    '....k....',
    '...krk...',
    '..kkrkk..',
    '.kkkrkkk.',
    'kkkkrkkkk',
    '.kkkrkkk.',
    '..kkwkk..',
    '...kwk...',
    '....k....',
  ],
};

// ------------------------------------------------------------------ atlas --
let atlas = null;
const cache = {};

function buildAtlas() {
  const names = Object.keys(ICONS);
  const cols = 8;
  const rows = Math.ceil(names.length / cols);
  const cv = document.createElement('canvas');
  cv.width = cols * ICON_SIZE;
  cv.height = rows * ICON_SIZE;
  const g = cv.getContext('2d');
  g.imageSmoothingEnabled = false;
  names.forEach((name, i) => {
    const ox = (i % cols) * ICON_SIZE, oy = Math.floor(i / cols) * ICON_SIZE;
    const art = ICONS[name];
    for (let y = 0; y < ICON_SIZE; y++) {
      const line = art[y] || '';
      for (let x = 0; x < ICON_SIZE; x++) {
        const col = ICON_PAL[line[x]];
        if (!col) continue;
        g.fillStyle = col;
        g.fillRect(ox + x, oy + y, 1, 1);
      }
    }
  });
  const index = {};
  names.forEach((name, i) => {
    index[name] = [(i % cols) * ICON_SIZE, Math.floor(i / cols) * ICON_SIZE];
  });
  return { cv, index, cols, rows };
}

function ensure() {
  if (!atlas) atlas = buildAtlas();
  return atlas;
}

// desenha o ícone com o canto superior esquerdo em (x, y), em pixels de jogo
export function drawIcon(ctx, name, x, y, scale = 1) {
  const a = ensure();
  const at = a.index[name];
  if (!at) return false;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(a.cv, at[0], at[1], ICON_SIZE, ICON_SIZE,
    Math.round(x), Math.round(y), ICON_SIZE * scale, ICON_SIZE * scale);
  return true;
}

export function iconW(scale = 1) { return ICON_SIZE * scale; }

// PNG pequeno em data-URI, para usar em HTML (listas, botões, legendas)
export function iconDataURL(name, scale = 2) {
  const key = name + '@' + scale;
  if (cache[key]) return cache[key];
  const a = ensure();
  const at = a.index[name];
  if (!at) return '';
  const cv = document.createElement('canvas');
  cv.width = ICON_SIZE * scale;
  cv.height = ICON_SIZE * scale;
  const g = cv.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.drawImage(a.cv, at[0], at[1], ICON_SIZE, ICON_SIZE, 0, 0, cv.width, cv.height);
  const url = cv.toDataURL('image/png');
  cache[key] = url;
  return url;
}

export function iconImg(name, scale = 2, cls = 'pxi') {
  const url = iconDataURL(name, scale);
  if (!url) return '';
  return `<img class="${cls}" alt="" src="${url}">`;
}

export function iconNames() { return Object.keys(ICONS); }
