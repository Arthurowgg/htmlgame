#!/usr/bin/env python3
# Gera icon.ico (16/32/48) para o executável: estrela dourada sobre
# quadrado arredondado escuro — sem dependências (BMP 32bpp + alpha).
import struct, os, math

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'gen', 'icon.ico')

def make_image(px):
    """Desenha o ícone em `px` e devolve o blob BMP-DIB (32bpp, bottom-up) + AND mask."""
    cx = cy = (px - 1) / 2.0
    rq = px * 0.46                     # canto arredondado
    R = px * 0.315                     # raio da estrela
    r = R * 0.42
    pts = []
    for i in range(10):
        a = math.pi / 2 + i * math.pi / 5
        rr = R if i % 2 == 0 else r
        pts.append((cx + math.cos(a) * rr, cy + math.sin(a) * rr))
    def in_star(x, y):
        j = 9; inside = False
        for i in range(10):
            xi, yi = pts[i]; xj, yj = pts[j]
            if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi + 1e-9) + xi:
                inside = not inside
            j = i
        return inside

    def alpha_at(x, y):
        # quadrado arredondado (distância aprox.) com AA suave de 1px
        dx = max(abs(x - cx) - (px * 0.5 - rq), 0.0)
        dy = max(abs(y - cy) - (px * 0.5 - rq), 0.0)
        d = math.hypot(dx, dy) - 0.6
        return max(0.0, min(1.0, 1.0 - d))

    xor = bytearray()
    androw = ((px + 31) // 32) * 4
    andm = bytearray(androw * px)
    for y in range(px - 1, -1, -1):     # bottom-up
        yy = px - 1 - y
        for x in range(px):
            a = alpha_at(x + 0.5, yy + 0.5)
            if a <= 0:
                xor += b'\x00\x00\x00\x00'
                andm[yy * androw + x // 8] |= 0x80 >> (x % 8)
                continue
            # fundo gradiente escuro-arroxeado
            t = (yy + 1.0) / px
            bg = (22 + 8 * t, 18 + 9 * t, 40 + 12 * t)
            core = in_star(x + 0.5, yy + 0.5)
            glow = False
            if not core:
                for dx in (-1, 0, 1):
                    for dy in (-1, 0, 1):
                        if in_star(x + dx + 0.5, yy + dy + 0.5):
                            glow = True
            if core:
                c = (255, 216, 116)     # dourado
            elif glow:
                k = 0.35 * a
                c = (int(bg[0] * (1 - k) + 255 * k),
                     int(bg[1] * (1 - k) + 216 * k),
                     int(bg[2] * (1 - k) + 120 * k))
            else:
                c = bg
            xor += bytes((c[2], c[1], c[0], int(a * 255)))  # BGRA
    pad = (4 - (px * 4) % 4) % 4
    row = bytearray()
    for y in range(px):
        row.extend(xor[y * px * 4:(y + 1) * px * 4])
        row.extend(b'\x00' * pad)
    hdr = struct.pack('<IiiHHIIiiII', 40, px, px * 2, 1, 32, 0, len(row), 0, 0, 0, 0)
    return bytes(hdr) + bytes(row) + bytes(andm)

def build():
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    imgs = {s: make_image(s) for s in (16, 32, 48)}
    header = struct.pack('<HHH', 0, 1, 3)
    pos = 6 + 16 * 3
    blob = b''
    out = header
    for s in (16, 32, 48):
        out += struct.pack('<BBBBHHII', s, s, 0, 0, 1, 32, len(imgs[s]), pos)
        blob += imgs[s]
        pos += len(imgs[s])
    out += blob
    with open(OUT, 'wb') as f:
        f.write(out)
    print('icon.ico gerado:', OUT, len(out), 'bytes')

if __name__ == '__main__':
    build()
