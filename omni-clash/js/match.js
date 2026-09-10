/* ============================================================
   OMNI CLASH — MATCH
   Round flow (best of 3), procedural stages, HUD, effects.
   Logical resolution: 960x540.
   ============================================================ */
(function () {
  "use strict";

  const ROUND_TIME = 99;
  const WINS_NEEDED = 2;

  /* ---------------- stages ---------------- */
  const STAGES = [
    {
      name: "NEON NEW YORK",
      sky: ["#1a1030", "#3b1d4e", "#8a2f4f"],
      far: "#241638", mid: "#180f28", near: "#0d0a18",
      floorTop: "#2a2140", floor: "#141020",
      draw(ctx, t) {
        // moon
        ctx.fillStyle = "#f4ecd8";
        ctx.beginPath(); ctx.arc(790, 90, 34, 0, 7); ctx.fill();
        ctx.fillStyle = "rgba(244,236,216,.12)";
        ctx.beginPath(); ctx.arc(790, 90, 52, 0, 7); ctx.fill();
        // stars
        ctx.fillStyle = "rgba(255,255,255,.7)";
        for (let i = 0; i < 40; i++) {
          const x = (i * 137) % 960, y = (i * 61) % 220;
          if ((i + Math.floor(t / 30)) % 7 !== 0) ctx.fillRect(x, y, 2, 2);
        }
        // skyline far
        ctx.fillStyle = this.far;
        for (let i = 0; i < 12; i++) {
          const bw = 70 + (i * 53) % 60, bh = 120 + (i * 97) % 140, bx = i * 84 - 30;
          ctx.fillRect(bx, 330 - bh + 120, bw, bh + 130);
        }
        // windows mid
        ctx.fillStyle = this.mid;
        for (let i = 0; i < 9; i++) {
          const bw = 90 + (i * 71) % 70, bh = 90 + (i * 131) % 110, bx = i * 112 - 20;
          ctx.fillRect(bx, 430 - bh, bw, bh + 30);
        }
        ctx.fillStyle = "rgba(255,212,42,.5)";
        for (let i = 0; i < 60; i++) {
          const x = (i * 173) % 940, y = 300 + (i * 89) % 150;
          if ((i * 7 + Math.floor(t / 50)) % 5 < 3) ctx.fillRect(x, y, 4, 6);
        }
        // water tower
        ctx.fillStyle = this.near;
        ctx.fillRect(70, 330, 60, 60);
        ctx.beginPath(); ctx.moveTo(60, 332); ctx.lineTo(140, 332); ctx.lineTo(100, 306); ctx.closePath(); ctx.fill();
      },
    },
    {
      name: "WAYNE MANOR",
      sky: ["#0b0f1a", "#101828", "#1c2a40"],
      far: "#0e1420", mid: "#0a0e18", near: "#06080f",
      floorTop: "#1c2434", floor: "#0c1018",
      draw(ctx, t) {
        // stars
        ctx.fillStyle = "rgba(255,255,255,.5)";
        for (let i = 0; i < 30; i++) ctx.fillRect((i * 211) % 960, (i * 83) % 190, 2, 2);
        // bats crossing
        ctx.fillStyle = "#04060a";
        for (let i = 0; i < 4; i++) {
          const bx = ((t * (0.6 + i * 0.2)) + i * 300) % 1100 - 70;
          const by = 70 + i * 28 + Math.sin(t * 0.05 + i) * 8;
          ctx.beginPath();
          ctx.moveTo(bx, by);
          ctx.quadraticCurveTo(bx - 8, by - 6, bx - 14, by);
          ctx.quadraticCurveTo(bx - 6, by + 3, bx, by + 1);
          ctx.quadraticCurveTo(bx + 6, by + 3, bx + 14, by);
          ctx.quadraticCurveTo(bx + 8, by - 6, bx, by);
          ctx.fill();
        }
        // manor silhouette
        ctx.fillStyle = this.mid;
        ctx.fillRect(560, 220, 320, 230);
        ctx.beginPath();
        ctx.moveTo(540, 224); ctx.lineTo(720, 130); ctx.lineTo(900, 224);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = "#0a0e18";
        ctx.fillRect(690, 160, 60, 70);
        // lit windows
        ctx.fillStyle = "rgba(255,212,42,.4)";
        [[600, 260], [660, 260], [780, 260], [840, 260], [620, 330], [800, 330]].forEach(([x, y]) => {
          ctx.fillRect(x, y, 22, 30);
        });
        // columns left
        ctx.fillStyle = this.near;
        ctx.fillRect(60, 260, 26, 190); ctx.fillRect(130, 260, 26, 190);
        ctx.fillRect(46, 240, 124, 24);
        // gate
        ctx.strokeStyle = "#04060a"; ctx.lineWidth = 5;
        for (let i = 0; i < 8; i++) { ctx.beginPath(); ctx.moveTo(220 + i * 16, 330); ctx.lineTo(220 + i * 16, 450); ctx.stroke(); }
        ctx.beginPath(); ctx.moveTo(210, 340); ctx.quadraticCurveTo(300, 300, 390, 340); ctx.stroke();
        // rain
        ctx.strokeStyle = "rgba(160,190,230,.16)"; ctx.lineWidth = 1;
        for (let i = 0; i < 46; i++) {
          const rx = (i * 149 + t * 12) % 990, ry = (i * 97 + t * 26) % 520;
          ctx.beginPath(); ctx.moveTo(rx, ry); ctx.lineTo(rx - 4, ry + 14); ctx.stroke();
        }
      },
    },
    {
      name: "THEMYSCIRA SHORE",
      sky: ["#2a1440", "#8a2f4f", "#f2a54a"],
      far: "#402048", mid: "#301740", near: "#1c0e2c",
      floorTop: "#c98a4b", floor: "#8a5a30",
      draw(ctx, t) {
        // sun
        ctx.fillStyle = "#ffd9a0";
        ctx.beginPath(); ctx.arc(480, 200, 46, 0, 7); ctx.fill();
        ctx.fillStyle = "rgba(255,217,160,.25)";
        ctx.beginPath(); ctx.arc(480, 200, 74, 0, 7); ctx.fill();
        // sea
        const sea = ctx.createLinearGradient(0, 300, 0, 420);
        sea.addColorStop(0, "#35205c"); sea.addColorStop(1, "#53307a");
        ctx.fillStyle = sea;
        ctx.fillRect(0, 300, 960, 130);
        ctx.strokeStyle = "rgba(255,220,170,.35)"; ctx.lineWidth = 2;
        for (let i = 0; i < 5; i++) {
          ctx.beginPath();
          const yy = 316 + i * 18;
          ctx.moveTo(0, yy);
          for (let x = 0; x <= 960; x += 40) ctx.lineTo(x, yy + Math.sin(x * 0.03 + t * 0.04 + i) * 3);
          ctx.stroke();
        }
        // columns
        ctx.fillStyle = this.near;
        [80, 170, 850].forEach((x, i) => {
          const h = 190 - i * 10;
          ctx.fillRect(x, 430 - h, 30, h);
          ctx.fillRect(x - 8, 430 - h - 16, 46, 18);
        });
        // distant island
        ctx.fillStyle = this.mid;
        ctx.beginPath();
        ctx.moveTo(600, 310);
        ctx.quadraticCurveTo(700, 240, 800, 310);
        ctx.fill();
      },
    },
  ];

  /* ---------------- particles ---------------- */
  class Particle {
    constructor(x, y, vx, vy, life, color, size, grav) {
      this.x = x; this.y = y; this.vx = vx; this.vy = vy;
      this.life = life; this.maxLife = life;
      this.color = color; this.size = size; this.grav = grav || 0.25;
    }
    update() {
      this.x += this.vx; this.y += this.vy; this.vy += this.grav; this.life--;
    }
    draw(ctx) {
      const a = Math.max(0, this.life / this.maxLife);
      ctx.globalAlpha = a;
      ctx.fillStyle = this.color;
      ctx.beginPath(); ctx.arc(this.x, this.y, this.size * (0.4 + a * 0.6), 0, 7); ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  /* ---------------- match ---------------- */
  class Match {
    constructor(canvas, cfg) {
      // cfg: { p1: charDef, p2: charDef, controls2: 'p2'|'cpu', difficulty }
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d");
      this.stage = STAGES[Math.floor(Math.random() * STAGES.length)];
      this.p1 = new window.Fighter(cfg.p1, 0, "p1");
      this.p2 = new window.Fighter(cfg.p2, 1, cfg.controls2);
      this.fighters = [this.p1, this.p2];
      this.ai = cfg.controls2 === "cpu" ? new window.AIController(cfg.difficulty) : null;
      this.projectiles = [];
      this.particles = [];
      this.booms = [];
      this.shakeT = 0; this.shakeAmp = 0;
      this.frame = 0;
      this.over = false;
      this.winner = null;
      this.roundNo = 1;
      this.phase = "intro";   // intro | fight | ko | roundend | matchend | paused
      this.phaseT = 0;
      this.timer = ROUND_TIME;
      this.banner = { text: "ROUND 1", sub: "", t: 0 };
      this.onEnd = cfg.onEnd || null;   // callback(winnerChar, stats)
      this.slowmo = 0;
      this.paused = false;
    }

    /* ---------- effects api ---------- */
    shake(amp) { this.shakeAmp = Math.max(this.shakeAmp, amp); this.shakeT = 12; }
    spawnSpark(x, y, color, n) {
      for (let i = 0; i < n; i++) {
        this.particles.push(new Particle(
          x, y,
          (Math.random() - 0.5) * 7, (Math.random() - 0.8) * 6,
          16 + Math.random() * 12, color, 2 + Math.random() * 2.5
        ));
      }
    }
    spawnBoom(x, y, r) {
      this.booms.push({ x, y, r, t: 0 });
      this.spawnSpark(x, y, "#8fd94a", 16);
      this.spawnSpark(x, y, "#ffd42a", 10);
    }
    spawnDashGlow(f) {
      this.spawnSpark(f.x + f.facing * 30, f.y - 80, "#ffd42a", 12);
    }
    onCombo(f) {
      this.banner.combo = { who: f, n: f.combo, t: 40 };
    }

    onKO(loser) {
      if (this.phase !== "fight") return;
      this.phase = "ko";
      this.phaseT = 0;
      this.slowmo = 46;
      const winner = this.fighters.find(f => f !== loser);
      winner.wins++;
      this.banner = { text: "K.O.!", sub: "", t: 60 };
      AUDIO.ko();
    }

    /* ---------- loop ---------- */
    update() {
      this.frame++;
      if (this.phase === "paused" || this.phase === "matchend") return;

      if (this.shakeT > 0) this.shakeT--;

      if (this.slowmo > 0) {
        this.slowmo--;
        if (this.frame % 2 === 0) return; // half speed
      }

      const fightInputsAllowed = this.phase === "fight";

      // AI
      if (this.ai && fightInputsAllowed) this.ai.update(this.p2, this.p1, this);
      else if (this.ai) { const i = this.p2.input; i.left = i.right = i.up = i.down = i.punch = i.kick = i.special = false; }

      // block inputs outside fight
      if (!fightInputsAllowed) {
        for (const f of this.fighters) {
          f.input.left = f.input.right = f.input.up = f.input.down = false;
          f.input.punch = f.input.kick = f.input.special = false;
        }
      }

      this.p1.update(this, this.p2);
      this.p2.update(this, this.p1);

      // soft body push (no overlap)
      const dx = this.p2.x - this.p1.x;
      const minD = 52;
      if (Math.abs(dx) < minD && Math.abs(this.p1.y - this.p2.y) < 100) {
        const push = (minD - Math.abs(dx)) / 2 * Math.sign(dx || 1);
        this.p1.x -= push; this.p2.x += push;
        this.p1.x = Math.max(50, Math.min(910, this.p1.x));
        this.p2.x = Math.max(50, Math.min(910, this.p2.x));
      }

      // projectiles
      for (const p of this.projectiles) {
        p.update(this);
        if (p.dead) continue;
        const victim = p.owner === this.p1 ? this.p2 : this.p1;
        if (victim.state !== "ko" && !p.hit &&
            Math.abs(victim.x - p.x) < 34 && Math.abs((victim.y - 80) - p.y) < 66) {
          p.hit = true;
          if (p.kind !== "bomb") {
            victim.takeHit(p.dmg, Math.sign(p.vx) || 1, p.stun > 18 ? 2 : 4, this, p.kind === "web" ? false : false);
            if (p.kind === "web") { victim.hitstun = Math.max(victim.hitstun, 24); }
            p.dead = true;
          }
        }
      }
      this.projectiles = this.projectiles.filter(p => !p.dead);

      // particles & booms
      for (const pt of this.particles) pt.update();
      this.particles = this.particles.filter(pt => pt.life > 0);
      for (const b of this.booms) b.t++;
      this.booms = this.booms.filter(b => b.t < 18);

      // phase machine
      this.phaseT++;
      switch (this.phase) {
        case "intro":
          if (this.phaseT === 1) { this.banner = { text: "ROUND " + this.roundNo, sub: this.stage.name, t: 55 }; AUDIO.confirm(); }
          if (this.phaseT > 60) {
            this.phase = "fight";
            this.banner = { text: "FIGHT!", sub: "", t: 34 };
            AUDIO.roundWin();
          }
          break;
        case "fight": {
          if (this.banner.t > 0) this.banner.t--;
          if (this.frame % 60 === 0 && this.timer > 0) {
            this.timer--;
            if (this.timer <= 10 && this.timer > 0) AUDIO.select();
          }
          if (this.timer <= 0) this.timeUp();
          break;
        }
        case "ko":
          if (this.banner.t > 0) this.banner.t--;
          if (this.phaseT > 130) this.endRound();
          break;
        case "roundend":
          if (this.phaseT > 40) this.startNextRound();
          break;
      }
    }

    timeUp() {
      this.phase = "ko";
      this.phaseT = 0;
      const w = this.p1.hp === this.p2.hp ? null : (this.p1.hp > this.p2.hp ? this.p1 : this.p2);
      if (w) w.wins++;
      this.banner = { text: "TIME UP", sub: "", t: 60 };
      AUDIO.ko();
    }

    endRound() {
      this.phase = "roundend";
      this.phaseT = 0;
      const leader = this.fighters.find(f => f.wins >= WINS_NEEDED);
      if (leader) {
        leader.state = "win";
        leader.stateT = 0;
        const other = this.fighters.find(f => f !== leader);
        this.winner = leader;
        this.over = true;
        this.phase = "matchend";
        this.banner = { text: leader.def.name + " WINS", sub: "MATCH", t: 9999 };
        AUDIO.roundWin();
        if (this.onEnd) {
          setTimeout(() => this.onEnd(leader.def, this.collectStats()), 1600);
        }
      } else {
        this.banner = { text: this.fighters[0].wins + " — " + this.fighters[1].wins, sub: "", t: 50 };
      }
    }

    startNextRound() {
      if (this.over) return;
      this.roundNo++;
      this.timer = ROUND_TIME;
      this.projectiles = [];
      this.p1.resetRound(300);
      this.p2.resetRound(660);
      this.phase = "intro";
      this.phaseT = 0;
    }

    collectStats() {
      return {
        p1: { name: this.p1.def.name, dealt: Math.round(this.p1.statsDealt) },
        p2: { name: this.p2.def.name, dealt: Math.round(this.p2.statsDealt) },
        rounds: this.p1.wins + " × " + this.p2.wins,
      };
    }

    setPaused(p) {
      this.paused = p;
      this.phase = p ? "paused" : "fight";
    }

    /* ---------- render ---------- */
    draw() {
      const ctx = this.ctx;
      ctx.save();
      if (this.shakeT > 0) {
        const a = this.shakeAmp * (this.shakeT / 12);
        ctx.translate((Math.random() - 0.5) * a, (Math.random() - 0.5) * a);
        if (this.shakeT === 0) this.shakeAmp = 0;
      }

      // sky
      const g = ctx.createLinearGradient(0, 0, 0, 430);
      g.addColorStop(0, this.stage.sky[0]);
      g.addColorStop(0.55, this.stage.sky[1]);
      g.addColorStop(1, this.stage.sky[2]);
      ctx.fillStyle = g;
      ctx.fillRect(-20, -20, 1000, 460);

      this.stage.draw(ctx, this.frame);

      // floor
      ctx.fillStyle = this.stage.floor;
      ctx.fillRect(-20, window.FighterApi.GROUND, 1000, 560 - window.FighterApi.GROUND + 20);
      ctx.fillStyle = this.stage.floorTop;
      ctx.fillRect(-20, window.FighterApi.GROUND - 4, 1000, 8);

      // entities (back to front)
      for (const p of this.projectiles) p.draw(ctx);
      for (const f of this.fighters) f.draw(ctx);

      for (const b of this.booms) {
        const pr = b.t / 18;
        ctx.strokeStyle = `rgba(143,217,74,${1 - pr})`;
        ctx.lineWidth = 5 * (1 - pr);
        ctx.beginPath(); ctx.arc(b.x, b.y, b.r * (0.4 + pr), 0, 7); ctx.stroke();
      }
      for (const pt of this.particles) pt.draw(ctx);

      ctx.restore();

      this.drawHUD(ctx);
    }

    drawHUD(ctx) {
      const bar = (x, dir, f, color) => {
        const w = 380, h = 22, y = 26;
        ctx.save();
        ctx.translate(x, y);
        if (dir < 0) { ctx.scale(-1, 1); }
        // frame
        ctx.fillStyle = "rgba(6,6,12,.75)";
        ctx.beginPath();
        ctx.moveTo(0, 0); ctx.lineTo(w + 14, 0); ctx.lineTo(w, h); ctx.lineTo(0, h);
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle = "#0a0a12"; ctx.lineWidth = 3; ctx.stroke();
        // hp
        const hpw = (w - 8) * (f.hp / f.maxhp);
        const grad = ctx.createLinearGradient(0, 0, w, 0);
        grad.addColorStop(0, color);
        grad.addColorStop(1, "#ffb199");
        ctx.fillStyle = f.hp / f.maxhp < 0.28 ? "#ff5252" : grad;
        ctx.beginPath();
        ctx.moveTo(4, 4);
        ctx.lineTo(4 + hpw, 4); ctx.lineTo(Math.max(4, 4 + hpw - 4), h - 4); ctx.lineTo(4, h - 4);
        ctx.closePath(); ctx.fill();
        ctx.restore();
      };
      bar(24, 1, this.p1, "#e23636");
      bar(936, -1, this.p2, "#2e6df6");

      // names
      ctx.font = "800 15px 'Segoe UI',sans-serif";
      ctx.fillStyle = "#fff";
      ctx.strokeStyle = "#000"; ctx.lineWidth = 3;
      ctx.textAlign = "left";
      ctx.strokeText(this.p1.def.name, 26, 68); ctx.fillText(this.p1.def.name, 26, 68);
      ctx.textAlign = "right";
      ctx.strokeText(this.p2.def.name, 934, 68); ctx.fillText(this.p2.def.name, 934, 68);

      // cooldown bars
      const cd = (x, dir, f) => {
        const w = 90, y = 76;
        ctx.save(); ctx.translate(x, y);
        if (dir < 0) ctx.scale(-1, 1);
        ctx.fillStyle = "rgba(6,6,12,.7)";
        ctx.fillRect(0, 0, w, 6);
        const pr = 1 - f.cooldown / f.def.special.cooldown;
        ctx.fillStyle = pr >= 1 ? "#ffd42a" : "#4a4a66";
        ctx.fillRect(0, 0, w * pr, 6);
        ctx.restore();
      };
      cd(26, 1, this.p1);
      cd(934, -1, this.p2);

      // round pips
      const pip = (x, y, filled, color) => {
        ctx.beginPath(); ctx.arc(x, y, 6, 0, 7);
        ctx.fillStyle = filled ? color : "rgba(255,255,255,.18)";
        ctx.fill();
        ctx.strokeStyle = "#000"; ctx.lineWidth = 2; ctx.stroke();
      };
      for (let i = 0; i < WINS_NEEDED; i++) pip(30 + i * 20, 96, this.p1.wins > i, "#e23636");
      for (let i = 0; i < WINS_NEEDED; i++) pip(930 - i * 20, 96, this.p2.wins > i, "#2e6df6");

      // timer
      ctx.font = "900 44px 'Segoe UI',sans-serif";
      ctx.textAlign = "center";
      ctx.strokeStyle = "#000"; ctx.lineWidth = 6;
      const tstr = this.phase === "fight" || this.phase === "ko" ? String(Math.max(0, this.timer)).padStart(2, "0") : "--";
      ctx.strokeText(tstr, 480, 62);
      ctx.fillStyle = this.timer <= 10 ? "#ff5252" : "#ffd42a";
      ctx.fillText(tstr, 480, 62);

      // combo
      if (this.banner.combo && this.banner.combo.t > 0) {
        this.banner.combo.t--;
        const cb = this.banner.combo;
        if (cb.n >= 2) {
          ctx.font = "900 26px Impact,'Arial Black',sans-serif";
          ctx.fillStyle = "#ffd42a";
          ctx.strokeStyle = "#000"; ctx.lineWidth = 4;
          const cx = cb.who.side === 0 ? 170 : 790;
          ctx.strokeText(cb.n + " HITS!", cx, 130);
          ctx.fillText(cb.n + " HITS!", cx, 130);
        }
      }

      // banner text
      if (this.banner.t > 0 || this.phase === "matchend") {
        const b = this.banner;
        const a = Math.min(1, b.t / 12);
        ctx.globalAlpha = Math.max(0.25, a);
        ctx.textAlign = "center";
        ctx.font = "900 74px Impact,'Arial Black',sans-serif";
        ctx.strokeStyle = "#000"; ctx.lineWidth = 10;
        ctx.strokeText(b.text, 480, 250);
        ctx.fillStyle = b.text.includes("K.O.") ? "#ff5252" : "#ffd42a";
        ctx.fillText(b.text, 480, 250);
        if (b.sub) {
          ctx.font = "800 18px 'Segoe UI',sans-serif";
          ctx.strokeStyle = "#000"; ctx.lineWidth = 5;
          ctx.strokeText(b.sub, 480, 286);
          ctx.fillStyle = "#fff";
          ctx.fillText(b.sub, 480, 286);
        }
        ctx.globalAlpha = 1;
      }

      // pause overlay
      if (this.phase === "paused") {
        ctx.fillStyle = "rgba(4,4,10,.66)";
        ctx.fillRect(0, 0, 960, 540);
        ctx.textAlign = "center";
        ctx.font = "900 60px Impact,'Arial Black',sans-serif";
        ctx.fillStyle = "#ffd42a";
        ctx.fillText("PAUSED", 480, 250);
        ctx.font = "800 17px 'Segoe UI',sans-serif";
        ctx.fillStyle = "#fff";
        ctx.fillText("P / ESC resume · L back to lobby", 480, 296);
      }
    }
  }

  window.Match = Match;
  window.MatchStages = STAGES;
})();
