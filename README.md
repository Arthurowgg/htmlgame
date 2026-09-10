# Grand Pixel Game — Lumina Isle

3D open-island RPG (Fortnite-style POIs, fog-of-war map, inventory) + a
**standalone pixel desktop launcher**. One-click setup — no repo clone needed.

## Install the launcher (easiest)

You only need **Python 3.10+**.

### Windows
1. Install Python from https://www.python.org/downloads/ (tick *Add to PATH*)
2. Download [`setup/GPG_Setup.py`](setup/GPG_Setup.py) from this repo / the release
3. Double-click it  
   → downloads launcher + game, installs deps, makes a Desktop shortcut

### Linux / macOS
```bash
curl -LO https://raw.githubusercontent.com/Arthurowgg/htmlgame/arena/01a08cbd-htmlgame/setup/GPG_Setup.py
python3 GPG_Setup.py
```

Then open **Grand Pixel Game Launcher** → pick **3.0.0** → **Install & Play**.  
The game opens in its **own app window**.

## Run from a clone (devs)

```bash
python3 -m venv .venv
.venv/bin/pip install pygame pillow pywebview
.venv/bin/python launcher/run.py
```

## Game (v3.0.0 — Lumina Isle)

| | |
|-|-|
| World | Original island with **14 POIs** (cities, docks, neon, ruins, peaks…) |
| Map | Fog of war — discover places to reveal them |
| Systems | Inventory, gather, combat, day/night, **god-ray shaders** |
| Move | **WASD works immediately** · click to lock look · RMB drag look |

### Controls
- **WASD** move · **Shift** sprint · **Space** jump  
- **Mouse** look (click lock, or hold right mouse)  
- **F / click** attack · **E** talk / gather  
- **M** map · **I** inventory · **Esc** pause  

Direct play (no launcher): `python3 -m http.server 8080` → `/versions/3.0.0/`

## Layout
```
setup/GPG_Setup.py   one-click installer (download from GitHub)
launcher/            pixel desktop app (pygame) + native game window
game/                Lumina Isle source
versions/3.0.0/      shipped build
```
