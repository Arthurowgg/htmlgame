#!/usr/bin/env python3
"""Empacota o Launcher do Grand Pixel Game num único .exe para Windows.

    python3 launcher/build.py [--version 1.1.0]

O executável é montado em launcher/dist/ e leva dentro dele: a interface,
o ícone, a arte do app e toda a lógica de download — mas NUNCA o jogo.
O conteúdo do jogo é baixado das publicações do projeto no GitHub.

Requer: Zig (pacote Python `ziglang`) e Pillow.
"""
import argparse
import hashlib
import os
import re
import shutil
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
GEN = os.path.join(HERE, 'gen')
DIST = os.path.join(HERE, 'dist')
SRC = os.path.join(HERE, 'src')

# a ordem importa: o build junta tudo num arquivo só (unidade de compilação)
SOURCES = [
    'src/core/gpg_str.cpp',
    'src/core/gpg_json.cpp',
    'src/core/gpg_hash_zip.cpp',
    'src/core/gpg_engine.cpp',
    'src/ui/gpg_ui.cpp',
    'src/ui/gpg_widgets.cpp',
    'src/ui/gpg_screens.cpp',
    'src/plat/win/win_canvas.cpp',
    'src/plat/win/win_platform.cpp',
    'src/plat/win/win_main.cpp',
    'gen/gpg_assets.cpp',
]
LIBS = ['user32', 'gdi32', 'msimg32', 'winhttp', 'ws2_32', 'shell32', 'ole32', 'comctl32',
        'windowscodecs', 'dwmapi', 'advapi32']


def find_zig():
    env = os.environ.get('ZIG')
    if env and os.path.exists(env):
        return env
    import glob
    for pat in ['~/.local/lib/python*/site-packages/ziglang/zig',
                '/usr/lib/python3*/site-packages/ziglang/zig',
                '/usr/local/lib/python3*/dist-packages/ziglang/zig',
                '/usr/lib/python3*/dist-packages/ziglang/zig']:
        hits = glob.glob(os.path.expanduser(pat))
        if hits:
            return hits[0]
    p = shutil.which('zig')
    if p:
        return p
    sys.exit('Zig não encontrado: pip install --user --break-system-packages ziglang')


def version_of():
    with open(os.path.join(SRC, 'version.txt'), encoding='utf-8') as f:
        v = f.read().strip()
    if not re.match(r'^\d+\.\d+\.\d+$', v):
        sys.exit('versão inválida em src/version.txt: ' + v)
    return v


def gen_rc(version, icon_path):
    """Recursos do Windows: ícone, manifesto e a ficha do programa — é o que
    faz o Windows mostrar nome, versão e ícone corretos nas propriedades."""
    os.makedirs(GEN, exist_ok=True)
    manifest = os.path.join(GEN, 'app.manifest')
    with open(manifest, 'w', encoding='utf-8') as f:
        f.write('''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<assembly xmlns="urn:schemas-microsoft-com:asm.v1" manifestVersion="1.0">
  <assemblyIdentity type="win32" name="GrandPixelGame.Launcher" version="%s" processorArchitecture="amd64"/>
  <description>Grand Pixel Game Launcher</description>
  <trustInfo xmlns="urn:schemas-microsoft-com:asm.v3">
    <security>
      <requestedPrivileges>
        <requestedExecutionLevel level="asInvoker" uiAccess="false"/>
      </requestedPrivileges>
    </security>
  </trustInfo>
  <application xmlns="urn:schemas-microsoft-com:asm.v3">
    <windowsSettings>
      <dpiAware xmlns="http://schemas.microsoft.com/SMI/2005/WindowsSettings">true</dpiAware>
      <dpiAwareness xmlns="http://schemas.microsoft.com/SMI/2016/WindowsSettings">PerMonitorV2</dpiAwareness>
      <activeCodePage xmlns="http://schemas.microsoft.com/SMI/2019/WindowsSettings">UTF-8</activeCodePage>
    </windowsSettings>
  </application>
  <compatibility xmlns="urn:schemas-microsoft-com:compatibility.v1">
    <application>
      <supportedOS Id="{8e0f7a12-bfb3-4fe8-b9a5-48fd50a15a9a}"/>
      <supportedOS Id="{4f476546-937b-4bde-96c0-599b953a6b31}"/>
    </application>
  </compatibility>
</assembly>
''' % version)
    vn = ','.join(version.split('.') + ['0'])
    rc = os.path.join(GEN, 'app.rc')
    with open(rc, 'w', encoding='utf-8') as f:
        f.write('#include <winres.h>\n')
        f.write('MAINICON ICON "%s"\n' % icon_path.replace('\\', '/'))
        f.write('1 24 "app.manifest"\n\n')
        f.write('VS_VERSION_INFO VERSIONINFO\n')
        f.write(' FILEVERSION %s\n PRODUCTVERSION %s\n' % (vn, vn))
        f.write(' FILEFLAGSMASK 0x3fL\n FILEFLAGS 0x0L\n FILEOS 0x40004L\n FILETYPE 0x1L\n'
                ' FILESUBTYPE 0x0L\n')
        f.write('BEGIN\n  BLOCK "StringFileInfo"\n  BEGIN\n    BLOCK "040904b0"\n    BEGIN\n')
        f.write('      VALUE "CompanyName", "Grand Pixel Game"\n')
        f.write('      VALUE "FileDescription", "Grand Pixel Game Launcher"\n')
        f.write('      VALUE "FileVersion", "%s"\n' % version)
        f.write('      VALUE "InternalName", "GrandPixelGameLauncher"\n')
        f.write('      VALUE "LegalCopyright", "Copyright (c) 2026 Grand Pixel Game"\n')
        f.write('      VALUE "OriginalFilename", "GrandPixelGameLauncher.exe"\n')
        f.write('      VALUE "ProductName", "Grand Pixel Game"\n')
        f.write('      VALUE "ProductVersion", "%s"\n' % version)
        f.write('    END\n  END\n  BLOCK "VarFileInfo"\n  BEGIN\n')
        f.write('    VALUE "Translation", 0x409, 1200\n  END\nEND\n')
    return rc


def unity_build():
    out = os.path.join(GEN, 'unity.cpp')
    with open(out, 'w', encoding='utf-8') as dst:
        for rel in SOURCES:
            with open(os.path.join(HERE, rel), encoding='utf-8') as f:
                dst.write('// ---- %s ----\n' % rel)
                dst.write(f.read())
                dst.write('\n')
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--version', default=None)
    ap.add_argument('--debug', action='store_true')
    args = ap.parse_args()
    version = args.version or version_of()
    zig = find_zig()
    os.makedirs(GEN, exist_ok=True)
    os.makedirs(DIST, exist_ok=True)

    print('== Launcher do Grand Pixel Game — versão %s ==' % version)
    print('  montando arte e ícone:')
    subprocess.run([sys.executable, os.path.join(HERE, 'tools', 'icon.py')], check=True)
    subprocess.run([sys.executable, os.path.join(HERE, 'tools', 'assets.py')], check=True)
    icon = os.path.join(GEN, 'app.ico')

    print('  recursos do Windows…')
    rc = gen_rc(version, icon)
    res = os.path.join(GEN, 'app.res')
    subprocess.run([zig, 'rc', '-fo' + res, rc], check=True)

    print('  juntando o código…')
    unity = unity_build()

    exe = os.path.join(DIST, 'GrandPixelGameLauncher-v%s-win64.exe' % version)
    cmd = [zig, 'c++', '-target', 'x86_64-windows-gnu', '-std=c++17', '-municode',
           '-DUNICODE', '-D_UNICODE',
           '-DGPG_LAUNCHER_VER="%s"' % version,
           '-I' + os.path.join(SRC, 'core'),
           '-I' + os.path.join(SRC, 'ui'),
           '-I' + os.path.join(SRC, 'plat', 'win'),
           '-I' + GEN,
           ('-O1' if args.debug else '-O2'),
           '-fno-exceptions',
           '-fno-rtti',
           unity, res,
           '-Wl,/subsystem:windows',
           '-o', exe]
    for lib in LIBS:
        cmd.append('-l' + lib)
    print('  compilando…')
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        sys.stderr.write(r.stdout[-8000:] + '\n' + r.stderr[-8000:] + '\n')
        sys.exit('compilação falhou')
    warn = [l for l in (r.stdout + r.stderr).splitlines() if 'error' in l.lower()]
    if warn:
        print('\n'.join(warn[:10]))
    size = os.path.getsize(exe)
    sha = hashlib.sha256(open(exe, 'rb').read()).hexdigest()
    print('  pronto: %s' % os.path.relpath(exe, ROOT))
    print('  tamanho: %.0f KB (%d bytes)' % (size / 1024.0, size))
    print('  sha256:  %s' % sha)
    print('== build ok ==')


if __name__ == '__main__':
    main()
