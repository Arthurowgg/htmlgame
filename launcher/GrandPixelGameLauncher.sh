#!/usr/bin/env bash
# Grand Pixel Game Launcher — portable runner
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ ! -x "$ROOT/.venv/bin/python" ]]; then
  echo "Creating virtualenv…"
  python3 -m venv "$ROOT/.venv"
  "$ROOT/.venv/bin/pip" install -q pygame pillow
fi

exec "$ROOT/.venv/bin/python" "$ROOT/launcher/run.py" "$@"
