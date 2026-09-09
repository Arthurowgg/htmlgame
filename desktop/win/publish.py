#!/usr/bin/env python3
# Publica o executável de uma versão como ASSET do release no GitHub.
#
# O ambiente de build deste projeto nem sempre tem rota de rede para
# uploads.github.com (usado pelo `gh release upload`). Quando a rota estiver
# bloqueada, o release ainda funciona: o .exe fica versionado na árvore da
# tag (pasta dist/) e o launcher o baixa pelo link oficial da tag. Quando a
# rota estiver disponível, rode este script para anexar os binários como
# assets formais do release.
#
# Uso: python3 desktop/win/publish.py v1.1.0
import subprocess, sys, os, glob

def main():
    if len(sys.argv) < 2:
        sys.exit('uso: python3 desktop/win/publish.py v1.1.0')
    tag = sys.argv[1]
    root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    files = [os.path.join(root, 'dist', f'GrandPixelGame-{tag}-win64.exe'),
             os.path.join(root, 'dist', f'GrandPixelGame-{tag}-web.zip')]
    files = [f for f in files if os.path.isfile(f)]
    if not files:
        sys.exit('binários não encontrados em dist/ para ' + tag +
                 ' — rode antes: python3 desktop/win/build_win.py')
    print('publicando em', tag, ':', [os.path.basename(f) for f in files])
    r = subprocess.run(['gh', 'release', 'upload', tag, *files, '--clobber'])
    if r.returncode != 0:
        print('AVISO: upload falhou (uploads.github.com bloqueado?). Os binários '
              'continuam disponíveis na árvore da tag (dist/).')
        sys.exit(r.returncode)
    print('assets publicados com sucesso.')

if __name__ == '__main__':
    main()
