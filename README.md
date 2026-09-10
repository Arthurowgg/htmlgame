# Grand Pixel Game

Ilha aberta em voxels, em pixel art, jogada no navegador — e um **launcher
desktop para Windows** que baixa e abre cada versão direto do GitHub.

## ⬇ Baixar o executável (Windows, 1,7 MB)

[**Baixar o Grand Pixel Game Launcher (.exe)**](https://github.com/Arthurowgg/htmlgame/raw/refs/tags/launcher-v1.1.2/launcher/dist/GrandPixelGameLauncher-v1.1.2-win64.exe)

Não precisa instalar nada, nem compilar nada: é um **.exe pronto**. Abra e o
launcher lista as versões do jogo, baixa a que você escolher e abre o jogo numa
janela própria.

> As páginas de release também têm esse link no topo das notas — o botão
> "Source code (zip)" que o GitHub gera é só o código, o jogo jogável é o
> `.exe` acima.
>
> SmartScreen pode pedir "Executar assim mesmo" porque o arquivo não tem
> assinatura comercial.

## Jogar sem baixar nada

```bash
cd game && python3 -m http.server 8137     # abra http://localhost:8137
```

## Como as versões funcionam

Duas linhas independentes — e o launcher lê o GitHub sozinho, então um launcher
antigo continua jogando lançamentos novos:

| Linha | Tag | O que publica |
|---|---|---|
| Jogo (conteúdo) | `game-vX.Y.Z` | `game/dist/GrandPixelGame-vX.Y.Z-web.zip` |
| Launcher (app) | `launcher-vX.Y.Z` | `launcher/dist/GrandPixelGameLauncher-vX.Y.Z-win64.exe` |

- O jogo **nunca** vira `.exe`: é conteúdo (zip) que o launcher baixa e serve.
- Downloads: o launcher procura primeiro o arquivo **anexado na release**
  (Assets) e, se não houver, usa o arquivo versionado na árvore da tag — as
  duas formas funcionam.
- Instalação: `%LOCALAPPDATA%\GrandPixelGame\versions\<tag>\web`, registros em
  `launcher.log` na mesma pasta, saves no navegador do jogo.

## Publicar uma versão (para quem mantém)

```bash
# jogo
cd game && npm install --no-save jsdom && npm test
python3 tools/pack.py                 # gera game/dist/GrandPixelGame-vX.Y.Z-web.zip
git tag game-vX.Y.Z && git push origin game-vX.Y.Z

# launcher
cd launcher && g++ -std=c++17 -O1 -Isrc/core src/core/*.cpp tests/test_core.cpp -o /tmp/t && /tmp/t
python3 build.py                      # gera launcher/dist/...-win64.exe
git tag launcher-vX.Y.Z && git push origin launcher-vX.Y.Z
```

### Para o arquivo aparecer na seção **Assets** da release

O GitHub só aceita arquivos de release por um endereço de upload que algumas
ferramentas automatizadas não alcançam. Há uma automação pronta no repositório
que resolve isso de vez, rodando nos servidores do próprio GitHub:

1. abra `.github/release-assets.workflow.yml`
2. no site do GitHub, edite e troque o nome para
   `.github/workflows/release-assets.yml` (é só mudar o campo do nome) e salve
3. aba **Actions** → **Arquivos das releases** → **Run workflow**

Pronto: essa execução anexa o `.exe` e o `.zip` de **todas** as releases
(inclusive as antigas) e, de lá em diante, toda tag enviada ganha o arquivo
automaticamente.

Enquanto a automação não está ativa, também dá para anexar à mão: abra a
release, arraste o arquivo baixado para **"Attach binaries"** e clique em
**Update release**.

## Estrutura

```
game/       o jogo (HTML/CSS/JS — WebGL puro, sem dependências)
launcher/   o launcher Windows, em C++ (Win32), com testes nativos
.github/    automação das releases
```

Veja `game/README.md`, `launcher/README.md` e `CHANGELOG.md`.
