/* ============================================================
   OMNI CLASH — AUDIO: everything synthesized with WebAudio.
   No sound files. Init on first user gesture.
   ============================================================ */
(function () {
  "use strict";

  const AudioSys = {
    ctx: null,
    master: null,
    musicGain: null,
    sfxGain: null,
    muted: false,
    musicOn: true,
    musicTimer: null,
    step: 0,

    init() {
      if (this.ctx) return;
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.muted ? 0 : 0.9;
        this.master.connect(this.ctx.destination);
        this.sfxGain = this.ctx.createGain();
        this.sfxGain.gain.value = 0.9;
        this.sfxGain.connect(this.master);
        this.musicGain = this.ctx.createGain();
        this.musicGain.gain.value = 0.32;
        this.musicGain.connect(this.master);
      } catch (e) {
        this.ctx = null;
      }
    },

    resume() {
      this.init();
      if (this.ctx && this.ctx.state === "suspended") this.ctx.resume();
    },

    setMuted(m) {
      this.muted = m;
      if (this.master) this.master.gain.value = m ? 0 : 0.9;
    },

    toggleMute() {
      this.setMuted(!this.muted);
      return this.muted;
    },

    /* -------- low-level helpers -------- */
    beep(freq, dur, type, vol, slideTo, when) {
      if (!this.ctx) return;
      const t = (when !== undefined ? when : this.ctx.currentTime);
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = type || "square";
      o.frequency.setValueAtTime(freq, t);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
      g.gain.setValueAtTime(vol || 0.2, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(this.sfxGain);
      o.start(t); o.stop(t + dur + 0.02);
    },

    noise(dur, vol, filterFreq, when) {
      if (!this.ctx) return;
      const t = (when !== undefined ? when : this.ctx.currentTime);
      const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      const f = this.ctx.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.value = filterFreq || 1200;
      const g = this.ctx.createGain();
      g.gain.value = vol || 0.25;
      src.connect(f); f.connect(g); g.connect(this.sfxGain);
      src.start(t);
    },

    /* -------- game SFX -------- */
    select()  { this.resume(); this.beep(660, 0.06, "square", 0.15); },
    confirm() { this.resume(); this.beep(520, 0.08, "square", 0.16); this.beep(780, 0.12, "square", 0.16, null, this.ctx ? this.ctx.currentTime + 0.07 : 0); },
    deny()    { this.resume(); this.beep(160, 0.18, "sawtooth", 0.18, 90); },
    jump()    { this.resume(); this.beep(300, 0.14, "sine", 0.14, 640); },
    swing()   { this.resume(); this.noise(0.07, 0.10, 2600); },
    punch()   { this.resume(); this.noise(0.09, 0.30, 900); this.beep(140, 0.08, "square", 0.18, 60); },
    kick()    { this.resume(); this.noise(0.12, 0.34, 620); this.beep(110, 0.10, "square", 0.20, 50); },
    block()   { this.resume(); this.beep(220, 0.07, "triangle", 0.18); this.noise(0.05, 0.10, 3200); },
    hurt()    { this.resume(); this.beep(260, 0.12, "sawtooth", 0.15, 130); },
    special() {
      this.resume();
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      this.beep(880, 0.22, "sawtooth", 0.16, 180, t);
      this.beep(1320, 0.30, "sine", 0.12, 320, t + 0.03);
    },
    boom() {
      this.resume();
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      this.noise(0.5, 0.5, 400, t);
      this.beep(70, 0.5, "sine", 0.4, 30, t);
    },
    ko() {
      this.resume();
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      this.beep(520, 0.5, "sawtooth", 0.25, 60, t);
      this.noise(0.4, 0.4, 500, t);
      this.beep(60, 0.6, "sine", 0.35, 25, t + 0.05);
    },
    roundWin() {
      this.resume();
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      [523, 659, 784].forEach((f, i) => this.beep(f, 0.16, "square", 0.16, null, t + i * 0.11));
    },

    /* -------- tiny loop BGM (dark synth riff) -------- */
    BASS: [55, 55, 0, 55, 0, 65.4, 0, 55, 49, 49, 0, 49, 0, 58.3, 0, 49],
    ARP:  [220, 0, 261.6, 0, 311.1, 0, 261.6, 0, 196, 0, 233.1, 0, 311.1, 0, 233.1, 0],

    startMusic() {
      this.resume();
      if (!this.ctx || this.musicTimer) return;
      this.step = 0;
      const spb = 60 / 138 / 2; // 8th notes at 138bpm
      this.musicTimer = setInterval(() => {
        if (!this.ctx || this.muted || !this.musicOn) return;
        const t = this.ctx.currentTime + 0.05;
        const s = this.step % 16;
        const b = this.BASS[s];
        if (b) {
          const o = this.ctx.createOscillator();
          const g = this.ctx.createGain();
          o.type = "sawtooth"; o.frequency.value = b;
          g.gain.setValueAtTime(0.5, t);
          g.gain.exponentialRampToValueAtTime(0.001, t + spb * 0.9);
          o.connect(g); g.connect(this.musicGain);
          o.start(t); o.stop(t + spb);
        }
        const a = this.ARP[s];
        if (a && this.step % 2 === 0) {
          const o = this.ctx.createOscillator();
          const g = this.ctx.createGain();
          o.type = "triangle"; o.frequency.value = a;
          g.gain.setValueAtTime(0.18, t);
          g.gain.exponentialRampToValueAtTime(0.001, t + spb * 1.4);
          o.connect(g); g.connect(this.musicGain);
          o.start(t); o.stop(t + spb * 1.5);
        }
        if (s % 4 === 0) this.noise(0.04, 0.05, 5000, t); // hat
        this.step++;
      }, spb * 1000);
    },

    stopMusic() {
      if (this.musicTimer) { clearInterval(this.musicTimer); this.musicTimer = null; }
    },
  };

  window.AUDIO = AudioSys;
})();
