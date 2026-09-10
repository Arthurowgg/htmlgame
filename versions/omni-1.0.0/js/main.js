/* ============================================================
   OMNI CLASH — MAIN
   Screen manager, global input, game loop bootstrap. v1.0.0
   ============================================================ */
(function () {
  "use strict";

  const VERSION = "1.0.0";

  const Main = {
    screen: "title",
    match: null,
    raf: null,
    keys: new Set(),

    init() {
      window.LOBBY.init();

      document.getElementById("btn-start").addEventListener("click", () => this.show("lobby"));

      // global keys
      window.addEventListener("keydown", e => {
        const k = e.key.toLowerCase();
        this.keys.add(k);
        AUDIO.resume();

        if (k === "m") {
          const m = AUDIO.toggleMute();
          this.toast(m ? "🔇 MUTED" : "🔊 SOUND ON");
        }

        if (this.screen === "title" && (k === "enter" || k === " ")) {
          this.show("lobby");
        } else if (this.screen === "lobby") {
          if (k === "escape") this.show("title");
        } else if (this.screen === "game") {
          if (k === "p" || k === "escape") {
            if (this.match && !this.match.over) {
              this.match.setPaused(!(this.match.phase === "paused"));
              if (this.match.phase !== "paused" && e.key === "Escape") this.backToLobby();
            } else {
              this.backToLobby();
            }
          }
        }

        if (["arrowleft", "arrowright", "arrowup", "arrowdown", " "].includes(e.key.toLowerCase())) {
          e.preventDefault();
        }
      });
      window.addEventListener("keyup", e => this.keys.delete(e.key.toLowerCase()));
      window.addEventListener("blur", () => this.keys.clear());

      // release latched keys used by AI reset etc. — map inputs every frame
      const loop = () => { this.frame(); this.raf = requestAnimationFrame(loop); };
      this.raf = requestAnimationFrame(loop);
    },

    /* ---------- input mapping ---------- */
    applyInputs() {
      if (!this.match) return;
      const k = this.keys;
      const p1 = this.match.p1.input;
      p1.left = k.has("a"); p1.right = k.has("d"); p1.up = k.has("w"); p1.down = k.has("s");
      p1.punch = k.has("j"); p1.kick = k.has("k"); p1.special = k.has("l");

      if (this.match.p2.controls === "p2") {
        const p2 = this.match.p2.input;
        p2.left = k.has("arrowleft"); p2.right = k.has("arrowright");
        p2.up = k.has("arrowup"); p2.down = k.has("arrowdown");
        p2.punch = k.has(",") || k.has("1");
        p2.kick = k.has(".") || k.has("2");
        p2.special = k.has("/") || k.has("3");
      }
    },

    frame() {
      if (this.screen !== "game" || !this.match) return;
      this.applyInputs();
      this.match.update();
      this.match.draw();
    },

    /* ---------- screens ---------- */
    show(name) {
      this.screen = name;
      document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
      const map = { title: "screen-title", lobby: "screen-lobby", game: "screen-game" };
      document.getElementById(map[name]).classList.add("active");
      if (name !== "game" && this.match) { this.match = null; }
      if (name === "lobby") window.LOBBY.reset();
      if (name === "lobby") AUDIO.startMusic();
      if (name === "title") AUDIO.stopMusic();
    },

    startMatch(cfg) {
      const canvas = document.getElementById("game-canvas");
      this.show("game");
      document.getElementById("stage-name").textContent = "";
      this.match = new window.Match(canvas, {
        p1: cfg.p1, p2: cfg.p2,
        controls2: cfg.controls2,
        difficulty: cfg.difficulty,
        onEnd: (winnerDef, stats) => {
          document.getElementById("stage-name").textContent =
            winnerDef.name + " WINS · " + stats.rounds +
            " · damage " + stats.p1.dealt + " vs " + stats.p2.dealt +
            " · press ESC for lobby";
        },
      });
      document.getElementById("fight-round-indicator").textContent =
        cfg.controls2 === "cpu" ? ("1P vs CPU · " + cfg.difficulty.toUpperCase()) : "2 PLAYERS";
      // match stage name appears with intro banner; also set under canvas
      const st = this.match.stage.name;
      document.getElementById("stage-name").textContent = "STAGE: " + st;
      AUDIO.startMusic();
    },

    backToLobby() {
      this.show("lobby");
    },

    toast(msg) {
      // reuse lobby toast even in game screen
      const t = document.getElementById("toast");
      if (!t) return;
      t.textContent = msg;
      t.classList.add("show");
      clearTimeout(this._t);
      this._t = setTimeout(() => t.classList.remove("show"), 1400);
    },
  };

  window.MAIN = Main;
  window.OMNI_VERSION = VERSION;

  document.addEventListener("DOMContentLoaded", () => Main.init());
})();
