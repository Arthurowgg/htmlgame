# OMNI CLASH — Marvel × DC Fan Fighter

> **v1.0.0** — lutinha 1v1 em navegador, 100% desenhada por código (nenhum
> asset externo). Spider-Man e Batman liberados; Iron Man, Wonder Woman e
> Joker chegam na 1.1. O legado Grand Pixel Game / Lumina Isle continua no
> repo (abaixo).

**Jogue agora:** abra [`versions/omni-1.0.0/`](versions/omni-1.0.0/) ·
**Windows:** baixe `OmniClash-Setup.exe` nas
[releases](https://github.com/Arthurowgg/htmlgame/releases)
(compilado automaticamente pelo GitHub Actions).

| | |
|-|-|
| Modos | 1P vs CPU (Rookie/Hero/Legend) · 2 players local · melhor de 3 |
| Especiais | Web Shot · Batarang · Repulsor · Shield Charge · Joy Buzzer Bomb |
| Palcos | Neon New York · Wayne Manor · Themyscira Shore (procedurais) |
| Áudio | SFX + trilha 100% sintetizados (WebAudio) |
| Código | [`omni-clash/`](omni-clash/) · docs em [`omni-clash/README.md`](omni-clash/README.md) |

Projeto de fã, sem fins comerciais; nomes de personagens pertencem a
Marvel/DC. Nenhum asset copiado.

---

# Legado: Grand Pixel Game — Lumina Isle

3D open-island RPG + a **standalone pixel desktop launcher**.

---

## Install on Windows (recommended)

**You do not need Python, Git, or the terminal.**

### Steps

1. Open the latest **Launcher** release:  
   [github.com/Arthurowgg/htmlgame/releases](https://github.com/Arthurowgg/htmlgame/releases)
2. Under **Assets**, download **`Launcher-Setup.exe`**
3. Double-click **`Launcher-Setup.exe`**
4. Click **Install Launcher** and wait for it to finish
5. Open **Grand Pixel Game Launcher** from the Desktop shortcut (or click **Open Launcher** in the setup)
6. In the launcher: pick version **3.0.0** → **Install & Play**

That’s the full install path for players.

| | |
|-|-|
| Installer | `Launcher-Setup.exe` (GitHub Release → Assets) |
| What it does | Downloads the launcher package, installs an embedded Python runtime, creates Desktop + Start Menu shortcuts |
| After install | Double-click the Desktop shortcut anytime |

> SmartScreen may say “Windows protected your PC” because the exe is not code-signed. Choose **More info** → **Run anyway**.

---

## Game (v3.0.0 — Lumina Isle)

| | |
|-|-|
| World | Island with **14 POIs** (cities, docks, neon, ruins, peaks…) |
| Map | Fog of war — discover places to reveal them |
| Systems | Inventory, gather, combat, day/night, god-ray shaders |
| Move | WASD · click to lock look · RMB drag look |

### Controls
- **WASD** move · **Shift** sprint · **Space** jump  
- **Mouse** look (click lock, or hold right mouse)  
- **F / click** attack · **E** talk / gather  
- **M** map · **I** inventory · **Esc** pause  

---

## Developers

Manual / CLI setup (not required for players):

```bash
git clone https://github.com/Arthurowgg/htmlgame.git
cd htmlgame
python3 -m venv .venv
.venv/bin/pip install pygame pillow pywebview
.venv/bin/python launcher/run.py
```

CLI installer (Linux/macOS or Windows with Python already installed):

```bash
python setup/GPG_Setup.py
```

### Build `Launcher-Setup.exe` locally (Windows)

```bat
python -m pip install pyinstaller pillow
python setup/build_windows_setup.py
:: → launcher\dist\Launcher-Setup.exe
```

### CI / Releases (build `Launcher-Setup.exe` on GitHub)

The Windows build workflow ships as a **ready-made file** (this environment cannot enable Actions workflows automatically):

1. On GitHub, open [`.github/build-launcher.workflow.yml`](.github/build-launcher.workflow.yml)
2. Click the pencil (**Edit**), rename the path to  
   `.github/workflows/build-launcher.yml`  and commit
3. **Actions** → **Build Launcher Setup (Windows)** → **Run workflow**  
   or push a tag:

```bash
git tag launcher-v3.2.0
git push origin launcher-v3.2.0
```

The job runs on `windows-latest`, builds **`Launcher-Setup.exe`**, and attaches it to the release **Assets**.

### Layout

```
setup/
  win_setup_gui.py          GUI installer (→ Launcher-Setup.exe)
  win_setup_core.py         shared install logic
  build_windows_setup.py    PyInstaller build script
  GPG_Setup.py              CLI installer
launcher/                   pixel desktop app (pygame)
  dist/Launcher-Setup.exe   built installer (CI / local)
game/                       Lumina Isle source
versions/3.0.0/             shipped game build
.github/workflows/build-launcher.yml
```
