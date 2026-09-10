// GRAND PIXEL GAME — pipeline de pixels
// O mundo e a HUD são desenhados numa tela pequena (a "tela do jogo") e
// ampliados em múltiplos INTEIROS, sem suavização. Resultado: todo pixel do
// jogo é quadrado, do mesmo tamanho e alinhado à grade — de verdade, não um
// filtro por cima.
//
// A HUD em DOM (HTML) usa a variável CSS --px = tamanho de 1 pixel do jogo em
// pixels de tela, então bordas, sombras e textos ficam na MESMA grade.

export const PIX = {
  scale: 3,     // pixels de tela por pixel do jogo
  w: 0, h: 0,   // resolução interna (a tela do jogo)
  winW: 0, winH: 0,
  compat: false,
};

// escala base pela altura da janela; ajustada pela opção de "Pixels" e pela
// compatibilidade. Sempre inteira, sempre >= 2 (senão não parece pixel).
function pickScale(winW, winH, quality, compat) {
  let s = winH >= 1200 ? 5 : winH >= 900 ? 4 : winH >= 650 ? 3 : 2;
  // qualidade alta = pixels menores (mais detalhe); baixa = mais grossos
  if (quality === 0) s += 1;
  else if (quality === 2) s -= 1;
  if (winW < 900 && s > 3) s -= 1;
  if (compat) s = Math.max(2, s - 1);
  return Math.max(2, Math.min(6, s));
}

export function applyPixelScale(stage, glCanvas, uiCanvas, quality) {
  const winW = Math.max(320, Math.floor(window.innerWidth || 960));
  const winH = Math.max(200, Math.floor(window.innerHeight || 540));
  const scale = pickScale(winW, winH, quality, PIX.compat);
  const w = Math.max(160, Math.floor(winW / scale));
  const h = Math.max(120, Math.floor(winH / scale));
  PIX.scale = scale; PIX.w = w; PIX.h = h; PIX.winW = winW; PIX.winH = winH;

  if (stage) {
    stage.style.width = w * scale + 'px';
    stage.style.height = h * scale + 'px';
  }
  for (const c of [glCanvas, uiCanvas]) {
    if (!c) continue;
    if (c.width !== w) c.width = w;
    if (c.height !== h) c.height = h;
  }
  const root = document.documentElement;
  if (root) {
    root.style.setProperty('--px', scale + 'px');
    root.style.setProperty('--px2', scale * 2 + 'px');
  }
  return PIX;
}

// parâmetros de URL úteis: ?compat=1 (modo leve) e ?pixel=4 (força a escala)
export function readUrlBits() {
  const out = { compat: false, pixel: 0 };
  try {
    const q = new URLSearchParams(window.location.search || '');
    out.compat = q.get('compat') === '1' || q.get('compat') === 'true';
    const p = parseInt(q.get('pixel') || '0', 10);
    if (p >= 2 && p <= 8) out.pixel = p;
  } catch (e) { /* sem URLSearchParams: segue o jogo */ }
  return out;
}

export function forceScale(n) {
  if (n >= 2 && n <= 8) PIX.scale = n;
}

// tamanho da tela do jogo em "pixels de jogo" (para leiautes da HUD em canvas)
export const px = () => PIX.scale;

// converte um ponto da tela (CSS px) para coordenadas da tela do jogo
export function toGame(cssX, cssY, stage) {
  const r = stage ? stage.getBoundingClientRect() : { left: 0, top: 0 };
  return { x: (cssX - r.left) / PIX.scale, y: (cssY - r.top) / PIX.scale };
}
