/* ============================================================
   OMNI CLASH — FIGHTER ENGINE
   Physics, state machine, moves, hitboxes and the procedural
   character renderer (every sprite is drawn by code).
   ============================================================ */
(function () {
  "use strict";

  const GROUND = 470;          // stage floor y (logical 960x540)
  const GRAVITY = 0.85;
  const FACING = { LEFT: -1, RIGHT: 1 };

  /* ---------------- projectile ---------------- */
  class Projectile {
    constructor(owner, kind, x, y, dir, spec) {
      this.owner = owner;      // Fighter
      this.kind = kind;        // 'web' | 'batarang' | 'repulsor' | 'bomb'
      this.x = x; this.y = y;
      this.vx = dir * (spec.speed || 9);
      this.vy = 0;
      this.dir = dir;
      this.dmg = spec.dmg;
      this.stun = spec.stun || 16;
      this.dead = false;
      this.hit = false;
      this.t = 0;
      this.returning = false;  // batarang
      this.fuse = kind === "bomb" ? 78 : Infinity; // bomb airtime
      this.explodeOnGround = kind === "bomb";
    }
    update(match) {
      this.t++;
      if (this.kind === "batarang") {
        if (!this.returning && Math.abs(this.x - this.owner.x) > 340) this.returning = true;
        if (this.returning) {
          const dx = this.owner.x - this.x;
          const dy = this.owner.y - 60 - this.y;
          const d = Math.hypot(dx, dy) || 1;
          this.vx = (dx / d) * 10;
          this.vy = (dy / d) * 10;
          if (d < 26) this.dead = true;
        }
      }
      if (this.kind === "bomb") {
        this.vy += 0.22;
        if (this.t > this.fuse) this.detonate(match);
      }
      this.x += this.vx;
      this.y += this.vy;
      if (this.explodeOnGround && this.y >= GROUND - 8) this.detonate(match);
      if (this.x < -60 || this.x > 1020) this.dead = true;
    }
    detonate(match) {
      if (this.dead) return;
      this.dead = true;
      match.spawnBoom(this.x, this.y, 86);
      AUDIO.boom();
      // area damage
      for (const f of match.fighters) {
        if (f === this.owner || f.state === "ko") continue;
        if (Math.abs(f.x - this.x) < 86 && Math.abs((f.y - 70) - this.y) < 110) {
          f.takeHit(this.dmg, this.owner.facing, 22, match, true);
        }
      }
      match.shake(10);
    }
    draw(ctx) {
      ctx.save();
      ctx.translate(this.x, this.y);
      if (this.kind === "web") {
        ctx.fillStyle = "rgba(255,255,255,.35)";
        for (let i = 1; i <= 3; i++) {
          ctx.beginPath();
          ctx.arc(-this.dir * i * 9, Math.sin(this.t * .5 + i) * 3, 4 - i, 0, 7);
          ctx.fill();
        }
        ctx.fillStyle = "#fff";
        ctx.beginPath(); ctx.arc(0, 0, 7, 0, 7); ctx.fill();
        ctx.strokeStyle = "#cbd5ff"; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(0, 0, 7, 0, 7); ctx.stroke();
      } else if (this.kind === "batarang") {
        ctx.rotate(this.t * 0.45);
        ctx.fillStyle = "#20222e";
        ctx.beginPath();
        ctx.moveTo(0, -11); ctx.lineTo(4, -3); ctx.lineTo(13, 0); ctx.lineTo(4, 3);
        ctx.lineTo(0, 11); ctx.lineTo(-4, 3); ctx.lineTo(-13, 0); ctx.lineTo(-4, -3);
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle = "#ffd42a"; ctx.lineWidth = 1.4; ctx.stroke();
      } else if (this.kind === "repulsor") {
        const g = ctx.createRadialGradient(0, 0, 2, 0, 0, 16);
        g.addColorStop(0, "#ffffff"); g.addColorStop(.4, "#9fd8ff"); g.addColorStop(1, "rgba(80,160,255,0)");
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(0, 0, 16, 0, 7); ctx.fill();
      } else if (this.kind === "bomb") {
        ctx.rotate(this.t * 0.2);
        ctx.fillStyle = "#2ea44f";
        ctx.beginPath(); ctx.arc(0, 0, 10, 0, 7); ctx.fill();
        ctx.fillStyle = "#8fd94a";
        ctx.beginPath(); ctx.arc(-3, -3, 3, 0, 7); ctx.fill();
        ctx.strokeStyle = "#c9a227"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(0, -10); ctx.quadraticCurveTo(6, -16, 3, -20); ctx.stroke();
        if (this.t % 8 < 4) {
          ctx.fillStyle = "#ffd42a";
          ctx.beginPath(); ctx.arc(3, -21, 2.4, 0, 7); ctx.fill();
        }
      }
      ctx.restore();
    }
  }

  /* ---------------- fighter ---------------- */
  let FIGHTER_SEQ = 0;

  class Fighter {
    constructor(charDef, side, controls /* 'p1'|'p2'|'cpu' */) {
      this.uid = ++FIGHTER_SEQ;
      this.def = charDef;
      this.side = side;              // 0 left / 1 right
      this.controls = controls;      // 'p1' | 'p2' | 'cpu'
      this.maxhp = charDef.stats.hp;
      this.hp = this.maxhp;
      this.x = side === 0 ? 300 : 660;
      this.y = GROUND;               // feet position
      this.vy = 0;
      this.facing = side === 0 ? FACING.RIGHT : FACING.LEFT;
      this.state = "idle";           // idle walk jump crouch block punch kick special hit ko win
      this.stateT = 0;               // frames in state
      this.attack = null;            // {name,startup,active,recovery,dmg,range,low,knock}
      this.hitstun = 0;
      this.cooldown = 0;
      this.blocking = false;
      this.wins = 0;
      this.combo = 0;
      this.statsDealt = 0;
      this.flash = 0;                // hit flash timer
      this.animT = 0;                // idle anim clock
      this.input = { left: false, right: false, up: false, down: false, punch: false, kick: false, special: false };
      this.prevInput = { punch: false, kick: false, special: false };
      // buffered attack kinds while in another attack's recovery
      this.buffered = null;
    }

    get speed() { return 3.4 * this.def.stats.speed; }
    get airborne() { return this.y < GROUND - 0.5; }

    resetRound(x) {
      this.hp = this.maxhp;
      this.x = x;
      this.y = GROUND;
      this.vy = 0;
      this.state = "idle";
      this.stateT = 0;
      this.attack = null;
      this.hitstun = 0;
      this.cooldown = 0;
      this.combo = 0;
      this.buffered = null;
      this.facing = this.side === 0 ? FACING.RIGHT : FACING.LEFT;
    }

    /* ---------- combat ---------- */
    startAttack(kind, match) {
      if (this.state === "hit" || this.state === "ko" || this.state === "win") return;
      if (this.attack && this.attack.phase !== "recovery") { this.buffered = kind; return; }
      if (kind === "special") {
        if (this.cooldown > 0 || this.airborne) return;
        this.cooldown = this.def.special.cooldown;
        const s = this.def.special;
        if (s.kind === "dash") {
          this.attack = { name: s.name, kind: "special", phase: "startup", t: 0,
            startup: 9, active: 22, recovery: 16, dmg: this.def.stats.special, range: 62, knock: 7, dashSpeed: 9 };
          AUDIO.special();
          match.spawnDashGlow(this);
        } else {
          this.attack = { name: s.name, kind: "special", phase: "startup", t: 0,
            startup: 11, active: 3, recovery: 18, dmg: 0, range: 0, knock: 0, spawnProj: true };
          AUDIO.special();
        }
      } else if (kind === "punch") {
        this.attack = { name: "punch", kind: "punch", phase: "startup", t: 0,
          startup: 4, active: 5, recovery: 8, dmg: this.def.stats.punch, range: 64, knock: 3 };
        AUDIO.swing();
      } else {
        this.attack = { name: "kick", kind: "kick", phase: "startup", t: 0,
          startup: 7, active: 6, recovery: 13, dmg: this.def.stats.kick, range: 84, knock: 5 };
        AUDIO.swing();
      }
      this.state = this.attack.kind === "special" ? "special" : this.attack.kind;
      this.stateT = 0;
      this.attack.phaseT = 0;
    }

    takeHit(dmg, fromDir, knock, match, unblockable) {
      if (this.state === "ko") return;
      const blocked = !unblockable && this.blocking && !this.airborne &&
        ((fromDir === FACING.RIGHT && this.facing === FACING.LEFT) ||
         (fromDir === FACING.LEFT && this.facing === FACING.RIGHT));
      if (blocked) {
        dmg = Math.max(1, Math.round(dmg * 0.22));
        AUDIO.block();
        match.spawnSpark(this.x + this.facing * 26, this.y - 90, "#9fd8ff", 6);
        this.vy -= knock * 0.25;
      } else {
        AUDIO.hurt();
        this.flash = 8;
        match.spawnSpark(this.x - fromDir * -1 * 20, this.y - 95, "#ffd42a", 10);
      }
      this.hp = Math.max(0, this.hp - dmg);
      if (this.hp <= 0) {
        this.state = "ko";
        this.stateT = 0;
        this.vy = -7;
        this.attack = null;
        this.hitstun = 0;
        AUDIO.ko();
        match.onKO(this);
        return;
      }
      if (!blocked) {
        this.hitstun = 18;
        this.state = "hit";
        this.stateT = 0;
        this.attack = null;
        this.vy -= knock * 0.6;
        this.x += fromDir * knock * 3.2;
      }
      match.shake(blocked ? 3 : 6 + Math.min(6, dmg / 3));
    }

    applyHit(match, victim) {
      if (victim.state === "ko") return;
      victim.combo = 0;
      this.combo++;
      this.statsDealt += this.attack.dmg;
      victim.takeHit(this.attack.dmg, this.facing, this.attack.knock, match);
      this.attack.hasHit = true;
      if (this.combo >= 3) match.onCombo(this);
    }

    /* ---------- per-frame ---------- */
    update(match, opponent) {
      this.animT++;
      // edge detection uses PREVIOUS frame's input (latched at end of update)
      const press = k => this.input[k] && !this.prevInput[k];
      if (this.cooldown > 0) this.cooldown--;
      if (this.flash > 0) this.flash--;

      // face opponent when grounded & neutral
      if (!this.airborne && !this.attack && this.state !== "hit" && this.state !== "ko") {
        this.facing = opponent.x >= this.x ? FACING.RIGHT : FACING.LEFT;
      }

      switch (this.state) {
        case "ko": {
          this.stateT++;
          this.vy += GRAVITY;
          this.y = Math.min(GROUND, this.y + this.vy);
          if (this.y >= GROUND) { this.x += this.facing * -0.4; }
          return;
        }
        case "hit": {
          this.hitstun--;
          this.vy += GRAVITY;
          this.y = Math.min(GROUND, this.y + this.vy);
          this.x = Math.max(50, Math.min(910, this.x));
          if (this.hitstun <= 0) { this.state = this.airborne ? "jump" : "idle"; this.stateT = 0; }
          return;
        }
        case "win": { this.stateT++; return; }
      }

      // crouch / block
      this.blocking = this.input.down && !this.airborne;

      // movement
      const canMove = !this.attack && !this.blocking;
      if (canMove) {
        let mv = 0;
        if (this.input.left) mv -= 1;
        if (this.input.right) mv += 1;
        if (mv !== 0) {
          this.x += mv * this.speed;
          if (!this.airborne) this.state = "walk";
          else this.state = "jump";
        } else if (!this.airborne) {
          this.state = this.blocking ? "block" : (this.input.down ? "crouch" : "idle");
        }
        // jump
        if (this.input.up && !this.airborne) {
          this.vy = -13.2 * this.def.stats.jump;
          this.state = "jump";
          AUDIO.jump();
        }
      }

      // physics
      if (this.airborne || this.vy < 0) {
        this.vy += GRAVITY;
        this.y += this.vy;
        if (this.y >= GROUND) { this.y = GROUND; this.vy = 0; if (this.state === "jump") this.state = "idle"; }
      }

      // inputs → attacks (edge triggered — `press` computed at top)
      if (this.blocking && !this.attack) {
        // no attacks while blocking
      } else if (press("punch")) this.startAttack("punch", match);
      else if (press("kick")) this.startAttack("kick", match);
      else if (press("special")) this.startAttack("special", match);
      else if (this.buffered && !this.attack) {
        const k = this.buffered; this.buffered = null; this.startAttack(k, match);
      }

      // attack progression
      if (this.attack) {
        const a = this.attack;
        a.t++;
        if (a.phase === "startup" && a.t >= a.startup) {
          a.phase = "active"; a.phaseT = 0;
          if (a.spawnProj) this.spawnProjectile(match);
        } else if (a.phase === "active") {
          a.phaseT++;
          if (a.dashSpeed) this.x += this.facing * a.dashSpeed;
          this.x = Math.max(50, Math.min(910, this.x));
          if (!a.hasHit && a.dmg > 0) {
            const hitX = this.x + this.facing * a.range * 0.7;
            const inRange = Math.abs(opponent.x - hitX) < a.range * 0.55 + 26 &&
              Math.abs(opponent.y - this.y) < 110;
            if (inRange && opponent.state !== "ko") this.applyHit(match, opponent);
          }
          if (a.phaseT >= a.active) { a.phase = "recovery"; a.phaseT = 0; }
        } else if (a.phase === "recovery") {
          a.phaseT++;
          if (a.phaseT >= a.recovery) { this.attack = null; this.state = this.airborne ? "jump" : "idle"; }
        }
      }

      this.x = Math.max(50, Math.min(910, this.x));
      this.stateT++;
    }

    spawnProjectile(match) {
      const s = this.def.special;
      const px = this.x + this.facing * 40;
      const py = this.y - 95;
      if (s.kind === "boomerang") {
        match.projectiles.push(new Projectile(this, "batarang", px, py, this.facing,
          { speed: 10, dmg: this.def.stats.special, stun: 16 }));
      } else if (s.kind === "lob") {
        const p = new Projectile(this, "bomb", px, py - 10, this.facing,
          { speed: 6.5, dmg: this.def.stats.special, stun: 20 });
        p.vy = -7.5;
        match.projectiles.push(p);
      } else {
        const kind = this.def.id === "spiderman" ? "web" : "repulsor";
        match.projectiles.push(new Projectile(this, kind, px, py, this.facing,
          { speed: this.def.id === "spiderman" ? 11 : 13, dmg: this.def.stats.special, stun: this.def.id === "spiderman" ? 24 : 14 }));
      }
    }

    /* ============================================================
       PROCEDURAL RENDERER — the fighter is drawn with shapes,
       poses keyed per state. No image assets anywhere.
       ============================================================ */
    draw(ctx) {
      const c = this.def.colors;
      const st = this.def.style;
      const f = this.facing;
      const airborne = this.airborne;
      const t = this.animT;

      ctx.save();
      ctx.translate(this.x, this.y);
      if (this.flash > 0 && this.flash % 4 < 2) {
        ctx.globalAlpha = 0.55;
      }

      // shadow
      ctx.fillStyle = "rgba(0,0,0,.35)";
      ctx.beginPath();
      ctx.ellipse(0, 4, 34, 8, 0, 0, 7);
      ctx.fill();

      ctx.scale(f, 1); // draw facing right

      // ---- pose computation ----
      let hipY = -58, lean = 0, crouchOff = 0;
      let armF = { a: -0.5, b: 0.6 }, armB = { a: 0.6, b: 0.5 }; // angles: shoulder, elbow
      let legF = { a: 0.25, b: -0.15 }, legB = { a: -0.2, b: -0.1 };
      let bob = Math.sin(t * 0.09) * 2;

      if (this.state === "walk") {
        const w = Math.sin(t * 0.28);
        legF = { a: 0.55 * w, b: -0.5 * Math.max(0, w) };
        legB = { a: -0.55 * w, b: -0.5 * Math.max(0, -w) };
        armF = { a: -0.4 * w - 0.2, b: 0.5 };
        armB = { a: 0.4 * w + 0.2, b: 0.4 };
        hipY = -56 + Math.abs(w) * 2;
      } else if (this.state === "jump") {
        legF = { a: 0.9, b: -1.2 }; legB = { a: -0.5, b: -0.9 };
        armF = { a: -1.5, b: -0.4 }; armB = { a: 0.8, b: 0.3 };
        hipY = -60;
      } else if (this.state === "crouch" || this.state === "block") {
        crouchOff = this.state === "block" ? 6 : 16;
        hipY = -40 + (this.state === "block" ? 0 : 0);
        legF = { a: 1.1, b: -1.6 }; legB = { a: -0.9, b: -1.4 };
        if (this.state === "block") { armF = { a: -1.35, b: -1.5 }; armB = { a: -1.1, b: -1.55 }; }
        else { armF = { a: -0.8, b: -1.0 }; armB = { a: 0.5, b: -0.6 }; }
      } else if (this.state === "punch") {
        const ph = this.attack ? this.attack.phase : "recovery";
        if (ph === "startup") { armF = { a: -0.9, b: -1.2 }; }
        else if (ph === "active") { armF = { a: -1.57, b: -0.05 }; lean = 4; }
        else { armF = { a: -1.0, b: -0.5 }; }
        armB = { a: 0.8, b: 0.6 };
      } else if (this.state === "kick") {
        const ph = this.attack ? this.attack.phase : "recovery";
        if (ph === "startup") { legF = { a: -0.4, b: -1.0 }; hipY = -60; }
        else if (ph === "active") { legF = { a: -1.45, b: -0.1 }; hipY = -62; lean = -3; armF = { a: -0.6, b: -1.1 }; armB = { a: 1.2, b: 0.5 }; }
        else { legF = { a: -0.4, b: -0.9 }; }
        legB = { a: 0.3, b: -0.2 };
      } else if (this.state === "special") {
        const ph = this.attack ? this.attack.phase : "recovery";
        if (this.def.special.kind === "dash") {
          if (ph === "active") { lean = 10; hipY = -52; armF = { a: -1.5, b: -0.1 }; armB = { a: -1.3, b: -0.4 }; legF = { a: 1.2, b: -0.4 }; legB = { a: -1.0, b: -0.3 }; }
          else { armF = { a: -1.1, b: -1.3 }; hipY = -54; }
        } else {
          if (ph === "startup") { armF = { a: -1.8, b: -1.4 }; hipY = -60; }
          else if (ph === "active") { armF = { a: -1.57, b: -0.02 }; hipY = -58; lean = 3; }
          else { armF = { a: -1.2, b: -0.6 }; }
          armB = { a: 0.9, b: 0.5 };
        }
      } else if (this.state === "hit") {
        lean = -7; hipY = -54;
        armF = { a: 0.9, b: 0.9 }; armB = { a: 1.3, b: 0.7 };
        legF = { a: 0.5, b: -0.3 }; legB = { a: -0.5, b: -0.2 };
      } else if (this.state === "ko") {
        // lying down
        ctx.rotate(-Math.min(1.35, this.stateT * 0.09));
        armF = { a: 1.6, b: 0.2 }; armB = { a: 1.9, b: 0.2 };
        legF = { a: 0.3, b: -0.2 }; legB = { a: -0.3, b: -0.2 };
        hipY = -40;
      } else if (this.state === "win") {
        const w2 = Math.sin(t * 0.2);
        armF = { a: -2.4 + w2 * 0.2, b: -0.3 };
        armB = { a: 0.5, b: 0.4 };
        hipY = -58 - Math.abs(w2) * 3;
      }

      hipY += crouchOff + (airborne && this.state === "jump" ? 0 : bob * 0.4);

      const bodyTilt = lean * 0.017;

      // ---- legs ----
      const hip = { x: 0, y: hipY };
      this.limb(ctx, hip, 26, legB.a + Math.PI / 2, legB.b, c.secondary, 11, true);
      this.limb(ctx, hip, 26, legF.a + Math.PI / 2, legF.b, c.secondary, 11, true);

      // ---- back arm ----
      const shoulderB = { x: -2, y: hipY - 34 };
      this.limb(ctx, shoulderB, 30, armB.a + Math.PI, armB.b, c.primary, 8.5, true);

      // ---- torso ----
      ctx.save();
      ctx.rotate(bodyTilt);
      ctx.fillStyle = c.primary;
      ctx.strokeStyle = "#0a0a12";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(-13, hipY + 2);
      ctx.lineTo(-15, hipY - 36);
      ctx.quadraticCurveTo(0, hipY - 44, 15, hipY - 36);
      ctx.lineTo(13, hipY + 2);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
      // shorts / trunks
      ctx.fillStyle = c.secondary;
      ctx.fillRect(-13, hipY - 6, 26, 10);
      // belt
      ctx.fillStyle = c.accent;
      ctx.fillRect(-13.5, hipY - 8, 27, 4);
      // emblem
      this.drawEmblem(ctx, 0, hipY - 22, st.emblem, c);
      // cape (batman)
      if (st.ears === "bat") {
        ctx.fillStyle = c.secondary;
        ctx.globalAlpha = 0.92;
        ctx.beginPath();
        ctx.moveTo(-6, hipY - 38);
        ctx.quadraticCurveTo(-34 - Math.sin(t * .1) * 5, hipY - 10, -26, hipY + 16);
        ctx.lineTo(-10, hipY + 2);
        ctx.closePath();
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      ctx.restore();

      // ---- front arm ----
      const shoulderF = { x: 3, y: hipY - 32 };
      this.limb(ctx, shoulderF, 30, armF.a + Math.PI, armF.b, c.primary, 9);

      // ---- head ----
      const headY = hipY - 50 + bodyTilt * 40;
      this.drawHead(ctx, 4, headY, st, c, t);

      ctx.restore();

      // special glow ring when charging
      if (this.state === "special" && this.attack && this.attack.phase === "startup") {
        ctx.save();
        ctx.translate(this.x, this.y - 60);
        const r = 20 + (this.attack.t / Math.max(1, this.attack.startup)) * 16;
        ctx.strokeStyle = this.def.id === "spiderman" ? "rgba(255,255,255,.7)" : "rgba(159,216,255,.8)";
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.stroke();
        ctx.restore();
      }

      // player marker
      if (this.state !== "ko") {
        ctx.save();
        ctx.translate(this.x, this.y + 22);
        ctx.fillStyle = this.controls === "p1" ? "#e23636" : this.controls === "p2" ? "#2e6df6" : "#9a9ab8";
        ctx.font = "900 11px 'Segoe UI',sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(this.controls === "cpu" ? "CPU" : this.controls.toUpperCase(), 0, 0);
        // arrow
        ctx.beginPath();
        ctx.moveTo(-5, -14); ctx.lineTo(5, -14); ctx.lineTo(0, -7);
        ctx.closePath(); ctx.fill();
        ctx.restore();
      }
    }

    limb(ctx, from, len, ang1, ang2, color, w, isLeg) {
      const kx = from.x + Math.cos(ang1) * len * 0.55;
      const ky = from.y + Math.sin(ang1) * len * 0.55;
      const ex = kx + Math.cos(ang1 + ang2) * len * 0.55;
      const ey = ky + Math.sin(ang1 + ang2) * len * 0.55;
      ctx.strokeStyle = "#0a0a12";
      ctx.lineWidth = w + 4;
      ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(kx, ky); ctx.lineTo(ex, ey); ctx.stroke();
      ctx.strokeStyle = color;
      ctx.lineWidth = w;
      ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(kx, ky); ctx.lineTo(ex, ey); ctx.stroke();
      // foot / fist
      ctx.fillStyle = "#0a0a12";
      if (isLeg) {
        ctx.beginPath(); ctx.ellipse(ex + 3, ey + 1, 8, 4.5, 0, 0, 7); ctx.fill();
      } else {
        ctx.beginPath(); ctx.arc(ex, ey, w * 0.62, 0, 7); ctx.fill();
      }
      return { x: ex, y: ey };
    }

    drawHead(ctx, hx, hy, st, c, t) {
      ctx.save();
      ctx.translate(hx, hy);
      ctx.strokeStyle = "#0a0a12";
      ctx.lineWidth = 2.5;
      // ears behind head
      if (st.ears === "bat") {
        ctx.fillStyle = c.primary;
        ctx.beginPath();
        ctx.moveTo(-8, -6); ctx.lineTo(-12, -26); ctx.lineTo(-2, -12);
        ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(8, -6); ctx.lineTo(12, -26); ctx.lineTo(2, -12);
        ctx.closePath(); ctx.fill(); ctx.stroke();
      }
      // head shape
      ctx.fillStyle = c.skin;
      ctx.beginPath();
      ctx.ellipse(0, 0, 13, 14, 0, 0, 7);
      ctx.fill(); ctx.stroke();

      if (st.mask === "spider") {
        // full red mask with web lines + big white lens
        ctx.fillStyle = c.primary;
        ctx.beginPath(); ctx.ellipse(0, 0, 13.5, 14.5, 0, 0, 7); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = "rgba(10,10,18,.55)"; ctx.lineWidth = 1;
        for (let a = 0; a < 6; a++) {
          ctx.beginPath(); ctx.moveTo(0, -14);
          ctx.quadraticCurveTo(Math.sin(a) * 8, 0, Math.cos(a * 1.05) * 9, 12);
          ctx.stroke();
        }
        ctx.fillStyle = c.lens;
        ctx.beginPath(); ctx.ellipse(5, -2, 5.4, 3.6, -0.25, 0, 7); ctx.fill();
        ctx.strokeStyle = "#0a0a12"; ctx.lineWidth = 1.4; ctx.stroke();
      } else if (st.mask === "bat") {
        // cowl
        ctx.fillStyle = c.primary;
        ctx.beginPath();
        ctx.moveTo(-13, -2);
        ctx.quadraticCurveTo(0, -17, 13, -2);
        ctx.lineTo(11, 6);
        ctx.lineTo(-11, 6);
        ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = c.skin;
        ctx.beginPath();
        ctx.moveTo(-9, 2);
        ctx.quadraticCurveTo(0, -2, 9, 2);
        ctx.lineTo(8, 9);
        ctx.quadraticCurveTo(0, 13, -8, 9);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = "#fff";
        ctx.fillRect(1.5, 1, 3, 2.6);
      } else if (st.mask === "helmet") {
        ctx.fillStyle = c.primary;
        ctx.beginPath(); ctx.ellipse(0, 0, 13.5, 14.5, 0, 0, 7); ctx.fill(); ctx.stroke();
        ctx.fillStyle = c.secondary; // gold faceplate
        ctx.beginPath();
        ctx.moveTo(3, -12); ctx.lineTo(13, -4); ctx.lineTo(13, 8); ctx.lineTo(3, 12);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = c.lens;
        ctx.beginPath(); ctx.ellipse(8, -2, 3.4, 2.2, 0, 0, 7); ctx.fill();
      } else if (st.mask === "tiara") {
        // hair + tiara
        ctx.fillStyle = "#1c1410";
        ctx.beginPath();
        ctx.ellipse(-2, -3, 13.5, 13, 0, Math.PI * 0.85, Math.PI * 2.05);
        ctx.fill();
        ctx.fillStyle = c.accent;
        ctx.beginPath();
        ctx.moveTo(-11, -8); ctx.lineTo(11, -8); ctx.lineTo(8, -13); ctx.lineTo(-8, -13);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = "#c22736";
        ctx.beginPath(); ctx.arc(0, -10.5, 2.4, 0, 7); ctx.fill();
        ctx.fillStyle = "#fff";
        ctx.fillRect(3, 0, 3, 2.4);
      } else if (st.mask === "clown") {
        // green hair
        ctx.fillStyle = c.secondary;
        ctx.beginPath();
        ctx.ellipse(-2, -6, 14, 9, -0.3, Math.PI, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#fff";
        ctx.beginPath(); ctx.arc(4, -2, 3.4, 0, 7); ctx.fill();
        ctx.fillStyle = c.lens;
        ctx.beginPath(); ctx.arc(5, -2, 1.7, 0, 7); ctx.fill();
        ctx.strokeStyle = "#c22736"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(5, 4, 5, 0.15, Math.PI * 0.85); ctx.stroke();
      } else {
        // bare face fallback
        ctx.fillStyle = "#fff";
        ctx.fillRect(3, -3, 3, 2.4);
      }
      ctx.restore();
    }

    drawEmblem(ctx, x, y, kind, c) {
      ctx.save();
      ctx.translate(x, y);
      if (kind === "spider") {
        ctx.fillStyle = "#0a0a12";
        ctx.beginPath(); ctx.ellipse(0, 0, 3, 5, 0, 0, 7); ctx.fill();
        ctx.strokeStyle = "#0a0a12"; ctx.lineWidth = 1.2;
        for (const s of [-1, 1]) for (let i = 0; i < 3; i++) {
          ctx.beginPath(); ctx.moveTo(0, -2 + i * 2);
          ctx.lineTo(s * (6 + i), -4 + i * 4);
          ctx.stroke();
        }
      } else if (kind === "bat") {
        ctx.fillStyle = "#0a0a12";
        ctx.beginPath();
        ctx.moveTo(0, -5);
        ctx.quadraticCurveTo(6, -2, 9, -4);
        ctx.quadraticCurveTo(5, 1, 3, 4);
        ctx.quadraticCurveTo(1, 2, 0, 4);
        ctx.quadraticCurveTo(-1, 2, -3, 4);
        ctx.quadraticCurveTo(-5, 1, -9, -4);
        ctx.quadraticCurveTo(-6, -2, 0, -5);
        ctx.fill();
      } else if (kind === "circle") {
        ctx.fillStyle = c.accent;
        ctx.beginPath(); ctx.arc(0, 0, 5, 0, 7); ctx.fill();
        ctx.fillStyle = c.secondary;
        ctx.beginPath(); ctx.arc(0, 0, 2.2, 0, 7); ctx.fill();
      } else if (kind === "W") {
        ctx.fillStyle = c.accent;
        ctx.font = "900 11px Georgia,serif";
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText("W", 0, 1);
      } else if (kind === "card") {
        ctx.fillStyle = "#f4f0e6";
        ctx.fillRect(-4, -5.5, 8, 11);
        ctx.strokeStyle = "#0a0a12"; ctx.lineWidth = 1;
        ctx.strokeRect(-4, -5.5, 8, 11);
        ctx.fillStyle = "#c22736";
        ctx.font = "900 7px Georgia,serif";
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText("J", 0, 0.5);
      }
      ctx.restore();
    }
  }

  /* ---------------- portrait (lobby cards) ---------------- */
  function drawPortrait(canvas, charDef) {
    const ctx = canvas.getContext("2d");
    const W = canvas.width = 120, H = canvas.height = 120;
    ctx.clearRect(0, 0, W, H);
    // backdrop
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, charDef.colors.primary + "55");
    g.addColorStop(1, "#0a0a12");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    // fake fighter via temporary instance, upper body scaled
    const f = new Fighter(charDef, 0, "cpu");
    f.x = 0; f.y = 0;
    f.state = "idle";
    f.animT = 30;
    ctx.save();
    ctx.translate(60, 128);
    ctx.scale(1.7, 1.7);
    const oldDraw = Fighter.prototype.draw;
    // reuse internal drawing by translating: draw only works relative to feet at (0,0)
    f.draw(ctx);
    ctx.restore();
    if (!charDef.unlocked) {
      ctx.fillStyle = "rgba(6,6,12,.35)";
      ctx.fillRect(0, 0, W, H);
    }
  }

  window.Fighter = Fighter;
  window.Projectile = Projectile;
  window.FighterApi = { drawPortrait, GROUND };
})();
