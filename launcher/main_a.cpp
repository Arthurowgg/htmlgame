// ============================================================
// GRAND PIXEL GAME — Launcher (C++, Win32)
// App Windows que baixa e joga as versões do jogo publicadas no
// GitHub. O JOGO NÃO VEM EMBUTIDO: o launcher busca releases com
// tag "game-vX.Y.Z" e baixa só o conteúdo (zip). O próprio
// launcher é versionado em releases "launcher-vX.Y.Z".
//
// Compilação (empacotamento do .exe): launcher/build.py (Zig c++)
// ============================================================
#define WIN32_LEAN_AND_MEAN
#include <winsock2.h>
#include <ws2tcpip.h>
#include <windows.h>
#include <winhttp.h>
#include <windowsx.h>
#include <shlobj.h>
#include <shellapi.h>
#include <shlwapi.h>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <cwchar>
#include <cstdarg>
#include <cmath>

#ifndef GPG_LAUNCHER_VER
#define GPG_LAUNCHER_VER "1.0.0"
#endif

#define APP_NAME      L"Grand Pixel Game"
#define APP_BASE      L"GrandPixelGame"
#define PORT_GAME     8137
#define MAXVERSIONS   96
#define REPO_API      L"/repos/Arthurowgg/htmlgame/releases?per_page=100"
#define RAW_BASE      "https://github.com/Arthurowgg/htmlgame/raw/refs/tags/"

/* ---------------------------------------------------------- utilitários */
static void die_box(const char *msg) {
  MessageBoxA(NULL, msg, "Grand Pixel Game", MB_OK | MB_ICONERROR);
  ExitProcess(1);
}
static int ends_with(const char *s, const char *suf) {
  size_t a = strlen(s), b = strlen(suf);
  return a >= b && strcmp(s + a - b, suf) == 0;
}
static int starts_with(const char *s, const char *pre) {
  return strncmp(s, pre, strlen(pre)) == 0;
}

static wchar_t g_appdirW[MAX_PATH * 2];
static char   g_appdirA[MAX_PATH * 2];

static void ensure_appdir(void) {
  if (g_appdirW[0]) return;
  wchar_t base[MAX_PATH * 2];
  if (!SUCCEEDED(SHGetFolderPathW(NULL, CSIDL_LOCAL_APPDATA, NULL, 0, base)) || !base[0]) {
    if (!GetTempPathW(MAX_PATH * 2, base)) die_box("Sem LOCALAPPDATA nem TEMP.");
  }
  _snwprintf(g_appdirW, MAX_PATH * 2, L"%s\\GrandPixelGame", base);
  CreateDirectoryW(g_appdirW, NULL);
  WideCharToMultiByte(CP_UTF8, 0, g_appdirW, -1, g_appdirA, (int)sizeof(g_appdirA), NULL, NULL);
}
static void ensure_verdir(void) {
  ensure_appdir();
  wchar_t d[MAX_PATH * 2];
  _snwprintf(d, MAX_PATH * 2, L"%s\\versions", g_appdirW);
  CreateDirectoryW(d, NULL);
}
/* log de diagnóstico (gravado desde o primeiro passo) */
static void log_line(const char *fmt, ...) {
  char buf[1024];
  va_list ap;
  va_start(ap, fmt);
  vsnprintf(buf, sizeof(buf), fmt, ap);
  va_end(ap);
  char path[MAX_PATH * 2];
  ensure_appdir();
  _snprintf(path, sizeof(path), "%s\\launcher.log", g_appdirA);
  FILE *f = fopen(path, "ab");
  if (!f) return;
  SYSTEMTIME st;
  GetLocalTime(&st);
  fprintf(f, "[%02u:%02u:%02u] %s\r\n", st.wHour, st.wMinute, st.wSecond, buf);
  fclose(f);
}
static wchar_t *utf8w(const char *u) {
  int n = MultiByteToWideChar(CP_UTF8, 0, u, -1, NULL, 0);
  wchar_t *w = (wchar_t *)malloc((size_t)(n + 1) * sizeof(wchar_t));
  if (w) MultiByteToWideChar(CP_UTF8, 0, u, -1, w, n);
  return w;
}
static void ver_only(const char *tag, char *out, size_t cap) {
  /* "game-v1.2.3" -> "v1.2.3"; tags antigas "v1.2.3" ficam como estão */
  const char *h = strrchr(tag, '-');
  if (h && h[1] == 'v') { strncpy(out, h + 1, cap - 1); out[cap - 1] = 0; return; }
  strncpy(out, tag, cap - 1);
  out[cap - 1] = 0;
}

/* ------------------------------------------------------------ versões */
typedef struct {
  char tag[40];          /* "game-v1.2.3" */
  char ver[24];          /* "v1.2.3" */
  char date[24];
  char url[1000];        /* zip de conteúdo */
  long long size;
  int installed;         /* conteúdo presente em versions\\<tag>\\web */
} Ver;
static Ver g_vers[MAXVERSIONS];
static int g_verCount = 0;
static int g_hasNewLauncher = 0;
static char g_newLauncherVer[24] = "";

static int g_fetching = 0, g_fetchFailed = 0;
static int g_downloading = 0;
static int g_dlIndex = -1;
static long long g_dlGot = 0, g_dlTotal = 0;
static char g_dlTag[40] = "";
static wchar_t g_dlError[400] = L"";

static int parse_ver(const char *tag, int out[3]) {
  out[0] = out[1] = out[2] = 0;
  if (sscanf(tag, "v%d.%d.%d", &out[0], &out[1], &out[2]) != 3) return 0;
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
    if (c == '\\') {
      if (j->pos < j->len) {
        c = j->s[j->pos++];
        if (c == 'n') c = '\n';
        else if (c == 't') c = '\t';
        else if (c == 'r') c = '\r';
        else if (c == 'u') { j->pos += 4; continue; }
      }
    }
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
  if (c == '{') { j->pos++; for (;;) { jp_ws(j); if (jp_ch(j, '}')) return; if (jp_ch(j, ',')) continue; jp_skip(j); } }
  if (c == '[') { j->pos++; for (;;) { jp_ws(j); if (jp_ch(j, ']')) return; if (jp_ch(j, ',')) continue; jp_skip(j); } }
  jp_num(j);
}
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

/* parseia as releases: separa game-v* (conteúdo do jogo) e launcher-v*
 * (atualizações do próprio launcher) */
static void parse_releases(const char *json, size_t len) {
  JP j = { json, (long)len, 0 };
  g_verCount = 0;
  g_hasNewLauncher = 0;
  g_newLauncherVer[0] = 0;
  if (!jp_ch(&j, '[')) return;
  for (;;) {
    jp_ws(&j);
    if (jp_ch(&j, ']')) break;
    if (!jp_ch(&j, '{')) break;
    char tag[40] = "", date[24] = "";
    long long asz = 0;
    char au[1000] = "";
    int draft = 0;
    for (;;) {
      char key[48];
      if (!jp_key(&j, key, sizeof(key))) break;
      if (strcmp(key, "tag_name") == 0) jp_str(&j, tag, sizeof(tag));
      else if (strcmp(key, "published_at") == 0) jp_str(&j, date, sizeof(date));
      else if (strcmp(key, "draft") == 0) draft = jp_bool(&j);
      else if (strcmp(key, "assets") == 0) {
        if (jp_ch(&j, '[')) {
          for (;;) {
            jp_ws(&j);
            if (jp_ch(&j, ']')) break;
            if (!jp_ch(&j, '{')) break;
            char an[200] = "", a2[1000] = "";
            long long s2 = 0;
            for (;;) {
              char k2[48];
              if (!jp_key(&j, k2, sizeof(k2))) break;
              if (strcmp(k2, "name") == 0) jp_str(&j, an, sizeof(an));
              else if (strcmp(k2, "browser_download_url") == 0) jp_str(&j, a2, sizeof(a2));
              else if (strcmp(k2, "size") == 0) s2 = jp_num(&j);
              else jp_skip(&j);
            }
            jp_ch(&j, '}');
            if (ends_with(an, "-web.zip") && !au[0] && a2[0]) {
              strncpy(au, a2, sizeof(au) - 1);
              asz = s2;
            }
          }
        }
      }
      else jp_skip(&j);
    }
    jp_ch(&j, '}');
    if (draft || !tag[0]) continue;
    if (strlen(date) > 10) date[10] = 0;
    char ver[24];
    ver_only(tag, ver, sizeof(ver));
    int pv[3];
    if (!parse_ver(ver, pv)) continue;

    if (starts_with(tag, "launcher-v")) {
      /* versão do próprio launcher: interessa só se for mais nova */
      char cur[24];
      _snprintf(cur, sizeof(cur), "v%s", GPG_LAUNCHER_VER);
      if (is_newer(ver, cur)) {
        g_hasNewLauncher = 1;
        if (!g_newLauncherVer[0] || is_newer(ver, g_newLauncherVer))
          _snprintf(g_newLauncherVer, sizeof(g_newLauncherVer), "%s", ver);
      }
      continue;
    }
    if (!starts_with(tag, "game-v")) continue;   /* só o jogo entra na lista */

    if (g_verCount >= MAXVERSIONS) continue;
    Ver v;
    memset(&v, 0, sizeof(v));
    strncpy(v.tag, tag, sizeof(v.tag) - 1);
    _snprintf(v.ver, sizeof(v.ver), "%s", ver);
    _snprintf(v.date, sizeof(v.date), "%s", date);
    v.size = asz;
    if (au[0]) strncpy(v.url, au, sizeof(v.url) - 1);
    else {
      /* sem asset anexado: o conteúdo está versionado na árvore da tag */
      _snprintf(v.url, sizeof(v.url),
                RAW_BASE "%s/dist/game/GrandPixelGame-%s-web.zip", tag, ver);
    }
    g_vers[g_verCount++] = v;
  }
}

/* ------------------------------------------------------- conteúdo local */
static void version_dir(const char *tag, wchar_t *out, size_t cap) {
  ensure_verdir();
  wchar_t tagW[64];
  MultiByteToWideChar(CP_UTF8, 0, tag, -1, tagW, 64);
  _snwprintf(out, cap, L"%s\\versions\\%s", g_appdirW, tagW);
}
static void version_web_dir(const char *tag, wchar_t *out, size_t cap) {
  version_dir(tag, out, cap);
  size_t n = wcslen(out);
  _snwprintf(out + n, cap - n, L"\\web");
}
static int version_installed(const char *tag) {
  wchar_t idx[MAX_PATH * 2];
  version_web_dir(tag, idx, MAX_PATH * 2);
  size_t n = wcslen(idx);
  _snwprintf(idx + n, MAX_PATH * 2 - n, L"\\index.html");
  return GetFileAttributesW(idx) != INVALID_FILE_ATTRIBUTES;
}
static void find_installed(void) {
  for (int k = 0; k < g_verCount; k++) g_vers[k].installed = version_installed(g_vers[k].tag);
}
static int find_ver(const char *tag) {
  for (int i = 0; i < g_verCount; i++)
    if (strcmp(g_vers[i].tag, tag) == 0) return i;
  return -1;
}

/* ---------------------------------------------------- HTTP (WinHTTP) */
typedef struct { char *buf; size_t len, cap; int ok; unsigned status; } Resp;
static void resp_init(Resp *r) { memset(r, 0, sizeof(*r)); }
static void resp_free(Resp *r) { free(r->buf); r->buf = NULL; r->len = r->cap = 0; }

static int http_get(const wchar_t *host, const wchar_t *path, int https, Resp *out) {
  resp_init(out);
  HINTERNET hs = WinHttpOpen(L"GrandPixelGame-Launcher/1.0", WINHTTP_ACCESS_TYPE_DEFAULT_PROXY,
                             WINHTTP_NO_PROXY_NAME, WINHTTP_NO_PROXY_BYPASS, 0);
  if (!hs) return 0;
  HINTERNET hc = WinHttpConnect(hs, host, https ? INTERNET_DEFAULT_HTTPS_PORT : INTERNET_DEFAULT_HTTP_PORT, 0);
  if (!hc) { WinHttpCloseHandle(hs); return 0; }
  HINTERNET hr = WinHttpOpenRequest(hc, L"GET", path, NULL, WINHTTP_NO_REFERER,
                                    WINHTTP_DEFAULT_ACCEPT_TYPES, https ? WINHTTP_FLAG_SECURE : 0);
  if (!hr) { WinHttpCloseHandle(hc); WinHttpCloseHandle(hs); return 0; }
  DWORD redir = WINHTTP_OPTION_REDIRECT_POLICY_ALWAYS;
  WinHttpSetOption(hr, WINHTTP_OPTION_REDIRECT_POLICY, &redir, sizeof(redir));
  const wchar_t *hdr = L"Accept: application/vnd.github+json\r\nUser-Agent: GrandPixelGame-Launcher\r\n";
  int ok = 0;
  if (WinHttpSendRequest(hr, hdr, (DWORD)-1L, WINHTTP_NO_REQUEST_DATA, 0, 0, 0) &&
      WinHttpReceiveResponse(hr, NULL)) {
    DWORD st = 0, sz = sizeof(st);
    WinHttpQueryHeaders(hr, WINHTTP_QUERY_STATUS_CODE | WINHTTP_QUERY_FLAG_NUMBER,
                        WINHTTP_HEADER_NAME_BY_INDEX, &st, &sz, WINHTTP_NO_HEADER_INDEX);
    for (;;) {
      char tmp[65536];
      DWORD got = 0;
      if (!WinHttpReadData(hr, tmp, sizeof(tmp), &got)) break;
      if (got == 0) break;
      if (out->len + got + 1 > out->cap) {
        size_t nc = out->cap ? out->cap * 2 : 262144;
        while (nc < out->len + got + 1) nc *= 2;
        char *nb = (char *)realloc(out->buf, nc);
        if (!nb) { ok = 0; goto done; }
        out->buf = nb;
        out->cap = nc;
      }
      memcpy(out->buf + out->len, tmp, got);
      out->len += got;
      out->buf[out->len] = 0;
      if (out->len > (64L << 20)) { ok = 0; goto done; }
    }
    if (out->buf && st == 200) { out->status = st; ok = 1; }
  }
done:
  WinHttpCloseHandle(hr);
  WinHttpCloseHandle(hc);
  WinHttpCloseHandle(hs);
  return ok;
}

static int http_save(const wchar_t *url, const wchar_t *dest,
                     void (*prog)(void *ctx, long long got, long long total), void *ctx,
                     wchar_t *err, size_t errcap) {
  wchar_t host[256] = L"";
  wchar_t path[1200] = L"/";
  const wchar_t *p = url;
  int https = 1;
  if (wcsncmp(p, L"https://", 8) == 0) p += 8;
  else if (wcsncmp(p, L"http://", 7) == 0) { https = 0; p += 7; }
  else { if (err) _snwprintf(err, errcap, L"URL inválida"); return 0; }
  const wchar_t *slash = wcschr(p, L'/');
  if (!slash) wcsncpy(host, p, 255);
  else {
    size_t hn = (size_t)(slash - p);
    if (hn > 255) hn = 255;
    wcsncpy(host, p, hn);
    host[hn] = 0;
    _snwprintf(path, 1200, L"%s", slash);
  }
  HINTERNET hs = WinHttpOpen(L"GrandPixelGame-Launcher/1.0", WINHTTP_ACCESS_TYPE_DEFAULT_PROXY,
                             WINHTTP_NO_PROXY_NAME, WINHTTP_NO_PROXY_BYPASS, 0);
  if (!hs) return 0;
  HINTERNET hc = WinHttpConnect(hs, host, https ? INTERNET_DEFAULT_HTTPS_PORT : INTERNET_DEFAULT_HTTP_PORT, 0);
  if (!hc) { WinHttpCloseHandle(hs); return 0; }
  HINTERNET hr = WinHttpOpenRequest(hc, L"GET", path, NULL, WINHTTP_NO_REFERER,
                                    WINHTTP_DEFAULT_ACCEPT_TYPES, https ? WINHTTP_FLAG_SECURE : 0);
  if (!hr) { WinHttpCloseHandle(hc); WinHttpCloseHandle(hs); return 0; }
  {
    DWORD redir = WINHTTP_OPTION_REDIRECT_POLICY_ALWAYS;
    WinHttpSetOption(hr, WINHTTP_OPTION_REDIRECT_POLICY, &redir, sizeof(redir));
    DWORD dl = 90000;
    WinHttpSetTimeouts(hs, dl, dl, dl, dl);
  }
  const wchar_t *hdr = L"User-Agent: GrandPixelGame-Launcher\r\n";
  int ok = 0;
  if (WinHttpSendRequest(hr, hdr, (DWORD)-1L, WINHTTP_NO_REQUEST_DATA, 0, 0, 0) &&
      WinHttpReceiveResponse(hr, NULL)) {
    DWORD st = 0, sz = sizeof(st);
    WinHttpQueryHeaders(hr, WINHTTP_QUERY_STATUS_CODE | WINHTTP_QUERY_FLAG_NUMBER,
                        WINHTTP_HEADER_NAME_BY_INDEX, &st, &sz, WINHTTP_NO_HEADER_INDEX);
    if (st != 200) {
      if (err) _snwprintf(err, errcap, L"HTTP %lu ao baixar", st);
      goto done;
    }
    long long total = -1;
    wchar_t lb[40];
    DWORD ls = sizeof(lb);
    if (WinHttpQueryHeaders(hr, WINHTTP_QUERY_CONTENT_LENGTH, WINHTTP_HEADER_NAME_BY_INDEX,
                            lb, &ls, WINHTTP_NO_HEADER_INDEX)) total = _wtoi64(lb);
    HANDLE f = CreateFileW(dest, GENERIC_WRITE, 0, NULL, CREATE_ALWAYS, FILE_ATTRIBUTE_NORMAL, NULL);
    if (f == INVALID_HANDLE_VALUE) { if (err) _snwprintf(err, errcap, L"não consegui gravar em disco"); goto done; }
    long long got = 0;
    for (;;) {
      char tmp[65536];
      DWORD rd = 0;
      if (!WinHttpReadData(hr, tmp, sizeof(tmp), &rd)) {
        if (GetLastError() == ERROR_WINHTTP_CONNECTION_ERROR) break;
        CloseHandle(f);
        DeleteFileW(dest);
        if (err) _snwprintf(err, errcap, L"falha na conexão durante o download");
        goto done;
      }
      if (rd == 0) break;
      DWORD wr = 0;
      if (!WriteFile(f, tmp, rd, &wr, NULL) || wr != rd) {
        CloseHandle(f);
        DeleteFileW(dest);
        if (err) _snwprintf(err, errcap, L"falha ao gravar arquivo");
        goto done;
      }
      got += rd;
      if (prog) prog(ctx, got, total);
    }
    CloseHandle(f);
    if (prog) prog(ctx, got, total);
    ok = 1;
  } else if (err) {
    _snwprintf(err, errcap, L"sem conexão (verifique sua internet)");
  }
done:
  WinHttpCloseHandle(hr);
  WinHttpCloseHandle(hc);
  WinHttpCloseHandle(hs);
  return ok;
}

/* ------------------------------------------------- zip (método STORE) */
static void mkdirs(const char *dir) {
  char *d = (char *)malloc(strlen(dir) + 1);
  if (!d) return;
  strcpy(d, dir);
  for (size_t i = 0; i < strlen(d); i++) {
    if (d[i] == '/') d[i] = '\\';
    if (d[i] == '\\' && i > 0) {
      char c = d[i];
      d[i] = 0;
      CreateDirectoryA(d, NULL);
      d[i] = c;
    }
  }
  CreateDirectoryA(d, NULL);
  free(d);
}
static int zip_name_ok(const char *name, size_t len) {
  if (len == 0 || len > 400) return 0;
  if (name[0] == '/' || name[0] == '\\' || strchr(name, ':')) return 0;
  for (size_t i = 0; i + 1 < len; i++)
    if ((name[i] == '.' && name[i + 1] == '.') &&
        (i + 2 >= len || name[i + 2] == '/' || name[i + 2] == '\\')) return 0;
  return 1;
}
/* extrai entradas não-compactadas do zip; devolve nº de arquivos ou <0 */
static int zip_extract_store(const char *zip_path, const char *out_dir) {
  FILE *f = fopen(zip_path, "rb");
  if (!f) return -1;
  fseek(f, 0, SEEK_END);
  long sz = ftell(f);
  if (sz < 22) { fclose(f); return -2; }
  rewind(f);
  unsigned char *buf = (unsigned char *)malloc((size_t)sz);
  if (!buf) { fclose(f); return -1; }
  if (fread(buf, 1, (size_t)sz, f) != (size_t)sz) { free(buf); fclose(f); return -1; }
  fclose(f);
  long eocd = -1;
  long from = (sz - 22 - 65536) > 0 ? (sz - 22 - 65536) : 0;
  for (long i = sz - 22; i >= from; i--) {
    if (buf[i] == 'P' && buf[i + 1] == 'K' && buf[i + 2] == 5 && buf[i + 3] == 6) { eocd = i; break; }
  }
  if (eocd < 0) { free(buf); return -2; }
  unsigned long cd_off = (unsigned long)buf[eocd + 16] | ((unsigned long)buf[eocd + 17] << 8) |
                         ((unsigned long)buf[eocd + 18] << 16) | ((unsigned long)buf[eocd + 19] << 24);
  unsigned count = (unsigned)buf[eocd + 10] | ((unsigned)buf[eocd + 11] << 8);
  char outbuf[1200];
  _snprintf(outbuf, sizeof(outbuf), "%s", out_dir);
  size_t outlen = strlen(outbuf);
  int extracted = 0;
  unsigned long pos = cd_off;
  for (unsigned e = 0; e < count && pos + 46 <= (unsigned long)sz; e++) {
    const unsigned char *c = buf + pos;
    if (!(c[0] == 'P' && c[1] == 'K' && c[2] == 1 && c[3] == 2)) break;
    unsigned method = (unsigned)c[10] | ((unsigned)c[11] << 8);
    unsigned long csize = (unsigned long)c[20] | ((unsigned long)c[21] << 8) |
                          ((unsigned long)c[22] << 16) | ((unsigned long)c[23] << 24);
    unsigned long usize = (unsigned long)c[24] | ((unsigned long)c[25] << 8) |
                          ((unsigned long)c[26] << 16) | ((unsigned long)c[27] << 24);
    unsigned nlen = (unsigned)c[28] | ((unsigned)c[29] << 8);
    unsigned xlen = (unsigned)c[30] | ((unsigned)c[31] << 8);
    unsigned clen = (unsigned)c[32] | ((unsigned)c[33] << 8);
    unsigned long loff = (unsigned long)c[42] | ((unsigned long)c[43] << 8) |
                         ((unsigned long)c[44] << 16) | ((unsigned long)c[45] << 24);
    pos += 46 + nlen + xlen + clen;
    if (nlen == 0 || !zip_name_ok((const char *)(c + 46), nlen)) { free(buf); return -4; }
    if (method != 0) { free(buf); return -3; }  /* conteúdo é publicado sem compressão */
    if (loff + 30 + nlen > (unsigned long)sz) { free(buf); return -2; }
    const unsigned char *l = buf + loff;
    if (!(l[0] == 'P' && l[1] == 'K' && l[2] == 3 && l[3] == 4)) { free(buf); return -2; }
    unsigned lnlen = (unsigned)l[26] | ((unsigned)l[27] << 8);
    unsigned lxlen = (unsigned)l[28] | ((unsigned)l[29] << 8);
    unsigned long data = loff + 30 + lnlen + lxlen;
    if (data + csize > (unsigned long)sz || csize != usize) { free(buf); return -2; }
    if (outlen + 1 + nlen + 1 > sizeof(outbuf)) { free(buf); return -4; }
    memcpy(outbuf + outlen, "\\", 1);
    memcpy(outbuf + outlen + 1, c + 46, nlen);
    outbuf[outlen + 1 + nlen] = 0;
    char *slash = strrchr(outbuf, '\\');
    if (slash && slash != outbuf) {
      char save = *slash;
      *slash = 0;
      mkdirs(outbuf);
      *slash = save;
    }
    FILE *o = fopen(outbuf, "wb");
    if (!o) { free(buf); return -1; }
    if (csize && fwrite(buf + data, 1, csize, o) != csize) { fclose(o); free(buf); return -1; }
    fclose(o);
    extracted++;
  }
  free(buf);
  return extracted;
}

/* ------------------------------------------------------ thread rede */
static volatile int g_bgPhase = 0;   /* 0 ocioso, 1 buscando, 2 baixando */
static HANDLE g_netThread = NULL;
static HWND g_hwnd = NULL;

#define WM_APP_NETOK   (WM_APP + 1)
#define WM_APP_NETFAIL (WM_APP + 2)
#define WM_APP_DLPROG  (WM_APP + 3)
#define WM_APP_DLDONE  (WM_APP + 4)

static void dl_prog_cb(void *ctx, long long got, long long total) {
  (void)ctx;
  g_dlGot = got;
  g_dlTotal = total;
  if (g_hwnd) PostMessageW(g_hwnd, WM_APP_DLPROG, 0, 0);
}
static void net_fetch(void *) {
  Resp r;
  if (http_get(L"api.github.com", REPO_API, 1, &r) && r.buf) {
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
static void net_download(void *) {
  wchar_t errW[300] = L"";
  wchar_t dest[MAX_PATH * 2];
  _snwprintf(dest, MAX_PATH * 2, L"%s\\versions\\gpg-%hs-tmp.zip", g_appdirW, g_dlTag);
  wchar_t urlW[1100];
  MultiByteToWideChar(CP_UTF8, 0, g_vers[g_dlIndex].url, -1, urlW, 1100);
  int ok = http_save(urlW, dest, dl_prog_cb, NULL, errW, 300);
  int extracted = -1;
  if (ok) {
    char zipA[MAX_PATH * 2], outA[MAX_PATH * 2];
    WideCharToMultiByte(CP_UTF8, 0, dest, -1, zipA, sizeof(zipA), NULL, NULL);
    wchar_t webW[MAX_PATH * 2];
    version_web_dir(g_dlTag, webW, MAX_PATH * 2);
    CreateDirectoryW(webW, NULL);
    WideCharToMultiByte(CP_UTF8, 0, webW, -1, outA, sizeof(outA), NULL, NULL);
    extracted = zip_extract_store(zipA, outA);
    DeleteFileW(dest);
  }
  if (ok && extracted >= 0 && g_hwnd)
    PostMessageW(g_hwnd, WM_APP_DLDONE, 1, 0);
  else if (g_hwnd) {
    if (!ok) _snwprintf(g_dlError, 400, L"falha no download: %ls", errW);
    else if (extracted == -3) _snwprintf(g_dlError, 400, L"arquivo veio compactado de um jeito que eu não leio — avise o desenvolvedor.");
    else _snwprintf(g_dlError, 400, L"falha ao instalar (%d). Baixe de novo ou avise o desenvolvedor.", extracted);
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
  HANDLE h = CreateThread(NULL, 0, (LPTHREAD_START_ROUTINE)net_fetch, NULL, 0, NULL);
  if (h) { CloseHandle(h); g_netThread = h; }
  else { g_fetching = 0; g_bgPhase = 0; }
}
static void start_download(HWND hwnd, int idx) {
  if (g_bgPhase != 0) return;
  if (idx < 0 || idx >= g_verCount || !g_vers[idx].url[0]) return;
  g_hwnd = hwnd;
  ensure_verdir();
  _snprintf(g_dlTag, sizeof(g_dlTag), "%s", g_vers[idx].tag);
  g_downloading = 1;
  g_bgPhase = 2;
  g_dlGot = 0;
  g_dlTotal = 0;
  g_dlIndex = idx;
  g_dlError[0] = 0;
  HANDLE h = CreateThread(NULL, 0, (LPTHREAD_START_ROUTINE)net_download, NULL, 0, NULL);
  if (h) { CloseHandle(h); g_netThread = h; }
  else { g_downloading = 0; g_bgPhase = 0; }
}
