# Grand Pixel Game Launcher — standalone desktop app

**Not a website.** A real pixel-art desktop application (Python + pygame) that looks
like a classic Minecraft-style launcher: pick a version, install it, play.

## Run (dev)

From the repo root:

```bash
# once
python3 -m venv .venv
.venv/bin/pip install pygame pillow pyinstaller

# every time
.venv/bin/python launcher/run.py
# or:
./launcher/run.py
```

Options:

```text
--scale 3          pixel upscale (2–5)
--screenshot       render UI previews into launcher/screenshots/ and exit
--dummy            force headless SDL (CI)
```

## What it does

| Feature | Detail |
|--------|--------|
| Version picker | Reads `versions/catalog.json` (+ optional GitHub `game-v*` releases) |
| Install | Copies a version into app data (`~/.local/share/GrandPixelGame/versions/…`) |
| Play | Serves the install on localhost and opens a dedicated browser app window |
| Profile | Name + skin color injected into the game as `window.__GPG__` |
| Library | Install / remove / play per version |
| Settings | Scale, difficulty, animations, sounds |

## Build a single executable

```bash
.venv/bin/python launcher/build_exe.py
# → launcher/dist/GrandPixelGameLauncher
#    launcher/dist/versions/   (game content next to the binary)
```

On Windows the binary is `GrandPixelGameLauncher.exe`. Ship the `dist/` folder.

## Layout

```
launcher/
  run.py              entry script
  build_exe.py        PyInstaller packager
  app/
    main.py           CLI
    ui.py             pixel UI (pygame)
    core.py           catalog / install / play
    http_server.py    local game server
    theme.py          palette
    font.py           5×7 pixel font
    widgets.py        panels, buttons, hero art
  screenshots/        UI previews
  dist/               built binary
```
