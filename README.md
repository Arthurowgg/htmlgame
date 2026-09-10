# Grand Pixel Game

Open-world voxel adventure + a **standalone pixel-art desktop launcher**
(Minecraft-style version picker → install → play).

> The launcher is a **real app** (Python / pygame), **not** a web page.
> Old HTML and broken Windows `.exe` launchers were retired.

## Desktop launcher (recommended)

```bash
python3 -m venv .venv
.venv/bin/pip install pygame pillow pyinstaller

.venv/bin/python launcher/run.py
```

| Keys | Action |
|------|--------|
| Enter | Install & Play |
| ← → | Switch version |
| 1–4 | Tabs (Play / Library / Profile / Settings) |
| Esc | Quit |

### Build a standalone binary

```bash
.venv/bin/python launcher/build_exe.py
# → launcher/dist/GrandPixelGameLauncher  (+ versions/ beside it)
```

### What the launcher does

1. Lists game versions from `versions/catalog.json` (and GitHub `game-v*` tags)
2. **Installs** a version into app data (`~/.local/share/GrandPixelGame/versions/…`)
3. **Plays** it via a local server + dedicated browser app window
4. Passes your profile (name, color, difficulty, scale) into the game

Pixel UI screenshots: `launcher/screenshots/`.

## Game only (browser)

```bash
python3 -m http.server 8080 --bind 0.0.0.0
# http://localhost:8080/game/
# http://localhost:8080/versions/2.0.0/
```

### Controls

| Key | Action |
|-----|--------|
| WASD | Move |
| Mouse | Look (click to lock) |
| Space | Jump |
| F / Click | Attack |
| E | Talk / gather |
| Q / M / Esc | Quests / Map / Pause |

## Ship a new game version

```bash
python3 tools/pack_version.py 2.1.0 --notes "What changed"
git add versions/ && git commit -m "Release game 2.1.0"
git tag game-v2.1.0 && git push origin HEAD game-v2.1.0
```

## Layout

```
launcher/          standalone pixel desktop app (pygame)
  run.py
  app/             UI, core, server, theme, font
  dist/            built executable
game/              live game source (WebGL)
versions/          shipped playable builds (2.0.0, 2.0.1, …)
tools/pack_version.py
```

## License

MIT
