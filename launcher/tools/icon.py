#!/usr/bin/env python3
"""Ícone do launcher: emblema em pixel art desenhado do zero e exportado em
todas as medidas que o Windows usa (16 a 256), num único .ico.
"""
import os
import sys

try:
    from PIL import Image, ImageDraw
except ImportError:
    sys.exit("pillow não instalado (pip install pillow)")

HERE = os.path.dirname(os.path.abspath(__file__))
GEN = os.path.join(os.path.dirname(HERE), 'gen')
OUT = os.path.join(GEN, 'app.ico')

# Paleta
BG      = (14, 22, 38)
BG2     = (22, 34, 56)
GOLD    = (243, 195, 78)
GOLD_HI = (255, 228, 154)
GOLD_DK = (176, 132, 32)
CYAN    = (90, 212, 255)
GRASS   = (53, 192, 138)
ISLAND  = (30, 111, 92)

# Emblema 16x16: obelisco dourado sobre a ilha, com estrelas
# . vazio   B fundo   G ouro   H ouro claro   D ouro escuro
# C ciano  R grama    I ilha
ART = [
    "................",
    "..C..........C..",
    "................",
    "......GGG.......",
    ".....GHHGG......",
    ".....GHHGG......",
    ".....GHHGG......",
    "....GGHHGGG.....",
    "....GGHHDGG.....",
    "....GGHHDGG.....",
    "...RRRRRRRRR....",
    "..RRRRRRRRRRR...",
    "..IIIIIIIIIII...",
    "...IIIIIIIII....",
    "....IIIIIII.....",
    "................",
]
COLORS = {'.': None, 'G': GOLD, 'H': GOLD_HI, 'D': GOLD_DK, 'C': CYAN, 'R': GRASS, 'I': ISLAND}


def render(size):
    """Desenha o emblema numa grade de 16x16 com fundo arredondado."""
    ss = 8 if size < 64 else 4          # superamostragem para bordas suaves
    px = max(1, size * ss // 16)
    im = Image.new('RGBA', (px * 16, px * 16), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    # fundo: quadrado arredondado com leve gradiente
    r = int(px * 3.2)
    d.rounded_rectangle([0, 0, px * 16 - 1, px * 16 - 1], radius=r, fill=BG)
    d.rounded_rectangle([0, px * 8, px * 16 - 1, px * 16 - 1], radius=r, fill=BG2)
    d.rounded_rectangle([0, 0, px * 16 - 1, px * 16 - 1], radius=r, outline=(40, 56, 92, 255), width=max(1, px // 4))
    # pixels do emblema
    for y, row in enumerate(ART):
        for x, ch in enumerate(row):
            col = COLORS.get(ch)
            if col is None:
                continue
            d.rectangle([x * px, y * px, x * px + px - 1, y * px + px - 1], fill=col + (255,))
    # brilho superior
    d.rectangle([px * 5, px * 3, px * 7, px * 4], fill=GOLD_HI + (255,))
    return im.resize((size, size), Image.LANCZOS)


def main():
    os.makedirs(GEN, exist_ok=True)
    sizes = [16, 20, 24, 32, 40, 48, 64, 96, 128, 256]
    frames = [render(s) for s in sizes]
    frames[0].save(OUT, format='ICO', sizes=[(s, s) for s in sizes], append_images=frames[1:])
    print('  ícone gerado: %s (%d medidas, %.1f KB)' % (OUT, len(sizes), os.path.getsize(OUT) / 1024))


if __name__ == '__main__':
    main()
