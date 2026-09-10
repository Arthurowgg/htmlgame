/** Procedural SFX + soft ambient bed via Web Audio */
class AudioSys {
  constructor() {
    this.ac = null;
    this.sfx = 0.7;
    this.music = 0.35;
    this._bed = null;
    this.enabled = true;
  }
  ensure() {
    if (this.ac) return this.ac;
    try {
      this.ac = new (window.AudioContext || window.webkitAudioContext)();
    } catch { this.enabled = false; }
    return this.ac;
  }
  resume() {
    const ac = this.ensure();
    if (ac && ac.state === 'suspended') ac.resume();
  }
  setSfx(v) { this.sfx = v; }
  setMusic(v) {
    this.music = v;
    if (this._bedGain) this._bedGain.gain.value = v * 0.15;
  }

  tone(freq, dur, type = 'square', vol = 0.08, slide = 0) {
    if (!this.enabled) return;
    const ac = this.ensure(); if (!ac) return;
    const t0 = ac.currentTime;
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t0 + dur);
    g.gain.setValueAtTime(vol * this.sfx, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(ac.destination);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }

  noise(dur, vol = 0.05) {
    if (!this.enabled) return;
    const ac = this.ensure(); if (!ac) return;
    const n = (dur * ac.sampleRate) | 0;
    const buf = ac.createBuffer(1, n, ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    const src = ac.createBufferSource();
    src.buffer = buf;
    const g = ac.createGain();
    const f = ac.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 1200;
    g.gain.setValueAtTime(vol * this.sfx, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + dur);
    src.connect(f); f.connect(g); g.connect(ac.destination);
    src.start();
  }

  ui() { this.tone(720, 0.05, 'square', 0.04); }
  click() { this.tone(520, 0.04, 'square', 0.035); }
  hit() { this.tone(180, 0.1, 'sawtooth', 0.07, -80); this.noise(0.06, 0.04); }
  swing() { this.tone(300, 0.08, 'triangle', 0.04, -120); }
  hurt() { this.tone(140, 0.18, 'sawtooth', 0.08, -60); }
  jump() { this.tone(280, 0.1, 'square', 0.05, 220); }
  pickup() { this.tone(660, 0.06, 'square', 0.05); setTimeout(() => this.tone(880, 0.08, 'square', 0.05), 50); }
  quest() { this.tone(523, 0.1, 'triangle', 0.06); setTimeout(() => this.tone(659, 0.1, 'triangle', 0.06), 90); setTimeout(() => this.tone(784, 0.16, 'triangle', 0.07), 180); }
  level() { this.tone(392, 0.12, 'square', 0.05); setTimeout(() => this.tone(523, 0.12, 'square', 0.05), 100); setTimeout(() => this.tone(659, 0.2, 'square', 0.06), 200); }
  step() { this.noise(0.03, 0.025); }
  boss() {
    this.tone(80, 0.4, 'sawtooth', 0.09, 20);
    setTimeout(() => this.tone(60, 0.5, 'sawtooth', 0.08), 200);
  }

  startBed() {
    if (!this.enabled || this._bed) return;
    const ac = this.ensure(); if (!ac) return;
    // soft drone + slow fifth
    const mk = (freq, type, detune = 0) => {
      const o = ac.createOscillator();
      o.type = type; o.frequency.value = freq; o.detune.value = detune;
      return o;
    };
    const g = ac.createGain();
    g.gain.value = this.music * 0.15;
    this._bedGain = g;
    const f = ac.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 600;
    const o1 = mk(110, 'sine');
    const o2 = mk(164.81, 'sine', 6);
    const o3 = mk(220, 'triangle', -4);
    const lg = ac.createGain(); lg.gain.value = 0.4;
    o1.connect(g); o2.connect(g); o3.connect(lg); lg.connect(f); f.connect(g);
    g.connect(ac.destination);
    o1.start(); o2.start(); o3.start();
    this._bed = [o1, o2, o3];
  }
  stopBed() {
    if (!this._bed) return;
    try { this._bed.forEach(o => o.stop()); } catch {}
    this._bed = null;
  }
}

export const audio = new AudioSys();
