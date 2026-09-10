# Grand Pixel Game — o jogo

Mundo aberto em voxels, 3D, sem dependências: WebGL puro, ES modules e áudio
gerado em tempo real. Roda em qualquer navegador moderno.

## Rodar aqui

```bash
python3 -m http.server 8137        # nesta pasta
# abra http://localhost:8137
```

Ou, no Windows, use o **launcher** (release `launcher-v*` do repositório):
ele baixa esta pasta como pacote (`dist/*-web.zip`) e abre numa janela própria.

## Conteúdo da v1.1.0

- **Registro de Jornada** (menu de pausa): tempo de jogo, missões, artefatos,
  chefes, coletas por tipo, pontos descobertos e progresso em barras.
- **9 conquistas** que aparecem no jogo quando são ganhas e ficam guardadas
  junto do progresso (saves v5; saves v4 antigos continuam funcionando).
- 70 missões (11 capítulos + 59 secundárias), 10 artefatos, 3 chefes, 10 regiões.

## Testes

```bash
npm install --no-save jsdom
npm test            # abre o jogo num DOM real e verifica os 22 pontos
```

## Empacotar uma versão nova

1. Ajuste `VERSION` em `js/main.js` e o teste (`tests/smoke.mjs`).
2. `npm test`
3. `python3 tools/pack.py` → gera `dist/GrandPixelGame-vX.Y.Z-web.zip`
4. Commit, tag `game-vX.Y.Z` e release com o zip.

O zip usa compressão **STORE** (sem compactar) e tem o `index.html` na raiz:
é o contrato que o launcher espera para instalar direto.
