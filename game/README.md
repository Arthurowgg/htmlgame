# Grand Pixel Game — source

Develop here, then pack into `versions/`:

```bash
python3 tools/pack_version.py 2.1.0 --notes "What changed"
```

Run the live source:

```bash
python3 -m http.server 8080 --bind 0.0.0.0
# http://localhost:8080/game/
```
