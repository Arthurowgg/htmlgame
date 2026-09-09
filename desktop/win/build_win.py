#!/usr/bin/env python3
# Build Windows do Grand Pixel Game (launcher + jogo embutido).
#
# Pré-requisitos:
#   - Zig (qualquer versão recente) — usado como cc + rc cross (target x86_64-windows-gnu).
#     Local padrão: wheel "ziglang" do PyPI (pip install --user --break-system-packages ziglang)
#   - gh (opcional, só com --release <tag>)
#
# Uso:
#   python3 desktop/win/build_win.py                 # gera dist/ (exe + zip web)
#   python3 desktop/win/build_win.py --release vX    # idem + sobe assets no release via gh
#   python3 desktop/win/build_win.py --version 1.2.3 # força a versão (senão lê de js/main.js)
import argparse, glob, os, re, shutil, subprocess, sys, zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, '..', '..'))
GEN = os.path.join(HERE, 'gen')
DIST = os.path.join(ROOT, 'dist')

WEB_FILES = ['index.html', 'css/style.css'] + sorted(glob.glob('js/*.js')) + ['assets/music/COLOQUE_AQUI.txt']

def read_version():
    src = open(os.path.join(ROOT, 'js', 'main.js'), encoding='utf-8').read()
    m = re.search(r"VERSION\s*=\s*'([^']+)'", src)
    if not m:
        sys.exit('Não achei VERSION em js/main.js')
    return m.group(1)

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
    sys.exit('Zig não encontrado (instale via pip install --user --break-system-packages ziglang ou exporte ZIG=/caminho/zig)')

def embed(version, target_c, target_h):
    """Gera gen/embedded.c|h com os arquivos do jogo embutidos."""
    entries = []
    for rel in WEB_FILES:
        full = os.path.join(ROOT, rel)
        if not os.path.isfile(full):
            print('  (pulando ausente)', rel)
            continue
        data = open(full, 'rb').read()
        name = re.sub(r'[^A-Za-z0-9_]', '_', rel)
        entries.append((rel, name, data))
    with open(target_h, 'w') as f:
        f.write('/* gerado por build_win.py — não edite */\n#ifndef GPG_EMBEDDED_H\n#define GPG_EMBEDDED_H\n')
        f.write('#include <stddef.h>\nstruct gpg_asset { const char *path; const unsigned char *data; size_t size; };\n')
        f.write('extern const struct gpg_asset gpg_assets[];\nextern const int gpg_assets_count;\n')
        f.write('extern const char *gpg_embedded_version;\n#endif\n')
    with open(target_c, 'w') as f:
        f.write('/* gerado por build_win.py — não edite */\n#include "embedded.h"\n')
        f.write('const char *gpg_embedded_version = "%s";\n' % version)
        f.write('const struct gpg_asset gpg_assets[] = {\n')
        for rel, name, data in entries:
            f.write('  { "/%s", (const unsigned char[]){\n    ' % rel)
            for i, b in enumerate(data):
                f.write('0x%02x,' % b)
                if i % 16 == 15:
                    f.write('\n    ')
            f.write('\n  }, %d },\n' % len(data))
        f.write('};\n')
        f.write('const int gpg_assets_count = %d;\n' % len(entries))
    print('embutidos:', len(entries), 'arquivos ->', os.path.basename(target_c))

def write_rc(version):
    rc = os.path.join(GEN, 'app.rc')
    man = os.path.join(GEN, 'app.manifest')
    with open(man, 'w') as f:
        f.write('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
                '<assembly xmlns="urn:schemas-microsoft-com:asm.v1" manifestVersion="1.0">\n'
                ' <assemblyIdentity version="%s" processorArchitecture="amd64" name="GrandPixelGame" type="win32"/>\n'
                ' <description>Grand Pixel Game</description>\n'
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
                '   <supportedOS Id="{8e0f7a12-bfb3-4fe8-b9a5-48fd50a15a9a}"/>\n'   # Win10
                '   <supportedOS Id="{1f676c76-80e1-4239-95bb-83d0f6d0da78}"/>\n'   # Win8.1
                '  </application>\n'
                ' </compatibility>\n'
                '</assembly>\n' % version)
    with open(rc, 'w') as f:
        f.write('1 ICON "icon.ico"\n')
        f.write('1 24 "app.manifest"\n')
    return rc

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--release', help='tag do release para subir os assets (via gh)')
    ap.add_argument('--version', help='versão (padrão: lida de js/main.js)')
    ap.add_argument('--keep-res', action='store_true')
    args = ap.parse_args()
    version = args.version or read_version()
    zig = find_zig()
    os.makedirs(GEN, exist_ok=True)
    os.makedirs(DIST, exist_ok=True)

    print('== Grand Pixel Game — build Windows v%s ==' % version)
    subprocess.run([sys.executable, os.path.join(HERE, 'icon.py')], check=True)
    embed(version, os.path.join(GEN, 'embedded.c'), os.path.join(GEN, 'embedded.h'))
    rc = write_rc(version)
    res = os.path.join(GEN, 'app.res')

    print('zig rc ...')
    subprocess.run([zig, 'rc', '-fo' + res, rc], check=True)
    exe = os.path.join(DIST, 'GrandPixelGame-v%s-win64.exe' % version)
    print('zig cc ...')
    cc = [zig, 'cc', '-target', 'x86_64-windows-gnu', '-O2', '-std=c99', '-municode',
          '-DGPG_VERSION="%s"' % version,
          '-I' + GEN,
          os.path.join(HERE, 'launcher.c'),
          os.path.join(GEN, 'embedded.c'),
          res,
          '-Wl,/subsystem:windows',
          '-luser32', '-lgdi32', '-lwinhttp', '-lws2_32', '-lshell32', '-ladvapi32', '-luxtheme',
          '-o', exe]
    subprocess.run(cc, check=True)
    print('exe:', exe, os.path.getsize(exe) // 1024, 'KB')

    zip_path = os.path.join(DIST, 'GrandPixelGame-v%s-web.zip' % version)
    with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as z:
        for rel in WEB_FILES:
            full = os.path.join(ROOT, rel)
            if os.path.isfile(full):
                z.write(full, rel)
    print('zip:', zip_path, os.path.getsize(zip_path) // 1024, 'KB')

    if args.release:
        print('subindo assets para o release', args.release)
        subprocess.run(['gh', 'release', 'upload', args.release, exe, zip_path,
                        '--clobber'], check=True)
    print('== build ok ==')

if __name__ == '__main__':
    main()
