/* ============================================================
   OMNI CLASH — LOBBY (character select)
   DOM-driven; portraits drawn by the fighter renderer.
   ============================================================ */
(function () {
  "use strict";

  const Lobby = {
    mode: "cpu",            // 'cpu' | '2p'
    difficulty: "hero",
    p1: null,               // charDef
    p2: null,               // charDef (chosen or cpu random)
    el: {},

    init() {
      this.el = {
        roster: document.getElementById("roster"),
        p1slot: document.getElementById("p1-slot"),
        p2slot: document.getElementById("p2-slot"),
        vsMid: document.getElementById("vs-mid"),
        fight: document.getElementById("btn-fight"),
        toast: document.getElementById("toast"),
        segMode: document.getElementById("seg-mode"),
        segDiff: document.getElementById("seg-diff"),
        back: document.getElementById("btn-back-title"),
      };
      this.renderRoster();
      this.updateVS();

      this.el.fight.addEventListener("click", () => this.tryFight());
      this.el.back.addEventListener("click", () => window.MAIN.show("title"));

      this.el.segMode.querySelectorAll("button").forEach(b => {
        b.addEventListener("click", () => {
          this.el.segMode.querySelectorAll("button").forEach(x => x.classList.remove("on"));
          b.classList.add("on");
          this.mode = b.dataset.mode;
          AUDIO.select();
          if (this.mode === "cpu") this.p2 = null;
          this.updateSelectionMarks();
          this.updateVS();
        });
      });
      this.el.segDiff.querySelectorAll("button").forEach(b => {
        b.addEventListener("click", () => {
          this.el.segDiff.querySelectorAll("button").forEach(x => x.classList.remove("on"));
          b.classList.add("on");
          this.difficulty = b.dataset.diff;
          AUDIO.select();
        });
      });
    },

    renderRoster() {
      this.el.roster.innerHTML = "";
      for (const c of window.ROSTER.all) {
        const card = document.createElement("div");
        card.className = "card" + (c.unlocked ? "" : " locked");
        card.dataset.id = c.id;

        const cv = document.createElement("canvas");
        cv.width = 120; cv.height = 120;
        card.appendChild(cv);

        const name = document.createElement("div");
        name.className = "cname";
        name.textContent = c.name;
        card.appendChild(name);

        const alias = document.createElement("div");
        alias.className = "calias";
        alias.textContent = c.unlocked ? c.alias : "???" ;
        card.appendChild(alias);

        const badge = document.createElement("div");
        badge.className = "badge " + (c.unlocked ? "free" : "locked");
        badge.textContent = c.unlocked ? "FREE" : "LOCKED";
        card.appendChild(badge);

        if (!c.unlocked) {
          const lock = document.createElement("div");
          lock.className = "lock-row";
          lock.textContent = "🔒 OMNI CLASH 1.1";
          card.appendChild(lock);
        }

        card.addEventListener("click", () => this.pick(c, card));
        this.el.roster.appendChild(card);

        window.FighterApi.drawPortrait(cv, c);
      }
      this.updateSelectionMarks();
    },

    pick(c, cardEl) {
      AUDIO.resume();
      if (!c.unlocked) {
        AUDIO.deny();
        if (cardEl) {
          cardEl.classList.add("deny");
          setTimeout(() => cardEl.classList.remove("deny"), 350);
        }
        this.toastMsg("🔒 " + c.name + " chega no OMNI CLASH 1.1 — fica pro próximo round!");
        return;
      }
      if (this.mode === "2p" && this.p1) {
        this.p2 = c;
        AUDIO.confirm();
      } else {
        this.p1 = c;
        if (this.mode === "cpu") this.p2 = null;
        AUDIO.confirm();
      }
      this.updateSelectionMarks();
      this.updateVS();
    },

    updateSelectionMarks() {
      const cards = this.el.roster.querySelectorAll(".card");
      cards.forEach(el => {
        el.classList.remove("sel1", "sel2");
        if (this.p1 && el.dataset.id === this.p1.id) el.classList.add("sel1");
        if (this.p2 && el.dataset.id === this.p2.id) el.classList.add("sel2");
      });
    },

    updateVS() {
      this.el.p1slot.querySelector(".vs-name").textContent = this.p1 ? this.p1.name : "—";
      if (this.mode === "2p") {
        this.el.vsMid.textContent = "VS";
        this.el.p2slot.querySelector(".vs-name").textContent = this.p2 ? this.p2.name : "P2 — pick";
        this.el.fight.textContent = (this.p1 && this.p2) ? "FIGHT!" : (this.p1 ? "P2: PICK" : "P1: PICK");
      } else {
        this.el.vsMid.textContent = "VS";
        this.el.p2slot.querySelector(".vs-name").textContent = "CPU · " + this.difficulty.toUpperCase();
        this.el.fight.textContent = this.p1 ? "FIGHT!" : "PICK A FIGHTER";
      }
      this.el.fight.disabled = !(this.mode === "cpu" ? this.p1 : (this.p1 && this.p2));
    },

    tryFight() {
      if (!this.p1) { this.toastMsg("Escolhe um lutador primeiro!"); AUDIO.deny(); return; }
      if (this.mode === "cpu" && !this.p2) {
        // cpu picks someone other than p1 when possible
        this.p2 = window.ROSTER.randomUnlocked(this.p1.id);
      }
      if (this.mode === "2p" && (!this.p1 || !this.p2)) {
        this.toastMsg(this.p1 ? "Falta o P2 escolher!" : "Falta o P1 escolher!");
        AUDIO.deny(); return;
      }
      AUDIO.confirm();
      window.MAIN.startMatch({
        p1: this.p1,
        p2: this.p2,
        controls2: this.mode === "2p" ? "p2" : "cpu",
        difficulty: this.difficulty,
      });
    },

    toastMsg(msg) {
      this.el.toast.textContent = msg;
      this.el.toast.classList.add("show");
      clearTimeout(this._toastT);
      this._toastT = setTimeout(() => this.el.toast.classList.remove("show"), 2200);
    },

    reset() {
      this.p1 = null;
      this.p2 = null;
      this.updateSelectionMarks();
      this.updateVS();
    },
  };

  window.LOBBY = Lobby;
})();
