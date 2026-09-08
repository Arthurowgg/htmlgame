// GRAND PIXEL GAME — motor de áudio: tema sintetizado + SFX 8-bit + MP3 opcional
// efeitos sonoros 8-bit. Se existir assets/music/inner-light.mp3 ele é usado
// (coloque o arquivo e o jogo toca-o na abertura; créditos na tela de título).
export const NOTE = {
  C:16.35, 'C#':17.32, D:18.35, 'D#':19.45, E:20.60, F:21.83,
  'F#':23.12, G:24.50, 'G#':25.96, A:27.50, 'A#':29.14, B:30.87
};
export const n = (name, oct) => NOTE[name] * Math.pow(2, oct);

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.musicBus = null;
    this.sfxBus = null;
    this.ready = false;
    this.muted = false;
    this.external = null; // elemento de áudio para música externa
    this.musicVol = 0.9;
    this.sfxVol = 0.8;
    this.musicStarted = false;
    this.time = 0; // relógio da música
    this.tempo = 0;
    this.step = 0;
    this.nextEv = 0;
    this.events = [];
    this.introT = 0; // fade de início
    this.vol = 0.85;
  }
  ensure() {
    if (this.ctx) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : this.vol;
      this.master.connect(this.ctx.destination);
      this.musicBus = this.ctx.createGain();
      this.musicBus.gain.value = this.musicVol;
      this.musicBus.connect(this.master);
      this.sfxBus = this.ctx.createGain();
      this.sfxBus.gain.value = this.sfxVol;
      this.sfxBus.connect(this.master);
    } catch (e) {
      console.warn('áudio indisponível', e);
    }
  }
  resume() {
    this.ensure();
    if (!this.ctx || this.ctx.state === 'running') return;
    this.ctx.resume();
    this.musicStarted = true;
  }
  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : this.vol;
    if (this.external) this.external.muted = m;
  }
  get isMuted() { return this.muted; }
  setMusicVol(v) { this.musicVol = Math.max(0, Math.min(1, v)); if (this.musicBus) this.musicBus.gain.value = this.musicVol; if (this.external) this.external.volume = this.musicVol * 0.9; }
  setSfxVol(v) { this.sfxVol = Math.max(0, Math.min(1, v)); if (this.sfxBus) this.sfxBus.gain.value = this.sfxVol; }
  getMusicVol() { return this.musicVol; }
  getSfxVol() { return this.sfxVol; }

  // ---------------- música externa (assets/music/inner-light.mp3) ----------------
  tryLoadExternal(srcs) {
    const list = Array.isArray(srcs) ? srcs.slice() : [srcs];
    return new Promise(res => {
      const tryNext = () => {
        const src = list.shift();
        if (!src) { res(false); return; }
        const el = new Audio();
        let settled = false;
        const done = ok => {
          if (settled) return; settled = true;
          if (ok) { this.external = el; el.loop = true; }
          res(ok);
        };
        el.addEventListener('canplaythrough', () => done(true), { once: true });
        el.addEventListener('error', () => { if (list.length) tryNext(); else done(false); }, { once: true });
        el.preload = 'auto';
        el.src = src;
        el.load();
        setTimeout(() => { if (el.readyState < 2) done(false); }, 8000);
      };
      tryNext();
    });
  }
  playExternal() {
    if (!this.external) return;
    this.external.volume = 0.0;
    const t0 = this.ctx ? this.ctx.currentTime : 0;
    this.external.play().then(() => {
      if (this.external) {
        this.external.volume = 0.9;
      }
    }).catch(() => {});
  }
  stopExternal() {
    if (this.external) { try { this.external.pause(); } catch (e) {} }
  }

  // ---------------- composição "Inner Light" (tema original) ----------------
  // Notas: [inicio_em_steps, duracao_steps, {o:voz, f:freq, ...}]
  startMusic() {
    this.ensure();
    if (!this.ctx) return;
    if (this.external) { this.playExternal(); return; }
    if (this.musicStarted && this.introT < 8) return; // já tocando
    this.musicStarted = true;
    this.buildSong();
    this.time = 0;
    this.step = 0;
    this.nextEv = 0;
  }

  buildSong() {
    // 105 BPM → 0.5714 s/beat; um "step" = colcheia = 0.2857 s
    const spb = 60 / 105 / 2;
    this.tempo = spb;
    const ev = [];
    const S = 16; // semicolcheia? usaremos colcheias
    // vozes
    const pad = (t, dur, freq, vol = 0.05, atk = 1.2) => ev.push([t, dur, { kind: 'pad', f: freq, vol, atk }]);
    const bass = (t, dur, freq) => ev.push([t, dur, { kind: 'bass', f: freq }]);
    const bell = (t, freq, dur = 2.4, vol = 0.11) => ev.push([t, dur, { kind: 'bell', f: freq, vol }]);
    const chime = (t, freq, vol = 0.06) => ev.push([t, 1.6, { kind: 'chime', f: freq, vol }]);
    const noisePulse = (t, dur = 1.5, vol = 0.012) => ev.push([t, dur, { kind: 'noise', vol }]);

    // Notas da melodia (frases curtas, calmas)
    const M = {
      intro: ['G5','E5','C5','D5','E5','C5','A4','C5'],   // compasso 1
    };
    // harmonias
    const Am = n('A', 2), Em = n('E', 2), F = n('F', 2), C = n('C', 2), G = n('G', 2), Dm = n('D', 2);
    const E = n('E', 2), D = n('D', 2);
    const Am3 = n('A', 3), Em3 = n('E', 3), F3 = n('F', 3), C3 = n('C', 3), G3 = n('G', 3), D3 = n('D', 3);
    const E3 = n('E', 3);
    const Am4 = n('A',4), Em4 = n('E',4), F4 = n('F',4), C4 = n('C',4), G4 = n('G',4), D4 = n('D',4);
    // melodia nota (graus)
    const E5 = n('E',5), D5 = n('D',5), C5 = n('C',5), A4 = n('A',4), G5 = n('G',5), A5 = n('A',5), F5 = n('F',5), B4 = n('B',4);

    const PAD = [
      [0, 8, Am, Am3, Am4], [8, 8, F, F3, C4],
      [16, 8, C, C3, G4], [24, 8, G, G3, D4],
      [32, 8, Am, Am3, Am4], [40, 8, F, F3, C4],
      [48, 8, C, C3, G4], [56, 8, G, G3, D4],
      [64, 8, Am, Am3, Am4], [72, 8, F, F3, C4],
      [80, 8, C, C3, G4], [88, 8, E, E3, B4],
      [96, 4, Dm, D3, A4], [100, 4, G, G3, D4],
      [104, 8, Am, Am3, Am4], [112, 8, Am, Am3, Am4],
    ];
    for (const [t, dur, r, t3, t4] of PAD) {
      pad(t, dur, r, 0.045, 0.9);
      pad(t, dur, t3, 0.03, 0.9);
      pad(t, dur, t4, 0.02, 1.5);
    }
    // baixo (padrão calmo)
    const BASS = [Am, Am, F, F, C, C, G, G, Am, Am, F, F, C, C, G, G];
    BASS.forEach((f, i) => {
      bass(i * 4, 3.4, f);
      if (i % 2 === 0) bass(i * 4 + 2, 1.4, f / 2);
    });
    // linha de sino (a cada 2 compassos) + chimes
    for (let c = 0; c < 8; c++) {
      const t = c * 16;
      bell(t, Am4 + c * 0, 3.0, 0.08);
      if (c === 0) bell(0, E5, 6, 0.05);
      if (c === 2) bell(32, E5, 3, 0.07);
      if (c === 4) bell(64, F5, 3, 0.06);
      if (c === 6) bell(96, D5, 2, 0.06);
    }
    // arpejo suave
    const arp = (t, base, mults) => mults.forEach((m, i) => chime(t + i * 1, base * m, 0.045));
    arp(0, Am4, [1, 1.5, 2, 3, 2, 1.5]); // la mi la do# mi la
    arp(8, C4, [1, 1.5, 2, 2.5]); // dó mi sol si
    arp(16, G4, [1, 1.25, 1.5, 2]); 
    arp(24, D4, [1, 1.25, 1.5, 2, 2.5, 3]);
    arp(48, F4, [1, 1.5, 2, 2.5]);
    arp(64, E5, [1, 1.125, 1.5, 2]);
    arp(80, B4, [1, 1.25, 1.5, 2]);
    arp(96, A4, [1, 1.25, 1.5, 2.5]);
    arp(112, Am4, [1, 1.5, 2, 3]);

    // melodia simples sobre a harmonia (segunda metade)
    const MEL = [
      // 32.. (compasso 3 começa com C)
      [32, C5], [34, E5], [36, G5], [38, E5], [40, A5], [42, G5], [44, E5], [46, C5],
      [48, D5], [50, E5], [52, F5], [54, E5], [56, D5], [58, C5], [60, D5], [62, C5],
      [64, A4], [66, C5], [68, E5], [70, G5], [72, F5], [74, E5], [76, D5], [78, C5],
      [80, B4], [82, C5], [84, D5], [86, E5], [88, G5], [90, E5], [92, C5], [94, B4],
      [96, A4], [98, C5], [100, D5], [102, F5], [104, E5], [106, C5], [108, A4], [110, G4],
    ];
    for (const [t, f] of MEL) bell(t, f, 2.2, 0.06);
    for (let t = 0; t < 128; t += 8) if (t % 32 !== 0) chime(t + 4, n('E',5), 0.02);

    // ruído suave (como chuva distante)
    noisePulse(0, 128, 0.012);
    noisePulse(16, 96, 0.012);
    noisePulse(32, 64, 0.01);
    noisePulse(64, 32, 0.01);

    // evento de fim de loop: -1
    ev.push([128, 0, { kind: 'loop' }]);
    this.events = ev.sort((a, b) => a[0] - b[0]);
    this.step = 0;
    this.nextEv = 0;
    this.time = 0;
  }

  scheduleEvents(fromStep, toStep) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime;
    for (; this.nextEv < this.events.length; this.nextEv++) {
      const ev = this.events[this.nextEv];
      if (ev[0] >= toStep) break;
      const when = t0 + Math.max(0, ev[0] - fromStep) * this.tempo;
      this.playEvent(ev[1], ev[2], when);
    }
  }
  playEvent(dur, o, when) {
    const t = when;
    if (o.kind === 'pad') {
      for (const oscT of ['triangle', 'sine']) {
        const osc = this.ctx.createOscillator();
        osc.type = oscT;
        osc.frequency.value = o.f;
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(o.vol, t + 0.5);
        g.gain.setValueAtTime(o.vol, t + dur * this.tempo * 0.7);
        g.gain.linearRampToValueAtTime(0.0001, t + dur * this.tempo);
        const flt = this.ctx.createBiquadFilter();
        flt.type = 'lowpass';
        flt.frequency.value = 900;
        osc.connect(g); g.connect(flt); flt.connect(this.musicBus);
        osc.start(t); osc.stop(t + dur * this.tempo + 0.1);
      }
    } else if (o.kind === 'bass') {
      const osc = this.ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = o.f;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.14, t + 0.03);
      g.gain.setValueAtTime(0.12, t + dur * this.tempo * 0.5);
      g.gain.linearRampToValueAtTime(0.0001, t + dur * this.tempo);
      osc.connect(g); g.connect(this.musicBus);
      osc.start(t); osc.stop(t + dur * this.tempo + 0.1);
    } else if (o.kind === 'bell') {
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = o.f;
      const osc2 = this.ctx.createOscillator();
      osc2.type = 'sine';
      osc2.frequency.value = o.f * 2.01;
      const g = this.ctx.createGain();
      const g2 = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(o.vol, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      g2.gain.setValueAtTime(0.0001, t);
      g2.gain.linearRampToValueAtTime(o.vol * 0.4, t + 0.008);
      g2.gain.exponentialRampToValueAtTime(0.0001, t + dur * 0.6);
      const flt = this.ctx.createBiquadFilter();
      flt.type = 'highpass'; flt.frequency.value = 400;
      osc.connect(g); g.connect(flt); flt.connect(this.musicBus);
      osc2.connect(g2); g2.connect(flt);
      osc.start(t); osc.stop(t + dur + 0.1);
      osc2.start(t); osc2.stop(t + dur * 0.6 + 0.1);
    } else if (o.kind === 'chime') {
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = o.f;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(o.vol, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
      osc.connect(g); g.connect(this.musicBus);
      osc.start(t); osc.stop(t + 1.5);
    } else if (o.kind === 'noise') {
      // "vento" — noise muito suave e filtrado
      const len = Math.floor(this.ctx.sampleRate * dur * this.tempo);
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * 0.35;
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      const flt = this.ctx.createBiquadFilter();
      flt.type = 'lowpass'; flt.frequency.value = 240;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(o.vol, t + 2.0);
      g.gain.setValueAtTime(o.vol, t + dur * this.tempo - 1);
      g.gain.linearRampToValueAtTime(0.0001, t + dur * this.tempo);
      src.connect(flt); flt.connect(g); g.connect(this.musicBus);
      src.start(t); src.stop(t + dur * this.tempo + 0.1);
    } else if (o.kind === 'loop') {
      // agenda o próximo ciclo
      const ln = this.ctx.currentTime + (128 - fromStep) * this.tempo;
      // (o main update lida com o loop; aqui nada)
    }
  }

  // avança o sequenciador (chamado no game loop com dt)
  update(dt) {
    if (!this.ctx || this.external || !this.musicStarted) return;
    this.time += dt;
    const stepNow = this.time / this.tempo;
    if (stepNow > 130) {
      this.time -= 128 * this.tempo;
      this.step = 0;
      this.nextEv = 0;
      this.scheduleEvents(0, Math.min(130, stepNow - 128));
    } else {
      this.scheduleEvents(this.step, stepNow);
      this.step = stepNow;
    }
  }

  // ---------------- efeitos sonoros ----------------
  sfx(kind, opts = {}) {
    this.ensure();
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const vol = opts.vol !== undefined ? opts.vol : 0.16;
    const out = this.sfxBus;
    const tone = (type, f0, f1, dur, g0 = vol, g1 = 0.0001, delay = 0) => {
      const o = this.ctx.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime(f0, t + delay);
      if (f1) o.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + delay + dur);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t + delay);
      g.gain.linearRampToValueAtTime(g0, t + delay + 0.012);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0001, g1), t + delay + dur);
      o.connect(g); g.connect(out);
      o.start(t + delay); o.stop(t + delay + dur + 0.05);
    };
    switch (kind) {
      case 'jump': tone('square', 320, 640, 0.18, 0.12); break;
      case 'land': tone('square', 160, 70, 0.12, 0.09); break;
      case 'hit': tone('square', 220, 90, 0.14, 0.15); break;
      case 'hurt': tone('sawtooth', 400, 90, 0.3, 0.16); break;
      case 'coin': tone('square', 988, 0, 0.06, 0.09); tone('square', 1319, 0, 0.12, 0.09, 0.0001, 0.07); break;
      case 'pickup': tone('square', 660, 0, 0.07, 0.09); tone('square', 880, 0, 0.1, 0.09, 0.0001, 0.08); break;
      case 'quest': tone('triangle', 523, 0, 0.12, 0.14); tone('triangle', 659, 0, 0.12, 0.14, 0.0001, 0.12); tone('triangle', 784, 0, 0.22, 0.14, 0.0001, 0.24); break;
      case 'complete': tone('triangle', 523, 0, 0.14, 0.13); tone('triangle', 659, 0, 0.14, 0.13, 0.0001, 0.15); tone('triangle', 784, 0, 0.14, 0.13, 0.0001, 0.3); tone('triangle', 1047, 0, 0.4, 0.14, 0.0001, 0.45); break;
      case 'select': tone('square', 700, 500, 0.08, 0.1); break;
      case 'talk': tone('square', 440, 330, 0.05, 0.07); break;
      case 'blip': tone('square', 880, 0, 0.03, 0.05); break;
      case 'text': tone('square', 980, 900, 0.03, 0.035); break;
      case 'slash': { const len = Math.floor(this.ctx.sampleRate * 0.14); const b = this.ctx.createBuffer(1, len, this.ctx.sampleRate); const d = b.getChannelData(0); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2); const s = this.ctx.createBufferSource(); s.buffer = b; const flt = this.ctx.createBiquadFilter(); flt.type = 'bandpass'; flt.frequency.value = 1800; flt.Q.value = 1; const g = this.ctx.createGain(); g.gain.value = 0.22; s.connect(flt); flt.connect(g); g.connect(out); s.start(t); break; }
      case 'die': tone('sawtooth', 500, 60, 0.6, 0.15); break;
      case 'bloom': { for (const [f, d] of [[523,0],[659,0.09],[784,0.18],[1047,0.3]]) tone('triangle', f, 0, 1.2, 0.1, 0.0001, d); break; }
      case 'glitch': tone('square', 180, 900, 0.18, 0.08); tone('square', 700, 120, 0.2, 0.08, 0.0001, 0.1); break;
      case 'step': tone('square', 130 + Math.random() * 30, 90, 0.05, 0.05); break;
    }
  }
}
export const audio = new AudioEngine();
