// GRAND PIXEL GAME — lançador Windows (.exe autossuficiente)
// Extrai o runtime Node.js + bundle do jogo para %LOCALAPPDATA%\GrandPixelGame
// e sobe o servidor local, abrindo o navegador (mesma janela de console).
//
// Compilação (cross, Linux):
//   zig cc -target x86_64-windows-gnu -O2 -ffunction-sections -fdata-sections \
//      -Wl,--gc-sections -o GrandPixelGame.exe launcher.c blobs.o
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <stdio.h>
#include <string.h>
#include <stdlib.h>

// blobs gerados por blobs.S (.incbin)
extern const unsigned char node_exe_bin[];
extern const unsigned char node_exe_bin_end[];
extern const unsigned char bundle_cjs_bin[];
extern const unsigned char bundle_cjs_bin_end[];

static char g_appdir[MAX_PATH];
static char g_node_path[MAX_PATH];
static char g_bundle_path[MAX_PATH];

static void die(const char *msg) {
  fprintf(stderr, "\n[Grand Pixel Game] %s\n", msg);
  MessageBoxA(NULL, msg, "Grand Pixel Game — erro", MB_OK | MB_ICONERROR);
  ExitProcess(1);
}

static int write_if_different(const char *path, const unsigned char *data, size_t len) {
  // grava só se ausente ou com tamanho diferente (evita reescrita a cada execução)
  HANDLE f = CreateFileA(path, GENERIC_READ, FILE_SHARE_READ, NULL, OPEN_EXISTING, 0, NULL);
  if (f != INVALID_HANDLE_VALUE) {
    LARGE_INTEGER sz;
    if (GetFileSizeEx(f, &sz) && (unsigned long long)sz.QuadPart == len) {
      CloseHandle(f);
      return 0;
    }
    CloseHandle(f);
  }
  f = CreateFileA(path, GENERIC_WRITE, 0, NULL, CREATE_ALWAYS, FILE_ATTRIBUTE_NORMAL, NULL);
  if (f == INVALID_HANDLE_VALUE) return -1;
  DWORD written = 0;
  BOOL ok = WriteFile(f, data, (DWORD)len, &written, NULL);
  CloseHandle(f);
  return ok && written == len ? 0 : -1;
}

static void setup_dirs(void) {
  // %LOCALAPPDATA%\GrandPixelGame
  char base[MAX_PATH];
  if (!GetEnvironmentVariableA("LOCALAPPDATA", base, sizeof(base))) {
    if (!GetTempPathA(sizeof(base), base)) die("Não achei pasta para os arquivos temporários.");
    size_t n = strlen(base);
    if (n && base[n - 1] == '\\') base[n - 1] = 0;
  }
  _snprintf(g_appdir, sizeof(g_appdir), "%s\\GrandPixelGame", base);
  if (!CreateDirectoryA(g_appdir, NULL) && GetLastError() != ERROR_ALREADY_EXISTS)
    die("Não consegui criar a pasta de trabalho.");
  _snprintf(g_node_path, sizeof(g_node_path), "%s\\node.exe", g_appdir);
  _snprintf(g_bundle_path, sizeof(g_bundle_path), "%s\\gpg.cjs", g_appdir);
}

// mantém a janela com título amigável
static void set_title(void) {
  SetConsoleTitleA("Grand Pixel Game");
}

int main(int argc, char **argv) {
  const size_t node_len = (size_t)(node_exe_bin_end - node_exe_bin);
  const size_t bundle_len = (size_t)(bundle_cjs_bin_end - bundle_cjs_bin);
  set_title();
  printf("GRAND PIXEL GAME\nPreparando o jogo...\n");
  setup_dirs();

  if (write_if_different(g_node_path, node_exe_bin, node_len) != 0)
    die("Não consegui gravar o runtime na pasta de trabalho.");
  if (write_if_different(g_bundle_path, bundle_cjs_bin, bundle_len) != 0)
    die("Não consegui gravar o jogo na pasta de trabalho.");

  // pasta da música local: ao lado deste .exe (assets/music)
  {
    char mydir[MAX_PATH], env[2 * MAX_PATH];
    GetModuleFileNameA(NULL, mydir, sizeof(mydir));
    char *slash = strrchr(mydir, '\\');
    if (slash) *slash = 0;
    _snprintf(env, sizeof(env), "GPG_DATA_DIR=%s", mydir);
    _putenv(env);
  }

  // linha de comando: node.exe gpg.cjs [argumentos do usuário]
  {
    char cmd[2 * MAX_PATH + 256];
    char extra[512] = "";
    for (int i = 1; i < argc; i++) {
      // argumentos crus; suficiente para --port/--noopen
      char piece[256];
      _snprintf(piece, sizeof(piece), " %s", argv[i]);
      if (strlen(extra) + strlen(piece) < sizeof(extra) - 1) strcat(extra, piece);
    }
    _snprintf(cmd, sizeof(cmd), "\"%s\" \"%s\"%s", g_node_path, g_bundle_path, extra);

    STARTUPINFOA si;
    PROCESS_INFORMATION pi;
    memset(&si, 0, sizeof(si));
    si.cb = sizeof(si);
    memset(&pi, 0, sizeof(pi));
    if (!CreateProcessA(NULL, cmd, NULL, NULL, TRUE, 0, NULL, g_appdir, &si, &pi)) {
      die("Não consegui iniciar o jogo (runtime corrompido?). Apague a pasta\n%LOCALAPPDATA%\\GrandPixelGame e tente de novo.");
    }
    CloseHandle(pi.hThread);
    WaitForSingleObject(pi.hProcess, INFINITE);
    DWORD code = 0;
    GetExitCodeProcess(pi.hProcess, &code);
    CloseHandle(pi.hProcess);
    return (int)code;
  }
}
