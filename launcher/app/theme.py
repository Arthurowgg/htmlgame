"""Pixel palette & layout constants (Minecraft-meets-JRPG launcher)."""

# Integer pixel scale for UI chrome (drawn at 1x then scaled up)
SCALE = 3

# Window logical size (before OS scaling); final window = W*SCALE x H*SCALE
# Actually we draw on a low-res surface and blit scaled — classic pixel look.
LOGICAL_W = 460
LOGICAL_H = 280
WINDOW_TITLE = "Grand Pixel Game Launcher"

# Palette — warm earth + gold accents
C = {
    "bg":        (18, 14, 28),
    "bg2":       (28, 22, 42),
    "bg3":       (38, 32, 56),
    "panel":     (32, 26, 48),
    "panel2":    (44, 36, 64),
    "line":      (72, 58, 96),
    "line2":     (96, 78, 128),
    "text":      (236, 230, 214),
    "muted":     (148, 136, 168),
    "dim":       (96, 88, 112),
    "gold":      (232, 184, 74),
    "gold2":     (196, 140, 40),
    "orange":    (196, 122, 58),
    "green":     (74, 196, 122),
    "green2":    (40, 148, 88),
    "green_dk":  (24, 96, 56),
    "blue":      (74, 140, 232),
    "blue2":     (48, 100, 180),
    "red":       (220, 72, 88),
    "red2":      (160, 40, 56),
    "white":     (255, 255, 255),
    "black":     (0, 0, 0),
    "shadow":    (8, 6, 14),
    "sky1":      (40, 56, 96),
    "sky2":      (72, 48, 88),
    "grass":     (56, 140, 72),
    "dirt":      (120, 84, 48),
    "wood":      (96, 64, 36),
    "wood2":     (72, 48, 28),
    "water":     (48, 100, 180),
    "highlight": (255, 236, 160),
}

# Tabs
TABS = ["PLAY", "LIBRARY", "PROFILE", "SETTINGS"]

FONT_W = 5
FONT_H = 7
FONT_GAP = 1
