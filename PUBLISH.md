# OMNI CLASH — Como publicar (passo a passo)

> Este guia substitui o antigo (da era Grand Pixel Game). Tudo abaixo já foi
> executado na publicação da **omni-v1.0.0** — fica registrado para as
> próximas versões (ex.: 1.1 com o roster completo).

## 0. Pré-requisitos

- Sessão com acesso de rede ao GitHub (`git ls-remote origin` responde).
- `gh` autenticado (neste ambiente já vem configurado).

## 1. Código → branch da sessão → PR → main

```bash
# na branch da sessão (ex.: arena/01a08d35-htmlgame)
git add -A
git commit -m "OMNI CLASH 1.0 — fighter + lobby + roster Marvel/DC"
git push -u origin HEAD
gh pr create --base main --fill
gh pr merge --merge --delete-branch=false
```

## 2. Limpar releases antigas (uma vez só)

As releases antigas (`launcher-v*`, `game-v*`) estavam todas **vazias**
(sem assets), então apagar não perde nada:

```bash
gh release list
gh release delete <tag> --yes --cleanup-tag   # repetir para cada uma
```

## 3. Release oficial + exe compilado no Actions

O workflow `.github/workflows/build-launcher.yml` dispara em tags `omni-v*`:

```bash
git tag omni-v1.0.0
git push origin omni-v1.0.0
# Actions → "Build OmniClash Setup (Windows)" roda em windows-latest,
# compila launcher/dist/OmniClash-Setup.exe via PyInstaller
# e anexa na release omni-v1.0.0 automaticamente.
```

Acompanhar:

```bash
gh run watch            # ou gh run list --limit 3
gh release view omni-v1.0.0
```

Se precisar reprocessar sem nova tag:

```bash
gh workflow run "Build OmniClash Setup (Windows)" \
  -f release_tag=omni-v1.0.0 -f create_release=true
```

## 4. Checklist de release

- [ ] `versions/omni-X.Y.Z/` empacotado + `versions/catalog.json` atualizado (latest=true)
- [ ] `setup/` com marca OMNI (`APP_NAME`, títulos, atalhos)
- [ ] `index.html` (raiz) apontando pra nova versão
- [ ] Tag `omni-vX.Y.Z` criada → Actions verde → asset `OmniClash-Setup.exe` na release
- [ ] Smoke test headless (`node`) sem falhas

## Notas de infra

- O instalador baixa o pacote do launcher na instalação; se as releases de
  launcher não existirem, ele cai automaticamente no zip do branch via
  codeload (`setup/win_setup_core.py`), então **nunca fica sem fonte**.
- O jogo em si é 100% estático (HTML/JS) — `versions/omni-*/` funciona em
  GitHub Pages sem build.
