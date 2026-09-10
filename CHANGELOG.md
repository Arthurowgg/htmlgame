# Changelog

## OMNI CLASH 1.0.0 — 2026-09-10

- **Luta 1v1 no navegador**, 100% código: personagens, palcos, SFX e trilha desenhados/sintetizados em runtime (zero assets)
- **Lobby** com 5 lutadores: SPIDER-MAN e BATMAN free; IRON MAN, WONDER WOMAN e JOKER bloqueados para 1.1
- Especiais: Web Shot (stun), Batarang (bumerangue), Repulsor Blast, Shield Charge (investida), Joy Buzzer Bomb (granada)
- Modos: 1P vs CPU (Rookie/Hero/Legend) e 2 players local; melhor de 3, rounds de 99s
- 3 palcos procedurais: Neon New York, Wayne Manor, Themyscira Shore
- Empacotado em `versions/omni-1.0.0/` (catalog.json: latest) + landing raiz rebrandada
- Instalador rebrandado: **`OmniClash-Setup.exe`** (setup/ + launcher com marca OMNI)
- Workflow de CI rebrandado: tags `omni-v*` → build Windows → asset na release
- Fix de engine pego em teste headless: edge-trigger de input destruído no mesmo frame (ataques não sairiam pelo teclado)

## Launcher 3.2.0 — Windows Setup.exe

- **`Launcher-Setup.exe`** — double-click Windows installer (no terminal, no system Python)
- Shared install core (`setup/win_setup_core.py`) + GUI (`setup/win_setup_gui.py`)
- Embedded CPython runtime + pygame/pillow/pywebview
- Desktop + Start Menu shortcuts
- GitHub Actions workflow builds the exe on `launcher-v*` tags and attaches it to Release **Assets**

## Launcher 3.1.0 — 2026-09-10

- **One-click Setup** (`setup/GPG_Setup.py`) — downloads everything from GitHub, no clone
- Game opens in a **dedicated native app window** (pywebview child process, else Chrome `--app`)
- Desktop / Start-menu shortcut creation

## Game 3.0.0 — Lumina Isle — 2026-09-10

- Full core remake: **3D open-island RPG**
- Fortnite-style **14 POIs** (Haven Plaza, Sun Market, Tide Docks, Neon District, Ironbluff, Old Kingdom, Prism Vale, Ember Peak, Frostcrown, Sky Arena, Beacon Point, Light Temple, Whisper Grove, Golden Fields)
- **Fog-of-war map** — discover to reveal
- **Inventory** (blooms, timber, shards, potions, scrap, gold)
- **Fixed movement** (camera-relative WASD, step-up, sprint)
- Lighting overhaul: normals, sun arc, **god-ray / sun-shaft overlay**, emissive neon/lava/crystal
- Day/night cycle, NPCs, combat, gather, sell at market

## Launcher 3.0.0 — 2026-09-10

- Standalone pixel-art desktop app (pygame)

## Game 2.0.x — retired as latest (still installable)
