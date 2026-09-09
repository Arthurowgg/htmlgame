#!/usr/bin/env python3
# Empacota o Launcher do Grand Pixel Game em um .exe Windows.
# Uso: python3 launcher/build.py [--version 1.0.0]
# Saída: dist/launcher/GrandPixelGameLauncher-v<ver>-win64.exe
# Requer o pacote Python "ziglang" (pip install --user --break-system-packages ziglang).
import argparse, os, re, shutil, subprocess, sys, hashlib, glob

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, '..'))
GEN = os.path.join(HERE, 'gen')
DIST = os.path.join(ROOT, 'dist', 'launcher')

def find_zig():
    env = os.environ.get('ZIG')
    if env and os.path.exists(env):
        return env
    cand = os.path.expanduser('~/.local/lib/python3.11/site-packages/ziglang/zig')
    if os.path.exists(cand):
        return cand
    p = shutil.which('zig')
    if p:
        return p
    sys.exit('Zig não encontrado (pip install --user --break-system-packages ziglang ou exporte ZIG=/caminho/zig)')

def gen_rc(version):
    os.makedirs(GEN, exist_ok=True)
    man = os.path.join(GEN, 'app.manifest')
    with open(man, 'w') as f:
        f.write('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
                '<assembly xmlns="urn:schemas-microsoft-com:asm.v1" manifestVersion="1.0">\n'
                ' <assemblyIdentity version="%s" processorArchitecture="amd64" name="GrandPixelGameLauncher" type="win32"/>\n'
                ' <description>Grand Pixel Game Launcher</description>\n'
                ' <trustInfo xmlns="urn:schemas-microsoft-com:asm.v3">\n'
                '  <security><requestedPrivileges>'
                '<requestedExecutionLevel level="asInvoker" uiAccess="false"/></requestedPrivileges></security>\n'
                ' </trustInfo>\n'
                ' <application xmlns="urn:schemas-microsoft-com:asm.v3">\n'
                '  <windowsSettings>\n'
                '   <dpiAware xmlns="http://schemas.microsoft.com/SMI/2005/WindowsSettings">true</dpiAware>\n'
                '   <dpiAwareness xmlns="http://schemas.microsoft.com/SMI/2016/WindowsSettings">PerMonitorV2</dpiAwareness>\n'
                '  </windowsSettings>\n'
                ' </application>\n'
                ' <compatibility xmlns="urn:schemas-microsoft-com:compatibility.v1">\n'
                '  <application>\n'
                '   <supportedOS Id="{8e0f7a12-bfb3-4fe8-b9a5-48fd50a15a9a}"/>\n'
                '  </application>\n'
                ' </compatibility>\n'
                '</assembly>\n' % version)
    rc = os.path.join(GEN, 'app.rc')
    vn = ','.join(version.split('.') + ['0'])
    with open(rc, 'w') as f:
        f.write('#include <winres.h>\n')
        f.write('1 ICON "icon.ico"\n')
        f.write('1 24 "app.manifest"\n')
        f.write('\nVS_VERSION_INFO VERSIONINFO\n')
        f.write(' FILEVERSION %s\n' % vn)
        f.write(' PRODUCTVERSION %s\n' % vn)
        f.write(' FILEFLAGSMASK 0x3fL\n FILEFLAGS 0x0L\n FILEOS 0x40004L\n FILETYPE 0x1L\n FILESUBTYPE 0x0L\n')
        f.write('BEGIN\n    BLOCK "StringFileInfo"\n    BEGIN\n        BLOCK "040904b0"\n        BEGIN\n')
        f.write('            VALUE "CompanyName", "Grand Pixel Game"\n')
        f.write('            VALUE "FileDescription", "Grand Pixel Game Launcher"\n')
        f.write('            VALUE "FileVersion", "%s"\n' % version)
        f.write('            VALUE "InternalName", "GrandPixelGameLauncher"\n')
        f.write('            VALUE "LegalCopyright", "Copyright 2026 Grand Pixel Game"\n')
        f.write('            VALUE "OriginalFilename", "GrandPixelGameLauncher.exe"\n')
        f.write('            VALUE "ProductName", "Grand Pixel Game"\n')
        f.write('            VALUE "ProductVersion", "%s"\n' % version)
        f.write('        END\n    END\n    BLOCK "VarFileInfo"\n    BEGIN\n')
        f.write('        VALUE "Translation", 0x409, 1200\n    END\nEND\n')
    return rc

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--version', default=None)
    args = ap.parse_args()
    src = open(os.path.join(HERE, 'main_a.cpp'), encoding='utf-8').read()
    version = args.version
    if not version:
        m = re.search(r'GPG_LAUNCHER_VER\s+"([^"]+)"', src)
        if not m:
            sys.exit('Versão não encontrada')
        version = m.group(1)
    zig = find_zig()
    os.makedirs(GEN, exist_ok=True)
    os.makedirs(DIST, exist_ok=True)
    print('== Launcher Grand Pixel Game v%s ==' % version)
    subprocess.run([sys.executable, os.path.join(HERE, 'icon.py')], check=True)
    # os .cpp viram uma única unidade de compilação (compartilham estáticos)
    full = os.path.join(GEN, 'launcher_full.cpp')
    with open(full, 'w', encoding='utf-8') as f:
        f.write(open(os.path.join(HERE, 'main_a.cpp'), encoding='utf-8').read())
        f.write('\n')
        f.write(open(os.path.join(HERE, 'main_b.cpp'), encoding='utf-8').read())
    rc = gen_rc(version)
    res = os.path.join(GEN, 'app.res')
    print('zig rc ...')
    subprocess.run([zig, 'rc', '-fo' + res, rc], check=True)
    exe = os.path.join(DIST, 'GrandPixelGameLauncher-v%s-win64.exe' % version)
    print('zig c++ ...')
    cc = [zig, 'c++', '-target', 'x86_64-windows-gnu', '-O2', '-std=c++17', '-municode',
          '-DGPG_LAUNCHER_VER="%s"' % version,
          '-I' + GEN,
          full,
          res,
          '-Wl,/subsystem:windows',
          '-luser32', '-lgdi32', '-lwinhttp', '-lws2_32', '-lshell32',
          '-ladvapi32', '-luxtheme', '-lole32',
          '-o', exe]
    subprocess.run(cc, check=True)
    sha = hashlib.sha256(open(exe, 'rb').read()).hexdigest()
    print('exe:', exe, os.path.getsize(exe) // 1024, 'KB')
    print('sha256:', sha)
    print('== build ok ==')

if __name__ == '__main__':
    main()
