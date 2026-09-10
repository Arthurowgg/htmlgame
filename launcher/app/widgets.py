"""Pixel UI primitives — panels, buttons, bars, icons."""
from __future__ import annotations
import pygame
from .theme import C
from . import font as F


def fill(surf, rect, color):
    pygame.draw.rect(surf, color, rect)


def rect_border(surf, r, color, w=1):
    pygame.draw.rect(surf, color, r, w)


def panel(surf, r, fill_c=None, border_c=None, raised=True):
    fill_c = fill_c or C["panel"]
    border_c = border_c or C["line"]
    fill(surf, r, fill_c)
    # outer border
    rect_border(surf, r, border_c, 1)
    if raised:
        # top/left highlight, bottom/right shadow (1px bevel)
        pygame.draw.line(surf, C["line2"], (r.left + 1, r.top + 1), (r.right - 2, r.top + 1))
        pygame.draw.line(surf, C["line2"], (r.left + 1, r.top + 1), (r.left + 1, r.bottom - 2))
        pygame.draw.line(surf, C["shadow"], (r.left + 1, r.bottom - 1), (r.right - 1, r.bottom - 1))
        pygame.draw.line(surf, C["shadow"], (r.right - 1, r.top + 1), (r.right - 1, r.bottom - 1))


def inset(surf, r, fill_c=None):
    fill_c = fill_c or C["bg"]
    fill(surf, r, fill_c)
    rect_border(surf, r, C["shadow"], 1)
    pygame.draw.line(surf, C["line"], (r.left, r.bottom - 1), (r.right - 1, r.bottom - 1))
    pygame.draw.line(surf, C["line"], (r.right - 1, r.top), (r.right - 1, r.bottom - 1))


class Button:
    def __init__(self, r, label, kind="normal", enabled=True, icon=None):
        self.r = pygame.Rect(r)
        self.label = label
        self.kind = kind  # normal | primary | danger | ghost | tab
        self.enabled = enabled
        self.icon = icon
        self.hover = False
        self.pressed = False
        self.visible = True

    def hit(self, pos):
        return self.visible and self.enabled and self.r.collidepoint(pos)

    def draw(self, surf):
        if not self.visible:
            return
        r = self.r
        if self.kind == "primary":
            base = C["green"] if self.enabled else C["dim"]
            edge = C["green_dk"] if self.enabled else C["shadow"]
            text_c = C["bg"] if self.enabled else C["muted"]
        elif self.kind == "danger":
            base = C["red"] if self.enabled else C["dim"]
            edge = C["red2"]
            text_c = C["white"]
        elif self.kind == "ghost":
            base = C["panel"] if not self.hover else C["panel2"]
            edge = C["line"]
            text_c = C["muted"] if self.enabled else C["dim"]
        elif self.kind == "tab":
            base = C["panel2"] if self.pressed else (C["bg3"] if self.hover else C["bg2"])
            edge = C["gold"] if self.pressed else C["line"]
            text_c = C["gold"] if self.pressed else C["muted"]
        else:
            base = C["panel2"] if self.hover and self.enabled else C["panel"]
            edge = C["line2"] if self.hover else C["line"]
            text_c = C["text"] if self.enabled else C["dim"]

        if self.pressed and self.kind != "tab":
            # sink
            fill(surf, r, edge)
            fill(surf, r.inflate(-2, -2).move(0, 1), base)
        else:
            fill(surf, r, edge)
            inner = r.inflate(-2, -2)
            if self.kind == "primary" and self.enabled:
                # 3-band gradient
                h = inner.height
                fill(surf, pygame.Rect(inner.x, inner.y, inner.w, h // 3), (90, 220, 150))
                fill(surf, pygame.Rect(inner.x, inner.y + h // 3, inner.w, h // 3), base)
                fill(surf, pygame.Rect(inner.x, inner.y + 2 * h // 3, inner.w, h - 2 * h // 3), C["green2"])
            else:
                fill(surf, inner, base)

        # label
        tx = r.centerx
        ty = r.centery - (F.FONT_H // 2)
        if self.pressed and self.kind != "tab":
            ty += 1
        F.draw_text(surf, self.label, tx, ty, text_c, scale=1, shadow=self.kind == "primary", align="center")

        if self.kind == "tab" and self.pressed:
            # gold underline
            pygame.draw.rect(surf, C["gold"], pygame.Rect(r.x + 2, r.bottom - 2, r.w - 4, 2))


class ProgressBar:
    def __init__(self, r):
        self.r = pygame.Rect(r)
        self.value = 0.0  # 0..1
        self.label = ""
        self.detail = ""
        self.visible = False

    def draw(self, surf):
        if not self.visible:
            return
        r = self.r
        inset(surf, r, C["bg"])
        inner = r.inflate(-4, -4)
        if self.value > 0:
            w = max(2, int(inner.w * min(1.0, self.value)))
            fill_r = pygame.Rect(inner.x, inner.y, w, inner.h)
            # striped pixel fill
            fill(surf, fill_r, C["blue"])
            for x in range(fill_r.x, fill_r.right, 4):
                pygame.draw.line(surf, C["blue2"], (x, fill_r.y), (x, fill_r.bottom - 1))
            # shiny top
            pygame.draw.line(surf, (140, 180, 255), (fill_r.x, fill_r.y), (fill_r.right - 1, fill_r.y))
        if self.label:
            F.draw_text(surf, self.label, r.x, r.y - 10, C["muted"], scale=1)


def draw_icon_block(surf, x, y, size=16):
    """Pixel game-icon (house / block face)."""
    # background
    fill(surf, pygame.Rect(x, y, size, size), C["bg"])
    s = size / 16
    def p(px, py, w, h, c):
        fill(surf, pygame.Rect(int(x + px * s), int(y + py * s), max(1, int(w * s)), max(1, int(h * s))), c)
    p(0, 0, 16, 16, C["bg2"])
    p(3, 2, 10, 2, C["gold"])       # roof ridge
    p(2, 4, 12, 7, C["orange"])     # face
    p(2, 11, 12, 2, C["wood"])
    p(4, 13, 8, 2, C["wood2"])
    p(5, 6, 2, 2, C["shadow"])      # eyes
    p(9, 6, 2, 2, C["shadow"])
    rect_border(surf, pygame.Rect(x, y, size, size), C["line"], 1)


def draw_avatar(surf, x, y, size, color):
    fill(surf, pygame.Rect(x, y, size, size), color)
    s = size / 16
    def p(px, py, w, h, c):
        fill(surf, pygame.Rect(int(x + px * s), int(y + py * s), max(1, int(w * s)), max(1, int(h * s))), c)
    # eyes + mouth
    p(4, 5, 3, 3, C["shadow"])
    p(9, 5, 3, 3, C["shadow"])
    p(6, 11, 4, 2, C["shadow"])
    # highlight
    p(1, 1, 2, 2, C["highlight"])
    rect_border(surf, pygame.Rect(x, y, size, size), C["line"], 1)


def draw_hero_bg(surf, t=0.0):
    """Animated pixel sky / hills / island silhouette for the hero banner."""
    w, h = surf.get_size()
    # sky gradient bands
    bands = 8
    for i in range(bands):
        y0 = int(i * h / bands)
        y1 = int((i + 1) * h / bands)
        k = i / max(1, bands - 1)
        c = (
            int(C["sky1"][0] * (1 - k) + C["sky2"][0] * k),
            int(C["sky1"][1] * (1 - k) + C["sky2"][1] * k),
            int(C["sky1"][2] * (1 - k) + C["sky2"][2] * k),
        )
        fill(surf, pygame.Rect(0, y0, w, y1 - y0), c)

    # stars
    import math
    for i in range(18):
        sx = int((i * 97 + t * 4) % w)
        sy = 4 + (i * 37) % max(1, h // 2 - 4)
        if (i + int(t * 2)) % 5 != 0:
            fill(surf, pygame.Rect(sx, sy, 1, 1), C["highlight"] if i % 3 == 0 else C["muted"])

    # distant mountains
    for mx, mh, col in [(40, 40, (48, 44, 72)), (120, 55, (40, 36, 64)), (220, 48, (52, 40, 70)), (320, 60, (36, 32, 58))]:
        pts = [(mx - mh, h), (mx, h - mh), (mx + mh, h)]
        pygame.draw.polygon(surf, col, pts)

    # island / grass strip
    gy = h - 28
    fill(surf, pygame.Rect(0, gy, w, h - gy), C["grass"])
    fill(surf, pygame.Rect(0, gy + 10, w, h - gy - 10), C["dirt"])
    # water edge
    fill(surf, pygame.Rect(0, gy - 4, w, 5), C["water"])
    # bobbing water highlights
    for i in range(0, w, 8):
        ox = int(2 * math.sin(t * 2 + i * 0.2))
        fill(surf, pygame.Rect(i + ox, gy - 3, 3, 1), (100, 160, 220))

    # little house silhouette
    hx, hy = w - 90, gy - 18
    fill(surf, pygame.Rect(hx, hy + 6, 22, 14), C["wood"])
    pygame.draw.polygon(surf, C["red"], [(hx - 2, hy + 6), (hx + 11, hy - 4), (hx + 24, hy + 6)])
    fill(surf, pygame.Rect(hx + 8, hy + 12, 6, 8), C["shadow"])

    # tree
    tx, ty = 50, gy - 22
    fill(surf, pygame.Rect(tx + 4, ty + 10, 4, 12), C["wood2"])
    fill(surf, pygame.Rect(tx, ty, 12, 12), C["green2"])
    fill(surf, pygame.Rect(tx + 2, ty - 4, 8, 8), C["green"])
