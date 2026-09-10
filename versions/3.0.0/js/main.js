import { Game } from './game.js';

// Allow launcher cfg via query
(function applyQueryCfg() {
  try {
    const q = new URLSearchParams(location.search).get('gpg');
    if (q) window.__GPG__ = Object.assign(window.__GPG__ || {}, JSON.parse(decodeURIComponent(q)));
  } catch {}
})();

const game = new Game();
game.boot();
