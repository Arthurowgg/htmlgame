# Setup / Installer

## Players (Windows)

1. Download **`Launcher-Setup.exe`** from the [GitHub Release Assets](https://github.com/Arthurowgg/htmlgame/releases)
2. Double-click it
3. Click **Install Launcher**
4. Start the launcher from the Desktop shortcut

No Python, no terminal, no clone.

## What the installer does

1. Downloads the launcher + game package from GitHub  
2. Extracts into `%LOCALAPPDATA%\GrandPixelGame\Launcher\…`  
3. Installs an **embedded CPython** runtime (user does not install Python)  
4. `pip install pygame pillow pywebview` into that runtime  
5. Creates **Desktop** + **Start Menu** shortcuts  
6. Optionally starts the launcher  

Shared logic: `win_setup_core.py`  
GUI entry: `win_setup_gui.py`  

## Build the exe (Windows / CI)

```bat
python setup/build_windows_setup.py
:: output: launcher\dist\Launcher-Setup.exe
```

GitHub Actions template: `.github/build-launcher.workflow.yml` — rename to `.github/workflows/build-launcher.yml` on GitHub (Edit → change path) to enable. Then every `launcher-v*` tag builds and attaches `Launcher-Setup.exe`.

## CLI (dev / Linux / macOS)

```bash
python setup/GPG_Setup.py
```
