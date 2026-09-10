# Grand Pixel Game

Open-world voxel adventure in the browser, plus a **Minecraft-style launcher** that lets you pick a version, install it, and play.

## Quick start

```bash
python3 -m http.server 8080 --bind 0.0.0.0
# open http://localhost:8080
```

That opens the **launcher**. From there:

1. Choose a version (e.g. `2.0.0`)
2. Click **Install** (or **Install & Play**)
3. Hit **Play** — the game runs in a full-window view with a back button to the launcher

### Play a version directly (no launcher)

```bash
# after the server is up:
# http://localhost:8080/versions/2.0.0/
# or the live source tree:
# http://localhost:8080/game/
```

## Launcher features

- Version catalog (local `versions/catalog.json` + optional GitHub releases)
- Install / uninstall with progress bar (cached in IndexedDB — works offline after install)
- Play in an embedded game view (blob-packaged so installs are self-contained)
- Profile (name + skin color passed into the game)
- Settings (render scale, difficulty, UI sounds)
- Installations table like a real game library

## Game (v2.0.0)

- Procedural voxel island with biomes, village, docks, farms, towers, shrine
- Day/night cycle, fog, crystals & lava glow
- Combat (slimes, shades, crystal golems) + **3 bosses**
- **18 story quests** + **10 side quests**, **10 artifacts**
- Minimap, full island map, quest log, dialog NPCs
- Save / continue, options, touch controls

### Controls

| Key | Action |
|-----|--------|
| WASD | Move |
| Mouse | Look (click game to lock pointer) |
| Space | Jump |
| F / Click | Attack |
| E | Talk / gather flowers |
| Shift | Sprint |
| Q | Quest log |
| M | Map |
| Esc | Pause |

## Repository layout

```
index.html          → launcher entry
launcher/           → launcher UI (css/js)
game/               → live game source (develop here)
versions/           → shipped playable builds (2.0.0, 2.0.1, …)
versions/catalog.json
tools/pack_version.py
```

## Ship a new game version

```bash
# 1. Edit game/ source and bump VERSION in game/js/main.js
# 2. Pack:
python3 tools/pack_version.py 2.1.0 --type release --notes "Cool new things"
# 3. Commit, tag, release:
git add versions/2.1.0 versions/catalog.json
git commit -m "Release game 2.1.0"
git tag game-v2.1.0
git push origin HEAD game-v2.1.0
gh release create game-v2.1.0 --title "Grand Pixel Game 2.1.0" --notes "..."
```

The launcher reads `versions/catalog.json` first (always works offline), and also merges any GitHub releases tagged `game-v*`.

## License

MIT — play it, fork it, ship it.
