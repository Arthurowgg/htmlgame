/* ============================================================
   OMNI CLASH — ROSTER
   Stats, palettes and procedural portrait configs.
   Spider-Man & Batman playable in 1.0 · the rest locked for 1.1
   ============================================================ */
(function () {
  "use strict";

  const ROSTER = [
    {
      id: "spiderman",
      name: "SPIDER-MAN",
      alias: "The Web-Slinger",
      unlocked: true,
      colors: {
        primary: "#e23636",   // suit red
        secondary: "#1d4ed8", // suit blue
        skin: "#e23636",      // masked — no visible skin
        lens: "#f4f7ff",
        accent: "#ffffff",
      },
      style: { mask: "spider", ears: null, emblem: "spider" },
      stats: {
        hp: 96, speed: 1.22, jump: 1.18, weight: 0.88,
        punch: 8, kick: 10, special: 15,
      },
      special: { name: "WEB SHOT", kind: "projectile", cooldown: 210 },
      bio: "Fastest fighter on the roster. Chains hits and zones with webs.",
      quote: "Web them up!",
    },
    {
      id: "batman",
      name: "BATMAN",
      alias: "The Dark Knight",
      unlocked: true,
      colors: {
        primary: "#3b3f52",   // cowl grey
        secondary: "#17171f", // cape black
        skin: "#d9a066",
        lens: "#e8ecf4",
        accent: "#ffd42a",    // utility belt
      },
      style: { mask: "bat", ears: "bat", emblem: "bat" },
      stats: {
        hp: 104, speed: 1.0, jump: 1.0, weight: 1.05,
        punch: 9, kick: 11, special: 16,
      },
      special: { name: "BATARANG", kind: "boomerang", cooldown: 240 },
      bio: "Heavy hitter with armor to spare. The batarang comes back — so does he.",
      quote: "I am the night.",
    },
    {
      id: "ironman",
      name: "IRON MAN",
      alias: "The Armored Avenger",
      unlocked: false,
      colors: {
        primary: "#b3242b", secondary: "#f2b21c", skin: "#b3242b",
        lens: "#9fd8ff", accent: "#7fe3ff",
      },
      style: { mask: "helmet", ears: null, emblem: "circle" },
      stats: {
        hp: 100, speed: 1.08, jump: 1.05, weight: 1.1,
        punch: 9, kick: 10, special: 18,
      },
      special: { name: "REPULSOR BLAST", kind: "projectile", cooldown: 260 },
      bio: "Repulsor blasts melt health bars. Locked for OMNI CLASH 1.1.",
      quote: "Genius, billionaire, brawler.",
    },
    {
      id: "wonderwoman",
      name: "WONDER WOMAN",
      alias: "Princess of Themyscira",
      unlocked: false,
      colors: {
        primary: "#c22736", secondary: "#28409c", skin: "#e8b58a",
        lens: "#ffffff", accent: "#ffd42a",
      },
      style: { mask: "tiara", ears: null, emblem: "W" },
      stats: {
        hp: 110, speed: 1.05, jump: 1.0, weight: 1.15,
        punch: 10, kick: 12, special: 17,
      },
      special: { name: "SHIELD CHARGE", kind: "dash", cooldown: 250 },
      bio: "Bracelet-blocking tank with an unstoppable shield dash. Locked for 1.1.",
      quote: "Bring it on.",
    },
    {
      id: "joker",
      name: "JOKER",
      alias: "The Clown Prince",
      unlocked: false,
      colors: {
        primary: "#6d3fb0", secondary: "#2ea44f", skin: "#e4ded0",
        lens: "#3dd68c", accent: "#8fd94a",
      },
      style: { mask: "clown", ears: null, emblem: "card" },
      stats: {
        hp: 90, speed: 1.15, jump: 1.1, weight: 0.85,
        punch: 8, kick: 9, special: 19,
      },
      special: { name: "JOY BUZZER BOMB", kind: "lob", cooldown: 270 },
      bio: "Lobs gag bombs that burst in electric confetti. Locked for 1.1.",
      quote: "Why so serious?",
    },
  ];

  const RosterApi = {
    all: ROSTER,
    get(id) { return ROSTER.find(c => c.id === id) || null; },
    unlocked() { return ROSTER.filter(c => c.unlocked); },
    randomUnlocked(excludeId) {
      const pool = this.unlocked().filter(c => c.id !== excludeId);
      if (!pool.length) pool.push(ROSTER[0]);
      return pool[Math.floor(Math.random() * pool.length)];
    },
  };

  window.ROSTER = RosterApi;
})();
