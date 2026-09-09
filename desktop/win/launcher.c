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
#include "zipstore.h"

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
  char url[700];         /* link do conteúdo (web.zip) desta versão */
  char name[160];
  long long size;        /* tamanho do conteúdo (0 = desconhecido) */
  int installed;         /* conteúdo presente em versions\<tag>\web */
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

static int version_installed_dir(const char *tag, wchar_t *out, size_t cap, int *any) {
  /* devolve em out o caminho versions\<tag>\web e 1 se tem index.html */
  ensure_verdir();
  wchar_t tagW[40];
  MultiByteToWideChar(CP_UTF8, 0, tag, -1, tagW, 40);
  wchar_t web[MAX_PATH * 2];
  _snwprintf(web, MAX_PATH * 2, L"%s\\versions\\%s\\web", g_appdirW, tagW);
  if (out) _snwprintf(out, cap, L"%s", web);
  wchar_t idx[MAX_PATH * 2];
  _snwprintf(idx, MAX_PATH * 2, L"%s\\index.html", web);
  *any = (GetFileAttributesW(idx) != INVALID_FILE_ATTRIBUTES);
  return *any;
}
static void find_installed(void) {
  ensure_verdir();
  for (int k = 0; k < g_verCount; k++) {
    int any = 0;
    version_installed_dir(g_vers[k].tag, NULL, 0, &any);
    g_vers[k].installed = any;
  }
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
            /* queremos o asset de conteúdo (web.zip) do jogo */
            if (!v.url[0] && ends_with(an, "-web.zip") && strstr(an, "GrandPixelGame-") && au[0]) {
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
        /* sem asset anexado: o conteúdo sempre está versionado na árvore da tag */
        _snprintf(v.url, sizeof(v.url),
                  "https://github.com/Arthurowgg/htmlgame/raw/refs/tags/%s/dist/GrandPixelGame-%s-web.zip",
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
  int extracted = -1;
  if (ok && g_dlJob.dest[0]) {
    /* extrai o conteúdo para versions\<tag>\web e remove o zip temporário */
    char zipA[MAX_PATH * 2], outA[MAX_PATH * 2];
    WideCharToMultiByte(CP_UTF8, 0, g_dlJob.dest, -1, zipA, sizeof(zipA), NULL, NULL);
    wchar_t webW[MAX_PATH * 2];
    int any = 0;
    version_installed_dir(g_dlJob.tag, webW, MAX_PATH * 2, &any);
    WideCharToMultiByte(CP_UTF8, 0, webW, -1, outA, sizeof(outA), NULL, NULL);
    wchar_t d1[MAX_PATH * 2], d2[MAX_PATH * 2];
    _snwprintf(d1, MAX_PATH * 2, L"%s\\versions", g_appdirW);
    CreateDirectoryW(d1, NULL);
    _snwprintf(d2, MAX_PATH * 2, L"%s\\versions\\%hs", g_appdirW, g_dlJob.tag);
    CreateDirectoryW(d2, NULL);
    CreateDirectoryW(webW, NULL);
    extracted = zip_extract_store(zipA, outA);
    DeleteFileW(g_dlJob.dest);
  }
  if (ok && extracted >= 0 && g_hwnd)
    PostMessageW(g_hwnd, WM_APP_DLDONE, 1, 0);
  else if (g_hwnd) {
    if (!ok) _snprintf(g_status, sizeof(g_status), "erro ao baixar %s: %ls", g_dlJob.tag, errW);
    else if (extracted < 0) _snprintf(g_status, sizeof(g_status),
                                      "erro ao instalar %s (arquivo corrompido?)", g_dlJob.tag);
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
  _snwprintf(g_dlJob.dest, MAX_PATH * 2, L"%s\\versions\\gpg-%hs.zip",
             g_appdirW, g_vers[idx].tag);
  MultiByteToWideChar(CP_UTF8, 0, g_vers[idx].url, -1, g_dlJob.url, 900);
  strncpy(g_dlJob.tag, g_vers[idx].tag, 23);
  g_downloading = 1;
  g_bgPhase = 2;
  g_dlGot = 0; g_dlTotal = 0;
  g_dlIndex = idx;
  { /* zera throttle de progresso */
    HWND zz = NULL; (void)zz;
  }
  _snprintf(g_status, sizeof(g_status), "baixando o conteúdo de %s…", g_vers[idx].tag);
  g_statusErr = 0;
  HANDLE h = CreateThread(NULL, 0, (LPTHREAD_START_ROUTINE)net_download, NULL, 0, NULL);
  if (h) { CloseHandle(h); g_netThread = h; }
  else { g_downloading = 0; g_bgPhase = 0; }
}

/* ------------------------------------------------------ servidor do jogo */
static SOCKET g_lsn = INVALID_SOCKET;
static volatile int g_serveStop = 0;
static HANDLE g_serveThread = NULL;
static char g_webRootA[1024] = "";   /* pasta do conteúdo ("" = embutido) */
static char g_srvVer[24] = GPG_VERSION;  /* versão sendo servida */

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
    char b[160];
    _snprintf(b, sizeof(b), "HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\n"
              "Cache-Control: no-store\r\nConnection: close\r\n\r\nGrandPixelGame %s",
              g_srvVer);
    send_all(c, b, strlen(b));
    closesocket(c);
    return;
  }
  if (strcmp(path, "/__gpg_quit__") == 0) {
    /* outra versão tomou a porta: avisa e encerra este processo */
    const char *r = "HTTP/1.1 200 OK\r\nContent-Length: 2\r\nConnection: close\r\n\r\nok";
    send_all(c, r, strlen(r));
    closesocket(c);
    g_serveStop = 1;
    ExitProcess(0);
  }
  /* caminho: remove query, decode %20 simples */
  char clean[1024];
  strncpy(clean, path, sizeof(clean) - 1);
  clean[sizeof(clean) - 1] = 0;
  char *q = strchr(clean, '?');
  if (q) *q = 0;
  if (strcmp(clean, "/") == 0) strcpy(clean, "/index.html");
  /* conteúdo vem de disco quando instalado; senão do embutido no .exe */
  const unsigned char *data = NULL;
  unsigned long dlen = 0;
  char diskPath[1200] = "";
  const struct gpg_asset *a = NULL;
  if (g_webRootA[0]) {
    /* impede escape de diretório */
    if (strstr(clean, "..") || strchr(clean, '\\')) {
      const char *r = "HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\nConnection: close\r\n\r\n";
      send_all(c, r, strlen(r));
      closesocket(c);
      return;
    }
    _snprintf(diskPath, sizeof(diskPath), "%s%s", g_webRootA, clean);
    FILE *f = fopen(diskPath, "rb");
    if (f) {
      fseek(f, 0, SEEK_END);
      long fs = ftell(f);
      rewind(f);
      if (fs > 0 && fs < (8L << 20)) {
        unsigned char *m = (unsigned char *)malloc((size_t)fs);
        if (m && fread(m, 1, (size_t)fs, f) == (size_t)fs) { data = m; dlen = (unsigned long)fs; }
        else free(m);
      }
      fclose(f);
      if (!data) {
        const char *r = "HTTP/1.1 500 Internal Server Error\r\nContent-Length: 0\r\nConnection: close\r\n\r\n";
        send_all(c, r, strlen(r));
        closesocket(c);
        return;
      }
    }
  } else {
    a = find_asset(clean);
    if (a) { data = a->data; dlen = (unsigned long)a->size; }
  }
  if (!data) {
    const char *r = "HTTP/1.1 404 Not Found\r\nContent-Type: text/plain\r\n"
                    "Connection: close\r\n\r\n404";
    send_all(c, r, strlen(r));
    closesocket(c);
    return;
  }
  char head[512];
  _snprintf(head, sizeof(head),
            "HTTP/1.1 200 OK\r\nContent-Type: %s\r\nContent-Length: %lu\r\n"
            "Cache-Control: no-cache\r\nConnection: close\r\nAccess-Control-Allow-Origin: *\r\n\r\n",
            mime_of(clean), dlen);
  send_all(c, head, strlen(head));
  if (strcmp(method, "HEAD") != 0) send_all(c, (const char *)data, dlen);
  if (g_webRootA[0] && data) free((void *)data);
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
/* envia pedido cru para o servidor local; 1 se conectou e enviou */
static int http_local_raw(const char *request_path) {
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
    struct timeval tv = { 2, 0 };
    if (select(0, NULL, &wf, NULL, &tv) > 0) {
      int soerr = 0; int sl = sizeof(soerr);
      getsockopt(s, SOL_SOCKET, SO_ERROR, (char *)&soerr, &sl);
      if (soerr == 0) {
        char req[320];
        _snprintf(req, sizeof(req),
                  "GET %s HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n",
                  request_path);
        send(s, req, (int)strlen(req), 0);
        ok = 1;
      }
    }
  }
  closesocket(s);
  return ok;
}
/* pede ao servidor de OUTRA versão que se encerre (libera a porta) */
static void request_quit_server(void) {
  http_local_raw("/__gpg_quit__");
  Sleep(900);
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
/* janela própria (modo app) via Edge — cara de aplicativo de verdade */
static int open_edge_app(void) {
  const wchar_t *envs[2] = { L"ProgramFiles(x86)", L"ProgramFiles" };
  for (int i = 0; i < 2; i++) {
    wchar_t pf[1024];
    DWORD n = GetEnvironmentVariableW(envs[i], pf, 1024);
    if (n == 0 || n >= 1024) continue;
    wchar_t edge[1100];
    _snwprintf(edge, 1100, L"%s\\Microsoft\\Edge\\Application\\msedge.exe", pf);
    if (GetFileAttributesW(edge) == INVALID_FILE_ATTRIBUTES) continue;
    HINSTANCE r = ShellExecuteW(NULL, L"open", edge,
                                L"--app=http://127.0.0.1:8137/ --window-size=1280,800",
                                NULL, SW_SHOWNORMAL);
    if ((INT_PTR)r > 32) return 1;
  }
  return 0;
}
static void open_game_window(void) {
  if (!open_edge_app()) open_browser();
}
/* ============================================================
 * UI — launcher (janela principal) e player (janela do jogo)
 * Versão bonita: double-buffer, gradientes, estrelas, ícones
 * vetoriais, spinner, badges e estados de hover.
 * ============================================================ */
#define C_BG1      RGB(11, 9, 22)
#define C_BG2      RGB(27, 20, 50)
#define C_CARD1    RGB(30, 25, 54)
#define C_CARD2    RGB(20, 17, 38)
#define C_CARD_SEL RGB(52, 43, 86)
#define C_LINE     RGB(62, 51, 105)
#define C_LINE_SOFT RGB(42, 35, 74)
#define C_GOLD     RGB(255, 215, 106)
#define C_GOLD_L   RGB(255, 233, 168)
#define C_GOLD_D   RGB(226, 165, 62)
#define C_GOLD_DK  RGB(96, 70, 24)
#define C_TXT      RGB(240, 235, 255)
#define C_MUT      RGB(163, 154, 205)
#define C_DIM      RGB(115, 106, 155)
#define C_GREEN    RGB(142, 226, 158)
#define C_CYAN     RGB(140, 228, 255)
#define C_RED      RGB(255, 125, 140)
#define C_BTN_TXT  RGB(48, 30, 4)

static HINSTANCE g_hInst;
static int W = 1024, H = 672;
static int PW = 500, PH = 254;

/* fontes */
enum { FT_MICRO, FT_TINY, FT_SMALL, FT_SMALLB, FT_NORM, FT_BOLD, FT_MID, FT_BIG, FT_HUGE, FT_LOGO, FT_COUNT };
static HFONT g_f[FT_COUNT];
static void fonts_init(void) {
  static const int px[FT_COUNT] = { 15, 17, 20, 20, 23, 23, 30, 44, 60, 33 };
  static const int wt[FT_COUNT] = { FW_NORMAL, FW_NORMAL, FW_NORMAL, FW_SEMIBOLD, FW_NORMAL, FW_BOLD, FW_BOLD, FW_BOLD, FW_BLACK, FW_BOLD };
  for (int i = 0; i < FT_COUNT; i++) {
    g_f[i] = CreateFontW(-px[i], 0, 0, 0, wt[i], 0, 0, 0, DEFAULT_CHARSET,
                         OUT_DEFAULT_PRECIS, CLIP_DEFAULT_PRECIS, CLEARTYPE_QUALITY,
                         DEFAULT_PITCH | FF_DONTCARE, L"Segoe UI");
    if (!g_f[i]) g_f[i] = (HFONT)GetStockObject(DEFAULT_GUI_FONT);
  }
}

/* estado */
enum { B_NONE = -1, B_MIN, B_CLOSE, B_REFRESH, B_PLAY, B_OPEN, B_AUTOUPD, B_SITE };
typedef struct { int id; RECT r; } Btn;
static Btn g_btns[16];
static int g_btnCount = 0;
static int g_hoverBtn = B_NONE, g_pressBtn = B_NONE;
static int g_hoverRow = -1;
static int g_selIdx = -1;
static int g_scroll = 0;
static int g_autoUpd = 1;
static int g_aniPhase = 0;
static int g_lastW = 0, g_lastH = 0;
static wchar_t g_statusW[420];
static int g_aboutTip = 0;

static void btn_add(int id, int x, int y, int w, int h) {
  if (g_btnCount >= 16) return;
  Btn *b = &g_btns[g_btnCount++];
  b->id = id;
  SetRect(&b->r, x, y, x + w, y + h);
}
static int btn_hit(int x, int y, int *id) {
  for (int i = 0; i < g_btnCount; i++)
    if (PtInRect(&g_btns[i].r, *(POINT *)&(POINT){ x, y })) { *id = g_btns[i].id; return 1; }
  return 0;
}

/* ------------------------------ primitivas ------------------------------ */
static void fill_rect(HDC h, int x, int y, int w, int hh, COLORREF c) {
  RECT r = { x, y, x + w, y + hh };
  HBRUSH br = CreateSolidBrush(c);
  FillRect(h, &r, br);
  DeleteObject(br);
}
static void grad_v(HDC h, int x, int y, int w, int hh, COLORREF a, COLORREF b) {
  if (hh <= 0 || w <= 0) return;
  for (int i = 0; i < hh; i++) {
    double t = (double)i / (hh - 1);
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
static void text_shadow(HDC h, const wchar_t *s, int x, int y, int w, int hh, COLORREF c, HFONT f,
                        UINT fmt, int tracking, COLORREF sh, int dy) {
  text_w(h, s, x + 1, y + dy, w, hh, sh, f, fmt, tracking);
  text_w(h, s, x, y, w, hh, c, f, fmt, tracking);
}
static int text_wid(HDC h, const wchar_t *s, HFONT f) {
  SelectObject(h, f);
  SIZE sz;
  GetTextExtentPoint32W(h, s, (int)wcslen(s), &sz);
  return sz.cx;
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
static void line(HDC h, int x1, int y1, int x2, int y2, COLORREF c, int wpx) {
  HPEN pn = CreatePen(PS_SOLID, wpx, c);
  HGDIOBJ ob = SelectObject(h, pn);
  MoveToEx(h, x1, y1, NULL);
  LineTo(h, x2, y2);
  SelectObject(h, ob);
  DeleteObject(pn);
}
static void star_poly(HDC h, int cx, int cy, int R, COLORREF c) {
  POINT p[10];
  for (int i = 0; i < 10; i++) {
    double a = 3.14159265 / 2 + i * 3.14159265 / 5;
    double rr = (i % 2 == 0) ? R : R * 0.42;
    p[i].x = (int)(cx + cos(a) * rr);
    p[i].y = (int)(cy - sin(a) * rr);
  }
  poly_pts(h, 10, p, c);
}
static void play_tri(HDC h, int cx, int cy, int r, COLORREF c) {
  POINT p[3];
  p[0].x = cx - (int)(r * 0.45); p[0].y = cy - r;
  p[1].x = cx - (int)(r * 0.45); p[1].y = cy + r;
  p[2].x = cx + r;               p[2].y = cy;
  poly_pts(h, 3, p, c);
}
static void draw_check(HDC h, int cx, int cy, int s, COLORREF c) {
  line(h, cx - s, cy, cx - s / 3, cy + s / 2, c, 3);
  line(h, cx - s / 3, cy + s / 2, cx + s, cy - s / 2, c, 3);
}
static void draw_arrow_down(HDC h, int cx, int cy, int s, COLORREF c) {
  line(h, cx, cy - s, cx, cy + s - 2, c, 2);
  line(h, cx - s + 2, cy + s / 2 - 2, cx, cy + s, c, 2);
  line(h, cx + s - 2, cy + s / 2 - 2, cx, cy + s, c, 2);
}
static void draw_circle(HDC h, int cx, int cy, int r, COLORREF c, int wpx) {
  HPEN pn = CreatePen(PS_SOLID, wpx, c);
  HGDIOBJ ob = SelectObject(h, pn);
  HGDIOBJ bb = SelectObject(h, GetStockObject(NULL_BRUSH));
  Ellipse(h, cx - r, cy - r, cx + r, cy + r);
  SelectObject(h, bb);
  SelectObject(h, ob);
  DeleteObject(pn);
}
static void draw_spinner(HDC h, int cx, int cy, int r, int phase) {
  /* arco girando: 8 segmentos, mais brilhantes na frente */
  for (int k = 0; k < 8; k++) {
    double a0 = (phase + k * 45) * 3.14159265 / 180.0;
    double a1 = a0 + 0.5;
    int bright = (k + 6) % 8; /* pico atrás */
    double t = bright / 7.0;
    COLORREF c = RGB((int)(90 + 165 * t), (int)(70 + 145 * t), (int)(30 + 60 * t));
    POINT pp[9];
    for (int i = 0; i <= 8; i++) {
      double a = a0 + (a1 - a0) * i / 8.0;
      pp[i].x = (int)(cx + cos(a) * r);
      pp[i].y = (int)(cy + sin(a) * r);
    }
    HPEN pn = CreatePen(PS_SOLID, 3, c);
    HGDIOBJ ob = SelectObject(h, pn);
    HGDIOBJ bb = SelectObject(h, GetStockObject(NULL_BRUSH));
    Polyline(h, pp, 9);
    SelectObject(h, bb);
    SelectObject(h, ob);
    DeleteObject(pn);
  }
}
static void draw_starfield(HDC h, int w, int hh) {
  srand(20260908);
  for (int i = 0; i < 130; i++) {
    int x = rand() % w, y = rand() % (hh * 2 / 3);
    int b = rand() % 100;
    int s = (b > 88) ? 2 : 1;
    int v = 70 + b;
    fill_rect(h, x, y, s, s, RGB(v / 2, v / 2, v));
  }
}

/* --------------------------- texto do status --------------------------- */
static void status_set(const wchar_t *s, int err) {
  wcsncpy(g_statusW, s, 419);
  g_statusW[419] = 0;
  g_statusErr = err;
}

/* --------------------------- seleção / lista --------------------------- */
static int ver_installed(const char *tag) {
  int any = 0;
  version_installed_dir(tag, NULL, 0, &any);
  return any;
}
static void refresh_rows(void) {
  for (int i = 0; i < g_verCount; i++) {
    char full[24];
    _snprintf(full, sizeof(full), "v%s", GPG_VERSION);
    g_vers[i].current = strcmp(g_vers[i].tag, full) == 0;
    g_vers[i].installed = ver_installed(g_vers[i].tag);
  }
  if (g_selIdx < 0 || g_selIdx >= g_verCount) {
    g_selIdx = 0;
    for (int i = 0; i < g_verCount; i++)
      if (g_vers[i].current || g_vers[i].installed) { g_selIdx = i; break; }
  }
  g_scroll = 0;
}
static void select_row(int idx) {
  if (idx < 0 || idx >= g_verCount) return;
  g_selIdx = idx;
  InvalidateRect(g_hwnd, NULL, FALSE);
}

static int g_autoPlayAfter = 0;   /* ao terminar download, já abre o jogo */

/* ------------------------------ JOGAR / DL ------------------------------ */
/* inicia a versão selecionada num processo jogador (janela própria). */
static void spawn_player(const char *tag) {
  wchar_t exe[MAX_PATH * 2];
  GetModuleFileNameW(NULL, exe, MAX_PATH * 2);
  wchar_t cmd[MAX_PATH * 2 + 40];
  if (tag && tag[0] && strcmp(tag, "v" GPG_VERSION) != 0)
    _snwprintf(cmd, MAX_PATH * 2 + 40, L"\"%s\" --play --ver %hs", exe, tag);
  else
    _snwprintf(cmd, MAX_PATH * 2 + 40, L"\"%s\" --play", exe);
  STARTUPINFOW si;
  PROCESS_INFORMATION pi;
  memset(&si, 0, sizeof(si));
  si.cb = sizeof(si);
  memset(&pi, 0, sizeof(pi));
  if (CreateProcessW(exe, cmd, NULL, NULL, FALSE, 0, NULL, NULL, &si, &pi)) {
    CloseHandle(pi.hThread);
    CloseHandle(pi.hProcess);
  } else {
    wchar_t m[400];
    _snwprintf(m, 400, L"Não consegui iniciar o jogo (erro %lu).\n"
               L"Tente abrir o .exe direto ou baixar de novo.", GetLastError());
    MessageBoxW(g_hwnd, m, L"Grand Pixel Game", MB_OK | MB_ICONERROR);
  }
}
static void play_launcher(void) {
  if (g_selIdx < 0 || g_selIdx >= g_verCount) return;
  Ver *v = &g_vers[g_selIdx];
  if (!v->current && !v->installed) return;
  spawn_player(v->tag);
  wchar_t st[260];
  _snwprintf(st, 260, L"abrindo %hs em janela própria — boa jornada!", v->tag);
  status_set(st, 0);
  ShowWindow(g_hwnd, SW_MINIMIZE);
}

/* ------------------------------ layout ------------------------------ */
#define LV_X0  24          /* card esquerdo */
#define LV_Y0  78
#define LV_W   336
#define RV_X0  384         /* card direito */
#define RV_W   (W - 384 - 24)
#define CARD_H (H - 78 - 78)   /* 78 topo + 78 rodapé */

static void layout_ui(void) {
  g_btnCount = 0;
  /* topo: min + fechar (à direita), 56px de altura */
  btn_add(B_MIN,   W - 92, 0, 46, 58);
  btn_add(B_CLOSE, W - 46, 0, 46, 58);
  /* card esquerdo */
  btn_add(B_PLAY, LV_X0 + 20, LV_Y0 + CARD_H - 74, LV_W - 40, 56);
  btn_add(B_AUTOUPD, LV_X0 + 16, LV_Y0 + CARD_H - 110, LV_W - 32, 30);
  btn_add(B_SITE, LV_X0 + 20, LV_Y0 + 16, 0, 0); /* logo clicável → projeto */
  g_btns[g_btnCount - 1].r.left = LV_X0 + 18; g_btns[g_btnCount - 1].r.top = LV_Y0 + 12;
  g_btns[g_btnCount - 1].r.right = LV_X0 + 240; g_btns[g_btnCount - 1].r.bottom = LV_Y0 + 46;
  /* card direito: botão verificar no cabeçalho */
  btn_add(B_REFRESH, RV_X0 + RV_W - 122, LV_Y0 + 16, 100, 26);
}

/* ------------------------------ paint: launcher ------------------------------ */
static COLORREF badge_colors(int kind, int *bg, int *fg) {
  /* kind 0 instalada (verde), 1 este exe (ciano), 2 nova (dourado) */
  if (kind == 1) { *fg = (int)C_CYAN;  *bg = (int)RGB(24, 58, 82); }
  else if (kind == 0) { *fg = (int)C_GREEN; *bg = (int)RGB(20, 56, 38); }
  else { *fg = (int)C_GOLD; *bg = (int)RGB(86, 62, 20); }
  return 0;
}
static int ver_kind(Ver *v) {
  if (v->current) return 1;
  if (v->installed) return 0;
  return 2;
}
static void paint_launcher(HDC hdc) {
  /* ---------------- fundo ---------------- */
  grad_v(hdc, 0, 0, W, H, C_BG1, C_BG2);
  draw_starfield(hdc, W, H);
  fill_rect(hdc, 0, 0, W, 3, C_GOLD_D);
  /* brilho suave no topo */
  for (int i = 0; i < 90; i++) {
    int a = 26 - (int)(26.0 * i / 90.0);
    if (a <= 0) break;
    fill_rect(hdc, 0, 0, W, 1, RGB(60 + a, 48 + a, 96 + a * 2 > 255 ? 255 : 96 + a * 2));
  }

  /* ---------------- cabeçalho ---------------- */
  star_poly(hdc, 40, 30, 12, C_GOLD);
  text_shadow(hdc, L"GRAND PIXEL GAME", 62, 8, 560, 34, C_GOLD, g_f[FT_LOGO],
              DT_LEFT | DT_VCENTER | DT_SINGLELINE, 7, RGB(0, 0, 0), 2);
  {
    wchar_t v[64];
    _snwprintf(v, 64, L"LAUNCHER  v%hs", GPG_VERSION);
    text_w(hdc, v, 470, 14, 300, 26, C_MUT, g_f[FT_TINY], DT_RIGHT | DT_VCENTER | DT_SINGLELINE, 3);
  }
  /* botões de janela */
  for (int i = 0; i < g_btnCount; i++) {
    Btn *b = &g_btns[i];
    if (b->id != B_MIN && b->id != B_CLOSE) continue;
    int hot = g_hoverBtn == b->id && g_pressBtn != b->id;
    int x = b->r.left, y = b->r.top, w = b->r.right - b->r.left, hh = b->r.bottom - b->r.top;
    if (b->id == B_CLOSE && hot) round_fill(hdc, x + 4, y + 12, w - 8, hh - 20, 14, RGB(150, 40, 50));
    else if (hot) round_fill(hdc, x + 4, y + 12, w - 8, hh - 20, 14, RGB(70, 60, 105));
    int cx = x + w / 2, cy = y + 12 + (hh - 20) / 2;
    if (b->id == B_MIN) line(hdc, cx - 6, cy, cx + 6, cy, hot ? C_TXT : C_MUT, 2);
    else { line(hdc, cx - 5, cy - 5, cx + 5, cy + 5, hot ? C_TXT : C_MUT, 2);
           line(hdc, cx + 5, cy - 5, cx - 5, cy + 5, hot ? C_TXT : C_MUT, 2); }
  }

  /* ---------------- card esquerdo: seleção ---------------- */
  int lx = LV_X0, ly = LV_Y0, lw = LV_W, lh = CARD_H;
  grad_round(hdc, lx, ly, lw, lh, 20, C_CARD1, C_CARD2);
  round_stroke(hdc, lx, ly, lw, lh, 20, C_LINE, 1);
  round_stroke(hdc, lx + 1, ly + 1, lw - 2, lh - 2, 19, RGB(80, 66, 120), 1);

  text_w(hdc, L"VERSÃO SELECIONADA", lx + 22, ly + 22, 220, 18, C_GOLD_D, g_f[FT_MICRO],
         DT_LEFT | DT_SINGLELINE, 4);

  Ver *v = (g_selIdx >= 0 && g_selIdx < g_verCount) ? &g_vers[g_selIdx] : NULL;
  if (v) {
    wchar_t big[40];
    _snwprintf(big, 40, L"%hs", v->tag);
    text_shadow(hdc, big, lx + 20, ly + 46, lw - 40, 58, C_TXT, g_f[FT_HUGE],
                DT_LEFT | DT_SINGLELINE, 2, RGB(0, 0, 0), 2);

    /* badge */
    int kind = ver_kind(v);
    const wchar_t *bd = kind == 1 ? L"ESTE EXE" : (kind == 0 ? L"INSTALADA" : L"NOVA");
    int tw = text_wid(hdc, bd, g_f[FT_SMALLB]);
    int bx = lx + 22, by = ly + 108;
    int bgc, fgc;
    badge_colors(kind, &bgc, &fgc);
    round_fill(hdc, bx, by, tw + 22, 26, 13, (COLORREF)bgc);
    round_stroke(hdc, bx, by, tw + 22, 26, 13, C_LINE, 1);
    text_w(hdc, bd, bx, by - 1, tw + 22, 26, (COLORREF)fgc, g_f[FT_SMALLB],
           DT_CENTER | DT_VCENTER | DT_SINGLELINE, 0);
    if (kind == 2) draw_arrow_down(hdc, bx + tw + 34, by + 13, 7, C_GOLD);

    /* datas e tamanho */
    wchar_t d[80];
    if (v->date[0]) {
      _snwprintf(d, 80, L"publicada em %hs", v->date);
      text_w(hdc, d, lx + 22, ly + 146, lw - 44, 20, C_MUT, g_f[FT_SMALL], DT_LEFT | DT_SINGLELINE, 0);
    }
    if (v->size > 0) {
      _snwprintf(d, 80, L"%.1f MB  ·  jogo completo embutido", v->size / 1048576.0);
      text_w(hdc, d, lx + 22, ly + 168, lw - 44, 20, C_DIM, g_f[FT_SMALL], DT_LEFT | DT_SINGLELINE, 0);
    }
    fill_rect(hdc, lx + 22, ly + 198, lw - 44, 1, C_LINE_SOFT);

    RECT box = { lx + 22, ly + 212, lx + lw - 22, ly + 346 };
    text_w(hdc, L"Um único executável: jogo completo, servidor local e\n"
                L"atualização pelo GitHub. Baixa qualquer versão\n"
                L"publicada e abre o jogo no navegador.",
           box.left, box.top, box.right - box.left, box.bottom - box.top,
           C_MUT, g_f[FT_SMALL], DT_LEFT | DT_WORDBREAK, 0);
  }

  /* checkbox auto-atualização */
  {
    int ax = lx + 22, ay = ly + lh - 128;
    int chk = g_autoUpd;
    draw_circle(hdc, ax + 9, ay + 7, 9, chk ? C_GOLD : C_LINE, 2);
    if (chk) { fill_rect(hdc, ax + 5, ay + 3, 9, 9, C_GOLD);
      /* check */
      line(hdc, ax + 7, ay + 7, ax + 10, ay + 10, RGB(40, 26, 4), 2);
      line(hdc, ax + 10, ay + 10, ax + 15, ay + 3, RGB(40, 26, 4), 2); }
    int hot = g_hoverBtn == B_AUTOUPD && g_pressBtn != B_AUTOUPD;
    text_w(hdc, L"atualização automática", ax + 26, ay - 7, 240, 24, chk ? C_TXT : C_MUT,
           g_f[FT_SMALL], DT_LEFT | DT_VCENTER | DT_SINGLELINE, 0);
    if (hot) text_w(hdc, L"quando houver versão nova, baixa e instala sozinho",
                    lx + 22, ay + 20, lw - 44, 18, C_DIM, g_f[FT_MICRO],
                    DT_LEFT | DT_SINGLELINE, 0);
  }

  /* botão principal JOGAR / BAIXAR */
  {
    Btn *b = NULL;
    for (int i = 0; i < g_btnCount; i++) if (g_btns[i].id == B_PLAY) { b = &g_btns[i]; break; }
    if (b) {
      int bx = b->r.left, by = b->r.top, bw = b->r.right - b->r.left, bh = b->r.bottom - b->r.top;
      int canPlay = v && (v->current || v->installed);
      int needDl = v && !v->current && !v->installed && v->url[0];
      int hot = g_hoverBtn == B_PLAY && g_pressBtn != B_PLAY;
      if (canPlay) {
        grad_round(hdc, bx, by, bw, bh, 16, hot ? RGB(255, 240, 190) : C_GOLD_L,
                   hot ? C_GOLD : C_GOLD_D);
        /* brilho superior */
        HRGN rg = CreateRoundRectRgn(bx, by, bx + bw + 1, by + bh + 1, 16, 16);
        SelectClipRgn(hdc, rg);
        for (int i = 0; i < 14; i++) {
          fill_rect(hdc, bx, by + i, bw, 1,
                    RGB(255, 255, 255 - i * 6 > 190 ? 255 : 255 - (int)(i * 5)));
        }
        SelectClipRgn(hdc, NULL);
        DeleteObject(rg);
        round_stroke(hdc, bx, by, bw, bh, 16, RGB(255, 246, 214), 1);
        play_tri(hdc, bx + 42, by + bh / 2, 11, C_BTN_TXT);
        text_w(hdc, L"JOGAR", bx + 44, by + (g_pressBtn == B_PLAY ? 2 : 0), bw - 60, bh,
               C_BTN_TXT, g_f[FT_MID], DT_CENTER | DT_VCENTER | DT_SINGLELINE, 5);
      } else if (needDl) {
        grad_round(hdc, bx, by, bw, bh, 16, hot ? RGB(56, 66, 122) : RGB(40, 46, 92),
                   hot ? RGB(48, 56, 104) : RGB(28, 33, 66));
        round_stroke(hdc, bx, by, bw, bh, 16, hot ? C_GOLD : C_GOLD_D, 1);
        text_w(hdc, L"BAIXAR E INSTALAR", bx + 24, by + (g_pressBtn == B_PLAY ? 2 : 0),
               bw - 48, bh, C_GOLD, g_f[FT_BOLD], DT_CENTER | DT_VCENTER | DT_SINGLELINE, 2);
        draw_arrow_down(hdc, bx + 44, by + bh / 2, 8, C_GOLD);
      } else {
        grad_round(hdc, bx, by, bw, bh, 16, RGB(52, 47, 76), RGB(40, 36, 62));
        text_w(hdc, L"…", bx, by, bw, bh, C_DIM, g_f[FT_MID], DT_CENTER | DT_VCENTER | DT_SINGLELINE, 0);
      }
    }
  }

  /* ---------------- card direito: lista ---------------- */
  int rx = RV_X0, ry = LV_Y0, rw = RV_W, rh = CARD_H;
  grad_round(hdc, rx, ry, rw, rh, 20, RGB(27, 22, 48), RGB(18, 15, 34));
  round_stroke(hdc, rx, ry, rw, rh, 20, C_LINE, 1);
  round_stroke(hdc, rx + 1, ry + 1, rw - 2, rh - 2, 19, RGB(74, 60, 116), 1);

  text_w(hdc, L"VERSÕES NO GITHUB", rx + 22, ry + 18, 260, 18, C_MUT, g_f[FT_MICRO],
         DT_LEFT | DT_SINGLELINE, 4);
  {
    wchar_t cnt[24];
    _snwprintf(cnt, 24, L"%d", g_verCount);
    int tw = text_wid(hdc, cnt, g_f[FT_SMALLB]);
    round_fill(hdc, rx + 172, ry + 14, tw + 16, 22, 11, RGB(52, 44, 90));
    text_w(hdc, cnt, rx + 172, ry + 13, tw + 16, 22, C_TXT, g_f[FT_SMALLB],
           DT_CENTER | DT_VCENTER | DT_SINGLELINE, 0);
  }
  /* botão verificar */
  {
    int hx = rx + rw - 122, hy = ry + 12;
    int hot = g_hoverBtn == B_REFRESH && g_pressBtn != B_REFRESH;
    int busy = g_fetching || g_downloading;
    round_fill(hdc, hx, hy, 100, 28, 14, hot ? RGB(62, 54, 100) : RGB(36, 31, 62));
    if (busy) draw_spinner(hdc, hx + 16, hy + 14, 8, g_aniPhase);
    text_w(hdc, busy ? L"verificando" : L"verificar agora", hx + (busy ? 32 : 0), hy - 1,
           100 - (busy ? 30 : 0), 28, hot ? C_TXT : C_MUT, g_f[FT_SMALL],
           DT_CENTER | DT_VCENTER | DT_SINGLELINE, 0);
    if (hot) fill_rect(hdc, hx, hy + 26, 100, 2, C_GOLD_D);
  }

  /* linhas */
  int rowH = 62;
  int yTop = ry + 56;
  int visRows = (rh - 56 - 10) / rowH;
  if (visRows < 1) visRows = 1;
  int maxScroll = g_verCount - visRows;
  if (maxScroll < 0) maxScroll = 0;
  if (g_scroll > maxScroll) g_scroll = maxScroll;
  if (g_scroll < 0) g_scroll = 0;

  for (int i = 0; i < visRows; i++) {
    int idx = i + g_scroll;
    if (idx >= g_verCount) break;
    Ver *vv = &g_vers[idx];
    int y = yTop + i * rowH;
    int isSel = idx == g_selIdx;
    int isHot = idx == g_hoverRow && !isSel;
    int kind = ver_kind(vv);
    if (isSel) {
      grad_round(hdc, rx + 12, y, rw - 24, rowH - 10, 14, C_CARD_SEL, RGB(42, 35, 72));
      round_stroke(hdc, rx + 12, y, rw - 24, rowH - 10, 14, C_GOLD_D, 1);
    } else if (isHot) {
      round_fill(hdc, rx + 12, y, rw - 24, rowH - 10, 14, RGB(44, 38, 74));
    }
    /* rádio */
    int cx = rx + 38, cy = y + (rowH - 10) / 2;
    draw_circle(hdc, cx, cy, 8, isSel ? C_GOLD : RGB(90, 80, 130), isSel ? 2 : 1);
    if (isSel) fill_rect(hdc, cx - 3, cy - 3, 7, 7, C_GOLD);
    /* tag */
    wchar_t tg[40];
    _snwprintf(tg, 40, L"%hs", vv->tag);
    text_w(hdc, tg, cx + 22, y, 130, rowH - 12, isSel ? C_TXT : RGB(216, 208, 240),
           g_f[FT_MID], DT_LEFT | DT_VCENTER | DT_SINGLELINE, 0);
    /* sub: data + tamanho */
    wchar_t sub[90];
    _snwprintf(sub, 90, L"%hs  ·  %s", vv->date[0] ? vv->date : "?",
               vv->size > 0 ? "" : "");
    if (vv->size > 0) _snwprintf(sub, 90, L"%hs  ·  %.1f MB", vv->date[0] ? vv->date : "?",
                                 vv->size / 1048576.0);
    else _snwprintf(sub, 90, L"%hs", vv->date[0] ? vv->date : "");
    text_w(hdc, sub, cx + 24, y + 28, 200, 18, C_DIM, g_f[FT_MICRO],
           DT_LEFT | DT_VCENTER | DT_SINGLELINE, 0);
    /* badge à direita */
    if (kind != 2 || vv->url[0]) {
      const wchar_t *bd = kind == 1 ? L"ESTE EXE" : (kind == 0 ? L"INSTALADA" : L"NOVA");
      int tw = text_wid(hdc, bd, g_f[FT_MICRO]);
      int bgc, fgc;
      badge_colors(kind, &bgc, &fgc);
      int bx = rx + rw - 12 - 14 - tw - 18;
      round_fill(hdc, bx, cy - 11, tw + 18, 22, 11, (COLORREF)bgc);
      text_w(hdc, bd, bx, cy - 12, tw + 18, 22, (COLORREF)fgc, g_f[FT_MICRO],
             DT_CENTER | DT_VCENTER | DT_SINGLELINE, 0);
    }
    if (i < visRows - 1 && idx + 1 < g_verCount)
      fill_rect(hdc, rx + 34, y + rowH - 8, rw - 68, 1, RGB(38, 32, 64));
  }
  if (g_verCount == 0) {
    text_w(hdc, g_fetching ? L"consultando o GitHub…" :
           (g_fetchFailed ? L"sem conexão — verifique sua internet" : L"nenhuma versão encontrada"),
           rx + 24, yTop + 22, rw - 48, 30, C_MUT, g_f[FT_NORM],
           DT_CENTER | DT_SINGLELINE, 0);
  }
  /* scrollbar */
  if (maxScroll > 0) {
    int sh = rh - 56 - 10;
    int th = sh / (maxScroll + 1);
    if (th < 26) th = 26;
    int ty = yTop + g_scroll * (sh - th) / maxScroll;
    round_fill(hdc, rx + rw - 12, ty, 5, th, 2, g_hoverRow >= 0 ? C_MUT : C_DIM);
  }

  /* legenda */
  {
    int lgy = ry + rh - 28;
    int x = rx + 22;
    const wchar_t *items[3] = { L"NOVA", L"INSTALADA", L"ESTE EXE" };
    int cols[3][2] = { { 86, 62, 20 }, { 20, 56, 38 }, { 24, 58, 82 } };
    int fgs[3] = { (int)C_GOLD, (int)C_GREEN, (int)C_CYAN };
    for (int k = 0; k < 3; k++) {
      int tw = text_wid(hdc, items[k], g_f[FT_MICRO]);
      round_fill(hdc, x, lgy, tw + 14, 18, 9, RGB(cols[k][0], cols[k][1], cols[k][2]));
      text_w(hdc, items[k], x, lgy - 1, tw + 14, 18, (COLORREF)fgs[k], g_f[FT_MICRO],
             DT_CENTER | DT_VCENTER | DT_SINGLELINE, 0);
      x += tw + 24;
    }
    text_w(hdc, L"→ selecione e clique em JOGAR", x, lgy - 1, rw - x + rx - 60, 18,
           C_DIM, g_f[FT_MICRO], DT_LEFT | DT_VCENTER | DT_SINGLELINE, 0);
  }

  /* ---------------- rodapé ---------------- */
  int fy = H - 56;
  fill_rect(hdc, 0, fy - 10, W, 1, RGB(40, 33, 70));
  if (g_downloading) {
    draw_spinner(hdc, 32, fy + 24, 9, g_aniPhase);
    wchar_t st[240];
    double pct = g_dlTotal > 0 ? (double)g_dlGot / g_dlTotal : 0;
    _snwprintf(st, 240, L"baixando %hs …  %d%%", g_dlJob.tag, (int)(pct * 100));
    text_w(hdc, st, 54, fy + 6, 330, 30, C_TXT, g_f[FT_SMALLB], DT_LEFT | DT_VCENTER | DT_SINGLELINE, 0);
    int bx = 420, bw = W - 420 - 240;
    round_fill(hdc, bx, fy + 17, bw, 14, 7, RGB(24, 21, 44));
    round_stroke(hdc, bx, fy + 17, bw, 14, 7, RGB(52, 44, 90), 1);
    int fw = (int)(bw * pct);
    if (fw > 4) {
      HRGN rg = CreateRoundRectRgn(bx, fy + 17, bx + fw, fy + 31, 14, 14);
      SelectClipRgn(hdc, rg);
      grad_v(hdc, bx, fy + 17, fw, 14, C_GOLD_L, C_GOLD_D);
      SelectClipRgn(hdc, NULL);
      DeleteObject(rg);
    }
    wchar_t mb[50];
    if (g_dlTotal > 0) _snwprintf(mb, 50, L"%.1f / %.1f MB", g_dlGot / 1048576.0, g_dlTotal / 1048576.0);
    else _snwprintf(mb, 50, L"%.1f MB", g_dlGot / 1048576.0);
    text_w(hdc, mb, W - 220, fy + 6, 170, 30, C_MUT, g_f[FT_SMALL], DT_RIGHT | DT_VCENTER | DT_SINGLELINE, 0);
  } else {
    if (g_statusErr) draw_circle(hdc, 30, fy + 22, 7, C_RED, 2);
    else if (g_fetching) draw_spinner(hdc, 30, fy + 22, 9, g_aniPhase);
    else { fill_rect(hdc, 27, fy + 19, 6, 6, C_GREEN); }
    text_w(hdc, g_statusW, 52, fy + 8, W - 300, 30, g_statusErr ? C_RED : C_MUT,
           g_f[FT_SMALL], DT_LEFT | DT_VCENTER | DT_SINGLELINE, 0);
    text_w(hdc, L"baixa e instala qualquer versão publicada no GitHub",
           W - 360, fy + 8, 330, 30, C_DIM, g_f[FT_MICRO],
           DT_RIGHT | DT_VCENTER | DT_SINGLELINE, 0);
    star_poly(hdc, W - 26, fy + 22, 6, C_GOLD_D);
  }
}


/* ============ janelas: player ============ */
static HWND g_playerWnd = NULL;
static int g_openedBrowser = 0;

#define B_PQUIT 300

static void player_layout(void) {
  g_btnCount = 0;
  btn_add(B_CLOSE, PW - 44, 0, 44, 40);
  int bw = (PW - 104) / 2;
  btn_add(B_OPEN, 36, PH - 68, bw, 48);
  btn_add(B_PQUIT, 36 + bw + 32, PH - 68, bw, 48);
}
static void player_paint(HDC hdc) {
  grad_v(hdc, 0, 0, PW, PH, C_BG1, C_BG2);
  draw_starfield(hdc, PW, PH);
  fill_rect(hdc, 0, 0, PW, 3, C_GOLD_D);
  /* selo com estrela */
  grad_round(hdc, 30, 34, 56, 56, 28, RGB(126, 100, 46), RGB(64, 46, 18));
  round_stroke(hdc, 30, 34, 56, 56, 28, RGB(190, 150, 70), 2);
  star_poly(hdc, 58, 62, 17, C_GOLD_L);
  text_shadow(hdc, L"GRAND PIXEL GAME", 100, 36, PW - 140, 32, C_GOLD, g_f[FT_LOGO],
              DT_LEFT | DT_SINGLELINE, 5, RGB(0, 0, 0), 2);
  {
    wchar_t v[70];
    _snwprintf(v, 70, L"jogando  %hs", g_srvVer);
    text_w(hdc, v, 102, 74, PW - 140, 22, C_CYAN, g_f[FT_SMALLB], DT_LEFT | DT_SINGLELINE, 0);
  }
  text_w(hdc, L"servidor local ativo — o jogo roda no seu navegador",
         102, 100, PW - 140, 20, RGB(204, 196, 234), g_f[FT_SMALL], DT_LEFT | DT_SINGLELINE, 0);
  {
    const wchar_t *adr = L"http://127.0.0.1:8137";
    int tw = text_wid(hdc, adr, g_f[FT_SMALLB]);
    round_fill(hdc, 102, 128, tw + 30, 26, 13, RGB(20, 38, 44));
    round_stroke(hdc, 102, 128, tw + 30, 26, 13, RGB(44, 82, 94), 1);
    fill_rect(hdc, 112, 137, 7, 7, C_GREEN);
    text_w(hdc, adr, 128, 127, tw, 26, C_TXT, g_f[FT_SMALLB], DT_LEFT | DT_VCENTER | DT_SINGLELINE, 0);
  }
  /* botões */
  for (int i = 0; i < g_btnCount; i++) {
    Btn *b = &g_btns[i];
    int x = b->r.left, y = b->r.top, w = b->r.right - b->r.left, h = b->r.bottom - b->r.top;
    int hot = g_hoverBtn == b->id && g_pressBtn != b->id;
    if (b->id == B_OPEN) {
      grad_round(hdc, x, y, w, h, 15, hot ? RGB(255, 240, 190) : C_GOLD_L, hot ? C_GOLD : C_GOLD_D);
      round_stroke(hdc, x, y, w, h, 15, RGB(255, 246, 214), 1);
      play_tri(hdc, x + 38, y + h / 2, 10, C_BTN_TXT);
      text_w(hdc, L"ABRIR JOGO", x + 28, y + (g_pressBtn == b->id ? 2 : 0), w - 44, h,
             C_BTN_TXT, g_f[FT_BOLD], DT_CENTER | DT_VCENTER | DT_SINGLELINE, 3);
    } else if (b->id == B_PQUIT) {
      round_fill(hdc, x, y, w, h, 15, hot ? RGB(96, 44, 60) : RGB(56, 30, 44));
      round_stroke(hdc, x, y, w, h, 15, hot ? RGB(255, 120, 140) : RGB(150, 66, 86), 1);
      text_w(hdc, L"ENCERRAR", x, y, w, h, RGB(255, 190, 200), g_f[FT_BOLD],
             DT_CENTER | DT_VCENTER | DT_SINGLELINE, 3);
    } else if (b->id == B_CLOSE) {
      int cx = x + w / 2, cy = y + h / 2;
      line(hdc, cx - 5, cy - 5, cx + 5, cy + 5, hot ? C_TXT : C_MUT, 2);
      line(hdc, cx + 5, cy - 5, cx - 5, cy + 5, hot ? C_TXT : C_MUT, 2);
    }
  }
}

/* jogador: qual versão está rodando ("" = embutida neste exe) */
static char g_runTag[24] = "";

static LRESULT CALLBACK player_wndproc(HWND hwnd, UINT msg, WPARAM wp, LPARAM lp) {
  switch (msg) {
    case WM_CREATE: {
      g_playerWnd = hwnd;
      g_hwnd = hwnd;
      player_layout();
      /* conteúdo em disco quando for uma versão instalada */
      if (g_runTag[0] && strcmp(g_runTag, "v" GPG_VERSION) != 0) {
        wchar_t webW[MAX_PATH * 2];
        int any = 0;
        version_installed_dir(g_runTag, webW, MAX_PATH * 2, &any);
        if (!any) {
          MessageBoxW(hwnd,
                      L"O conteúdo desta versão não está instalado.\n"
                      L"Abra o launcher e clique em BAIXAR E INSTALAR.",
                      L"Grand Pixel Game", MB_OK | MB_ICONINFORMATION);
          DestroyWindow(hwnd);
          return 0;
        }
        WideCharToMultiByte(CP_UTF8, 0, webW, -1, g_webRootA, sizeof(g_webRootA), NULL, NULL);
        _snprintf(g_srvVer, sizeof(g_srvVer), "%s", g_runTag);
      } else {
        g_webRootA[0] = 0;
        _snprintf(g_srvVer, sizeof(g_srvVer), "%s", GPG_VERSION);
      }
      /* inicia o servidor; se a porta estiver ocupada por OUTRA versão, toma a vez */
      if (!start_server()) {
        char other[48] = "";
        if (probe_server(other, sizeof(other))) {
          if (strcmp(other, g_srvVer) == 0) {
            /* já está rodando esta versão: só abre a janela do jogo */
            open_game_window();
            DestroyWindow(hwnd);
            return 0;
          }
          /* outra versão do jogo ocupa a porta: pede que ela saia */
          request_quit_server();
          if (start_server()) {
            SetTimer(hwnd, 1, 700, NULL);
            return 0;
          }
        }
        MessageBoxW(hwnd,
                    L"Não consegui iniciar o servidor local (porta 8137 ocupada "
                    L"por outro programa).\n\nFeche o programa que estiver usando "
                    L"a porta 8137 e tente de novo.",
                    L"Grand Pixel Game", MB_OK | MB_ICONWARNING);
        DestroyWindow(hwnd);
        return 0;
      }
      SetTimer(hwnd, 1, 700, NULL);
      return 0;
    }
    case WM_TIMER:
      if (wp == 1 && !g_openedBrowser) {
        g_openedBrowser = 1;
        KillTimer(hwnd, 1);
        open_game_window();
      }
      return 0;
    case WM_ERASEBKGND: return 1;
    case WM_PAINT: {
      PAINTSTRUCT ps;
      HDC dc = BeginPaint(hwnd, &ps);
      HDC mem = CreateCompatibleDC(dc);
      HBITMAP bm = CreateCompatibleBitmap(dc, PW, PH);
      HGDIOBJ ob = SelectObject(mem, bm);
      player_paint(mem);
      BitBlt(dc, 0, 0, PW, PH, mem, 0, 0, SRCCOPY);
      SelectObject(mem, ob);
      DeleteObject(bm);
      DeleteDC(mem);
      EndPaint(hwnd, &ps);
      return 0;
    }
    case WM_LBUTTONDOWN: {
      int x = GET_X_LPARAM(lp), y = GET_Y_LPARAM(lp);
      int id;
      if (btn_hit(x, y, &id)) {
        g_pressBtn = id;
        if (id == B_OPEN) { open_game_window(); return 0; }
        if (id == B_PQUIT || id == B_CLOSE) { DestroyWindow(hwnd); return 0; }
      }
      return 0;
    }
    case WM_LBUTTONUP:
      g_pressBtn = B_NONE;
      return 0;
    case WM_MOUSEMOVE: {
      int x = GET_X_LPARAM(lp), y = GET_Y_LPARAM(lp);
      int id;
      int old = g_hoverBtn;
      g_hoverBtn = btn_hit(x, y, &id) ? id : B_NONE;
      if (old != g_hoverBtn) InvalidateRect(hwnd, NULL, FALSE);
      return 0;
    }
    case WM_SETCURSOR: {
      int id;
      POINT pt;
      GetCursorPos(&pt);
      ScreenToClient(hwnd, &pt);
      SetCursor(LoadCursor(NULL, btn_hit(pt.x, pt.y, &id) ? IDC_HAND : IDC_ARROW));
      return 1;
    }
    case WM_NCHITTEST: {
      POINT pt = { GET_X_LPARAM(lp), GET_Y_LPARAM(lp) };
      ScreenToClient(hwnd, &pt);
      int id;
      if (btn_hit(pt.x, pt.y, &id)) return HTCLIENT;
      if (pt.y < 42) return HTCAPTION;
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

/* ============ janelas: launcher ============ */
static int list_hit_row(int y) {
  int ry = LV_Y0;
  int rowH = 62;
  int yTop = ry + 56;
  int rh = CARD_H;
  int visRows = (rh - 56 - 10) / rowH;
  if (visRows < 1) visRows = 1;
  if (y < yTop) return -1;
  int k = (y - yTop) / rowH;
  int idx = k + g_scroll;
  if (k < 0 || idx < 0 || idx >= g_verCount || idx >= g_scroll + visRows) return -1;
  if ((y - yTop) % rowH > rowH - 10) return -1;
  return idx;
}
static void open_site(void) {
  ShellExecuteW(NULL, L"open", L"https://github.com/Arthurowgg/htmlgame/releases",
                NULL, NULL, SW_SHOWNORMAL);
}

static LRESULT CALLBACK launcher_wndproc(HWND hwnd, UINT msg, WPARAM wp, LPARAM lp) {
  switch (msg) {
    case WM_CREATE: {
      g_hwnd = hwnd;
      /* lista mínima: a versão embutida (funciona 100% offline) */
      g_verCount = 1;
      memset(&g_vers[0], 0, sizeof(g_vers[0]));
      _snprintf(g_vers[0].tag, sizeof(g_vers[0].tag), "v%s", GPG_VERSION);
      _snprintf(g_vers[0].date, sizeof(g_vers[0].date), "versão embutida");
      g_vers[0].current = 1;
      g_vers[0].installed = 1;
      g_selIdx = 0;
      layout_ui();
      status_set(L"verificando atualizações no GitHub…", 0);
      SetTimer(hwnd, 2, 140, NULL);
      start_fetch(hwnd);
      return 0;
    }
    case WM_TIMER:
      if (wp == 2 && (g_fetching || g_downloading)) {
        g_aniPhase = (g_aniPhase + 12) % 360;
        InvalidateRect(hwnd, NULL, FALSE);
      }
      return 0;
    case WM_ERASEBKGND: return 1;
    case WM_PAINT: {
      PAINTSTRUCT ps;
      HDC dc = BeginPaint(hwnd, &ps);
      HDC mem = CreateCompatibleDC(dc);
      HBITMAP bm = CreateCompatibleBitmap(dc, W, H);
      HGDIOBJ ob = SelectObject(mem, bm);
      paint_launcher(mem);
      BitBlt(dc, 0, 0, W, H, mem, 0, 0, SRCCOPY);
      SelectObject(mem, ob);
      DeleteObject(bm);
      DeleteDC(mem);
      EndPaint(hwnd, &ps);
      return 0;
    }
    case WM_APP_NETOK: {
      g_fetchFailed = 0;
      g_fetching = 0;
      refresh_rows();
      if (g_verCount == 0) {
        g_verCount = 1;
        memset(&g_vers[0], 0, sizeof(g_vers[0]));
        _snprintf(g_vers[0].tag, sizeof(g_vers[0].tag), "v%s", GPG_VERSION);
        _snprintf(g_vers[0].date, sizeof(g_vers[0].date), "versão embutida");
        g_vers[0].current = 1;
        g_vers[0].installed = 1;
        g_selIdx = 0;
      }
      /* sugere a mais nova não instalada */
      int best = -1;
      for (int i = 0; i < g_verCount; i++)
        if (!g_vers[i].current && !g_vers[i].installed && g_vers[i].url[0])
          if (best < 0 || is_newer(g_vers[i].tag, g_vers[best].tag)) best = i;
      if (best >= 0) {
        if (g_autoUpd) {
          g_selIdx = best;
          wchar_t st[240];
          _snwprintf(st, 240, L"versão nova %hs — baixando automaticamente…", g_vers[best].tag);
          status_set(st, 0);
          start_download(hwnd, best);
        } else {
          g_selIdx = best;
          wchar_t st[240];
          _snwprintf(st, 240, L"versão nova %hs disponível — clique em BAIXAR E INSTALAR.",
                     g_vers[best].tag);
          status_set(st, 0);
        }
      } else {
        status_set(L"você está com a versão mais recente.", 0);
      }
      InvalidateRect(hwnd, NULL, FALSE);
      return 0;
    }
    case WM_APP_NETFAIL:
      g_fetchFailed = 1;
      g_fetching = 0;
      status_set(L"sem conexão com o GitHub — mostrando a versão embutida.", 1);
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
      if (wp) {
        int idx = find_ver(g_dlJob.tag);
        if (idx >= 0) {
          g_vers[idx].installed = ver_installed(g_dlJob.tag);
          g_selIdx = idx;
        }
        wchar_t st[240];
        _snwprintf(st, 240, L"%hs instalado!", g_dlJob.tag);
        status_set(st, 0);
        InvalidateRect(hwnd, NULL, FALSE);
        /* instalou por pedido do usuário (clique em JOGAR) → já abre o jogo */
        if (g_autoPlayAfter) {
          g_autoPlayAfter = 0;
          play_launcher();
        }
        return 0;
      }
      status_set(g_statusErr ? L"falha no download. Confira sua internet e tente de novo." :
                 L"falha no download. Tente de novo.", 1);
      InvalidateRect(hwnd, NULL, FALSE);
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
          if (!g_fetching && !g_downloading) {
            status_set(L"verificando atualizações…", 0);
            start_fetch(hwnd);
          }
          InvalidateRect(hwnd, NULL, FALSE);
          return 0;
        }
        if (id == B_PLAY) {
          Ver *v = (g_selIdx >= 0) ? &g_vers[g_selIdx] : NULL;
          if (v) {
            if (v->current || v->installed) play_launcher();
            else if (v->url[0] && !g_downloading) {
              g_autoPlayAfter = 1;
              status_set(L"baixando e instalando… (já abre quando terminar)", 0);
              start_download(hwnd, g_selIdx);
              InvalidateRect(hwnd, NULL, FALSE);
            }
          }
          return 0;
        }
        if (id == B_AUTOUPD) {
          g_autoUpd = !g_autoUpd;
          InvalidateRect(hwnd, NULL, FALSE);
          return 0;
        }
        if (id == B_SITE) { open_site(); return 0; }
        if (y < 58) {
          ReleaseCapture();
          SendMessageW(hwnd, WM_NCLBUTTONDOWN, HTCAPTION, 0);
        }
        return 0;
      }
      if (y < 58) {
        ReleaseCapture();
        SendMessageW(hwnd, WM_NCLBUTTONDOWN, HTCAPTION, 0);
        return 0;
      }
      int row = list_hit_row(y);
      if (row >= 0 && x >= RV_X0 && x < RV_X0 + RV_W) select_row(row);
      return 0;
    }
    case WM_LBUTTONUP:
      g_pressBtn = B_NONE;
      InvalidateRect(hwnd, NULL, FALSE);
      return 0;
    case WM_MOUSEMOVE: {
      int x = GET_X_LPARAM(lp), y = GET_Y_LPARAM(lp);
      int id;
      int oldBtn = g_hoverBtn, oldRow = g_hoverRow;
      g_hoverBtn = btn_hit(x, y, &id) ? id : B_NONE;
      g_hoverRow = (x >= RV_X0 && x < RV_X0 + RV_W) ? list_hit_row(y) : -1;
      if (oldBtn != g_hoverBtn || oldRow != g_hoverRow)
        InvalidateRect(hwnd, NULL, FALSE);
      return 0;
    }
    case WM_MOUSEWHEEL: {
      int delta = GET_WHEEL_DELTA_WPARAM(wp);
      int visRows = (CARD_H - 56 - 10) / 62;
      if (visRows < 1) visRows = 1;
      int maxScroll = g_verCount - visRows;
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
      int over = btn_hit(pt.x, pt.y, &id) ||
                 (pt.x >= RV_X0 && pt.x < RV_X0 + RV_W && list_hit_row(pt.y) >= 0);
      SetCursor(LoadCursor(NULL, over ? IDC_HAND : IDC_ARROW));
      return 1;
    }
    case WM_KEYDOWN:
      if (wp == VK_ESCAPE || wp == 'Q') { DestroyWindow(hwnd); return 0; }
      if (wp == VK_RETURN) {
        Ver *v = (g_selIdx >= 0) ? &g_vers[g_selIdx] : NULL;
        if (v) {
          if (v->current || v->installed) play_launcher();
          else if (v->url[0] && !g_downloading) {
            g_autoPlayAfter = 1;
            start_download(hwnd, g_selIdx);
          }
        }
        return 0;
      }
      if (wp == VK_UP && g_selIdx > 0) select_row(g_selIdx - 1);
      if (wp == VK_DOWN && g_selIdx < g_verCount - 1) select_row(g_selIdx + 1);
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

/* ============ entrada ============ */
int WINAPI wWinMain(HINSTANCE hInst, HINSTANCE hPrev, PWSTR lpCmd, int nShow) {
  (void)hPrev;
  (void)nShow;
  g_hInst = hInst;
  {
    HMODULE ud = LoadLibraryA("user32.dll");
    if (ud) {
      typedef BOOL(WINAPI *Fn)(int);
      Fn f = (Fn)(void *)GetProcAddress(ud, "SetProcessDpiAwarenessContext");
      if (f) f(-4);
    }
  }
  fonts_init();
  ensure_appdir();

  int playMode = (wcsstr(lpCmd, L"--play") != NULL);

  /* nomes de classe estáticos: RegisterClass guarda o ponteiro */
  static wchar_t clsLauncher[] = L"GPGLauncherWnd_v13";
  static wchar_t clsPlayer[128];
  static wchar_t mutexName[160];
  HANDLE runMutex = NULL;

  if (playMode) {
    /* extrai a versão pedida: --play --ver v1.2.3 (ou --ver=v1.2.3) */
    const wchar_t *vp = wcsstr(lpCmd, L"--ver");
    if (vp) {
      const wchar_t *val = vp + 4;
      if (*val == L'=') val++;
      else while (*val == L' ' || *val == L'\t') val++;
      wchar_t tw[32];
      int i = 0;
      while (val[i] && val[i] != L' ' && val[i] != L'\t' && i < 31) { tw[i] = val[i]; i++; }
      tw[i] = 0;
      if (tw[0] == L'v') {
        char ta[24];
        WideCharToMultiByte(CP_UTF8, 0, tw, -1, ta, sizeof(ta), NULL, NULL);
        _snprintf(g_runTag, sizeof(g_runTag), "%s", ta);
      }
    }
    char san[40];
    if (g_runTag[0]) version_san(san, sizeof(san), g_runTag);
    else version_san(san, sizeof(san), "v" GPG_VERSION);
    MultiByteToWideChar(CP_UTF8, 0, san, -1, clsPlayer, 64);
    wcscat(clsPlayer, L"_GPGPlay");
    _snwprintf(mutexName, 160, L"GrandPixelGame_Run_%hs", san);
    runMutex = CreateMutexW(NULL, FALSE, mutexName);
    if (GetLastError() == ERROR_ALREADY_EXISTS) {
      /* já existe um jogador desta versão rodando: foca e abre o jogo */
      HWND ex = FindWindowW(clsPlayer, NULL);
      if (ex) { ShowWindow(ex, SW_SHOW); SetForegroundWindow(ex); }
      open_game_window();
      return 0;
    }
    (void)runMutex; /* mantém o mutex até o processo sair */
  }

  WNDCLASSW wc;
  memset(&wc, 0, sizeof(wc));
  wc.hInstance = hInst;
  wc.hCursor = LoadCursor(NULL, IDC_ARROW);
  wc.hIcon = LoadIconW(hInst, MAKEINTRESOURCE(1));
  wc.lpfnWndProc = launcher_wndproc;
  wc.lpszClassName = clsLauncher;
  RegisterClassW(&wc);

  if (playMode) {
    wc.lpfnWndProc = player_wndproc;
    wc.lpszClassName = clsPlayer;
    RegisterClassW(&wc);
    RECT wa;
    SystemParametersInfoW(SPI_GETWORKAREA, 0, &wa, 0);
    int cx = wa.left + (wa.right - wa.left - PW) / 2;
    int cy = wa.top + (wa.bottom - wa.top - PH) / 2;
    HWND hw = CreateWindowExW(WS_EX_APPWINDOW, clsPlayer, L"Grand Pixel Game",
                              WS_POPUP | WS_VISIBLE, cx, cy, PW, PH, NULL, NULL,
                              hInst, NULL);
    if (!hw) {
      wchar_t m[400];
      _snwprintf(m, 400,
                 L"Não consegui abrir a janela do jogo (erro %lu).\n\n"
                 L"Anote esse número e me avise — isso ajuda a corrigir.",
                 GetLastError());
      MessageBoxW(NULL, m, L"Grand Pixel Game", MB_OK | MB_ICONERROR);
      return 1;
    }
  } else {
    RECT wa;
    SystemParametersInfoW(SPI_GETWORKAREA, 0, &wa, 0);
    int cx = wa.left + (wa.right - wa.left - W) / 2;
    int cy = wa.top + (wa.bottom - wa.top - H) / 2;
    HWND hw = CreateWindowExW(0, clsLauncher, L"Grand Pixel Game — Launcher",
                              WS_POPUP | WS_VISIBLE, cx, cy, W, H, NULL, NULL,
                              hInst, NULL);
    if (!hw) {
      wchar_t m[400];
      _snwprintf(m, 400,
                 L"Não consegui abrir o launcher (erro %lu).\n\n"
                 L"Anote esse número e me avise — isso ajuda a corrigir.",
                 GetLastError());
      MessageBoxW(NULL, m, L"Grand Pixel Game", MB_OK | MB_ICONERROR);
      return 1;
    }
  }

  MSG msg;
  while (GetMessageW(&msg, NULL, 0, 0) > 0) {
    TranslateMessage(&msg);
    DispatchMessageW(&msg);
  }
  return 0;
}
