#!/usr/bin/env python3
"""
OMNI CLASH — Windows Setup GUI

Packaged as OmniClash-Setup.exe (PyInstaller, windowed).
Double-click → automatic install → optional Launch.

No terminal required for the end user.
"""
from __future__ import annotations

import os
import sys
import threading
import traceback
from pathlib import Path

# Allow running from source: repo root on path
if not getattr(sys, "frozen", False):
    ROOT = Path(__file__).resolve().parents[1]
    if str(ROOT) not in sys.path:
        sys.path.insert(0, str(ROOT))

# When frozen, also allow importing setup package from _MEIPASS
if getattr(sys, "frozen", False):
    meipass = getattr(sys, "_MEIPASS", None)
    if meipass and meipass not in sys.path:
        sys.path.insert(0, meipass)

import tkinter as tk
from tkinter import ttk, messagebox, filedialog

from setup.win_setup_core import (  # noqa: E402
    DEFAULT_BRANCH,
    default_install_dir,
    run_install,
    launch_installed,
    InstallResult,
)

APP_TITLE = "OMNI CLASH — Setup"
VERSION = "1.0.0"


class SetupApp(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title(APP_TITLE)
        self.geometry("640x480")
        self.minsize(560, 420)
        self.configure(bg="#0e1524")
        self.res = None  # type: InstallResult | None
        self._installing = False

        # style
        style = ttk.Style(self)
        try:
            style.theme_use("clam")
        except Exception:
            pass
        style.configure("TFrame", background="#0e1524")
        style.configure("TLabel", background="#0e1524", foreground="#e8eef8", font=("Segoe UI", 10))
        style.configure("Title.TLabel", background="#0e1524", foreground="#e8b84a", font=("Segoe UI", 16, "bold"))
        style.configure("Sub.TLabel", background="#0e1524", foreground="#8b97ae", font=("Segoe UI", 10))
        style.configure("TButton", font=("Segoe UI", 10, "bold"), padding=8)
        style.configure("Accent.TButton", font=("Segoe UI", 11, "bold"), padding=10)
        style.configure("Horizontal.TProgressbar", troughcolor="#1a2438", background="#3dd68c", thickness=16)

        self._build()
        self.protocol("WM_DELETE_WINDOW", self._on_close)

    def _build(self):
        pad = {"padx": 20, "pady": 6}
        head = ttk.Frame(self)
        head.pack(fill="x", **pad)
        ttk.Label(head, text="GRAND PIXEL GAME", style="Title.TLabel").pack(anchor="w")
        ttk.Label(
            head,
            text="OMNI CLASH Setup — download, install, play. No terminal needed.",
            style="Sub.TLabel",
        ).pack(anchor="w")

        body = ttk.Frame(self)
        body.pack(fill="both", expand=True, **pad)

        ttk.Label(body, text="Install folder").pack(anchor="w")
        row = ttk.Frame(body)
        row.pack(fill="x", pady=4)
        self.path_var = tk.StringVar(value=str(default_install_dir()))
        self.path_entry = ttk.Entry(row, textvariable=self.path_var)
        self.path_entry.pack(side="left", fill="x", expand=True)
        ttk.Button(row, text="Browse…", command=self._browse).pack(side="left", padx=(8, 0))

        self.launch_var = tk.BooleanVar(value=True)
        ttk.Checkbutton(
            body,
            text="Start the Launcher when setup finishes",
            variable=self.launch_var,
        ).pack(anchor="w", pady=8)

        self.status = ttk.Label(body, text="Ready to install.", style="Sub.TLabel")
        self.status.pack(anchor="w", pady=(8, 2))

        self.pbar = ttk.Progressbar(body, mode="determinate", maximum=100)
        self.pbar.pack(fill="x", pady=4)

        # log box
        log_frame = ttk.Frame(body)
        log_frame.pack(fill="both", expand=True, pady=8)
        self.log = tk.Text(
            log_frame,
            height=12,
            bg="#070b14",
            fg="#c8d0e0",
            insertbackground="#e8eef8",
            font=("Consolas", 9),
            relief="flat",
            wrap="word",
        )
        sb = ttk.Scrollbar(log_frame, command=self.log.yview)
        self.log.configure(yscrollcommand=sb.set)
        self.log.pack(side="left", fill="both", expand=True)
        sb.pack(side="right", fill="y")
        self.log.insert("end", f"Setup v{VERSION}\n")
        self.log.configure(state="disabled")

        # buttons
        btns = ttk.Frame(self)
        btns.pack(fill="x", padx=20, pady=12)
        self.btn_install = ttk.Button(btns, text="Install Launcher", style="Accent.TButton", command=self._start)
        self.btn_install.pack(side="left")
        self.btn_launch = ttk.Button(btns, text="Open Launcher", command=self._launch_now, state="disabled")
        self.btn_launch.pack(side="left", padx=8)
        ttk.Button(btns, text="Close", command=self._on_close).pack(side="right")

    def _browse(self):
        d = filedialog.askdirectory(initialdir=self.path_var.get() or str(Path.home()))
        if d:
            self.path_var.set(d)

    def _append_log(self, msg: str):
        def do():
            self.log.configure(state="normal")
            self.log.insert("end", msg + "\n")
            self.log.see("end")
            self.log.configure(state="disabled")

        self.after(0, do)

    def _set_progress(self, frac: float, label: str):
        def do():
            self.pbar["value"] = max(0, min(100, frac * 100))
            self.status.configure(text=label)

        self.after(0, do)

    def _start(self):
        if self._installing:
            return
        path = self.path_var.get().strip()
        if not path:
            messagebox.showerror(APP_TITLE, "Choose an install folder.")
            return
        self._installing = True
        self.btn_install.configure(state="disabled")
        self.btn_launch.configure(state="disabled")
        self._append_log("— Starting installation —")
        t = threading.Thread(target=self._worker, args=(Path(path),), daemon=True)
        t.start()

    def _worker(self, dest: Path):
        try:
            res = run_install(
                install_to=dest,
                branch=DEFAULT_BRANCH,
                log=self._append_log,
                prog=self._set_progress,
                use_embed_python=(sys.platform == "win32"),
            )
            self.res = res
            self.after(0, lambda: self._done(res))
        except Exception:
            err = traceback.format_exc()
            self._append_log(err)
            self.after(0, lambda: self._done(InstallResult(ok=False, error=err)))

    def _done(self, res: InstallResult):
        self._installing = False
        self.btn_install.configure(state="normal")
        if res.ok and res.root:
            self.btn_launch.configure(state="normal")
            self.status.configure(text="Installation finished successfully.")
            self.pbar["value"] = 100
            messagebox.showinfo(
                APP_TITLE,
                "Launcher installed successfully!\n\n"
                f"Folder:\n{res.root}\n\n"
                "You can open it from the Desktop shortcut or click Open Launcher.",
            )
            if self.launch_var.get():
                self._launch_now()
        else:
            self.status.configure(text="Installation failed.")
            messagebox.showerror(
                APP_TITLE,
                "Installation failed.\n\n"
                f"{res.error or 'Unknown error'}\n\n"
                "Check the log for details. You need an internet connection "
                "the first time so the setup can download the launcher package.",
            )

    def _launch_now(self):
        root = self.res.root if self.res and self.res.root else None
        if not root or not root.is_dir():
            # try meta
            messagebox.showwarning(APP_TITLE, "Install the launcher first.")
            return
        try:
            launch_installed(root)
            self._append_log("Launcher started.")
        except Exception as e:
            messagebox.showerror(APP_TITLE, f"Could not start launcher:\n{e}")

    def _on_close(self):
        if self._installing:
            if not messagebox.askyesno(APP_TITLE, "Setup is still running. Quit anyway?"):
                return
        self.destroy()


def main():
    # HiDPI on Windows
    if sys.platform == "win32":
        try:
            import ctypes
            ctypes.windll.shcore.SetProcessDpiAwareness(1)  # type: ignore
        except Exception:
            pass
    app = SetupApp()
    app.mainloop()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
