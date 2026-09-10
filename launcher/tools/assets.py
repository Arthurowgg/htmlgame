#!/usr/bin/env python3
"""Prepara a arte do launcher e gera o código que a embute no executável.

As imagens entram no .exe como PNG comprimido (pequeno) e são decodificadas
na hora de desenhar — assim o executável fica leve e a arte continua nítida.
"""
import os
import sys

try:
    from PIL import Image
except ImportError:
    sys.exit("pillow não instalado (pip install pillow)")

HERE = os.path.dirname(os.path.abspath(__file__))
LAUNCHER = os.path.dirname(HERE)
ASSETS = os.path.join(LAUNCHER, 'assets')
GEN = os.path.join(LAUNCHER, 'gen')

# (arquivo, largura, altura, cores da paleta) — arte larga do topo e capa
SPEC = [
    ('hero.png', 'HERO', 1400, 560, 160),
    ('cover.png', 'COVER', 640, 640, 160),
]


def prepare(src, w, h, colors):
    im = Image.open(src).convert('RGB')
    # recorte central no formato desejado, depois reduz
    tr, sr = w / h, im.width / im.height
    if sr > tr:
        nw = int(im.height * tr)
        im = im.crop(((im.width - nw) // 2, 0, (im.width + nw) // 2, im.height))
    else:
        nh = int(im.width / tr)
        im = im.crop((0, (im.height - nh) // 2, im.width, (im.height + nh) // 2))
    im = im.resize((w, h), Image.LANCZOS)
    im = im.quantize(colors=colors, method=Image.MEDIANCUT, dither=Image.FLOYDSTEINBERG)
    return im.convert('RGB')


def main():
    os.makedirs(GEN, exist_ok=True)
    blobs = []
    for name, symbol, w, h, colors in SPEC:
        src = os.path.join(ASSETS, name)
        if not os.path.exists(src):
            sys.exit('arte não encontrada: ' + src)
        im = prepare(src, w, h, colors)
        tmp = os.path.join(GEN, symbol.lower() + '.png')
        im.save(tmp, 'PNG', optimize=True)
        with open(tmp, 'rb') as f:
            blobs.append((symbol, f.read(), im.width, im.height))
        print('  %-12s %dx%d  %.0f KB' % (name, im.width, im.height, len(blobs[-1][1]) / 1024))

    out = os.path.join(GEN, 'gpg_assets.cpp')
    with open(out, 'w', encoding='utf-8') as f:
        f.write('// GERADO POR launcher/tools/assets.py — não edite à mão.\n')
        f.write('#include "win_internal.h"\n\n')
        f.write('namespace gpg {\n')
        for symbol, data, w, h in blobs:
            f.write('// %s %dx%d, %d bytes\n' % (symbol, w, h, len(data)))
            f.write('static const unsigned char %s_PNG[] = {' % symbol)
            for i, b in enumerate(data):
                if i % 24 == 0:
                    f.write('\n  ')
                f.write('0x%02x,' % b)
            f.write('\n};\n\n')
        f.write('static const ImageBlob kBlobs[] = {\n')
        for symbol, data, w, h in blobs:
            f.write('  { %s_PNG, sizeof(%s_PNG) },\n' % (symbol, symbol))
        f.write('};\n\n')
        f.write('const ImageBlob* embedded_png(int id, size_t* size) {\n')
        f.write('  const int count = (int)(sizeof(kBlobs) / sizeof(kBlobs[0]));\n')
        f.write('  if (id < 0 || id >= count) { if (size) *size = 0; return 0; }\n')
        f.write('  if (size) *size = kBlobs[id].size;\n')
        f.write('  return &kBlobs[id];\n')
        f.write('}\n\n')
        f.write('}  // namespace gpg\n')
    print('  gerado', out)


if __name__ == '__main__':
    main()
