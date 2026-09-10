/* ============================================================
   OMNI CLASH — CPU AI
   Reaction-based controller that writes into fighter.input.
   ============================================================ */
(function () {
  "use strict";

  const DIFF = {
    rookie: { react: 26, aggression: 0.45, blockChance: 0.18, specialChance: 0.35, mistake: 0.30 },
    hero:   { react: 16, aggression: 0.70, blockChance: 0.40, specialChance: 0.60, mistake: 0.14 },
    legend: { react: 9,  aggression: 0.92, blockChance: 0.62, specialChance: 0.85, mistake: 0.05 },
  };

  class AIController {
    constructor(difficulty) {
      this.d = DIFF[difficulty] || DIFF.hero;
      this.decideT = 0;
      this.mode = "approach";
      this.modeT = 0;
      this.jumpCd = 0;
    }

    update(me, foe, match) {
      const inp = me.input;
      inp.left = inp.right = inp.up = inp.down = false;
      inp.punch = inp.kick = inp.special = false;
      if (me.state === "ko" || match.phase !== "fight") return;

      if (this.jumpCd > 0) this.jumpCd--;

      if (--this.decideT > 0) {
        this.execute(me, foe);
        return;
      }
      this.decideT = Math.max(4, this.d.react + (Math.random() * 14 - 7)) | 0;

      const dist = Math.abs(foe.x - me.x);
      const r = Math.random();

      // panic block when foe is attacking close
      if (foe.attack && foe.attack.phase === "startup" && dist < 150 &&
          Math.random() < this.d.blockChance) {
        this.mode = "block";
      } else if (dist > 240) {
        this.mode = (r < 0.82) ? "approach" : (r < 0.92 ? "wait" : "jumpin");
      } else if (dist > 110) {
        if (me.cooldown <= 0 && r < this.d.specialChance * 0.5) this.mode = "specialZone";
        else this.mode = (r < this.d.aggression) ? "approach" : "wait";
      } else {
        if (me.hp < me.maxhp * 0.28 && r < 0.18) this.mode = "retreat";
        else if (r < this.d.aggression) this.mode = "attack";
        else if (r < this.d.aggression + this.d.blockChance * 0.5) this.mode = "block";
        else this.mode = "approach";
      }
      if (Math.random() < this.d.mistake) this.mode = "wait";

      this.execute(me, foe);
    }

    execute(me, foe) {
      const inp = me.input;
      const dir = Math.sign(foe.x - me.x) || 1;
      const dist = Math.abs(foe.x - me.x);

      switch (this.mode) {
        case "approach":
          if (dist > 60) (dir > 0 ? inp.right = true : inp.left = true);
          break;
        case "retreat":
          (dir > 0 ? inp.left = true : inp.right = true);
          break;
        case "wait":
          break;
        case "block":
          inp.down = true;
          break;
        case "jumpin":
          if (this.jumpCd <= 0 && !me.airborne) { inp.up = true; this.jumpCd = 50; }
          if (dir > 0) inp.right = true; else inp.left = true;
          if (me.airborne && dist < 120 && Math.random() < 0.2) inp.kick = true;
          break;
        case "attack": {
          if (dist > 95) { (dir > 0 ? inp.right = true : inp.left = true); break; }
          const r = Math.random();
          if (r < 0.5) inp.punch = true;
          else if (r < 0.85) inp.kick = true;
          else if (me.cooldown <= 0) inp.special = true;
          break;
        }
        case "specialZone": {
          if (me.cooldown <= 0 && dist > 130 && dist < 430 && Math.random() < this.d.specialChance) {
            inp.special = true;
          } else if (dist > 70) {
            (dir > 0 ? inp.right = true : inp.left = true);
          }
          break;
        }
      }
    }
  }

  window.AIController = AIController;
})();
