#!/usr/bin/env python3
"""Gera a fonte de pixel usada na interface (HTML) a partir do mesmo desenho
que o canvas usa.

    node game/tools/font_dump.mjs        # js/font.js → gen/font.json
    python3 game/tools/build_font.py     # gen/font.json → assets/fonts/grandpixel.ttf

Cada "pixel" do desenho vira um quadrado de 100 unidades; o corpo da fonte tem
8 px de altura (800 unidades). Assim, `font-size: 8px` desenha 1 pixel da fonte
por pixel de tela, e `font-size: calc(var(--px) * 8)` faz a interface crescer
junto com a grade de pixels do jogo, sem borrar.
"""
import json
import os
import subprocess
import sys

from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.dirname(HERE)
GEN = os.path.join(GAME, 'gen')
OUT = os.path.join(GAME, 'assets', 'fonts', 'grandpixel.ttf')

UNIT = 100          # unidades por pixel do desenho
EM = 8 * UNIT       # corpo de 8 px
ASCENT = 7 * UNIT   # linha da base = 6 → topo da maiúscula em 7 px
DESCENT = -1 * UNIT


def load_glyphs():
    src = os.path.join(GEN, 'font.json')
    if not os.path.isfile(src):
        print('gerando gen/font.json…')
        subprocess.run(['node', os.path.join(HERE, 'font_dump.mjs')], check=True, cwd=GAME)
    with open(src, encoding='utf-8') as f:
        return json.load(f)


def rect_contour(pen, x0, y0, x1, y1):
    """Retângulo no sentido horário (TrueType espera contorno externo horário)."""
    pen.moveTo((x0, y0))
    pen.lineTo((x0, y1))
    pen.lineTo((x1, y1))
    pen.lineTo((x1, y0))
    pen.closePath()


def glyph_from_rows(rows, base_row=6):
    """Converte as linhas de '#' em quadrados, juntando pixels vizinhos."""
    pen = TTGlyphPen(None)
    for r, line in enumerate(rows):
        top = (base_row - r) * UNIT
        bottom = top - UNIT
        x = 0
        while x < len(line):
            if line[x] != '#':
                x += 1
                continue
            run = 1
            while x + run < len(line) and line[x + run] == '#':
                run += 1
            rect_contour(pen, x * UNIT, bottom, (x + run) * UNIT, top)
            x += run
    return pen.glyph()


def main():
    data = load_glyphs()
    glyphs = data['glyphs']
    names = {'.notdef': glyph_from_rows(['.....'] * 8)}
    order = ['.notdef']
    cmap = {}
    metrics = {'.notdef': (5 * UNIT, 0)}
    for i, (ch, g) in enumerate(sorted(glyphs.items(), key=lambda kv: ord(kv[0]))):
        name = 'u%04X' % ord(ch)
        if name in names:
            continue
        names[name] = glyph_from_rows(g['rows'])
        order.append(name)
        cmap[ord(ch)] = name
        metrics[name] = ((g['w'] + 1) * UNIT, 0)

    fb = FontBuilder(EM, isTTF=True)
    fb.setupGlyphOrder(order)
    fb.setupCharacterMap(cmap)
    fb.setupGlyf({n: names[n] for n in order})
    fb.setupHorizontalMetrics({n: metrics[n] for n in order})
    fb.setupHorizontalHeader(ascent=ASCENT, descent=DESCENT, lineGap=0)
    fb.setupNameTable({
        'familyName': 'GP Pixel',
        'styleName': 'Regular',
        'uniqueFontIdentifier': 'GP Pixel Regular 1.2',
        'fullName': 'GP Pixel Regular',
        'psName': 'GPPixel-Regular',
        'version': 'Version 1.2',
    })
    fb.setupOS2(
        sTypoAscender=ASCENT, sTypoDescender=DESCENT, sTypoLineGap=0,
        usWinAscent=ASCENT, usWinDescent=-DESCENT,
        sCapHeight=ASCENT, sxHeight=5 * UNIT,
        achVendID='GPXL', fsType=0,
    )
    fb.setupPost(isFixedPitch=0)
    fb.setupMaxp()
    fb.setupHead(unitsPerEm=EM)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    fb.save(OUT)

    size = os.path.getsize(OUT)
    print('== fonte de pixel ==')
    print('  glifos:   %d' % (len(order) - 1))
    print('  arquivo:  game/assets/fonts/grandpixel.ttf  (%.1f KB)' % (size / 1024.0))
    print('  uso:      font-size: calc(var(--px) * 8)')


if __name__ == '__main__':
    sys.exit(main())
