# OMNI CLASH 1.0.0 — Marvel × DC Fan Fighter

Lutinha 1v1 em navegador, 100% código (nenhuma imagem ou som externo — tudo
desenhado/sintetizado em runtime).

## Como jogar

Abra `index.html` (ou sirva a pasta com qualquer servidor estático).

| | P1 | P2 |
|---|---|---|
| Mover | `A` / `D` | `←` / `→` |
| Pular | `W` | `↑` |
| Defender | `S` | `↓` |
| Soco | `J` | `,` |
| Chute | `K` | `.` |
| Especial | `L` | `/` |

`Enter` start · `M` mute · `P`/`ESC` pause · Melhor de 3 rounds, 99s por round.

## Roster 1.0

| Lutador | Status | Especial |
|---|---|---|
| SPIDER-MAN | ✅ FREE | WEB SHOT (projétil que atordoa) |
| BATMAN | ✅ FREE | BATARANG (bumerangue) |
| IRON MAN | 🔒 1.1 | REPULSOR BLAST |
| WONDER WOMAN | 🔒 1.1 | SHIELD CHARGE (investida) |
| JOKER | 🔒 1.1 | JOY BUZZER BOMB (granada) |

Modos: **1P vs CPU** (Rookie / Hero / Legend) e **2 players local**.
3 palcos procedurais: Neon New York, Wayne Manor, Themyscira Shore.

## Estrutura

```
omni-clash/
├── index.html          shell + telas (title / lobby / fight)
├── css/style.css       UI comic/neon
└── js/
    ├── audio.js        SFX + trilha sintetizada (WebAudio)
    ├── characters.js   roster, stats, paletas
    ├── fighter.js      física, golpes, hitbox, renderer procedural
    ├── ai.js           CPU (3 dificuldades)
    ├── match.js        rounds, HUD, palcos, partículas
    ├── lobby.js        seleção de personagem
    └── main.js         bootstrap, input, telas
```

## Aviso

Projeto de fã, sem fins comerciais. Nomes de personagens pertencem a seus
donos (Marvel/DC). Nenhum asset copiado — cada pixel é desenhado por código.
