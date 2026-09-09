/* ============================================================
 * GRAND PIXEL GAME — Launcher Windows
 * Um único .exe: launcher bonito (instalar/jogar/atualizar por
 * versões do GitHub) + jogo embutido (servidor local + navegador).
 *
 * Modos:
 *   <sem argumentos>  launcher
 *   --play            janela do jogador: serve os arquivos embutidos
 *                     em http://127.0.0.1:8137 e abre o navegador
 *
 * Compilado por desktop/win/build_win.py (zig cc -target x86_64-windows-gnu).
 * ============================================================ */
#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif
#include <windows.h>
#include <windowsx.h>
#include <winhttp.h>
#include <winsock2.h>
#include <ws2tcpip.h>
#include <shellapi.h>
#include <shlobj.h>
#include <shlwapi.h>
#include <commctrl.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>
#include <stdarg.h>
#include <wchar.h>
#include <math.h>
#include "embedded.h"

#ifndef GPG_VERSION
#define GPG_VERSION "0.0.0"
#endif

#define APP_NAME      L"Grand Pixel Game"
#define APP_BASE      L"GrandPixelGame"
#define PORT_GAME     8137
#define MAXVERSIONS   96

/* ------------------------------------------------------------ utilitários */
static void die_box(const char *msg) {
  MessageBoxA(NULL, msg, "Grand Pixel Game", MB_OK | MB_ICONERROR);
  ExitProcess(1);
}
static void die_boxf(const char *fmt, ...) {
  char buf[512];
  va_list ap;
  va_start(ap, fmt);
  vsnprintf(buf, sizeof(buf), fmt, ap);
  va_end(ap);
  die_box(buf);
}
static void log_msg(const char *s) { (void)s; }
static int ends_with(const char *s, const char *suf) {
  size_t a = strlen(s), b = strlen(suf);
  return a >= b && strcmp(s + a - b, suf) == 0;
}
static int starts_with(const char *s, const char *pre) {
  return strncmp(s, pre, strlen(pre)) == 0;
}
static void wpath_join(wchar_t *out, size_t cap, const wchar_t *dir, const wchar_t *name) {
  _snwprintf(out, cap, L"%s\\%s", dir, name);
}
static void path_join(char *out, size_t cap, const char *dir, const char *name) {
  _snprintf(out, cap, "%s\\%s", dir, name);
}
static wchar_t g_appdirW[MAX_PATH * 2];   /* %LOCALAPPDATA%\GrandPixelGame */
static char   g_appdirA[MAX_PATH * 2];

static void ensure_appdir(void) {
  if (g_appdirW[0]) return;
  wchar_t base[MAX_PATH * 2];
  if (!SUCCEEDED(SHGetFolderPathW(NULL, CSIDL_LOCAL_APPDATA, NULL, 0, base)) || !base[0]) {
    if (!GetTempPathW(MAX_PATH * 2, base)) die_box("Sem LOCALAPPDATA nem TEMP.");
  }
  wpath_join(g_appdirW, MAX_PATH * 2, base, APP_BASE);
  CreateDirectoryW(g_appdirW, NULL);
  WideCharToMultiByte(CP_UTF8, 0, g_appdirW, -1, g_appdirA, (int)sizeof(g_appdirA), NULL, NULL);
}
static void ensure_verdir(void) {
  wchar_t d[MAX_PATH * 2];
  ensure_appdir();
  wpath_join(d, MAX_PATH * 2, g_appdirW, L"versions");
  CreateDirectoryW(d, NULL);
}
static void version_san(char *out, size_t cap, const char *tag) {
  /* v1.2.3 -> 1_2_3 */
  size_t n = 0;
  for (const char *p = tag; *p && n < cap - 1; p++) {
    if (*p == 'v') continue;
    out[n++] = (*p == '.') ? '_' : *p;
  }
  out[n] = 0;
}

/* ------------------------------------------------------------ versões */
typedef struct {
  char tag[24];          /* v1.2.3 */
  char date[24];
  char url[700];
  char name[160];
  long long size;        /* do asset exe (0 = desconhecido) */
  int installed;         /* exe baixado presente em versions\ */
  int current;           /* igual à versão embutida deste exe */
} Ver;

static Ver g_vers[MAXVERSIONS];
static int g_verCount = 0;
static char g_selTag[24];
static int  g_fetchFailed = 0;
static int  g_fetching = 0;
static int  g_downloading = 0;
static int  g_dlIndex = -1;
static long long g_dlGot = 0, g_dlTotal = 0;
static char g_status[300];
static int  g_statusErr = 0;

static int parse_ver(const char *tag, int out[3]) {
  out[0] = out[1] = out[2] = 0;
  if (sscanf(tag, "v%d.%d.%d", &out[0], &out[1], &out[2]) != 3) return 0;
  /* garante que não sobrou nada estranho */
  const char *p = tag;
  while (*p && (*p == 'v' || *p == '.' || (*p >= '0' && *p <= '9'))) p++;
  return *p == 0;
}
static int cmp_ver(const char *a, const char *b) {
  int va[3], vb[3];
  if (!parse_ver(a, va) || !parse_ver(b, vb)) return strcmp(a, b);
  for (int i = 0; i < 3; i++)
    if (va[i] != vb[i]) return va[i] - vb[i];
  return 0;
}
static int is_newer(const char *a, const char *b) { return cmp_ver(a, b) > 0; }

static void find_installed(void) {
  ensure_verdir();
  wchar_t pat[MAX_PATH * 2];
  _snwprintf(pat, MAX_PATH * 2, L"%s\\versions\\GrandPixelGame-v*.exe", g_appdirW);
  WIN32_FIND_DATAW fd;
  HANDLE h = FindFirstFileW(pat, &fd);
  if (h == INVALID_HANDLE_VALUE) return;
  do {
    char nm[MAX_PATH];
    WideCharToMultiByte(CP_UTF8, 0, fd.cFileName, -1, nm, sizeof(nm), NULL, NULL);
    /* GrandPixelGame-v1.2.3-win64.exe -> extrai v1.2.3 */
    char *p = strstr(nm, "-v");
    if (!p) continue;
    p += 2;
    char tag[24]; int i = 0;
    while (p[i] && (p[i] == '.' || (p[i] >= '0' && p[i] <= '9')) && i < 20) { tag[i] = p[i]; i++; }
    tag[i] = 0;
    if (i < 3) continue;
    char full[16]; _snprintf(full, sizeof(full), "v%s", tag);
    for (int k = 0; k < g_verCount; k++)
      if (strcmp(g_vers[k].tag, full) == 0) g_vers[k].installed = 1;
  } while (FindNextFileW(h, &fd));
  FindClose(h);
}

/* ------------------------------------------------------- JSON mínimo */
typedef struct { const char *s; long len; long pos; } JP;
static void jp_ws(JP *j) { while (j->pos < j->len) { char c = j->s[j->pos]; if (c != ' ' && c != '\n' && c != '\r' && c != '\t') break; j->pos++; } }
static int jp_ch(JP *j, char c) { jp_ws(j); if (j->pos < j->len && j->s[j->pos] == c) { j->pos++; return 1; } return 0; }
static int jp_str(JP *j, char *out, int cap) {
  jp_ws(j);
  if (j->pos >= j->len || j->s[j->pos] != '"') return 0;
  j->pos++;
  int n = 0;
  while (j->pos < j->len && n < cap - 1) {
    char c = j->s[j->pos++];
    if (c == '"') { out[n] = 0; return 1; }
    if (c == '\\') { if (j->pos < j->len) { c = j->s[j->pos++]; if (c == 'n') c = '\n'; else if (c == 't') c = '\t'; else if (c == 'r') c = '\r'; else if (c == 'u') { /* pula 4 hex (basta aproximação) */ j->pos += 4; continue; } } }
    out[n++] = c;
  }
  out[n] = 0;
  return 0;
}
static long long jp_num(JP *j) {
  jp_ws(j);
  long long v = 0; int neg = 0;
  if (j->pos < j->len && j->s[j->pos] == '-') { neg = 1; j->pos++; }
  while (j->pos < j->len && j->s[j->pos] >= '0' && j->s[j->pos] <= '9') { v = v * 10 + (j->s[j->pos] - '0'); j->pos++; }
  return neg ? -v : v;
}
static int jp_bool(JP *j) {
  jp_ws(j);
  if (strncmp(j->s + j->pos, "true", 4) == 0) { j->pos += 4; return 1; }
  if (strncmp(j->s + j->pos, "false", 5) == 0) { j->pos += 5; return 0; }
  return 0;
}
static void jp_skip(JP *j) {
  jp_ws(j);
  if (j->pos >= j->len) return;
  char c = j->s[j->pos];
  if (c == '"') { char tmp[64]; jp_str(j, tmp, sizeof(tmp)); return; }
  if (c == '{') {
    j->pos++;
    for (;;) { jp_ws(j); if (jp_ch(j, '}')) return; if (jp_ch(j, ',')) continue; jp_skip(j); }
  }
  if (c == '[') {
    j->pos++;
    for (;;) { jp_ws(j); if (jp_ch(j, ']')) return; if (jp_ch(j, ',')) continue; jp_skip(j); }
  }
  jp_num(j);
}
/* lê "key":value ; devolve 1 e deixa pos após o valor (value pode ser array/objeto) */
static int jp_key(JP *j, char *key, int cap) {
  for (;;) {
    jp_ws(j);
    if (j->pos >= j->len) return 0;
    if (j->s[j->pos] == '}' || j->s[j->pos] == ']' || j->s[j->pos] == ',') return 0;
    if (!jp_str(j, key, cap)) { jp_skip(j); return 0; }
    if (!jp_ch(j, ':')) { jp_skip(j); return 0; }
    return 1;
  }
}

/* ------------------------------------------------------------ HTTP (WinHTTP) */
static wchar_t *utf8_to_wide(const char *u) {
  int n = MultiByteToWideChar(CP_UTF8, 0, u, -1, NULL, 0);
  wchar_t *w = malloc((n + 1) * sizeof(wchar_t));
  MultiByteToWideChar(CP_UTF8, 0, u, -1, w, n);
  return w;
}

typedef struct { char *buf; size_t len, cap; int ok; unsigned status; } Resp;
static void resp_init(Resp *r) { r->buf = NULL; r->len = 0; r->cap = 0; r->ok = 0; r->status = 0; }
static void resp_free(Resp *r) { free(r->buf); r->buf = NULL; }

static int http_get(const wchar_t *host, const wchar_t *path, int https, Resp *out,
                    void (*prog)(void *ctx, long long got, long long total), void *ctx) {
  HINTERNET hs = NULL, hc = NULL, hr = NULL;
  resp_init(out);
  hs = WinHttpOpen(L"GrandPixelGame-Launcher/1.0", WINHTTP_ACCESS_TYPE_DEFAULT_PROXY,
                   WINHTTP_NO_PROXY_NAME, WINHTTP_NO_PROXY_BYPASS, 0);
  if (!hs) goto fail;
  hc = WinHttpConnect(hs, host, https ? INTERNET_DEFAULT_HTTPS_PORT : INTERNET_DEFAULT_HTTP_PORT, 0);
  if (!hc) goto fail;
  hr = WinHttpOpenRequest(hc, L"GET", path, NULL, WINHTTP_NO_REFERER,
                          WINHTTP_DEFAULT_ACCEPT_TYPES, https ? WINHTTP_FLAG_SECURE : 0);
  if (!hr) goto fail;
  DWORD redir = WINHTTP_OPTION_REDIRECT_POLICY_ALWAYS;
  WinHttpSetOption(hr, WINHTTP_OPTION_REDIRECT_POLICY, &redir, sizeof(redir));
  const wchar_t *hdr = L"Accept: application/vnd.github+json\r\nUser-Agent: GrandPixelGame-Launcher\r\n";
  if (!WinHttpSendRequest(hr, hdr, (DWORD)-1L, WINHTTP_NO_REQUEST_DATA, 0, 0, 0)) goto fail;
  if (!WinHttpReceiveResponse(hr, NULL)) goto fail;
  DWORD st = 0, sz = sizeof(st);
  WinHttpQueryHeaders(hr, WINHTTP_QUERY_STATUS_CODE | WINHTTP_QUERY_FLAG_NUMBER,
                      WINHTTP_HEADER_NAME_BY_INDEX, &st, &sz, WINHTTP_NO_HEADER_INDEX);
  out->status = st;
  long long total = -1;
  {
    wchar_t lenbuf[32];
    DWORD ls = sizeof(lenbuf);
    if (WinHttpQueryHeaders(hr, WINHTTP_QUERY_CONTENT_LENGTH, WINHTTP_HEADER_NAME_BY_INDEX,
                            lenbuf, &ls, WINHTTP_NO_HEADER_INDEX))
      total = _wtoi64(lenbuf);
  }
  for (;;) {
    char tmp[65536];
    DWORD got = 0;
    if (!WinHttpReadData(hr, tmp, sizeof(tmp), &got)) {
      if (GetLastError() == ERROR_WINHTTP_CONNECTION_ERROR) break;
      goto fail;
    }
    if (got == 0) break;
    if (out->len + got + 1 > out->cap) {
      size_t nc = out->cap ? out->cap * 2 : 262144;
      while (nc < out->len + got + 1) nc *= 2;
      char *nb = realloc(out->buf, nc);
      if (!nb) goto fail;
      out->buf = nb; out->cap = nc;
    }
    memcpy(out->buf + out->len, tmp, got);
    out->len += got;
    out->buf[out->len] = 0;
    if (prog) prog(ctx, (long long)out->len, total);
    if (out->len > (64L << 20)) goto fail;
  }
  if (out->buf && st == 200) out->ok = 1;
  WinHttpCloseHandle(hr); WinHttpCloseHandle(hc); WinHttpCloseHandle(hs);
  return out->ok;
fail:
  if (hr) WinHttpCloseHandle(hr);
  if (hc) WinHttpCloseHandle(hc);
  if (hs) WinHttpCloseHandle(hs);
  return 0;
}

static int http_save(const wchar_t *url, const wchar_t *dest,
                     void (*prog)(void *ctx, long long got, long long total), void *ctx,
                     wchar_t *err, size_t errcap) {
  /* url: https://... com possível redirect → resolve host/path */
  wchar_t host[256] = L""; wchar_t path[1024] = L"/";
  const wchar_t *p = url;
  int https = 1;
  if (wcsncmp(p, L"https://", 8) == 0) p += 8;
  else if (wcsncmp(p, L"http://", 7) == 0) { https = 0; p += 7; }
  else { _snwprintf(err, errcap, L"URL inválida"); return 0; }
  const wchar_t *slash = wcschr(p, L'/');
  if (!slash) { wcsncpy(host, p, 255); }
  else {
    size_t hn = (size_t)(slash - p);
    if (hn > 255) hn = 255;
    wcsncpy(host, p, hn); host[hn] = 0;
    _snwprintf(path, 1024, L"%s", slash);
  }
  HINTERNET hs = NULL, hc = NULL, hr = NULL;
  hs = WinHttpOpen(L"GrandPixelGame-Launcher/1.0", WINHTTP_ACCESS_TYPE_DEFAULT_PROXY,
                   WINHTTP_NO_PROXY_NAME, WINHTTP_NO_PROXY_BYPASS, 0);
  if (!hs) goto fail;
  hc = WinHttpConnect(hs, host, https ? INTERNET_DEFAULT_HTTPS_PORT : INTERNET_DEFAULT_HTTP_PORT, 0);
  if (!hc) goto fail;
  hr = WinHttpOpenRequest(hc, L"GET", path, NULL, WINHTTP_NO_REFERER, WINHTTP_DEFAULT_ACCEPT_TYPES,
                          https ? WINHTTP_FLAG_SECURE : 0);
  if (!hr) goto fail;
  {
    DWORD redir = WINHTTP_OPTION_REDIRECT_POLICY_ALWAYS;
    WinHttpSetOption(hr, WINHTTP_OPTION_REDIRECT_POLICY, &redir, sizeof(redir));
    DWORD dl = 60000; /* timeout (ms) */
    WinHttpSetTimeouts(hs, dl, dl, dl, dl);
  }
  const wchar_t *hdr = L"User-Agent: GrandPixelGame-Launcher\r\n";
  if (!WinHttpSendRequest(hr, hdr, (DWORD)-1L, WINHTTP_NO_REQUEST_DATA, 0, 0, 0)) goto fail;
  if (!WinHttpReceiveResponse(hr, NULL)) goto fail;
  {
    DWORD st = 0, sz = sizeof(st);
    WinHttpQueryHeaders(hr, WINHTTP_QUERY_STATUS_CODE | WINHTTP_QUERY_FLAG_NUMBER,
                        WINHTTP_HEADER_NAME_BY_INDEX, &st, &sz, WINHTTP_NO_HEADER_INDEX);
    if (st != 200) { _snwprintf(err, errcap, L"HTTP %lu ao baixar", st); goto fail; }
  }
  long long total = -1;
  {
    wchar_t lb[40]; DWORD ls = sizeof(lb);
    if (WinHttpQueryHeaders(hr, WINHTTP_QUERY_CONTENT_LENGTH, WINHTTP_HEADER_NAME_BY_INDEX,
                            lb, &ls, WINHTTP_NO_HEADER_INDEX)) total = _wtoi64(lb);
  }
  HANDLE f = CreateFileW(dest, GENERIC_WRITE, 0, NULL, CREATE_ALWAYS, FILE_ATTRIBUTE_NORMAL, NULL);
  if (f == INVALID_HANDLE_VALUE) { _snwprintf(err, errcap, L"não consegui gravar em disco"); goto fail; }
  long long got = 0;
  for (;;) {
    char tmp[65536];
    DWORD rd = 0;
    if (!WinHttpReadData(hr, tmp, sizeof(tmp), &rd)) {
      if (GetLastError() == ERROR_WINHTTP_CONNECTION_ERROR) break;
      CloseHandle(f); DeleteFileW(dest);
      _snwprintf(err, errcap, L"falha na conexão durante o download");
      goto fail;
    }
    if (rd == 0) break;
    DWORD wr = 0;
    if (!WriteFile(f, tmp, rd, &wr, NULL) || wr != rd) {
      CloseHandle(f); DeleteFileW(dest);
      _snwprintf(err, errcap, L"falha ao gravar arquivo");
      goto fail;
    }
    got += rd;
    if (prog) prog(ctx, got, total);
  }
  CloseHandle(f);
  if (prog) prog(ctx, got, total);
  WinHttpCloseHandle(hr); WinHttpCloseHandle(hc); WinHttpCloseHandle(hs);
  return 1;
fail:
  if (hr) WinHttpCloseHandle(hr);
  if (hc) WinHttpCloseHandle(hc);
  if (hs) WinHttpCloseHandle(hs);
  return 0;
}
/* ---------------------------------------------------- releases do GitHub */
static int asset_prefer(const char *name) {
  if (!ends_with(name, ".exe")) return 0;
  if (strstr(name, "GrandPixelGame-v") == NULL) return 0;
  return 1;
}
static void parse_releases(const char *json, size_t len) {
  JP j = { json, (long)len, 0 };
  int count = 0;
  g_verCount = 0;
  if (!jp_ch(&j, '[')) return;
  for (;;) {
    jp_ws(&j);
    if (jp_ch(&j, ']')) break;
    if (!jp_ch(&j, '{')) break;
    Ver v;
    memset(&v, 0, sizeof(v));
    int draft = 0, prerelease = 0;
    for (;;) {
      char key[48];
      if (!jp_key(&j, key, sizeof(key))) break;
      if (strcmp(key, "tag_name") == 0) jp_str(&j, v.tag, sizeof(v.tag));
      else if (strcmp(key, "published_at") == 0) jp_str(&j, v.date, sizeof(v.date));
      else if (strcmp(key, "draft") == 0) draft = jp_bool(&j);
      else if (strcmp(key, "prerelease") == 0) prerelease = jp_bool(&j);
      else if (strcmp(key, "assets") == 0) {
        if (jp_ch(&j, '[')) {
          for (;;) {
            jp_ws(&j);
            if (jp_ch(&j, ']')) break;
            if (!jp_ch(&j, '{')) break;
            char an[160] = "", au[700] = "";
            long long asz = 0;
            for (;;) {
              char k2[48];
              if (!jp_key(&j, k2, sizeof(k2))) break;
              if (strcmp(k2, "name") == 0) jp_str(&j, an, sizeof(an));
              else if (strcmp(k2, "browser_download_url") == 0) jp_str(&j, au, sizeof(au));
              else if (strcmp(k2, "size") == 0) asz = jp_num(&j);
              else jp_skip(&j);
            }
            jp_ch(&j, '}');
            /* queremos o asset .exe do jogo */
            if (!v.url[0] && asset_prefer(an) && au[0]) {
              strncpy(v.name, an, sizeof(v.name) - 1);
              strncpy(v.url, au, sizeof(v.url) - 1);
              v.size = asz;
            }
          }
        }
      }
      else jp_skip(&j);
    }
    jp_ch(&j, '}');
    int pv[3];
    if (!draft && v.tag[0] && parse_ver(v.tag, pv)) {
      if (strlen(v.date) > 10) v.date[10] = 0;
      if (!v.url[0]) {
        /* sem asset .exe no release: baixa o binário versionado na árvore da tag */
        _snprintf(v.url, sizeof(v.url),
                  "https://github.com/Arthurowgg/htmlgame/raw/refs/tags/%s/dist/GrandPixelGame-%s-win64.exe",
                  v.tag, v.tag);
      }
      g_vers[count] = v;
      count++;
      if (count >= MAXVERSIONS) break;
    }
    (void)prerelease;
  }
  g_verCount = count;
}

/* marca versão embutida + instaladas */
static void mark_states(void) {
  for (int i = 0; i < g_verCount; i++) {
    char full[24];
    _snprintf(full, sizeof(full), "v%s", GPG_VERSION);
    if (strcmp(g_vers[i].tag, full) == 0) g_vers[i].current = 1;
    g_vers[i].installed = 0;
  }
  find_installed();
}
static int find_ver(const char *tag) {
  for (int i = 0; i < g_verCount; i++)
    if (strcmp(g_vers[i].tag, tag) == 0) return i;
  return -1;
}

/* threads */
static HANDLE g_netThread = NULL;
static int g_netStop = 0;
static HWND g_hwnd = NULL;
static volatile int g_bgPhase = 0; /* 0 idle, 1 fetching, 2 downloading */

#define WM_APP_NETOK   (WM_APP + 1)
#define WM_APP_NETFAIL (WM_APP + 2)
#define WM_APP_DLPROG  (WM_APP + 3)
#define WM_APP_DLDONE  (WM_APP + 4)
#define WM_APP_STATUS  (WM_APP + 5)

typedef struct { wchar_t url[900]; wchar_t dest[MAX_PATH * 2]; char tag[24]; } DlJob;
static DlJob g_dlJob;

static void dl_prog_cb(void *ctx, long long got, long long total) {
  (void)ctx;
  if (g_netStop) return;
  g_dlGot = got; g_dlTotal = total;
  if (g_hwnd) PostMessageW(g_hwnd, WM_APP_DLPROG, 0, 0);
}
static void net_fetch(void *unused) {
  (void)unused;
  Resp r;
  static const wchar_t *host = L"api.github.com";
  static const wchar_t *path = L"/repos/Arthurowgg/htmlgame/releases?per_page=100";
  if (http_get(host, path, 1, &r, NULL, NULL) && r.buf) {
    parse_releases(r.buf, r.len);
    resp_free(&r);
    if (g_hwnd) PostMessageW(g_hwnd, WM_APP_NETOK, 0, 0);
  } else {
    resp_free(&r);
    if (g_hwnd) PostMessageW(g_hwnd, WM_APP_NETFAIL, 0, 0);
  }
  g_bgPhase = 0;
  g_netThread = NULL;
}
static void net_download(void *unused) {
  (void)unused;
  wchar_t errW[300];
  int ok = http_save(g_dlJob.url, g_dlJob.dest, dl_prog_cb, NULL, errW, sizeof(errW));
  if (ok && g_dlJob.dest[0] && g_hwnd)
    PostMessageW(g_hwnd, WM_APP_DLDONE, 1, 0);
  else if (g_hwnd) {
    if (!ok) _snprintf(g_status, sizeof(g_status), "erro ao baixar %s: %ls", g_dlJob.tag, errW);
    else _snprintf(g_status, sizeof(g_status), "erro ao baixar %s", g_dlJob.tag);
    g_statusErr = 1;
    PostMessageW(g_hwnd, WM_APP_DLDONE, 0, 0);
  }
  g_bgPhase = 0;
  g_downloading = 0;
}
static void start_fetch(HWND hwnd) {
  if (g_bgPhase != 0) return;
  g_hwnd = hwnd;
  g_fetching = 1;
  g_bgPhase = 1;
  g_fetchFailed = 0;
  _snprintf(g_status, sizeof(g_status), "verificando atualizações no GitHub…");
  g_statusErr = 0;
  HANDLE h = CreateThread(NULL, 0, (LPTHREAD_START_ROUTINE)net_fetch, NULL, 0, NULL);
  if (h) { CloseHandle(h); g_netThread = h; }
  else { g_fetching = 0; g_bgPhase = 0; }
}
static void start_download(HWND hwnd, int idx) {
  if (g_bgPhase != 0) return;
  if (idx < 0 || idx >= g_verCount || !g_vers[idx].url[0]) return;
  g_hwnd = hwnd;
  ensure_verdir();
  char san[40];
  version_san(san, sizeof(san), g_vers[idx].tag);
  _snwprintf(g_dlJob.dest, MAX_PATH * 2, L"%s\\versions\\GrandPixelGame-v%s-win64.exe",
             g_appdirW, san);
  MultiByteToWideChar(CP_UTF8, 0, g_vers[idx].url, -1, g_dlJob.url, 900);
  strncpy(g_dlJob.tag, g_vers[idx].tag, 23);
  g_downloading = 1;
  g_bgPhase = 2;
  g_dlGot = 0; g_dlTotal = 0;
  g_dlIndex = idx;
  { /* zera throttle de progresso */
    HWND zz = NULL; (void)zz;
  }
  _snprintf(g_status, sizeof(g_status), "baixando %s…", g_vers[idx].tag);
  g_statusErr = 0;
  HANDLE h = CreateThread(NULL, 0, (LPTHREAD_START_ROUTINE)net_download, NULL, 0, NULL);
  if (h) { CloseHandle(h); g_netThread = h; }
  else { g_downloading = 0; g_bgPhase = 0; }
}

/* ------------------------------------------------------ servidor do jogo */
static SOCKET g_lsn = INVALID_SOCKET;
static volatile int g_serveStop = 0;
static HANDLE g_serveThread = NULL;

static const char *mime_of(const char *path) {
  if (ends_with(path, ".html")) return "text/html; charset=utf-8";
  if (ends_with(path, ".js"))   return "text/javascript; charset=utf-8";
  if (ends_with(path, ".css"))  return "text/css; charset=utf-8";
  if (ends_with(path, ".json")) return "application/json";
  if (ends_with(path, ".png"))  return "image/png";
  if (ends_with(path, ".jpg") || ends_with(path, ".jpeg")) return "image/jpeg";
  if (ends_with(path, ".gif"))  return "image/gif";
  if (ends_with(path, ".svg"))  return "image/svg+xml";
  if (ends_with(path, ".ico"))  return "image/x-icon";
  if (ends_with(path, ".webp")) return "image/webp";
  if (ends_with(path, ".txt"))  return "text/plain; charset=utf-8";
  if (ends_with(path, ".mp3"))  return "audio/mpeg";
  if (ends_with(path, ".ogg"))  return "audio/ogg";
  if (ends_with(path, ".wav"))  return "audio/wav";
  if (ends_with(path, ".woff2")) return "font/woff2";
  return "application/octet-stream";
}
static const struct gpg_asset *find_asset(const char *path) {
  for (int i = 0; i < gpg_assets_count; i++)
    if (strcmp(gpg_assets[i].path, path) == 0) return &gpg_assets[i];
  return NULL;
}
static void send_all(SOCKET s, const char *data, size_t len) {
  size_t off = 0;
  while (off < len) {
    int n = send(s, data + off, (int)(len - off > 65536 ? 65536 : len - off), 0);
    if (n <= 0) return;
    off += (size_t)n;
  }
}
static void serve_client(SOCKET c) {
  char req[8192];
  size_t n = 0;
  int found_end = 0;
  while (n < sizeof(req) - 1) {
    int r = recv(c, req + n, (int)(sizeof(req) - 1 - n), 0);
    if (r <= 0) break;
    n += (size_t)r;
    req[n] = 0;
    if (strstr(req, "\r\n\r\n")) { found_end = 1; break; }
  }
  if (!found_end) { closesocket(c); return; }
  char method[16] = "", path[1024] = "", ver[16] = "";
  sscanf(req, "%15s %1023s %15s", method, path, ver);
  if (strcmp(method, "GET") != 0 && strcmp(method, "HEAD") != 0) {
    const char *r = "HTTP/1.1 405 Method Not Allowed\r\nContent-Length: 0\r\nAllow: GET, HEAD\r\n\r\n";
    send_all(c, r, strlen(r));
    closesocket(c);
    return;
  }
  if (strcmp(path, "/__gpg__") == 0) {
    char b[128];
    _snprintf(b, sizeof(b), "HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\n"
              "Cache-Control: no-store\r\nConnection: close\r\n\r\nGrandPixelGame %s",
              GPG_VERSION);
    send_all(c, b, strlen(b));
    closesocket(c);
    return;
  }
  /* caminho: remove query, decode %20 simples */
  char clean[1024];
  strncpy(clean, path, sizeof(clean) - 1);
  clean[sizeof(clean) - 1] = 0;
  char *q = strchr(clean, '?');
  if (q) *q = 0;
  if (strcmp(clean, "/") == 0) strcpy(clean, "/index.html");
  const struct gpg_asset *a = find_asset(clean);
  if (!a) {
    const char *r = "HTTP/1.1 404 Not Found\r\nContent-Type: text/plain\r\n"
                    "Connection: close\r\n\r\n404";
    send_all(c, r, strlen(r));
    closesocket(c);
    return;
  }
  char head[512];
  _snprintf(head, sizeof(head),
            "HTTP/1.1 200 OK\r\nContent-Type: %s\r\nContent-Length: %u\r\n"
            "Cache-Control: no-cache\r\nConnection: close\r\nAccess-Control-Allow-Origin: *\r\n\r\n",
            mime_of(clean), (unsigned)a->size);
  send_all(c, head, strlen(head));
  if (strcmp(method, "HEAD") != 0) send_all(c, (const char *)a->data, a->size);
  closesocket(c);
}
static DWORD WINAPI server_loop(LPVOID arg) {
  (void)arg;
  while (!g_serveStop) {
    SOCKET c = accept(g_lsn, NULL, NULL);
    if (c == INVALID_SOCKET) break;
    serve_client(c);
  }
  return 0;
}
static int start_server(void) {
  WSADATA wsa;
  if (WSAStartup(MAKEWORD(2, 2), &wsa) != 0) return 0;
  g_lsn = socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
  if (g_lsn == INVALID_SOCKET) return 0;
  u_long one = 1;
  ioctlsocket(g_lsn, FIONBIO, &one);
  struct sockaddr_in sa;
  memset(&sa, 0, sizeof(sa));
  sa.sin_family = AF_INET;
  sa.sin_port = htons(PORT_GAME);
  sa.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
  if (bind(g_lsn, (struct sockaddr *)&sa, sizeof(sa)) != 0) {
    closesocket(g_lsn);
    g_lsn = INVALID_SOCKET;
    return 0;
  }
  u_long zero = 0;
  ioctlsocket(g_lsn, FIONBIO, &zero);
  if (listen(g_lsn, 12) != 0) {
    closesocket(g_lsn);
    g_lsn = INVALID_SOCKET;
    return 0;
  }
  g_serveStop = 0;
  HANDLE h = CreateThread(NULL, 0, server_loop, NULL, 0, NULL);
  if (h) { CloseHandle(h); g_serveThread = h; }
  return 1;
}
static void stop_server(void) {
  g_serveStop = 1;
  if (g_lsn != INVALID_SOCKET) { closesocket(g_lsn); g_lsn = INVALID_SOCKET; }
  if (g_serveThread) { WaitForSingleObject(g_serveThread, 2000); g_serveThread = NULL; }
  WSACleanup();
}
/* checa versão do servidor que já estiver na porta (mesma/outra versão) */
static int probe_server(char *ver, size_t cap) {
  SOCKET s = socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
  if (s == INVALID_SOCKET) return 0;
  u_long blk = 1;
  ioctlsocket(s, FIONBIO, &blk);
  struct sockaddr_in sa;
  memset(&sa, 0, sizeof(sa));
  sa.sin_family = AF_INET;
  sa.sin_port = htons(PORT_GAME);
  sa.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
  int ok = 0;
  if (connect(s, (struct sockaddr *)&sa, sizeof(sa)) == 0 ||
      WSAGetLastError() == WSAEWOULDBLOCK || WSAGetLastError() == WSAEINPROGRESS) {
    fd_set wf;
    FD_ZERO(&wf); FD_SET(s, &wf);
    struct timeval tv = { 1, 0 };
    if (select(0, NULL, &wf, NULL, &tv) > 0) {
      int soerr = 0; int sl = sizeof(soerr);
      getsockopt(s, SOL_SOCKET, SO_ERROR, (char *)&soerr, &sl);
      if (soerr == 0) {
        const char *req = "GET /__gpg__ HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n";
        send(s, req, (int)strlen(req), 0);
        u_long z = 0; ioctlsocket(s, FIONBIO, &z);
        char buf[512];
        int n = recv(s, buf, sizeof(buf) - 1, 0);
        if (n > 0) {
          buf[n] = 0;
          char *b = strstr(buf, "\r\n\r\n");
          if (b) {
            b += 4;
            char *v = strstr(b, "GrandPixelGame ");
            if (v) { v += 15; char *e = strchr(v, '\r'); if (e) *e = 0;
                     strncpy(ver, v, cap - 1); ver[cap - 1] = 0; ok = 1; }
          }
        }
      }
    }
  }
  closesocket(s);
  return ok;
}
static void open_browser(void) {
  ShellExecuteW(NULL, L"open", L"http://127.0.0.1:8137/", NULL, NULL, SW_SHOWNORMAL);
}
/* ============================================================
 * UI — launcher (janela principal) e player (janela do jogo)
 * ============================================================ */
#define C_BG1    RGB(13, 11, 24)
#define C_BG2    RGB(23, 18, 41)
#define C_PANEL1 RGB(29, 24, 55)
#define C_PANEL2 RGB(21, 17, 40)
#define C_LINE   RGB(58, 48, 96)
#define C_LINE_G RGB(120, 96, 44)
#define C_GOLD   RGB(255, 215, 106)
#define C_GOLD_D RGB(224, 164, 64)
#define C_GOLD_DK RGB(90, 66, 26)
#define C_TXT    RGB(238, 232, 255)
#define C_MUT    RGB(150, 141, 190)
#define C_DIM    RGB(105, 98, 138)
#define C_GREEN  RGB(140, 224, 150)
#define C_CYAN   RGB(125, 228, 255)
#define C_RED    RGB(255, 122, 138)
#define C_HOVER  RGB(255, 255, 255)

static HINSTANCE g_hInst;
static HFONT g_f[10];            /* estilos */
enum { F_TINY = 0, F_SMALL, F_NORM, F_BOLD, F_BIG, F_HUGE, F_LOGO, F_MID, F_SMALLB, F_TITLEB };
static int g_hoverBtn = -1;
static int g_pressBtn = -1;
static int g_hoverRow = -1;
static int g_selIdx = -1;
static int g_scroll = 0;
static int g_autoUpd = 1;
static int g_listH = 0;
static wchar_t g_statusW[400];
static int g_lastNewsy = 0;

/* botões */
enum { B_NONE = -1, B_PLAY, B_CLOSE, B_MIN, B_REFRESH, B_DL, B_OPEN, B_QUIT, B_ABOUT };
typedef struct { int id; RECT r; } Btn;
static Btn g_btns[12];
static int g_btnCount = 0;
static void btn_add(int id, int x, int y, int w, int h) {
  if (g_btnCount >= 12) return;
  Btn *b = &g_btns[g_btnCount++];
  b->id = id;
  b->r.left = x; b->r.top = y; b->r.right = x + w; b->r.bottom = y + h;
}
static int btn_hit(int x, int y, int *id) {
  for (int i = 0; i < g_btnCount; i++)
    if (x >= g_btns[i].r.left && x <= g_btns[i].r.right && y >= g_btns[i].r.top && y <= g_btns[i].r.bottom) {
      *id = g_btns[i].id;
      return 1;
    }
  return 0;
}
static RECT btn_rect(int id) {
  for (int i = 0; i < g_btnCount; i++)
    if (g_btns[i].id == id) return g_btns[i].r;
  RECT z = { 0, 0, 0, 0 };
  return z;
}
static void mkfont(HFONT *f, int px, int weight) {
  *f = CreateFontW(-px, 0, 0, 0, weight, 0, 0, 0, DEFAULT_CHARSET,
                   OUT_DEFAULT_PRECIS, CLIP_DEFAULT_PRECIS, CLEARTYPE_QUALITY,
                   DEFAULT_PITCH | FF_DONTCARE, L"Segoe UI");
  if (!*f) *f = (HFONT)GetStockObject(DEFAULT_GUI_FONT);
}
static void fonts_init(void) {
  mkfont(&g_f[F_TINY],   17, FW_NORMAL);     /* ~10pt visual  */
  mkfont(&g_f[F_SMALL],  20, FW_NORMAL);
  mkfont(&g_f[F_SMALLB], 20, FW_SEMIBOLD);
  mkfont(&g_f[F_NORM],   23, FW_NORMAL);
  mkfont(&g_f[F_BOLD],   23, FW_BOLD);
  mkfont(&g_f[F_MID],    28, FW_BOLD);
  mkfont(&g_f[F_BIG],    40, FW_BOLD);
  mkfont(&g_f[F_HUGE],   58, FW_BLACK);
  mkfont(&g_f[F_LOGO],   34, FW_BOLD);
  mkfont(&g_f[F_TITLEB], 30, FW_BOLD);
}

/* ----------------------------- desenho base ----------------------------- */
static void fill_rect(HDC h, int x, int y, int w, int hh, COLORREF c) {
  RECT r = { x, y, x + w, y + hh };
  HBRUSH br = CreateSolidBrush(c);
  FillRect(h, &r, br);
  DeleteObject(br);
}
static void grad_v(HDC h, int x, int y, int w, int hh, COLORREF a, COLORREF b) {
  for (int i = 0; i < hh; i++) {
    double t = hh <= 1 ? 0 : (double)i / (hh - 1);
    int rr = (int)(GetRValue(a) + (GetRValue(b) - GetRValue(a)) * t);
    int gg = (int)(GetGValue(a) + (GetGValue(b) - GetGValue(a)) * t);
    int bb = (int)(GetBValue(a) + (GetBValue(b) - GetBValue(a)) * t);
    fill_rect(h, x, y + i, w, 1, RGB(rr, gg, bb));
  }
}
static void round_fill(HDC h, int x, int y, int w, int hh, int r, COLORREF c) {
  HBRUSH br = CreateSolidBrush(c);
  HGDIOBJ ob = SelectObject(h, br);
  RoundRect(h, x, y, x + w, y + hh, r * 2, r * 2);
  SelectObject(h, ob);
  DeleteObject(br);
}
static void round_stroke(HDC h, int x, int y, int w, int hh, int r, COLORREF c, int lw) {
  HPEN pn = CreatePen(PS_SOLID, lw, c);
  HGDIOBJ ob = SelectObject(h, pn);
  HGDIOBJ bb = SelectObject(h, GetStockObject(NULL_BRUSH));
  RoundRect(h, x, y, x + w, y + hh, r * 2, r * 2);
  SelectObject(h, bb);
  SelectObject(h, ob);
  DeleteObject(pn);
}
static void grad_round(HDC h, int x, int y, int w, int hh, int r, COLORREF a, COLORREF b) {
  HRGN rg = CreateRoundRectRgn(x, y, x + w + 1, y + hh + 1, r * 2, r * 2);
  SelectClipRgn(h, rg);
  grad_v(h, x, y, w, hh, a, b);
  SelectClipRgn(h, NULL);
  DeleteObject(rg);
}
static void text_w(HDC h, const wchar_t *s, int x, int y, int w, int hh, COLORREF c, HFONT f,
                   UINT fmt, int tracking) {
  SetTextColor(h, c);
  SetBkMode(h, TRANSPARENT);
  SelectObject(h, f);
  SetTextCharacterExtra(h, tracking);
  RECT r = { x, y, x + w, y + hh };
  DrawTextW(h, s, -1, &r, fmt | DT_NOPREFIX);
  SetTextCharacterExtra(h, 0);
}
static void text_w_shadow(HDC h, const wchar_t *s, int x, int y, int w, int hh, COLORREF c, HFONT f,
                          UINT fmt, int tracking, COLORREF sh) {
  text_w(h, s, x + 1, y + 2, w, hh, sh, f, fmt, tracking);
  text_w(h, s, x, y, w, hh, c, f, fmt, tracking);
}
static int text_wid(HDC h, const wchar_t *s, HFONT f) {
  SelectObject(h, f);
  SIZE sz;
  GetTextExtentPoint32W(h, s, (int)wcslen(s), &sz);
  return sz.cx;
}
static void pill(HDC h, const wchar_t *s, int cx, int cy, COLORREF fg, COLORREF bg, HFONT f,
                 int *outw) {
  int tw = text_wid(h, s, f);
  int w = tw + 18, hh = 22;
  int x = cx - w / 2, y = cy - hh / 2;
  round_fill(h, x, y, w, hh, 11, bg);
  text_w(h, s, x, y - 1, w, hh, fg, f, DT_CENTER | DT_VCENTER | DT_SINGLELINE, 0);
  if (outw) *outw = w;
}
static void poly_pts(HDC h, int n, const POINT *p, COLORREF c) {
  HBRUSH br = CreateSolidBrush(c);
  HGDIOBJ ob = SelectObject(h, br);
  HGDIOBJ pn = SelectObject(h, GetStockObject(NULL_PEN));
  Polygon(h, p, n);
  SelectObject(h, pn);
  SelectObject(h, ob);
  DeleteObject(br);
}

/* ------------------------- helpers de conteúdo ------------------------- */
static const wchar_t *state_badge(Ver *v, int *kind) {
  /* kind: 0 = instalada, 1 = esta versao, 2 = nova (mais recente) */
  if (v->current) { *kind = 1; return L"ESTE EXE"; }
  if (v->installed) { *kind = 0; return L"INSTALADA"; }
  *kind = 2;
  return L"";
}
static void star_icon(HDC h, int cx, int cy, int R, COLORREF c) {
  POINT p[10];
  for (int i = 0; i < 10; i++) {
    double a = 3.14159 / 2 + i * 3.14159 / 5;
    double rr = (i % 2 == 0) ? R : R * 0.42;
    p[i].x = (int)(cx + cos(a) * rr);
    p[i].y = (int)(cy - sin(a) * rr);
  }
  poly_pts(h, 10, p, c);
}

/* --------------------------------- paint: launcher ------------------------ */
static int W = 980, H = 620;
static void layout_launcher(void) {
  g_btnCount = 0;
  int tb = 46;
  btn_add(B_MIN,  W - 84, 0, 42, tb);
  btn_add(B_CLOSE, W - 42, 0, 42, tb);
  int px = 20, py = tb + 16;
  btn_add(B_PLAY, px, py + 220, 292, 58);
  btn_add(B_REFRESH, W - 130, tb + 8, 110, 28);
  /* checkbox "atualizacao automatica" */
  {
    Btn *b = &g_btns[g_btnCount++];
    b->id = B_ABOUT;
    SetRect(&b->r, px + 14, py + 282, px + 292, py + 334);
  }
  g_listH = H - tb - 16 - 40 - 44; /* do topo da lista ao rodapé */
}
static void paint_launcher(HDC hdc) {
  /* fundo */
  grad_v(hdc, 0, 0, W, H, C_BG1, C_BG2);
  /* faixa sutil no topo */
  fill_rect(hdc, 0, 0, W, 3, C_GOLD_D);

  /* ---- topo ---- */
  text_w_shadow(hdc, L"GRAND PIXEL GAME", 22, 6, 520, 34, C_GOLD, g_f[F_LOGO], DT_LEFT | DT_VCENTER | DT_SINGLELINE, 6, RGB(0, 0, 0));
  {
    wchar_t v[40];
    _snwprintf(v, 40, L"v%hs  ·  launcher", GPG_VERSION);
    text_w(hdc, v, 520, 10, 250, 26, C_MUT, g_f[F_SMALL], DT_LEFT | DT_VCENTER | DT_SINGLELINE, 0);
  }
  /* botoes janela */
  for (int i = 0; i < g_btnCount; i++) {
    Btn *b = &g_btns[i];
    if (b->id != B_MIN && b->id != B_CLOSE) continue;
    COLORREF c = (g_hoverBtn == b->id) ? C_LINE : RGB(28, 24, 50);
    fill_rect(hdc, b->r.left, b->r.top, b->r.right - b->r.left, b->r.bottom - b->r.top, c);
    int cx = (b->r.left + b->r.right) / 2, cy = (b->r.top + b->r.bottom) / 2;
    HPEN pn = CreatePen(PS_SOLID, 1, C_MUT);
    HGDIOBJ ob = SelectObject(hdc, pn);
    if (b->id == B_MIN) {
      MoveToEx(hdc, cx - 7, cy, NULL); LineTo(hdc, cx + 7, cy);
    } else {
      MoveToEx(hdc, cx - 6, cy - 6, NULL); LineTo(hdc, cx + 6, cy + 6);
      MoveToEx(hdc, cx + 6, cy - 6, NULL); LineTo(hdc, cx - 6, cy + 6);
    }
    SelectObject(hdc, ob);
    DeleteObject(pn);
  }

  /* ---- painel esquerdo ---- */
  int px = 20, py = 62, pw = 292, ph = 330;
  grad_round(hdc, px, py, pw, ph, 18, C_PANEL1, C_PANEL2);
  round_stroke(hdc, px, py, pw, ph, 18, C_LINE, 1);
  text_w(hdc, L"PRONTO PARA JOGAR", px + 22, py + 18, pw - 44, 20, C_GOLD_D, g_f[F_TINY],
         DT_LEFT | DT_SINGLELINE, 3);

  int sel = g_selIdx;
  Ver *v = sel >= 0 && sel < g_verCount ? &g_vers[sel] : NULL;
  if (v) {
    wchar_t big[40];
    _snwprintf(big, 40, L"%hs", v->tag);
    text_w_shadow(hdc, big, px + 20, py + 40, pw - 40, 64, C_TXT, g_f[F_HUGE], DT_LEFT | DT_SINGLELINE, 2, RGB(0, 0, 0));
    int kind = 2;
    const wchar_t *bd = state_badge(v, &kind);
    if (bd[0]) {
      int tw = text_wid(hdc, bd, g_f[F_SMALLB]);
      int bx = px + 22, by = py + 106;
      COLORREF fg = kind == 1 ? C_CYAN : (kind == 0 ? C_GREEN : C_GOLD);
      COLORREF bg = kind == 1 ? RGB(28, 66, 90) : (kind == 0 ? RGB(22, 60, 40) : RGB(80, 58, 20));
      round_fill(hdc, bx, by, tw + 20, 24, 12, bg);
      text_w(hdc, bd, bx, by - 1, tw + 20, 24, fg, g_f[F_SMALLB], DT_CENTER | DT_VCENTER | DT_SINGLELINE, 0);
    }
    if (v->date[0]) {
      wchar_t d[40];
      _snwprintf(d, 40, L"publicado em %hs", v->date);
      text_w(hdc, d, px + 22, py + 136, pw - 44, 20, C_DIM, g_f[F_SMALL], DT_LEFT | DT_SINGLELINE, 0);
    }
    if (v->size > 0) {
      wchar_t d[60];
      _snwprintf(d, 60, L"%.1f MB", v->size / 1048576.0);
      text_w(hdc, d, px + 22, py + 156, pw - 44, 20, C_DIM, g_f[F_SMALL], DT_LEFT | DT_SINGLELINE, 0);
    }
    /* separador */
    fill_rect(hdc, px + 22, py + 186, pw - 44, 1, C_LINE);
    text_w(hdc, L"jogo completo autossuficiente: 70 missoes, 10 artefatos e os\n3 chefes do vale — servido localmente no seu navegador.",
           px + 22, py + 196, pw - 44, 120, C_MUT, g_f[F_SMALL], DT_LEFT | DT_WORDBREAK, 0);
  }

  /* botão principal */
  {
    Btn *b = &g_btns[0]; /* B_PLAY */
    int canPlay = sel >= 0 && v && (v->current || v->installed);
    int needDl = sel >= 0 && v && !v->current && !v->installed && v->url[0];
    if (g_downloading && g_dlIndex == sel) {
      canPlay = 0; needDl = 0;
    }
    const wchar_t *lab = canPlay ? L"JOGAR" : (needDl ? L"BAIXAR E INSTALAR" : L"JOGAR");
    int on = g_hoverBtn == B_PLAY && !g_pressBtn;
    if (canPlay) {
      grad_round(hdc, b->r.left, b->r.top, b->r.right - b->r.left, b->r.bottom - b->r.top, 12,
                 on ? RGB(255, 236, 176) : C_GOLD, on ? RGB(255, 216, 130) : C_GOLD_D);
      round_stroke(hdc, b->r.left, b->r.top, b->r.right - b->r.left, b->r.bottom - b->r.top, 12,
                   RGB(255, 240, 200), 1);
      text_w(hdc, lab, b->r.left, b->r.top + (g_pressBtn ? 2 : 0), b->r.right - b->r.left,
             b->r.bottom - b->r.top, RGB(44, 28, 4), g_f[F_MID], DT_CENTER | DT_VCENTER | DT_SINGLELINE, 4);
    } else if (needDl) {
      grad_round(hdc, b->r.left, b->r.top, b->r.right - b->r.left, b->r.bottom - b->r.top, 12,
                 on ? RGB(52, 60, 108) : RGB(38, 42, 78), on ? RGB(48, 55, 100) : RGB(30, 33, 62));
      round_stroke(hdc, b->r.left, b->r.top, b->r.right - b->r.left, b->r.bottom - b->r.top, 12,
                   C_LINE_G, 1);
      text_w(hdc, lab, b->r.left, b->r.top + (g_pressBtn ? 2 : 0), b->r.right - b->r.left,
             b->r.bottom - b->r.top, C_GOLD, g_f[F_BOLD], DT_CENTER | DT_VCENTER | DT_SINGLELINE, 2);
    } else {
      grad_round(hdc, b->r.left, b->r.top, b->r.right - b->r.left, b->r.bottom - b->r.top, 12,
                 RGB(48, 44, 70), RGB(38, 34, 58));
      text_w(hdc, L"…", b->r.left, b->r.top, b->r.right - b->r.left, b->r.bottom - b->r.top,
             C_DIM, g_f[F_MID], DT_CENTER | DT_VCENTER | DT_SINGLELINE, 0);
    }
  }

  /* auto-atualização */
  {
    int ax = px + 22, ay = py + 330 - 34;
    int chk = g_autoUpd;
    int c = chk ? C_GOLD : C_LINE;
    round_stroke(hdc, ax, ay - 10, 18, 18, 4, c, 1);
    if (chk) {
      HPEN pn = CreatePen(PS_SOLID, 2, C_GOLD);
      HGDIOBJ ob = SelectObject(hdc, pn);
      MoveToEx(hdc, ax + 3, ay - 2, NULL); LineTo(hdc, ax + 7, ay + 2);
      LineTo(hdc, ax + 14, ay - 6);
      SelectObject(hdc, ob);
      DeleteObject(pn);
    }
    text_w(hdc, L"atualizacao automatica", ax + 26, ay - 13, 240, 20, chk ? C_TXT : C_MUT,
           g_f[F_SMALL], DT_LEFT | DT_VCENTER | DT_SINGLELINE, 0);
  }

  /* ---- painel direito (lista) ---- */
  int rx = 336, ry = 62, rw = W - rx - 20;
  grad_round(hdc, rx, ry, rw, g_listH, 18, RGB(26, 22, 46), RGB(19, 16, 36));
  round_stroke(hdc, rx, ry, rw, g_listH, 18, C_LINE, 1);
  text_w(hdc, L"VERSOES NO GITHUB", rx + 22, ry + 14, 260, 22, C_MUT, g_f[F_TINY], DT_LEFT | DT_SINGLELINE, 3);
  {
    Btn *rb = &g_btns[0];
    (void)rb;
  }
  {
    /* botão refresh no header */
    int hx = rx + rw - 130, hy = ry + 12;
    int on = g_hoverBtn == B_REFRESH;
    round_fill(hdc, hx, hy, 110, 26, 13, on ? RGB(52, 46, 84) : RGB(34, 30, 58));
    /* seta circular ↻ desenhada com dois arcos? usamos texto simples */
    text_w(hdc, L"verificar agora", hx, hy - 1, 110, 26, on ? C_TXT : C_MUT, g_f[F_SMALL],
           DT_CENTER | DT_VCENTER | DT_SINGLELINE, 0);
    if (g_hoverBtn == B_REFRESH && (g_pressBtn == B_REFRESH)) {
      fill_rect(hdc, hx, hy + 24, 110, 2, C_GOLD_D);
    } else if (on) {
      fill_rect(hdc, hx, hy + 24, 110, 2, RGB(120, 100, 60));
    }
  }

  /* linhas da lista */
  int lx = rx + 12, lw = rw - 24;
  int rowH = 56;
  int vis = (g_listH - 58) / rowH;
  if (vis < 1) vis = 1;
  int maxScroll = g_verCount - vis;
  if (maxScroll < 0) maxScroll = 0;
  if (g_scroll > maxScroll) g_scroll = maxScroll;
  if (g_scroll < 0) g_scroll = 0;
  int y0 = ry + 50;
  for (int i = 0; i < vis; i++) {
    int idx = i + g_scroll;
    if (idx >= g_verCount) break;
    Ver *vv = &g_vers[idx];
    int y = y0 + i * rowH;
    int isSel = (idx == g_selIdx);
    if (isSel) {
      grad_round(hdc, lx, y, lw, rowH - 8, 12, RGB(46, 40, 74), RGB(38, 33, 64));
      round_stroke(hdc, lx, y, lw, rowH - 8, 12, C_GOLD_D, 1);
    } else if (g_hoverRow == idx) {
      round_fill(hdc, lx, y, lw, rowH - 8, 12, RGB(37, 33, 60));
    }
    /* radio */
    int cx = lx + 22, cy = y + (rowH - 8) / 2;
    COLORREF rc = isSel ? C_GOLD : C_LINE;
    round_stroke(hdc, cx - 9, cy - 9, 18, 18, 9, rc, isSel ? 2 : 1);
    if (isSel) round_fill(hdc, cx - 4, cy - 4, 8, 8, 4, C_GOLD);
    /* tag */
    wchar_t tg[40];
    _snwprintf(tg, 40, L"%hs", vv->tag);
    text_w(hdc, tg, cx + 20, y, 150, rowH - 10, isSel ? C_TXT : RGB(210, 202, 236), g_f[F_MID],
           DT_LEFT | DT_VCENTER | DT_SINGLELINE, 0);
    /* badges */
    int kind;
    const wchar_t *bd = state_badge(vv, &kind);
    int bw = 0;
    if (bd[0]) {
      int tw = text_wid(hdc, bd, g_f[F_SMALLB]);
      bw = tw + 20;
      COLORREF fg = kind == 1 ? C_CYAN : (kind == 0 ? C_GREEN : C_GOLD);
      COLORREF bg = kind == 1 ? RGB(28, 66, 90) : (kind == 0 ? RGB(22, 60, 40) : RGB(80, 58, 20));
      round_fill(hdc, lx + lw - 40 - tw - 10, cy - 12, tw + 20, 24, 12, bg);
      text_w(hdc, bd, lx + lw - 40 - tw - 10, cy - 13, tw + 20, 24, fg, g_f[F_SMALLB],
             DT_CENTER | DT_VCENTER | DT_SINGLELINE, 0);
      (void)bw;
    }
    /* seta de baixar p/ não instaladas */
    if (!vv->current && !vv->installed && vv->url[0]) {
      int ax = lx + lw - 22;
      HPEN pn = CreatePen(PS_SOLID, 2, C_GOLD_D);
      HGDIOBJ ob = SelectObject(hdc, pn);
      MoveToEx(hdc, ax - 6, cy - 3, NULL); LineTo(hdc, ax, cy + 4); LineTo(hdc, ax + 6, cy - 3);
      MoveToEx(hdc, ax, cy - 6, NULL); LineTo(hdc, ax, cy + 6);
      SelectObject(hdc, ob);
      DeleteObject(pn);
    }
    /* separador */
    if (i < vis - 1 && idx + 1 < g_verCount)
      fill_rect(hdc, lx + 12, y + rowH - 6, lw - 24, 1, RGB(40, 35, 66));
  }
  if (g_verCount == 0) {
    text_w(hdc, g_fetching ? L"consultando o GitHub…" :
           (g_fetchFailed ? L"sem conexao — verifique sua internet" : L"nenhuma versao encontrada"),
           lx, y0 + 20, lw, 30, C_MUT, g_f[F_NORM], DT_CENTER | DT_SINGLELINE, 0);
  }
  /* scrollbar */
  if (maxScroll > 0) {
    int sh = g_listH - 58;
    int th = sh / (maxScroll + 1);
    if (th < 24) th = 24;
    int ty = y0 + g_scroll * (sh - th) / maxScroll;
    round_fill(hdc, rx + rw - 9, y0 + ty, 4, th, 2, C_DIM);
  }

  /* ---- rodapé: status + barra de progresso ---- */
  int fy = H - 40;
  fill_rect(hdc, 0, fy - 4, W, 1, RGB(36, 30, 62));
  if (g_downloading) {
    wchar_t st[200];
    double pct = g_dlTotal > 0 ? (double)g_dlGot / g_dlTotal : 0;
    _snwprintf(st, 200, L"baixando %hs   %d%%", g_dlJob.tag, (int)(pct * 100));
    text_w(hdc, st, 22, fy + 4, 400, 30, C_GOLD, g_f[F_SMALLB], DT_LEFT | DT_VCENTER | DT_SINGLELINE, 0);
    int bx = 430, bw = W - 430 - 150;
    round_fill(hdc, bx, fy + 14, bw, 12, 6, RGB(30, 26, 52));
    int fw = (int)(bw * pct);
    if (fw > 0) {
      HRGN rg = CreateRoundRectRgn(bx, fy + 14, bx + fw, fy + 26, 12, 12);
      SelectClipRgn(hdc, rg);
      grad_v(hdc, bx, fy + 14, fw, 12, C_GOLD, C_GOLD_D);
      SelectClipRgn(hdc, NULL);
      DeleteObject(rg);
    }
    wchar_t mb[40];
    if (g_dlTotal > 0) _snwprintf(mb, 40, L"%.1f / %.1f MB", g_dlGot / 1048576.0, g_dlTotal / 1048576.0);
    else _snwprintf(mb, 40, L"%.1f MB", g_dlGot / 1048576.0);
    text_w(hdc, mb, W - 140, fy + 4, 120, 30, C_MUT, g_f[F_SMALL], DT_RIGHT | DT_VCENTER | DT_SINGLELINE, 0);
  } else {
    text_w(hdc, g_statusW, 22, fy + 2, W - 44, 30, g_statusErr ? C_RED : C_MUT, g_f[F_SMALL],
           DT_LEFT | DT_VCENTER | DT_SINGLELINE, 0);
    /* estrela decorativa no canto */
    star_icon(hdc, W - 40, fy + 17, 8, C_GOLD_D);
  }
  /* glow do rodapé? ok */
}

/* --------------------------------------- ações launcher ------------------ */
static void launcher_set_status(const wchar_t *s, int err) {
  wcsncpy(g_statusW, s, 399);
  g_statusW[399] = 0;
  g_statusErr = err;
}
static void launcher_refresh_rows(void) {
  for (int i = 0; i < g_verCount; i++) {
    char full[24];
    _snprintf(full, sizeof(full), "v%s", GPG_VERSION);
    g_vers[i].current = strcmp(g_vers[i].tag, full) == 0;
    g_vers[i].installed = 0;
  }
  find_installed();
  if (g_selIdx < 0 || g_selIdx >= g_verCount) {
    /* seleciona a mais nova instalada/atual; senão a primeira */
    g_selIdx = 0;
    for (int i = 0; i < g_verCount; i++)
      if (g_vers[i].current || g_vers[i].installed) { g_selIdx = i; break; }
  }
}
static void launcher_play(void) {
  if (g_selIdx < 0 || g_selIdx >= g_verCount) return;
  Ver *v = &g_vers[g_selIdx];
  wchar_t exe[MAX_PATH * 2];
  if (v->current) {
    GetModuleFileNameW(NULL, exe, MAX_PATH * 2);
  } else if (v->installed) {
    char san[40];
    version_san(san, sizeof(san), v->tag);
    _snwprintf(exe, MAX_PATH * 2, L"%s\\versions\\GrandPixelGame-v%hs-win64.exe",
               g_appdirW, san);
  } else return;
  if (GetFileAttributesW(exe) == INVALID_FILE_ATTRIBUTES) return;
  wchar_t cmd[MAX_PATH * 2 + 24];
  _snwprintf(cmd, MAX_PATH * 2 + 24, L"\"%s\" --play", exe);
  STARTUPINFOW si;
  PROCESS_INFORMATION pi;
  memset(&si, 0, sizeof(si));
  si.cb = sizeof(si);
  memset(&pi, 0, sizeof(pi));
  if (CreateProcessW(exe, cmd, NULL, NULL, FALSE, 0, NULL, NULL, &si, &pi)) {
    CloseHandle(pi.hThread);
    CloseHandle(pi.hProcess);
    wchar_t st[200];
    _snwprintf(st, 200, L"%hs aberto no navegador — a janelinha do jogador fica aberta em segundo plano.", v->tag);
    launcher_set_status(st, 0);
  } else {
    launcher_set_status(L"nao consegui iniciar o jogo.", 1);
  }
}
static void launcher_select(int idx) {
  if (idx < 0 || idx >= g_verCount) return;
  g_selIdx = idx;
  g_scroll = 0;
  InvalidateRect(g_hwnd, NULL, FALSE);
}

/* --------------------------------------- paint: player -------------------- */
static int PW = 460, PH = 210;
static HWND g_playerWnd = NULL;
static int g_openedBrowser = 0;

static void layout_player(void) {
  g_btnCount = 0;
  int bw = PW - 60;
  btn_add(B_OPEN, 30, 128, (bw - 12) / 2, 46);
  btn_add(B_QUIT, 30 + (bw - 12) / 2 + 12, 128, (bw - 12) / 2, 46);
  btn_add(B_CLOSE, PW - 40, 0, 40, 36);
}
static void paint_player(HDC hdc) {
  grad_v(hdc, 0, 0, PW, PH, C_BG1, C_BG2);
  fill_rect(hdc, 0, 0, PW, 3, C_GOLD_D);
  /* icon */
  star_icon(hdc, 34, 62, 16, C_GOLD);
  text_w_shadow(hdc, L"GRAND PIXEL GAME", 60, 40, PW - 100, 26, C_GOLD, g_f[F_TITLEB],
                DT_LEFT | DT_SINGLELINE, 4, RGB(0, 0, 0));
  {
    wchar_t v[60];
    _snwprintf(v, 60, L"jogando %hs", GPG_VERSION);
    text_w(hdc, v, 60, 70, PW - 100, 20, C_MUT, g_f[F_SMALL], DT_LEFT | DT_SINGLELINE, 0);
  }
  text_w(hdc, L"servidor local ativo — o jogo roda no seu navegador",
         60, 96, PW - 90, 20, RGB(190, 182, 220), g_f[F_SMALL], DT_LEFT | DT_SINGLELINE, 0);
  /* botões */
  for (int i = 0; i < g_btnCount; i++) {
    Btn *b = &g_btns[i];
    if (b->id == B_OPEN) {
      int on = g_hoverBtn == B_OPEN && !g_pressBtn;
      grad_round(hdc, b->r.left, b->r.top, b->r.right - b->r.left, b->r.bottom - b->r.top, 12,
                 on ? RGB(255, 236, 176) : C_GOLD, on ? RGB(255, 216, 130) : C_GOLD_D);
      text_w(hdc, L"ABRIR JOGO", b->r.left, b->r.top, b->r.right - b->r.left,
             b->r.bottom - b->r.top, RGB(44, 28, 4), g_f[F_BOLD], DT_CENTER | DT_VCENTER | DT_SINGLELINE, 2);
    } else if (b->id == B_QUIT) {
      int on = g_hoverBtn == B_QUIT && !g_pressBtn;
      round_fill(hdc, b->r.left, b->r.top, b->r.right - b->r.left, b->r.bottom - b->r.top, 12,
                 on ? RGB(70, 36, 48) : RGB(44, 26, 38));
      round_stroke(hdc, b->r.left, b->r.top, b->r.right - b->r.left, b->r.bottom - b->r.top, 12,
                   RGB(140, 60, 74), 1);
      text_w(hdc, L"ENCERRAR", b->r.left, b->r.top, b->r.right - b->r.left,
             b->r.bottom - b->r.top, RGB(255, 190, 200), g_f[F_BOLD], DT_CENTER | DT_VCENTER | DT_SINGLELINE, 2);
    } else if (b->id == B_CLOSE) {
      int cx = (b->r.left + b->r.right) / 2, cy = (b->r.top + b->r.bottom) / 2;
      HPEN pn = CreatePen(PS_SOLID, 1, C_MUT);
      HGDIOBJ ob = SelectObject(hdc, pn);
      MoveToEx(hdc, cx - 5, cy - 5, NULL); LineTo(hdc, cx + 5, cy + 5);
      MoveToEx(hdc, cx + 5, cy - 5, NULL); LineTo(hdc, cx - 5, cy + 5);
      SelectObject(hdc, ob);
      DeleteObject(pn);
    }
  }
}

/* --------------------------------------- janelas -------------------------- */
static LRESULT CALLBACK player_wndproc(HWND hwnd, UINT msg, WPARAM wp, LPARAM lp) {
  switch (msg) {
    case WM_CREATE:
      g_playerWnd = hwnd;
      g_hwnd = hwnd;
      layout_player();
      if (!start_server()) {
        char other[48] = "";
        if (probe_server(other, sizeof(other))) {
          if (strcmp(other, GPG_VERSION) == 0) {
            open_browser();
            DestroyWindow(hwnd);
            return 0;
          }
        }
        MessageBoxW(hwnd, L"Nao consegui iniciar o servidor local (porta 8137 em uso).",
                    L"Grand Pixel Game", MB_OK | MB_ICONWARNING);
        DestroyWindow(hwnd);
        return 0;
      }
      SetTimer(hwnd, 1, 500, NULL);
      return 0;
    case WM_TIMER:
      if (wp == 1 && !g_openedBrowser) {
        g_openedBrowser = 1;
        KillTimer(hwnd, 1);
        open_browser();
      }
      return 0;
    case WM_ERASEBKGND: return 1;
    case WM_PAINT: {
      PAINTSTRUCT ps;
      HDC hdc = BeginPaint(hwnd, &ps);
      paint_player(hdc);
      EndPaint(hwnd, &ps);
      return 0;
    }
    case WM_LBUTTONDOWN: {
      int x = GET_X_LPARAM(lp), y = GET_Y_LPARAM(lp);
      int id;
      if (btn_hit(x, y, &id)) {
        if (id == B_OPEN) open_browser();
        else if (id == B_QUIT || id == B_CLOSE) DestroyWindow(hwnd);
        else if (id == B_MIN) ShowWindow(hwnd, SW_MINIMIZE);
      }
      return 0;
    }
    case WM_MOUSEMOVE: {
      int x = GET_X_LPARAM(lp), y = GET_Y_LPARAM(lp);
      int id;
      int old = g_hoverBtn;
      g_hoverBtn = btn_hit(x, y, &id) ? id : B_NONE;
      if (old != g_hoverBtn) {
        InvalidateRect(hwnd, NULL, FALSE);
        SetCursor(LoadCursor(NULL, g_hoverBtn != B_NONE ? IDC_HAND : IDC_ARROW));
      }
      return 0;
    }
    case WM_SETCURSOR:
      SetCursor(LoadCursor(NULL, g_hoverBtn != B_NONE ? IDC_HAND : IDC_ARROW));
      return 1;
    case WM_NCHITTEST: {
      POINT pt = { GET_X_LPARAM(lp), GET_Y_LPARAM(lp) };
      ScreenToClient(hwnd, &pt);
      int id;
      if (btn_hit(pt.x, pt.y, &id)) return HTCLIENT;
      if (pt.y < 36) return HTCAPTION;
      return HTCLIENT;
    }
    case WM_CLOSE:
      stop_server();
      DestroyWindow(hwnd);
      return 0;
    case WM_DESTROY:
      g_playerWnd = NULL;
      PostQuitMessage(0);
      return 0;
  }
  return DefWindowProcW(hwnd, msg, wp, lp);
}

static LRESULT CALLBACK launcher_wndproc(HWND hwnd, UINT msg, WPARAM wp, LPARAM lp) {
  switch (msg) {
    case WM_CREATE: {
      g_hwnd = hwnd;
      _snwprintf(g_statusW, 400, L"verificando atualizacoes no GitHub…");
      /* fila inicial: só a versão embutida (a lista chega pela rede) */
      g_verCount = 1;
      memset(&g_vers[0], 0, sizeof(g_vers[0]));
      _snprintf(g_vers[0].tag, sizeof(g_vers[0].tag), "v%s", GPG_VERSION);
      _snprintf(g_vers[0].date, sizeof(g_vers[0].date), "versao embutida");
      g_vers[0].current = 1;
      g_vers[0].installed = 1;
      g_selIdx = 0;
      layout_launcher();
      launcher_set_status(L"verificando atualizacoes no GitHub…", 0);
      start_fetch(hwnd);
      return 0;
    }
    case WM_ERASEBKGND: return 1;
    case WM_PAINT: {
      PAINTSTRUCT ps;
      HDC hdc = BeginPaint(hwnd, &ps);
      paint_launcher(hdc);
      EndPaint(hwnd, &ps);
      return 0;
    }
    case WM_APP_NETOK: {
      g_fetchFailed = 0;
      g_fetching = 0;
      launcher_refresh_rows();
      if (g_verCount == 0) {
        g_verCount = 1;
        memset(&g_vers[0], 0, sizeof(g_vers[0]));
        _snprintf(g_vers[0].tag, sizeof(g_vers[0].tag), "v%s", GPG_VERSION);
        g_vers[0].current = 1;
        g_vers[0].installed = 1;
      }
      launcher_set_status(L"lista de versoes atualizada.", 0);
      /* auto-update: a mais nova disponível não instalada */
      int best = -1;
      for (int i = 0; i < g_verCount; i++)
        if (!g_vers[i].current && !g_vers[i].installed && g_vers[i].url[0])
          if (best < 0 || is_newer(g_vers[i].tag, g_vers[best].tag)) best = i;
      if (best >= 0 && g_autoUpd) {
        g_selIdx = best;
        wchar_t st[200];
        _snwprintf(st, 200, L"nova versao %hs encontrada — baixando automaticamente…",
                   g_vers[best].tag);
        launcher_set_status(st, 0);
        start_download(hwnd, best);
      } else if (best >= 0) {
        g_selIdx = best;
        wchar_t st[200];
        _snwprintf(st, 200, L"nova versao %hs disponivel — clique em BAIXAR E INSTALAR.",
                   g_vers[best].tag);
        launcher_set_status(st, 0);
      } else {
        launcher_set_status(L"voce esta com a versao mais recente.", 0);
      }
      InvalidateRect(hwnd, NULL, FALSE);
      return 0;
    }
    case WM_APP_NETFAIL:
      g_fetchFailed = 1;
      g_fetching = 0;
      launcher_set_status(L"sem conexao com o GitHub — mostrando apenas esta versao.", 1);
      InvalidateRect(hwnd, NULL, FALSE);
      return 0;
    case WM_APP_DLPROG: {
      static int lastPct = -1;
      int pct = g_dlTotal > 0 ? (int)(g_dlGot * 100 / g_dlTotal) : (int)(g_dlGot / 65536);
      if (pct != lastPct) { lastPct = pct; InvalidateRect(hwnd, NULL, FALSE); }
      return 0;
    }
    case WM_APP_DLDONE: {
      g_downloading = 0;
      int ok = (int)wp;
      if (ok) {
        int idx = find_ver(g_dlJob.tag);
        if (idx >= 0) g_vers[idx].installed = 1;
        launcher_set_status(L"instalacao concluida! clique em JOGAR.", 0);
        InvalidateRect(hwnd, NULL, FALSE);
      } else {
        InvalidateRect(hwnd, NULL, FALSE);
      }
      return 0;
    }
    case WM_LBUTTONDOWN: {
      int x = GET_X_LPARAM(lp), y = GET_Y_LPARAM(lp);
      g_pressBtn = B_NONE;
      int id;
      if (btn_hit(x, y, &id)) {
        g_pressBtn = id;
        if (id == B_CLOSE) { DestroyWindow(hwnd); return 0; }
        if (id == B_MIN) { ShowWindow(hwnd, SW_MINIMIZE); return 0; }
        if (id == B_REFRESH) {
          if (g_bgPhase == 0) {
            launcher_set_status(L"verificando atualizacoes…", 0);
            start_fetch(hwnd);
            InvalidateRect(hwnd, NULL, FALSE);
          }
          return 0;
        }
        if (id == B_PLAY) {
          if (g_downloading && g_dlIndex == g_selIdx) return 0;
          Ver *v = g_selIdx >= 0 ? &g_vers[g_selIdx] : NULL;
          if (v && v->url[0] && !v->current && !v->installed && g_bgPhase == 0) {
            start_download(hwnd, g_selIdx);
            InvalidateRect(hwnd, NULL, FALSE);
            return 0;
          }
          if (v && (v->current || v->installed)) launcher_play();
          return 0;
        }
        if (id == B_ABOUT) {
          g_autoUpd = !g_autoUpd;
          InvalidateRect(hwnd, NULL, FALSE);
          return 0;
        }
        if (y < 46) { /* botões de janela/card não clicados → arrasta */
          ReleaseCapture();
          SendMessageW(hwnd, WM_NCLBUTTONDOWN, HTCAPTION, 0);
        }
        return 0;
      }
      if (y < 46) { /* drag no topo fora dos botões */
        ReleaseCapture();
        SendMessageW(hwnd, WM_NCLBUTTONDOWN, HTCAPTION, 0);
        return 0;
      }
      /* clique na lista */
      int ry = 62, y0 = ry + 50;
      int rowH = 56;
      int idx = (y - y0) / rowH + g_scroll;
      if (y >= y0 && idx >= 0 && idx < g_verCount && x >= 336) {
        launcher_select(idx);
        if (y - (y0 + idx * rowH - g_scroll * rowH) < rowH - 8) {
          /* selecionou */
        }
      }
      return 0;
    }
    case WM_LBUTTONUP:
      g_pressBtn = B_NONE;
      return 0;
    case WM_MOUSEMOVE: {
      int x = GET_X_LPARAM(lp), y = GET_Y_LPARAM(lp);
      int id;
      int old = g_hoverBtn, oldRow = g_hoverRow;
      g_hoverBtn = btn_hit(x, y, &id) ? id : B_NONE;
      int ry = 62, y0 = ry + 50;
      int rowH = 56;
      int rowIdx = -1;
      if (y >= y0 && x >= 336) {
        int k = (y - y0) / rowH;
        int idx = k + g_scroll;
        if (k >= 0 && idx >= 0 && idx < g_verCount) rowIdx = idx;
      }
      g_hoverRow = rowIdx;
      if (old != g_hoverBtn || oldRow != g_hoverRow)
        InvalidateRect(hwnd, NULL, FALSE);
      return 0;
    }
    case WM_MOUSEWHEEL: {
      int delta = GET_WHEEL_DELTA_WPARAM(wp);
      int vis = (g_listH - 58) / 56;
      if (vis < 1) vis = 1;
      int maxScroll = g_verCount - vis;
      if (maxScroll < 0) maxScroll = 0;
      g_scroll -= delta / 120;
      if (g_scroll < 0) g_scroll = 0;
      if (g_scroll > maxScroll) g_scroll = maxScroll;
      InvalidateRect(hwnd, NULL, FALSE);
      return 0;
    }
    case WM_SETCURSOR: {
      int id;
      POINT pt;
      GetCursorPos(&pt);
      ScreenToClient(hwnd, &pt);
      BOOL over = btn_hit(pt.x, pt.y, &id) ||
        (pt.y > 110 && pt.x >= 336 && g_hoverRow >= 0);
      SetCursor(LoadCursor(NULL, over ? IDC_HAND : IDC_ARROW));
      return 1;
    }
    case WM_KEYDOWN:
      if (wp == VK_ESCAPE || wp == 'Q') { DestroyWindow(hwnd); return 0; }
      if (wp == VK_RETURN) { /* joga selecionado */
        Ver *v = g_selIdx >= 0 ? &g_vers[g_selIdx] : NULL;
        if (v) {
          if (v->current || v->installed) launcher_play();
          else if (g_bgPhase == 0 && v->url[0]) start_download(hwnd, g_selIdx);
        }
        return 0;
      }
      if (wp == VK_UP) { if (g_selIdx > 0) launcher_select(g_selIdx - 1); return 0; }
      if (wp == VK_DOWN) { if (g_selIdx < g_verCount - 1) launcher_select(g_selIdx + 1); return 0; }
      return 0;
    case WM_CLOSE:
      DestroyWindow(hwnd);
      return 0;
    case WM_DESTROY:
      PostQuitMessage(0);
      return 0;
  }
  return DefWindowProcW(hwnd, msg, wp, lp);
}

/* --------------------------------------- entrada -------------------------- */
int WINAPI wWinMain(HINSTANCE hInst, HINSTANCE hPrev, PWSTR lpCmd, int nShow) {
  (void)hPrev;
  (void)nShow;
  g_hInst = hInst;
  /* DPI aware (opcional, só Windows 10+) */
  {
    HMODULE ud = LoadLibraryA("user32.dll");
    if (ud) {
      typedef BOOL(WINAPI *Fn)(int);
      Fn f = (Fn)(void *)GetProcAddress(ud, "SetProcessDpiAwarenessContext");
      if (f) f(-4); /* DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2 */
    }
  }
  fonts_init();
  ensure_appdir();

  int playMode = (wcsstr(lpCmd, L"--play") != NULL);

  WNDCLASSW wc;
  memset(&wc, 0, sizeof(wc));
  wc.hInstance = hInst;
  wc.hCursor = LoadCursor(NULL, IDC_ARROW);
  wc.hIcon = LoadIconW(hInst, MAKEINTRESOURCE(1));
  wc.lpfnWndProc = launcher_wndproc;
  wc.lpszClassName = L"GPGLauncherWnd";
  RegisterClassW(&wc);

  if (playMode) {
    char cls[64];
    char san[40];
    version_san(san, sizeof(san), GPG_VERSION);
    _snprintf(cls, sizeof(cls), "GPGPlay_%s", san);
    wchar_t wcls[80];
    MultiByteToWideChar(CP_UTF8, 0, cls, -1, wcls, 80);
    wc.lpfnWndProc = player_wndproc;
    wc.lpszClassName = wcls;
    if (!RegisterClassW(&wc)) {
      /* classe duplicada de outra instância: foca a janela existente */
      HWND ex = FindWindowW(wcls, NULL);
      if (ex) { ShowWindow(ex, SW_SHOW); SetForegroundWindow(ex); }
      return 0;
    }
    RECT wa;
    SystemParametersInfoW(SPI_GETWORKAREA, 0, &wa, 0);
    int cx = wa.left + (wa.right - wa.left - PW) / 2;
    int cy = wa.top + (wa.bottom - wa.top - PH) / 2;
    HWND hw = CreateWindowExW(WS_EX_APPWINDOW, wcls, L"Grand Pixel Game",
                              WS_POPUP | WS_VISIBLE,
                              cx, cy, PW, PH, NULL, NULL, hInst, NULL);
    if (!hw) return 1;
  } else {
    RECT wa;
    SystemParametersInfoW(SPI_GETWORKAREA, 0, &wa, 0);
    W = 980; H = 620;
    int cx = wa.left + (wa.right - wa.left - W) / 2;
    int cy = wa.top + (wa.bottom - wa.top - H) / 2;
    HWND hw = CreateWindowExW(0, L"GPGLauncherWnd", L"Grand Pixel Game — Launcher",
                              WS_POPUP | WS_VISIBLE,
                              cx, cy, W, H, NULL, NULL, hInst, NULL);
    if (!hw) return 1;
  }

  MSG msg;
  while (GetMessageW(&msg, NULL, 0, 0) > 0) {
    TranslateMessage(&msg);
    DispatchMessageW(&msg);
  }
  return 0;
}
