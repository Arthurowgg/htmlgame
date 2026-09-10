"""Pixel-art launcher UI (pygame)."""
from __future__ import annotations
import math
import sys
import time
from pathlib import Path

import pygame

from . import __version__
from .theme import C, LOGICAL_W, LOGICAL_H, SCALE, TABS, WINDOW_TITLE
from . import font as F
from . import widgets as W
from .core import LauncherCore, Version, LAUNCHER_VERSION

SWATCHES = [
    "#5a9e6f", "#3d8bfd", "#e8b84a", "#c47a3a",
    "#ff5d6c", "#a78bfa", "#22d3ee", "#f472b6",
    "#94a3b8", "#84cc16",
]


def hex_to_rgb(h: str):
    h = h.lstrip("#")
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def fmt_bytes(n: int) -> str:
    if n < 1024:
        return f"{n} B"
    if n < 1024 * 1024:
        return f"{n / 1024:.1f} KB"
    return f"{n / (1024 * 1024):.2f} MB"


def fmt_date(iso: str) -> str:
    if not iso:
        return "—"
    return iso[:10]


class LauncherApp:
    def __init__(self, scale: int = SCALE, screenshot_mode: bool = False):
        self.scale = max(2, min(5, scale))
        self.screenshot_mode = screenshot_mode
        self.core = LauncherCore(log=self._log)
        self.tab = 0
        self.clock = None
        self.screen = None   # scaled window surface
        self.canvas = None   # logical low-res surface
        self.running = True
        self.t0 = time.time()
        self.status = "Booting…"
        self.toast = ""
        self.toast_t = 0.0
        self.buttons: list[W.Button] = []
        self.progress = W.ProgressBar(pygame.Rect(0, 0, 10, 10))
        self.version_scroll = 0
        self.library_scroll = 0
        self.name_edit = False
        self.name_buf = ""
        self.confirm = None  # {msg, on_yes}
        self.mouse_logical = (0, 0)
        self.flash = 0.0
        self._build_static_buttons()

    def _log(self, msg: str):
        self.status = str(msg)[:80]
        print(f"[launcher] {msg}", flush=True)

    def _build_static_buttons(self):
        self.tab_btns = []
        x = 88
        for i, name in enumerate(TABS):
            b = W.Button((x, 5, 54, 14), name, kind="tab")
            b.pressed = i == 0
            self.tab_btns.append(b)
            x += 58

        self.btn_play = W.Button((0, 0, 120, 22), "PLAY", kind="primary")
        self.btn_install = W.Button((0, 0, 70, 22), "INSTALL", kind="normal")
        self.btn_uninstall = W.Button((0, 0, 70, 22), "REMOVE", kind="ghost")
        self.btn_refresh = W.Button((0, 0, 80, 14), "REFRESH", kind="ghost")
        self.btn_clear = W.Button((0, 0, 90, 14), "CLEAR ALL", kind="ghost")
        self.btn_save_prof = W.Button((0, 0, 90, 16), "SAVE PROFILE", kind="primary")
        self.btn_save_set = W.Button((0, 0, 90, 16), "SAVE SETTINGS", kind="primary")
        self.btn_prev = W.Button((0, 0, 16, 16), "◀", kind="normal")
        self.btn_next = W.Button((0, 0, 16, 16), "▶", kind="normal")

    # ----- lifecycle -----
    def run(self):
        pygame.init()
        pygame.display.set_caption(WINDOW_TITLE)
        w, h = LOGICAL_W * self.scale, LOGICAL_H * self.scale
        flags = 0
        self.screen = pygame.display.set_mode((w, h), flags)
        self.canvas = pygame.Surface((LOGICAL_W, LOGICAL_H))
        self.clock = pygame.time.Clock()
        self._set_icon()

        self.status = "Loading catalog…"
        self.core.refresh_catalog()
        self.status = f"Ready - {len(self.core.catalog)} version(s)"
        self._toast("Welcome, traveler")

        while self.running:
            dt = self.clock.tick(60) / 1000.0
            self._events()
            self._update(dt)
            self._draw()
            scaled = pygame.transform.scale(self.canvas, self.screen.get_size())
            self.screen.blit(scaled, (0, 0))
            pygame.display.flip()

            if self.screenshot_mode and time.time() - self.t0 > 0.8:
                self._save_preview()
                self.running = False

        self.core.stop_play()
        pygame.quit()

    def _set_icon(self):
        try:
            icon = pygame.Surface((32, 32))
            icon.fill(C["bg"])
            W.draw_icon_block(icon, 4, 4, 24)
            pygame.display.set_icon(icon)
        except Exception:
            pass

    def _save_preview(self):
        out = Path(__file__).resolve().parents[1] / "screenshots"
        out.mkdir(exist_ok=True)
        # save logical + scaled
        path = out / "launcher_play.png"
        pygame.image.save(self.screen, str(path))
        # also other tabs
        for i, name in enumerate(["play", "library", "profile", "settings"]):
            self.tab = i
            for b in self.tab_btns:
                b.pressed = False
            self.tab_btns[i].pressed = True
            self._draw()
            scaled = pygame.transform.scale(self.canvas, self.screen.get_size())
            self.screen.blit(scaled, (0, 0))
            pygame.image.save(self.screen, str(out / f"launcher_{name}.png"))
        print(f"Saved previews → {out}")

    # ----- events -----
    def _events(self):
        for ev in pygame.event.get():
            if ev.type == pygame.QUIT:
                self.running = False
            elif ev.type == pygame.KEYDOWN:
                self._key(ev)
            elif ev.type == pygame.MOUSEMOTION:
                self.mouse_logical = (ev.pos[0] // self.scale, ev.pos[1] // self.scale)
                self._hover(self.mouse_logical)
            elif ev.type == pygame.MOUSEBUTTONDOWN and ev.button == 1:
                self.mouse_logical = (ev.pos[0] // self.scale, ev.pos[1] // self.scale)
                self._click(self.mouse_logical, down=True)
            elif ev.type == pygame.MOUSEBUTTONUP and ev.button == 1:
                self.mouse_logical = (ev.pos[0] // self.scale, ev.pos[1] // self.scale)
                self._click(self.mouse_logical, down=False)
            elif ev.type == pygame.MOUSEWHEEL:
                if self.tab == 1:
                    self.library_scroll = max(0, self.library_scroll - ev.y)

    def _key(self, ev):
        if self.confirm:
            if ev.key in (pygame.K_ESCAPE, pygame.K_n):
                self.confirm = None
            elif ev.key in (pygame.K_RETURN, pygame.K_y):
                cb = self.confirm.get("on_yes")
                self.confirm = None
                if cb:
                    cb()
            return

        if self.name_edit:
            if ev.key == pygame.K_RETURN:
                self.core.profile.name = (self.name_buf or "Player")[:16]
                self.name_edit = False
                self.core.save_profile()
                self._toast("Name set")
            elif ev.key == pygame.K_ESCAPE:
                self.name_edit = False
            elif ev.key == pygame.K_BACKSPACE:
                self.name_buf = self.name_buf[:-1]
            else:
                ch = ev.unicode
                if ch and ch.isprintable() and len(self.name_buf) < 16:
                    self.name_buf += ch
            return

        if ev.key == pygame.K_ESCAPE:
            self.running = False
        elif ev.key == pygame.K_LEFT:
            self._cycle_version(-1)
        elif ev.key == pygame.K_RIGHT:
            self._cycle_version(1)
        elif ev.key == pygame.K_RETURN:
            self._do_play()
        elif ev.key in (pygame.K_1, pygame.K_2, pygame.K_3, pygame.K_4):
            self._set_tab(ev.key - pygame.K_1)
        elif ev.key == pygame.K_F5:
            self.core.refresh_catalog()
            self._toast("Catalog refreshed")

    def _hover(self, pos):
        for b in self._all_buttons():
            b.hover = b.hit(pos) if b.enabled and b.visible else False

    def _click(self, pos, down: bool):
        if self.confirm:
            if not down:
                # yes / no regions drawn in confirm modal
                mr = pygame.Rect(LOGICAL_W // 2 - 80, LOGICAL_H // 2 - 30, 160, 70)
                yes = pygame.Rect(mr.x + 10, mr.bottom - 22, 60, 14)
                no = pygame.Rect(mr.right - 70, mr.bottom - 22, 60, 14)
                if yes.collidepoint(pos):
                    cb = self.confirm.get("on_yes")
                    self.confirm = None
                    if cb:
                        cb()
                elif no.collidepoint(pos):
                    self.confirm = None
            return

        for b in self._all_buttons():
            if not b.visible or not b.enabled:
                b.pressed = b.pressed if b.kind == "tab" else False
                continue
            if b.hit(pos):
                if down:
                    if b.kind != "tab":
                        b.pressed = True
                else:
                    was = b.pressed or b.kind == "tab"
                    if b.kind != "tab":
                        b.pressed = False
                    if was or b.kind == "tab":
                        self._on_button(b)
            else:
                if b.kind != "tab":
                    b.pressed = False

        # swatches on profile
        if self.tab == 2 and not down:
            for i, hexcol in enumerate(SWATCHES):
                r = pygame.Rect(24 + (i % 5) * 22, 136 + (i // 5) * 22, 18, 18)
                if r.collidepoint(pos):
                    self.core.profile.color = hexcol
                    self._toast("Color selected")

        # name field
        if self.tab == 2 and not down:
            nr = pygame.Rect(92, 72, 150, 14)
            if nr.collidepoint(pos):
                self.name_edit = True
                self.name_buf = self.core.profile.name

        # version list click on library
        if self.tab == 1 and not down:
            self._library_click(pos)

        # settings toggles
        if self.tab == 3 and not down:
            self._settings_click(pos)

    def _all_buttons(self):
        bs = list(self.tab_btns)
        if self.tab == 0:
            bs += [self.btn_prev, self.btn_next, self.btn_play, self.btn_install, self.btn_uninstall]
        elif self.tab == 1:
            bs += [self.btn_refresh, self.btn_clear]
        elif self.tab == 2:
            bs += [self.btn_save_prof]
        elif self.tab == 3:
            bs += [self.btn_save_set]
        return bs

    def _on_button(self, b: W.Button):
        if b in self.tab_btns:
            self._set_tab(self.tab_btns.index(b))
            return
        if b is self.btn_play:
            self._do_play()
        elif b is self.btn_install:
            self._do_install()
        elif b is self.btn_uninstall:
            self._do_uninstall()
        elif b is self.btn_prev:
            self._cycle_version(-1)
        elif b is self.btn_next:
            self._cycle_version(1)
        elif b is self.btn_refresh:
            self.core.refresh_catalog()
            self._toast("Catalog refreshed")
        elif b is self.btn_clear:
            self.confirm = {
                "msg": "Clear all installs?",
                "on_yes": lambda: (self.core.clear_all_installs(), self._toast("Library cleared")),
            }
        elif b is self.btn_save_prof:
            if self.name_edit:
                self.core.profile.name = (self.name_buf or "Player")[:16]
                self.name_edit = False
            self.core.save_profile()
            self._toast("Profile saved")
        elif b is self.btn_save_set:
            self.core.save_profile()
            self._toast("Settings saved")

    def _set_tab(self, i: int):
        self.tab = max(0, min(len(TABS) - 1, i))
        for j, b in enumerate(self.tab_btns):
            b.pressed = j == self.tab
        self.name_edit = False

    def _cycle_version(self, delta: int):
        if not self.core.catalog:
            return
        ids = [v.id for v in self.core.catalog]
        cur = ids.index(self.core.selected.id) if self.core.selected and self.core.selected.id in ids else 0
        cur = (cur + delta) % len(ids)
        self.core.selected = self.core.catalog[cur]

    def _do_install(self):
        v = self.core.selected
        if not v or self.core.installing:
            return
        if self.core.is_installed(v):
            self._toast("Already installed")
            return
        self.progress.visible = True
        self.core.install(v, on_done=lambda ok, err: self._install_done(ok, err, play=False))

    def _do_play(self):
        v = self.core.selected
        if not v or self.core.installing:
            return
        if not self.core.is_installed(v):
            self.progress.visible = True
            self.core.install(v, on_done=lambda ok, err: self._install_done(ok, err, play=True))
            return
        ok, info = self.core.play(v)
        if ok:
            self._toast(f"Launching {v.version}…")
            self.flash = 0.4
        else:
            self._toast(f"Play failed: {info}")

    def _install_done(self, ok, err, play=False):
        if ok:
            self._toast("Installed!")
            if play:
                v = self.core.selected
                if v:
                    pok, info = self.core.play(v)
                    if pok:
                        self._toast(f"Launching {v.version}…")
                        self.flash = 0.4
                    else:
                        self._toast(f"Play failed: {info}")
        else:
            self._toast(f"Install failed: {err or 'error'}")
        # hide progress shortly
        self.progress.visible = False

    def _do_uninstall(self):
        v = self.core.selected
        if not v or not self.core.is_installed(v):
            return
        self.confirm = {
            "msg": f"Remove {v.version}?",
            "on_yes": lambda: (self.core.uninstall(v), self._toast("Removed")),
        }

    def _library_click(self, pos):
        y0 = 70  # hy(56)+14
        row_h = 20
        if pos[1] < y0:
            return
        idx = (pos[1] - y0) // row_h + self.library_scroll
        if idx < 0 or idx >= len(self.core.catalog):
            return
        v = self.core.catalog[idx]
        row_y = y0 + (idx - self.library_scroll) * row_h
        play_r = pygame.Rect(LOGICAL_W - 110, row_y + 3, 40, 12)
        act_r = pygame.Rect(LOGICAL_W - 64, row_y + 3, 48, 12)
        if play_r.collidepoint(pos) and self.core.is_installed(v):
            self.core.selected = v
            self._do_play()
        elif act_r.collidepoint(pos):
            self.core.selected = v
            if self.core.is_installed(v):
                self._do_uninstall()
            else:
                self._do_install()
        else:
            self.core.selected = v

    def _settings_click(self, pos):
        items = [
            ("sound", pygame.Rect(24, 58, 12, 12)),
            ("anim", pygame.Rect(24, 78, 12, 12)),
            ("auto_latest", pygame.Rect(24, 98, 12, 12)),
        ]
        for key, r in items:
            if r.collidepoint(pos):
                setattr(self.core.profile, key, not getattr(self.core.profile, key))
        for i, val in enumerate(["1", "2", "3"]):
            r = pygame.Rect(24 + i * 40, 134, 34, 14)
            if r.collidepoint(pos):
                self.core.profile.scale = val
        for i, val in enumerate(["easy", "normal", "hard"]):
            r = pygame.Rect(24 + i * 52, 168, 48, 14)
            if r.collidepoint(pos):
                self.core.profile.difficulty = val

    # ----- update -----
    def _update(self, dt):
        if self.toast_t > 0:
            self.toast_t -= dt
        if self.flash > 0:
            self.flash -= dt
        # progress mirror
        if self.core.installing:
            self.progress.visible = True
            self.progress.value = self.core.progress
            self.progress.label = self.core.progress_label
            self.progress.detail = self.core.progress_detail
        # button states for play tab
        v = self.core.selected
        inst = bool(v and self.core.is_installed(v))
        busy = self.core.installing
        self.btn_play.enabled = bool(v) and not busy
        self.btn_install.enabled = bool(v) and not inst and not busy
        self.btn_uninstall.enabled = inst and not busy
        self.btn_uninstall.visible = inst
        if v:
            if inst:
                self.btn_play.label = "PLAY"
            else:
                self.btn_play.label = "INSTALL & PLAY"
        self.btn_prev.enabled = len(self.core.catalog) > 1
        self.btn_next.enabled = len(self.core.catalog) > 1

    def _toast(self, msg: str):
        self.toast = msg.upper()
        self.toast_t = 2.4

    # ----- draw -----
    def _draw(self):
        t = time.time() - self.t0
        c = self.canvas
        c.fill(C["bg"])

        # top bar
        W.fill(c, pygame.Rect(0, 0, LOGICAL_W, 24), C["bg2"])
        pygame.draw.line(c, C["line"], (0, 24), (LOGICAL_W, 24))
        W.draw_icon_block(c, 6, 4, 16)
        F.draw_text(c, "GRAND PIXEL", 26, 5, C["gold"], scale=1, shadow=True)
        F.draw_text(c, "LAUNCHER", 26, 13, C["muted"], scale=1)

        for b in self.tab_btns:
            b.draw(c)

        # user chip
        W.draw_avatar(c, LOGICAL_W - 78, 4, 16, hex_to_rgb(self.core.profile.color))
        F.draw_text(c, self.core.profile.name[:10], LOGICAL_W - 58, 9, C["text"], scale=1)

        # content
        if self.tab == 0:
            self._draw_play(c, t)
        elif self.tab == 1:
            self._draw_library(c)
        elif self.tab == 2:
            self._draw_profile(c)
        elif self.tab == 3:
            self._draw_settings(c)

        # bottom status bar
        W.fill(c, pygame.Rect(0, LOGICAL_H - 12, LOGICAL_W, 12), C["shadow"])
        pygame.draw.line(c, C["line"], (0, LOGICAL_H - 12), (LOGICAL_W, LOGICAL_H - 12))
        F.draw_text(c, self.status, 4, LOGICAL_H - 9, C["dim"], scale=1)
        F.draw_text(c, f"v{LAUNCHER_VERSION}", LOGICAL_W - 4, LOGICAL_H - 9, C["dim"], scale=1, align="right")

        # toast
        if self.toast_t > 0 and self.toast:
            tw = F.measure(self.toast) + 16
            tr = pygame.Rect(LOGICAL_W // 2 - tw // 2, LOGICAL_H - 36, tw, 14)
            W.panel(c, tr, C["panel2"], C["gold"])
            F.draw_text(c, self.toast, tr.centerx, tr.y + 4, C["gold"], scale=1, align="center")

        # confirm modal
        if self.confirm:
            overlay = pygame.Surface((LOGICAL_W, LOGICAL_H), pygame.SRCALPHA)
            overlay.fill((0, 0, 0, 160))
            c.blit(overlay, (0, 0))
            mr = pygame.Rect(LOGICAL_W // 2 - 90, LOGICAL_H // 2 - 32, 180, 64)
            W.panel(c, mr, C["panel"], C["gold"])
            F.draw_text(c, self.confirm["msg"], mr.centerx, mr.y + 12, C["text"], scale=1, align="center")
            yes = pygame.Rect(mr.x + 16, mr.bottom - 22, 60, 14)
            no = pygame.Rect(mr.right - 76, mr.bottom - 22, 60, 14)
            W.Button(yes, "YES", kind="primary").draw(c)
            W.Button(no, "NO", kind="ghost").draw(c)

        # flash on launch
        if self.flash > 0:
            a = int(180 * (self.flash / 0.4))
            ov = pygame.Surface((LOGICAL_W, LOGICAL_H), pygame.SRCALPHA)
            ov.fill((255, 236, 160, a))
            c.blit(ov, (0, 0))

    def _draw_play(self, c, t):
        # hero banner
        hero = pygame.Rect(8, 30, LOGICAL_W - 16, 78)
        hero_s = pygame.Surface((hero.w, hero.h))
        if self.core.profile.anim:
            W.draw_hero_bg(hero_s, t)
        else:
            W.draw_hero_bg(hero_s, 0)
        c.blit(hero_s, hero.topleft)
        W.rect_border(c, hero, C["line"], 1)
        # dark scrim behind title for readability
        scrim = pygame.Surface((hero.w, 44), pygame.SRCALPHA)
        scrim.fill((8, 6, 14, 120))
        c.blit(scrim, (hero.x, hero.y))
        F.draw_text(c, "GRAND PIXEL GAME", hero.x + 10, hero.y + 8, C["white"], scale=2, shadow=True)
        F.draw_text(c, "OPEN WORLD  -  VOXEL  -  PIXEL", hero.x + 10, hero.y + 28, C["gold"], scale=1, shadow=True)
        n_inst = len(self.core.list_installed())
        F.draw_text(
            c,
            f"{len(self.core.catalog)} VERSIONS    {n_inst} INSTALLED    {fmt_bytes(self.core.total_library_size())}",
            hero.x + 10, hero.y + 58, C["text"], scale=1, shadow=True,
        )

        # version card
        card = pygame.Rect(8, 116, LOGICAL_W - 16, 140)
        W.panel(c, card, C["panel"], C["line"])

        F.draw_text(c, "VERSION", card.x + 10, card.y + 8, C["muted"], scale=1)

        # selector
        sel_r = pygame.Rect(card.x + 10, card.y + 20, card.w - 56, 16)
        W.inset(c, sel_r, C["bg"])
        v = self.core.selected
        if v:
            kind = "RELEASE" if v.type == "release" else "SNAPSHOT"
            label = f"{v.version}  -  {kind}"
            if v.latest:
                label += "  (LATEST)"
            if self.core.is_installed(v):
                label += "  *"
            F.draw_text(c, label, sel_r.x + 6, sel_r.y + 5, C["text"], scale=1)
        else:
            F.draw_text(c, "NO VERSIONS FOUND", sel_r.x + 6, sel_r.y + 5, C["dim"], scale=1)

        self.btn_prev.r = pygame.Rect(sel_r.right + 4, sel_r.y, 16, 16)
        self.btn_next.r = pygame.Rect(sel_r.right + 22, sel_r.y, 16, 16)
        self.btn_prev.draw(c)
        self.btn_next.draw(c)

        # tags + meta + notes
        if v:
            tags = []
            tags.append(("RELEASE" if v.type == "release" else "SNAPSHOT",
                         C["green"] if v.type == "release" else C["blue"]))
            if v.latest:
                tags.append(("LATEST", C["gold"]))
            if self.core.is_installed(v):
                tags.append(("INSTALLED", C["orange"]))
            else:
                tags.append(("NOT INSTALLED", C["dim"]))
            tx = card.x + 10
            for text, col in tags:
                tw = F.measure(text) + 8
                tr = pygame.Rect(tx, card.y + 42, tw, 10)
                W.fill(c, tr, C["bg"])
                W.rect_border(c, tr, col, 1)
                F.draw_text(c, text, tr.centerx, tr.y + 2, col, scale=1, align="center")
                tx += tw + 4

            meta = f"RELEASED {fmt_date(v.date)}"
            if v.size:
                meta += f"  -  {fmt_bytes(v.size)}"
            if self.core.is_installed(v):
                meta += f"  -  LOCAL {fmt_bytes(self.core.installed_size(v))}"
            F.draw_text(c, meta, card.x + 10, card.y + 56, C["muted"], scale=1)

            notes = (v.changelog or [])[:2]
            ny = card.y + 68
            for note in notes:
                line = note[:58]
                F.draw_text(c, f"* {line}", card.x + 10, ny, C["dim"], scale=1)
                ny += 10
            if not notes:
                F.draw_text(c, "Select Install & Play to begin your journey.", card.x + 10, ny, C["dim"], scale=1)

        # progress
        self.progress.r = pygame.Rect(card.x + 10, card.y + 92, card.w - 20, 8)
        if self.core.installing:
            self.progress.visible = True
            self.progress.value = self.core.progress
            F.draw_text(
                c,
                f"{self.core.progress_label}  {int(self.core.progress * 100)}%",
                card.x + 10, card.y + 84, C["muted"], scale=1,
            )
        self.progress.draw(c)

        # action buttons
        by = card.bottom - 26
        self.btn_play.r = pygame.Rect(card.x + 10, by, 140, 18)
        self.btn_install.r = pygame.Rect(self.btn_play.r.right + 6, by, 70, 18)
        self.btn_uninstall.r = pygame.Rect(self.btn_install.r.right + 6, by, 64, 18)
        self.btn_play.draw(c)
        self.btn_install.draw(c)
        self.btn_uninstall.draw(c)

        # tip above status bar
        F.draw_text(
            c,
            "ENTER = PLAY   ARROWS = VERSION   1-4 = TABS   ESC = QUIT",
            10, LOGICAL_H - 22, C["dim"], scale=1,
        )

    def _draw_library(self, c):
        F.draw_text(c, "INSTALLATIONS", 10, 32, C["gold"], scale=1, shadow=True)
        F.draw_text(c, "Manage game versions cached on this machine.", 10, 42, C["muted"], scale=1)

        self.btn_refresh.r = pygame.Rect(LOGICAL_W - 180, 30, 70, 14)
        self.btn_clear.r = pygame.Rect(LOGICAL_W - 100, 30, 90, 14)
        self.btn_refresh.draw(c)
        self.btn_clear.draw(c)

        # table header
        hy = 56
        W.fill(c, pygame.Rect(8, hy - 2, LOGICAL_W - 16, 12), C["bg3"])
        F.draw_text(c, "VERSION", 12, hy + 1, C["muted"], scale=1)
        F.draw_text(c, "TYPE", 100, hy + 1, C["muted"], scale=1)
        F.draw_text(c, "STATUS", 160, hy + 1, C["muted"], scale=1)
        F.draw_text(c, "SIZE", 250, hy + 1, C["muted"], scale=1)
        F.draw_text(c, "ACTIONS", 330, hy + 1, C["muted"], scale=1)

        row_h = 20
        visible = 8
        start = self.library_scroll
        for i, v in enumerate(self.core.catalog[start:start + visible]):
            y = hy + 14 + i * row_h
            row = pygame.Rect(8, y, LOGICAL_W - 16, row_h - 2)
            sel = self.core.selected and self.core.selected.id == v.id
            W.fill(c, row, C["panel2"] if sel else (C["panel"] if i % 2 == 0 else C["bg2"]))
            if sel:
                pygame.draw.rect(c, C["gold"], pygame.Rect(row.x, row.y, 2, row.h))

            F.draw_text(c, v.version + (" *" if v.latest else ""), 12, y + 6, C["text"], scale=1)
            tc = C["green"] if v.type == "release" else C["blue"]
            F.draw_text(c, "REL" if v.type == "release" else "SNAP", 100, y + 6, tc, scale=1)
            inst = self.core.is_installed(v)
            F.draw_text(c, "INSTALLED" if inst else "MISSING", 160, y + 6, C["green"] if inst else C["dim"], scale=1)
            sz = self.core.installed_size(v) if inst else v.size
            F.draw_text(c, fmt_bytes(sz) if sz else "-", 250, y + 6, C["muted"], scale=1)

            if inst:
                pb = W.Button((LOGICAL_W - 110, y + 3, 40, 12), "PLAY", kind="primary")
                pb.draw(c)
                ub = W.Button((LOGICAL_W - 64, y + 3, 48, 12), "REMOVE", kind="ghost")
                ub.draw(c)
            else:
                ib = W.Button((LOGICAL_W - 64, y + 3, 48, 12), "INSTALL", kind="normal")
                ib.draw(c)

        if not self.core.catalog:
            F.draw_text(c, "No versions in catalog.", LOGICAL_W // 2, 140, C["dim"], scale=1, align="center")

    def _draw_profile(self, c):
        F.draw_text(c, "PROFILE", 10, 32, C["gold"], scale=1, shadow=True)
        F.draw_text(c, "Local identity passed into the game.", 10, 42, C["muted"], scale=1)

        W.draw_avatar(c, 24, 60, 52, hex_to_rgb(self.core.profile.color))
        F.draw_text(c, "DISPLAY NAME", 92, 60, C["muted"], scale=1)
        nr = pygame.Rect(92, 72, 150, 14)
        W.inset(c, nr, C["bg"])
        shown = self.name_buf if self.name_edit else self.core.profile.name
        if self.name_edit and int(time.time() * 2) % 2 == 0:
            shown += "_"
        F.draw_text(c, shown[:16], nr.x + 4, nr.y + 4, C["text"], scale=1)
        F.draw_text(c, "CLICK TO EDIT", 92, 90, C["dim"], scale=1)

        F.draw_text(c, "SKIN COLOR", 24, 124, C["muted"], scale=1)
        for i, hexcol in enumerate(SWATCHES):
            r = pygame.Rect(24 + (i % 5) * 22, 136 + (i // 5) * 22, 18, 18)
            W.fill(c, r, hex_to_rgb(hexcol))
            if hexcol == self.core.profile.color:
                W.rect_border(c, r.inflate(2, 2), C["white"], 1)
                W.rect_border(c, r.inflate(4, 4), C["gold"], 1)
            else:
                W.rect_border(c, r, C["line"], 1)

        sc = pygame.Rect(260, 60, 180, 130)
        W.panel(c, sc, C["panel"], C["line"])
        F.draw_text(c, "LOCAL STATS", sc.x + 10, sc.y + 10, C["muted"], scale=1)
        rows = [
            ("LAUNCHES", str(self.core.stats.launches)),
            ("INSTALLS", str(self.core.stats.installs)),
            ("LIBRARY", str(len(self.core.list_installed()))),
            ("PLAYER", self.core.profile.name[:12]),
        ]
        yy = sc.y + 28
        for lab, val in rows:
            F.draw_text(c, lab, sc.x + 10, yy, C["dim"], scale=1)
            F.draw_text(c, val, sc.right - 10, yy, C["text"], scale=1, align="right")
            yy += 18

        self.btn_save_prof.r = pygame.Rect(24, 190, 110, 16)
        self.btn_save_prof.draw(c)

    def _draw_settings(self, c):
        F.draw_text(c, "SETTINGS", 10, 32, C["gold"], scale=1, shadow=True)

        def toggle(x, y, on, label):
            r = pygame.Rect(x, y, 12, 12)
            W.inset(c, r, C["bg"])
            if on:
                W.fill(c, r.inflate(-4, -4), C["green"])
            F.draw_text(c, label, x + 18, y + 3, C["text"], scale=1)

        toggle(24, 58, self.core.profile.sound, "UI SOUNDS")
        toggle(24, 78, self.core.profile.anim, "ANIMATED BACKGROUND")
        toggle(24, 98, self.core.profile.auto_latest, "AUTO-SELECT LATEST RELEASE")

        F.draw_text(c, "RENDER SCALE (GAME)", 24, 122, C["muted"], scale=1)
        for i, (val, lab) in enumerate([("1", "FINE"), ("2", "BAL"), ("3", "BIG")]):
            r = pygame.Rect(24 + i * 40, 134, 34, 14)
            on = self.core.profile.scale == val
            W.fill(c, r, C["gold"] if on else C["panel2"])
            W.rect_border(c, r, C["line2"], 1)
            F.draw_text(c, lab if not on else val, r.centerx, r.y + 4, C["bg"] if on else C["text"], scale=1, align="center")

        F.draw_text(c, "DIFFICULTY", 24, 156, C["muted"], scale=1)
        for i, val in enumerate(["easy", "normal", "hard"]):
            r = pygame.Rect(24 + i * 52, 168, 48, 14)
            on = self.core.profile.difficulty == val
            W.fill(c, r, C["gold"] if on else C["panel2"])
            W.rect_border(c, r, C["line2"], 1)
            F.draw_text(c, val.upper(), r.centerx, r.y + 4, C["bg"] if on else C["text"], scale=1, align="center")

        ab = pygame.Rect(250, 58, 190, 150)
        W.panel(c, ab, C["panel"], C["line"])
        F.draw_text(c, "ABOUT", ab.x + 10, ab.y + 10, C["muted"], scale=1)
        F.draw_text(c, f"LAUNCHER {LAUNCHER_VERSION}", ab.x + 10, ab.y + 26, C["text"], scale=1)
        F.draw_text(c, "STANDALONE PIXEL APP", ab.x + 10, ab.y + 40, C["gold"], scale=1)
        F.draw_text(c, "NOT A WEB PAGE", ab.x + 10, ab.y + 52, C["dim"], scale=1)
        data = str(self.core.data)
        F.draw_text(c, "DATA", ab.x + 10, ab.y + 72, C["muted"], scale=1)
        F.draw_text(c, data[-30:], ab.x + 10, ab.y + 84, C["dim"], scale=1)
        repo = str(self.core.repo) if self.core.repo else "-"
        F.draw_text(c, "REPO", ab.x + 10, ab.y + 102, C["muted"], scale=1)
        F.draw_text(c, repo[-30:], ab.x + 10, ab.y + 114, C["dim"], scale=1)

        self.btn_save_set.r = pygame.Rect(24, 200, 110, 16)
        self.btn_save_set.draw(c)
