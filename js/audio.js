// SOLARIA — efeitos sonoros 8-bit sintetizados (sem arquivos externos)
// Tudo é gerado por osciladores WebAudio; nenhuma música ou faixa externa.
import { mulberry32 } from './math.js';

const NOTE = { C: 16.35, 'C#': 17.32, D: 18.35, 'D#': 19.45, E: 20.6, F: 21.83, 'F#': 23.12, G: 24.5, 'G#': 25.96, A: 27.5, 'A#': 29.14, B: 30.87 };
const n = (name, oct) => NOTE[name] * Math.pow(2, oct + 1);

export class AudioEngine {
  constructor() {
    this.sfxVol = 0.8;
    this.muted = false;
    this.ctx = null;
    this._t = 0;
    this._last = {};
    try { this.ctx = new AudioContext(); this.ctx.resume(); } catch (e) { this.ctx = null; }
  }
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }
  get isMuted() { return this.muted; }
  setMuted(m) { this.muted = m; if (m && this.ctx) this.ctx.suspend(); else if (this.ctx) this.ctx.resume(); }
  setSfxVol(v) { this.sfxVol = Math.max(0, Math.min(1, v)); }

  tone(freq, dur, type = 'square', vol = 0.16, slide = 0, delay = 0) {
    if (!this.ctx || this.muted) return;
    const t0 = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t0 + dur);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol * this.sfxVol, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(this.ctx.destination);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }
  noise(dur, vol = 0.2, delay = 0) {
    if (!this.ctx || this.muted) return;
    const t0 = this.ctx.currentTime + delay;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    const r = mulberry32(Math.floor(t0 * 1000) ^ 0x9E37);
    for (let i = 0; i < len; i++) d[i] = (r() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol * this.sfxVol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(g); g.connect(this.ctx.destination);
    src.start(t0);
  }
  sfx(name) {
    if (this.muted) return;
    const now = performance.now();
    if (this._last[name] && now - this._last[name] < 40) return;
    this._last[name] = now;
    switch (name) {
      case 'select': this.tone(660, 0.07, 'square', 0.08); break;
      case 'blip': this.tone(880, 0.05, 'square', 0.06); break;
      case 'talk': this.tone(440, 0.08, 'sine', 0.1, -60); break;
      case 'jump': this.tone(300, 0.16, 'square', 0.09, 380); break;
      case 'djump': this.tone(420, 0.14, 'square', 0.09, 520); this.tone(620, 0.12, 'triangle', 0.07, 300, 0.05); break;
      case 'land': this.noise(0.09, 0.1); this.tone(160, 0.08, 'sine', 0.12, -60); break;
      case 'coin': this.tone(880, 0.07, 'square', 0.08); this.tone(1320, 0.1, 'square', 0.07, 0, 0.06); break;
      case 'slash': this.noise(0.12, 0.13); this.tone(500, 0.09, 'sawtooth', 0.05, -260); break;
      case 'hit': this.noise(0.08, 0.16); this.tone(220, 0.1, 'square', 0.1, -110); break;
      case 'hurt': this.tone(300, 0.24, 'sawtooth', 0.13, -160); this.tone(150, 0.28, 'square', 0.1, -70, 0.05); break;
      case 'die': this.tone(320, 0.22, 'square', 0.11, -220); this.noise(0.14, 0.1, 0.04); break;
      case 'complete': this.arp([523, 659, 784, 1046], 0.1, 0.09, 'square'); break;
      case 'quest': this.arp([392, 523, 659], 0.09, 0.08, 'triangle'); break;
      case 'artifact': this.arp([523, 659, 784, 1046, 1318], 0.11, 0.08, 'sine'); break;
      case 'chest': this.arp([330, 415, 494, 659], 0.12, 0.1, 'triangle'); break;
      case 'seal': this.tone(196, 0.9, 'sine', 0.09, 6); this.tone(392, 0.9, 'sine', 0.06, 8, 0.05); this.tone(784, 1.0, 'sine', 0.04, 4, 0.12); break;
      case 'boss': this.tone(110, 0.8, 'sawtooth', 0.12, -30); this.tone(82, 0.9, 'square', 0.08, -20, 0.1); this.noise(0.3, 0.08, 0.1); break;
      case 'roar': this.tone(140, 0.5, 'sawtooth', 0.14, -60); this.noise(0.4, 0.12, 0.02); break;
      case 'portal': this.tone(300, 0.7, 'sine', 0.1, 400); this.tone(600, 0.7, 'sine', 0.06, 800, 0.08); break;
      case 'heal': this.arp([523, 659, 784], 0.14, 0.1, 'sine'); break;
      case 'splash': this.noise(0.25, 0.15); this.tone(500, 0.2, 'sine', 0.06, -320); break;
      case 'swim': this.noise(0.12, 0.05); break;
      case 'respawn': this.arp([392, 523, 659, 784], 0.12, 0.11, 'triangle'); break;
      default: break;
    }
  }
  arp(freqs, dur, step, type) {
    freqs.forEach((f, i) => this.tone(f, dur, type, 0.09, 0, i * step));
  }
}

export const audio = new AudioEngine();
