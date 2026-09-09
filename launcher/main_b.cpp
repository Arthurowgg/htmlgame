// ============================================================
// parte B: servidor local do jogo + janela do launcher (UI)
// ============================================================
/* ---------------------------------------------- servidor do jogo */
static SOCKET g_lsn = INVALID_SOCKET;
static volatile int g_serveStop = 0;
static HANDLE g_serveThread = NULL;
static char g_webRootA[1024] = "";
static char g_srvVer[24] = "";

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
  while (n < sizeof(req) - 1) {
    int r = recv(c, req + n, (int)(sizeof(req) - 1 - n), 0);
    if (r <= 0) break;
    n += (size_t)r;
    req[n] = 0;
    if (strstr(req, "\r\n\r\n")) break;
  }
  if (!strstr(req, "\r\n\r\n")) { closesocket(c); return; }
  char method[16] = "", path[1200] = "";
  sscanf(req, "%15s %1199s", method, path);
  if (strcmp(method, "GET") != 0 && strcmp(method, "HEAD") != 0) {
    const char *r = "HTTP/1.1 405 Method Not Allowed\r\nContent-Length: 0\r\nAllow: GET, HEAD\r\n\r\n";
    send_all(c, r, strlen(r));
    closesocket(c);
    return;
  }
  if (strcmp(path, "/__gpg__") == 0) {
    char b[160];
    _snprintf(b, sizeof(b), "HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\n"
              "Cache-Control: no-store\r\nConnection: close\r\n\r\nGrandPixelGame %s", g_srvVer);
    send_all(c, b, strlen(b));
    closesocket(c);
    return;
  }
  if (strcmp(path, "/__gpg_quit__") == 0) {
    const char *r = "HTTP/1.1 200 OK\r\nContent-Length: 2\r\nConnection: close\r\n\r\nok";
    send_all(c, r, strlen(r));
    closesocket(c);
    g_serveStop = 1;
    ExitProcess(0);
  }
  char clean[1100];
  strncpy(clean, path, sizeof(clean) - 1);
  clean[sizeof(clean) - 1] = 0;
  char *q = strchr(clean, '?');
  if (q) *q = 0;
  if (strcmp(clean, "/") == 0) strcpy(clean, "/index.html");
  if (strstr(clean, "..") || strchr(clean, '\\')) {
    const char *r = "HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\nConnection: close\r\n\r\n";
    send_all(c, r, strlen(r));
    closesocket(c);
    return;
  }
  char diskPath[1300];
  _snprintf(diskPath, sizeof(diskPath), "%s%s", g_webRootA, clean);
  FILE *f = fopen(diskPath, "rb");
  if (!f) {
    const char *r = "HTTP/1.1 404 Not Found\r\nContent-Type: text/plain\r\nConnection: close\r\n\r\n404";
    send_all(c, r, strlen(r));
    closesocket(c);
    return;
  }
  fseek(f, 0, SEEK_END);
  long fs = ftell(f);
  rewind(f);
  if (fs < 0 || fs > (8L << 20)) {
    fclose(f);
    const char *r = "HTTP/1.1 500\r\nContent-Length: 0\r\nConnection: close\r\n\r\n";
    send_all(c, r, strlen(r));
    closesocket(c);
    return;
  }
  char *m = (char *)malloc((size_t)(fs ? fs : 1));
  if (!m || (fs && fread(m, 1, (size_t)fs, f) != (size_t)fs)) {
    fclose(f);
    free(m);
    const char *r = "HTTP/1.1 500\r\nContent-Length: 0\r\nConnection: close\r\n\r\n";
    send_all(c, r, strlen(r));
    closesocket(c);
    return;
  }
  fclose(f);
  char head[600];
  _snprintf(head, sizeof(head),
            "HTTP/1.1 200 OK\r\nContent-Type: %s\r\nContent-Length: %ld\r\n"
            "Cache-Control: no-cache\r\nConnection: close\r\nAccess-Control-Allow-Origin: *\r\n\r\n",
            mime_of(clean), fs);
  send_all(c, head, strlen(head));
  if (strcmp(method, "HEAD") != 0) send_all(c, m, (size_t)fs);
  free(m);
  closesocket(c);
}
static DWORD WINAPI server_loop(LPVOID) {
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
/* envia pedido cru ao servidor local; devolve 1 se conectou */
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
    FD_ZERO(&wf);
    FD_SET(s, &wf);
    struct timeval tv = { 2, 0 };
    if (select(0, NULL, &wf, NULL, &tv) > 0) {
      int soerr = 0, sl = sizeof(soerr);
      getsockopt(s, SOL_SOCKET, SO_ERROR, (char *)&soerr, &sl);
      if (soerr == 0) {
        char req[360];
        _snprintf(req, sizeof(req), "GET %s HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n",
                  request_path);
        send(s, req, (int)strlen(req), 0);
        ok = 1;
      }
    }
  }
  closesocket(s);
  return ok;
}
static void request_quit_server(void) {
  http_local_raw("/__gpg_quit__");
  Sleep(900);
}
/* checa a versão do servidor já ativo na porta */
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
    FD_ZERO(&wf);
    FD_SET(s, &wf);
    struct timeval tv = { 1, 0 };
    if (select(0, NULL, &wf, NULL, &tv) > 0) {
      int soerr = 0, sl = sizeof(soerr);
      getsockopt(s, SOL_SOCKET, SO_ERROR, (char *)&soerr, &sl);
      if (soerr == 0) {
        const char *req = "GET /__gpg__ HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n";
        send(s, req, (int)strlen(req), 0);
        u_long z = 0;
        ioctlsocket(s, FIONBIO, &z);
        char buf[512];
        int n = recv(s, buf, sizeof(buf) - 1, 0);
        if (n > 0) {
          buf[n] = 0;
          char *b = strstr(buf, "\r\n\r\n");
          if (b) {
            b += 4;
            char *v = strstr(b, "GrandPixelGame ");
            if (v) {
              v += 15;
              char *e = strchr(v, '\r');
              if (e) *e = 0;
              strncpy(ver, v, cap - 1);
              ver[cap - 1] = 0;
              ok = 1;
            }
          }
        }
      }
    }
  }
  closesocket(s);
  return ok;
}
/* janela própria (modo app) via Edge; sem Edge, navegador padrão */
static int open_edge_app(void) {
  const wchar_t *envs[2] = { L"ProgramFiles(x86)", L"ProgramFiles" };
  for (int i = 0; i < 2; i++) {
    wchar_t pf[1024];
    DWORD n = GetEnvironmentVariableW(envs[i], pf, 1024);
    if (n == 0 || n >= 1024) continue;
    wchar_t edge[1200];
    _snwprintf(edge, 1200, L"%s\\Microsoft\\Edge\\Application\\msedge.exe", pf);
    if (GetFileAttributesW(edge) == INVALID_FILE_ATTRIBUTES) continue;
    HINSTANCE r = ShellExecuteW(NULL, L"open", edge,
                                L"--app=http://127.0.0.1:8137/ --window-size=1280,800",
                                NULL, SW_SHOWNORMAL);
    if ((INT_PTR)r > 32) return 1;
  }
  return 0;
}
static void open_game_window(void) {
  if (!open_edge_app())
    ShellExecuteW(NULL, L"open", L"http://127.0.0.1:8137/", NULL, NULL, SW_SHOWNORMAL);
}

/* ------------------------------------------------- UI: primitivas */
#define C_BG1      RGB(11, 9, 22)
#define C_BG2      RGB(27, 20, 50)
#define C_CARD1    RGB(30, 25, 54)
#define C_CARD2    RGB(20, 17, 38)
#define C_CARD_SEL RGB(52, 43, 86)
#define C_LINE     RGB(62, 51, 105)
#define C_SOFT     RGB(42, 35, 74)
#define C_GOLD     RGB(255, 215, 106)
#define C_GOLD_L   RGB(255, 233, 168)
#define C_GOLD_D   RGB(226, 165, 62)
#define C_TXT      RGB(240, 235, 255)
#define C_MUT      RGB(163, 154, 205)
#define C_DIM      RGB(115, 106, 155)
#define C_GREEN    RGB(142, 226, 158)
#define C_CYAN     RGB(140, 228, 255)
#define C_RED      RGB(255, 125, 140)
#define C_BTN_TXT  RGB(48, 30, 4)

static HINSTANCE g_hInst;
static int W = 1040, H = 690;
static int PW = 480, PH = 240;

enum { FT_MICRO, FT_TINY, FT_SMALL, FT_SMALLB, FT_NORM, FT_BOLD, FT_MID, FT_BIG, FT_HUGE, FT_LOGO, FT_COUNT };
static HFONT g_f[FT_COUNT];
static void fonts_init(void) {
  static const int px[FT_COUNT] = { 15, 17, 20, 20, 23, 23, 30, 44, 58, 33 };
  static const int wt[FT_COUNT] = { FW_NORMAL, FW_NORMAL, FW_NORMAL, FW_SEMIBOLD, FW_NORMAL,
                                    FW_BOLD, FW_BOLD, FW_BOLD, FW_BLACK, FW_BOLD };
  for (int i = 0; i < FT_COUNT; i++) {
    g_f[i] = CreateFontW(-px[i], 0, 0, 0, wt[i], 0, 0, 0, DEFAULT_CHARSET,
                         OUT_DEFAULT_PRECIS, CLIP_DEFAULT_PRECIS, CLEARTYPE_QUALITY,
                         DEFAULT_PITCH | FF_DONTCARE, L"Segoe UI");
    if (!g_f[i]) g_f[i] = (HFONT)GetStockObject(DEFAULT_GUI_FONT);
  }
}
static void fill_rect(HDC h, int x, int y, int w, int hh, COLORREF c) {
  RECT r = { x, y, x + w, y + hh };
  HBRUSH br = CreateSolidBrush(c);
  FillRect(h, &r, br);
  DeleteObject(br);
}
static void grad_v(HDC h, int x, int y, int w, int hh, COLORREF a, COLORREF b) {
  if (hh <= 0 || w <= 0) return;
  for (int i = 0; i < hh; i++) {
    double t = hh <= 1 ? 0 : (double)i / (hh - 1);
    fill_rect(h, x, y + i, w, 1,
              RGB((int)(GetRValue(a) + (GetRValue(b) - GetRValue(a)) * t),
                  (int)(GetGValue(a) + (GetGValue(b) - GetGValue(a)) * t),
                  (int)(GetBValue(a) + (GetBValue(b) - GetBValue(a)) * t)));
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
static void text_shadow(HDC h, const wchar_t *s, int x, int y, int w, int hh, COLORREF c,
                        HFONT f, UINT fmt, int tracking, COLORREF sh, int dy) {
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
  for (int k = 0; k < 8; k++) {
    double a0 = (phase + k * 45) * 3.14159265 / 180.0;
    double a1 = a0 + 0.5;
    int t = (k + 6) % 8;
    COLORREF c = RGB((int)(90 + 165 * t / 7.0), (int)(70 + 145 * t / 7.0), 30);
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
  for (int i = 0; i < 120; i++) {
    int x = rand() % w, y = rand() % (hh * 2 / 3);
    int b = rand() % 100;
    int v = 60 + b;
    fill_rect(h, x, y, b > 88 ? 2 : 1, b > 88 ? 2 : 1, RGB(v / 2, v / 2, v));
  }
}

/* ------------------------------------------------- estado da UI */
enum { B_NONE = -1, B_REFRESH, B_PLAY, B_AUTOUPD, B_SITE, B_LUPDATE, B_OPEN, B_PQUIT };
typedef struct { int id; RECT r; } Btn;
static Btn g_btns[20];
static int g_btnCount = 0;
static int g_hoverBtn = B_NONE, g_pressBtn = B_NONE;
static int g_hoverRow = -1;
static int g_selIdx = -1;
static int g_scroll = 0;
static int g_autoUpd = 1;
static int g_autoPlay = 0;      /* depois do download, já joga */
static int g_aniPhase = 0;
static wchar_t g_statusW[420];
static int g_statusErr = 0;

#define LV_X0 24
#define LV_Y0 84
#define LV_W  330
#define RV_X0 376
#define CARD_H (H - LV_Y0 - 74)

static void btn_add(int id, int x, int y, int w, int h) {
  if (g_btnCount >= 20) return;
  Btn *b = &g_btns[g_btnCount++];
  b->id = id;
  SetRect(&b->r, x, y, x + w, y + h);
}
static int btn_hit(int x, int y, int *id) {
  for (int i = 0; i < g_btnCount; i++)
    if (PtInRect(&g_btns[i].r, POINT{ x, y })) { *id = g_btns[i].id; return 1; }
  return 0;
}
static void status_set(const wchar_t *s, int err) {
  wcsncpy(g_statusW, s, 419);
  g_statusW[419] = 0;
  g_statusErr = err;
}
static int row_h(void) { return 62; }
static int list_top(void) { return LV_Y0 + 56; }
static int visible_rows(void) {
  int v = (CARD_H - 56 - 10) / row_h();
  return v < 1 ? 1 : v;
}
static int list_hit_row(int y) {
  int k = (y - list_top()) / row_h();
  int idx = k + g_scroll;
  if (y < list_top()) return -1;
  if (k < 0 || idx < 0 || idx >= g_verCount || idx >= g_scroll + visible_rows()) return -1;
  return idx;
}
static void select_row(int idx) {
  if (idx < 0 || idx >= g_verCount) return;
  g_selIdx = idx;
  InvalidateRect(g_hwnd, NULL, FALSE);
}
static void refresh_rows(void) {
  find_installed();
  if (g_verCount > 0 && (g_selIdx < 0 || g_selIdx >= g_verCount)) {
    g_selIdx = g_verCount - 1;            /* começa na mais recente */
    for (int i = g_verCount - 1; i >= 0; i--)
      if (g_vers[i].installed) { g_selIdx = i; break; }
  }
  g_scroll = 0;
}
static void layout_ui(void) {
  g_btnCount = 0;
  int rw = W - RV_X0 - 24;
  btn_add(B_PLAY, LV_X0 + 20, LV_Y0 + CARD_H - 76, LV_W - 40, 56);
  btn_add(B_AUTOUPD, LV_X0 + 16, LV_Y0 + CARD_H - 112, LV_W - 32, 30);
  btn_add(B_SITE, LV_X0 + 14, LV_Y0 + 8, 300, 44);
  btn_add(B_REFRESH, RV_X0 + rw - 124, LV_Y0 + 12, 104, 28);
  btn_add(B_LUPDATE, W - 356, 18, 220, 30);
}
static void badge_pill(HDC h, const wchar_t *txt, int x, int y, int kind) {
  int tw = text_wid(h, txt, g_f[FT_MICRO]);
  COLORREF bg = kind == 0 ? RGB(20, 56, 38) : (kind == 1 ? RGB(24, 58, 82) : RGB(86, 62, 20));
  COLORREF fg = kind == 0 ? C_GREEN : (kind == 1 ? C_CYAN : C_GOLD);
  round_fill(h, x, y, tw + 16, 20, 10, bg);
  text_w(h, txt, x, y - 1, tw + 16, 20, fg, g_f[FT_MICRO], DT_CENTER | DT_VCENTER | DT_SINGLELINE, 0);
}
static int ver_kind(Ver *v) {
  return v->installed ? 0 : 1;   /* 0 instalada, 1 não instalada */
}
static void open_site_releases(void) {
  ShellExecuteW(NULL, L"open", L"https://github.com/Arthurowgg/htmlgame/releases",
                NULL, NULL, SW_SHOWNORMAL);
}

/* ------------------------------------------------ spawn do jogador */
static void spawn_player(const char *tag) {
  wchar_t exe[MAX_PATH * 2];
  GetModuleFileNameW(NULL, exe, MAX_PATH * 2);
  wchar_t cmd[MAX_PATH * 2 + 60];
  _snwprintf(cmd, MAX_PATH * 2 + 60, L"\"%s\" --play --ver %hs", exe, tag);
  STARTUPINFOW si;
  PROCESS_INFORMATION pi;
  memset(&si, 0, sizeof(si));
  si.cb = sizeof(si);
  memset(&pi, 0, sizeof(pi));
  if (CreateProcessW(exe, cmd, NULL, NULL, FALSE, 0, NULL, NULL, &si, &pi)) {
    CloseHandle(pi.hThread);
    CloseHandle(pi.hProcess);
  } else {
    DWORD le = GetLastError();
    wchar_t m[420];
    _snwprintf(m, 420, L"Não consegui iniciar o jogo (erro %lu).", le);
    MessageBoxW(g_hwnd, m, L"Grand Pixel Game", MB_OK | MB_ICONERROR);
  }
}
static void play_or_install(void) {
  if (g_selIdx < 0 || g_selIdx >= g_verCount) return;
  Ver *v = &g_vers[g_selIdx];
  if (v->installed) {
    spawn_player(v->tag);
    wchar_t st[220];
    _snwprintf(st, 220, L"abrindo %hs em janela própria. Boa jornada!", v->ver);
    status_set(st, 0);
    ShowWindow(g_hwnd, SW_MINIMIZE);
  } else if (v->url[0] && !g_downloading) {
    g_autoPlay = 1;
    status_set(L"baixando e instalando… (o jogo abre quando terminar)", 0);
    start_download(g_hwnd, g_selIdx);
    InvalidateRect(g_hwnd, NULL, FALSE);
  }
}

/* ------------------------------------------------ paint launcher */
static void paint_launcher(HDC hdc) {
  grad_v(hdc, 0, 0, W, H, C_BG1, C_BG2);
  draw_starfield(hdc, W, H);
  fill_rect(hdc, 0, 0, W, 3, C_GOLD_D);

  /* cabeçalho */
  star_poly(hdc, 40, 32, 12, C_GOLD);
  text_shadow(hdc, L"GRAND PIXEL GAME", 60, 12, 420, 36, C_GOLD, g_f[FT_LOGO],
              DT_LEFT | DT_VCENTER | DT_SINGLELINE, 6, RGB(0, 0, 0), 2);
  {
    wchar_t v[80];
    _snwprintf(v, 80, L"LAUNCHER  v%s", GPG_LAUNCHER_VER);
    text_w(hdc, v, 470, 14, 200, 24, C_MUT, g_f[FT_TINY], DT_LEFT | DT_VCENTER | DT_SINGLELINE, 3);
  }
  /* chip: novo launcher disponível */
  if (g_hasNewLauncher) {
    int hot = g_hoverBtn == B_LUPDATE && g_pressBtn != B_LUPDATE;
    wchar_t t[80];
    _snwprintf(t, 80, L"novo launcher %s — ver", g_newLauncherVer);
    round_fill(hdc, W - 372, 18, 240, 30, 15, hot ? RGB(120, 88, 26) : RGB(92, 66, 20));
    round_stroke(hdc, W - 372, 18, 240, 30, 15, C_GOLD_D, 1);
    text_w(hdc, t, W - 372, 17, 240, 30, C_GOLD_L, g_f[FT_SMALLB], DT_CENTER | DT_VCENTER | DT_SINGLELINE, 0);
  } else {
    text_w(hdc, L"launcher atualizado", W - 300, 18, 160, 26, C_DIM, g_f[FT_SMALL],
           DT_RIGHT | DT_VCENTER | DT_SINGLELINE, 0);
  }

  /* card esquerdo */
  int lx = LV_X0, ly = LV_Y0, lw = LV_W, lh = CARD_H;
  grad_round(hdc, lx, ly, lw, lh, 20, C_CARD1, C_CARD2);
  round_stroke(hdc, lx, ly, lw, lh, 20, C_LINE, 1);
  text_w(hdc, L"VERSÃO DO JOGO", lx + 22, ly + 16, 220, 18, C_GOLD_D, g_f[FT_MICRO],
         DT_LEFT | DT_SINGLELINE, 4);
  Ver *v = (g_selIdx >= 0 && g_selIdx < g_verCount) ? &g_vers[g_selIdx] : NULL;
  if (v) {
    text_shadow(hdc, utf8w(v->ver), lx + 20, ly + 40, lw - 40, 56, C_TXT, g_f[FT_HUGE],
                DT_LEFT | DT_SINGLELINE, 2, RGB(0, 0, 0), 2);
    badge_pill(hdc, v->installed ? L"INSTALADA" : L"NOVA", lx + 22, ly + 102,
               v->installed ? 0 : 2);
    wchar_t d[100];
    if (v->size > 0)
      _snwprintf(d, 100, L"publicada em %hs  ·  %.1f MB", v->date, v->size / 1048576.0);
    else
      _snwprintf(d, 100, L"publicada em %hs", v->date);
    text_w(hdc, d, lx + 22, ly + 138, lw - 44, 20, C_MUT, g_f[FT_SMALL], DT_LEFT | DT_SINGLELINE, 0);
    text_w(hdc, L"conteúdo baixado do GitHub e rodado localmente —\nsem instalação, sem programas extras.",
           lx + 22, ly + 168, lw - 44, 60, C_DIM, g_f[FT_SMALL], DT_LEFT | DT_WORDBREAK, 0);
  } else {
    text_w(hdc, L"nenhuma versão encontrada", lx + 22, ly + 50, lw - 44, 30, C_MUT, g_f[FT_NORM],
           DT_LEFT | DT_SINGLELINE, 0);
  }

  /* checkbox auto-atualização */
  {
    int ax = lx + 22, ay = ly + lh - 134;
    draw_circle(hdc, ax + 9, ay + 9, 9, g_autoUpd ? C_GOLD : C_LINE, 2);
    if (g_autoUpd) {
      line(hdc, ax + 6, ay + 9, ax + 10, ay + 13, C_GOLD, 2);
      line(hdc, ax + 10, ay + 13, ax + 16, ay + 4, C_GOLD, 2);
    }
    text_w(hdc, L"baixar automaticamente a versão mais nova", ax + 26, ay - 2, 270, 26,
           g_autoUpd ? C_TXT : C_MUT, g_f[FT_SMALL], DT_LEFT | DT_VCENTER | DT_SINGLELINE, 0);
  }

  /* botão principal */
  {
    Btn *b = NULL;
    for (int i = 0; i < g_btnCount; i++) if (g_btns[i].id == B_PLAY) { b = &g_btns[i]; break; }
    if (b) {
      int bx = b->r.left, by = b->r.top, bw = b->r.right - b->r.left, bh = b->r.bottom - b->r.top;
      int hot = g_hoverBtn == B_PLAY && g_pressBtn != B_PLAY;
      int installing = g_downloading && g_dlIndex == g_selIdx;
      if (v && (v->installed || installing)) {
        grad_round(hdc, bx, by, bw, bh, 16, hot ? RGB(255, 240, 190) : C_GOLD_L,
                   hot ? C_GOLD : C_GOLD_D);
        round_stroke(hdc, bx, by, bw, bh, 16, RGB(255, 246, 214), 1);
        if (!installing) {
          play_tri(hdc, bx + 42, by + bh / 2, 11, C_BTN_TXT);
          text_w(hdc, L"JOGAR", bx + 40, by, bw - 60, bh, C_BTN_TXT, g_f[FT_MID],
                 DT_CENTER | DT_VCENTER | DT_SINGLELINE, 5);
        } else {
          draw_spinner(hdc, bx + 42, by + bh / 2, 10, g_aniPhase);
          text_w(hdc, L"BAIXANDO…", bx + 40, by, bw - 60, bh, C_BTN_TXT, g_f[FT_MID],
                 DT_CENTER | DT_VCENTER | DT_SINGLELINE, 4);
        }
      } else if (v) {
        grad_round(hdc, bx, by, bw, bh, 16, hot ? RGB(56, 66, 122) : RGB(40, 46, 92),
                   hot ? RGB(48, 56, 104) : RGB(28, 33, 66));
        round_stroke(hdc, bx, by, bw, bh, 16, hot ? C_GOLD : C_GOLD_D, 1);
        draw_arrow_down(hdc, bx + 46, by + bh / 2, 9, C_GOLD);
        text_w(hdc, L"INSTALAR E JOGAR", bx + 24, by, bw - 48, bh, C_GOLD, g_f[FT_BOLD],
               DT_CENTER | DT_VCENTER | DT_SINGLELINE, 2);
      } else {
        grad_round(hdc, bx, by, bw, bh, 16, RGB(52, 47, 76), RGB(40, 36, 62));
        text_w(hdc, L"…", bx, by, bw, bh, C_DIM, g_f[FT_MID], DT_CENTER | DT_VCENTER | DT_SINGLELINE, 0);
      }
    }
  }

  /* card direito: versões do jogo */
  int rx = RV_X0, ry = LV_Y0, rw = W - RV_X0 - 24, rh = CARD_H;
  grad_round(hdc, rx, ry, rw, rh, 20, RGB(27, 22, 48), RGB(18, 15, 34));
  round_stroke(hdc, rx, ry, rw, rh, 20, C_LINE, 1);
  text_w(hdc, L"VERSÕES DO JOGO NO GITHUB", rx + 22, ry + 16, 300, 18, C_MUT, g_f[FT_MICRO],
         DT_LEFT | DT_SINGLELINE, 4);
  {
    int hx = rx + rw - 124, hy = ry + 10;
    int hot = g_hoverBtn == B_REFRESH && g_pressBtn != B_REFRESH;
    round_fill(hdc, hx, hy, 104, 28, 14, hot ? RGB(62, 54, 100) : RGB(36, 31, 62));
    if (g_fetching) draw_spinner(hdc, hx + 18, hy + 14, 8, g_aniPhase);
    text_w(hdc, g_fetching ? L"verificando" : L"verificar agora",
           hx + (g_fetching ? 34 : 0), hy - 1, 104 - (g_fetching ? 32 : 0), 28,
           hot ? C_TXT : C_MUT, g_f[FT_SMALL], DT_CENTER | DT_VCENTER | DT_SINGLELINE, 0);
  }
  int yTop = list_top();
  for (int i = 0; i < visible_rows(); i++) {
    int idx = i + g_scroll;
    if (idx >= g_verCount) break;
    Ver *vv = &g_vers[idx];
    int y = yTop + i * row_h();
    int isSel = idx == g_selIdx;
    if (isSel) {
      grad_round(hdc, rx + 12, y, rw - 24, row_h() - 10, 14, C_CARD_SEL, RGB(42, 35, 72));
      round_stroke(hdc, rx + 12, y, rw - 24, row_h() - 10, 14, C_GOLD_D, 1);
    } else if (idx == g_hoverRow) {
      round_fill(hdc, rx + 12, y, rw - 24, row_h() - 10, 14, RGB(44, 38, 74));
    }
    int cx = rx + 38, cy = y + (row_h() - 10) / 2;
    draw_circle(hdc, cx, cy, 8, isSel ? C_GOLD : RGB(90, 80, 130), isSel ? 2 : 1);
    if (isSel) fill_rect(hdc, cx - 3, cy - 3, 7, 7, C_GOLD);
    wchar_t *tagW = utf8w(vv->ver);
    text_w(hdc, tagW, cx + 22, y, 150, row_h() - 12, isSel ? C_TXT : RGB(216, 208, 240),
           g_f[FT_MID], DT_LEFT | DT_VCENTER | DT_SINGLELINE, 0);
    free(tagW);
    wchar_t sub[110];
    if (vv->size > 0)
      _snwprintf(sub, 110, L"%hs  ·  %.1f MB", vv->date, vv->size / 1048576.0);
    else
      _snwprintf(sub, 110, L"%hs", vv->date);
    text_w(hdc, sub, cx + 24, y + 30, 240, 16, C_DIM, g_f[FT_MICRO], DT_LEFT | DT_SINGLELINE, 0);
    if (vv->installed) badge_pill(hdc, L"INSTALADA", rx + rw - 24 - 96, cy - 10, 0);
    else if (idx == g_verCount - 1) badge_pill(hdc, L"NOVA", rx + rw - 24 - 72, cy - 10, 2);
    if (i < visible_rows() - 1 && idx + 1 < g_verCount)
      fill_rect(hdc, rx + 34, y + row_h() - 8, rw - 68, 1, RGB(38, 32, 64));
  }
  if (g_verCount == 0) {
    text_w(hdc, g_fetching ? L"consultando o GitHub…" :
           (g_fetchFailed ? L"sem conexão — clique em verificar agora" : L"nenhuma versão encontrada"),
           rx + 24, yTop + 30, rw - 48, 30, C_MUT, g_f[FT_NORM], DT_CENTER | DT_SINGLELINE, 0);
  }
  int maxScroll = g_verCount - visible_rows();
  if (maxScroll > 0) {
    int sh = rh - 56 - 10;
    int th = sh / (maxScroll + 1);
    if (th < 26) th = 26;
    int ty = yTop + g_scroll * (sh - th) / maxScroll;
    round_fill(hdc, rx + rw - 11, ty, 5, th, 2, C_DIM);
  }

  /* rodapé: status/progresso */
  int fy = H - 44;
  fill_rect(hdc, 0, fy - 8, W, 1, RGB(40, 33, 70));
  if (g_downloading) {
    draw_spinner(hdc, 32, fy + 20, 9, g_aniPhase);
    double pct = g_dlTotal > 0 ? (double)g_dlGot / g_dlTotal : 0;
    wchar_t st[260];
    _snwprintf(st, 260, L"baixando %hs  ·  %d%%", g_dlTag, (int)(pct * 100));
    text_w(hdc, st, 54, fy + 4, 330, 30, C_TXT, g_f[FT_SMALLB], DT_LEFT | DT_VCENTER | DT_SINGLELINE, 0);
    int bx = 420, bw = W - 420 - 260;
    round_fill(hdc, bx, fy + 15, bw, 14, 7, RGB(24, 21, 44));
    round_stroke(hdc, bx, fy + 15, bw, 14, 7, RGB(52, 44, 90), 1);
    int fw = (int)(bw * pct);
    if (fw > 4) {
      HRGN rg = CreateRoundRectRgn(bx, fy + 15, bx + fw, fy + 29, 14, 14);
      SelectClipRgn(hdc, rg);
      grad_v(hdc, bx, fy + 15, fw, 14, C_GOLD_L, C_GOLD_D);
      SelectClipRgn(hdc, NULL);
      DeleteObject(rg);
    }
    wchar_t mb[60];
    if (g_dlTotal > 0)
      _snwprintf(mb, 60, L"%.1f / %.1f MB", g_dlGot / 1048576.0, g_dlTotal / 1048576.0);
    else
      _snwprintf(mb, 60, L"%.1f MB", g_dlGot / 1048576.0);
    text_w(hdc, mb, W - 240, fy + 4, 190, 30, C_MUT, g_f[FT_SMALL], DT_RIGHT | DT_VCENTER | DT_SINGLELINE, 0);
  } else {
    if (g_fetching) draw_spinner(hdc, 30, fy + 20, 9, g_aniPhase);
    else if (g_statusErr) { draw_circle(hdc, 30, fy + 20, 7, C_RED, 2); }
    else fill_rect(hdc, 27, fy + 17, 7, 7, C_GREEN);
    text_w(hdc, g_statusW, 54, fy + 6, W - 300, 28, g_statusErr ? C_RED : C_MUT,
           g_f[FT_SMALL], DT_LEFT | DT_VCENTER | DT_SINGLELINE, 0);
    text_w(hdc, L"a versão do jogo fica sempre no GitHub — sem .exe de jogo",
           W - 320, fy + 6, 296, 28, C_DIM, g_f[FT_MICRO], DT_RIGHT | DT_VCENTER | DT_SINGLELINE, 0);
    star_poly(hdc, W - 20, fy + 20, 6, C_GOLD_D);
  }
}

/* ------------------------------------------------ janela do jogador */
static HWND g_playerWnd = NULL;
static int g_openedBrowser = 0;
static char g_runTag[40] = "";      /* versão que este processo serve */

static void player_layout(void) {
  g_btnCount = 0;
  int bw = (PW - 128) / 2;
  btn_add(B_OPEN, 34, PH - 66, bw, 48);
  btn_add(B_PQUIT, 34 + bw + 60, PH - 66, bw, 48);
}
static void paint_player(HDC hdc) {
  grad_v(hdc, 0, 0, PW, PH, C_BG1, C_BG2);
  draw_starfield(hdc, PW, PH);
  fill_rect(hdc, 0, 0, PW, 3, C_GOLD_D);
  grad_round(hdc, 28, 30, 54, 54, 27, RGB(126, 100, 46), RGB(64, 46, 18));
  round_stroke(hdc, 28, 30, 54, 54, 27, RGB(190, 150, 70), 2);
  star_poly(hdc, 55, 57, 16, C_GOLD_L);
  text_shadow(hdc, L"GRAND PIXEL GAME", 96, 30, PW - 130, 30, C_GOLD, g_f[FT_LOGO],
              DT_LEFT | DT_SINGLELINE, 4, RGB(0, 0, 0), 2);
  wchar_t v[90];
  _snwprintf(v, 90, L"jogando %hs", g_srvVer[0] ? g_srvVer : "?");
  text_w(hdc, v, 98, 68, PW - 130, 22, C_CYAN, g_f[FT_SMALLB], DT_LEFT | DT_SINGLELINE, 0);
  text_w(hdc, L"servidor local ativo — o jogo roda em janela própria",
         98, 94, PW - 120, 20, RGB(204, 196, 234), g_f[FT_SMALL], DT_LEFT | DT_SINGLELINE, 0);
  {
    const wchar_t *adr = L"http://127.0.0.1:8137";
    int tw = text_wid(hdc, adr, g_f[FT_SMALLB]);
    round_fill(hdc, 98, 122, tw + 30, 26, 13, RGB(20, 38, 44));
    round_stroke(hdc, 98, 122, tw + 30, 26, 13, RGB(44, 82, 94), 1);
    fill_rect(hdc, 108, 131, 7, 7, C_GREEN);
    text_w(hdc, adr, 124, 121, tw, 26, C_TXT, g_f[FT_SMALLB], DT_LEFT | DT_VCENTER | DT_SINGLELINE, 0);
  }
  for (int i = 0; i < g_btnCount; i++) {
    Btn *b = &g_btns[i];
    int x = b->r.left, y = b->r.top, w = b->r.right - b->r.left, h = b->r.bottom - b->r.top;
    int hot = g_hoverBtn == b->id && g_pressBtn != b->id;
    if (b->id == B_OPEN) {
      grad_round(hdc, x, y, w, h, 15, hot ? RGB(255, 240, 190) : C_GOLD_L,
                 hot ? C_GOLD : C_GOLD_D);
      round_stroke(hdc, x, y, w, h, 15, RGB(255, 246, 214), 1);
      play_tri(hdc, x + 34, y + h / 2, 9, C_BTN_TXT);
      text_w(hdc, L"ABRIR JOGO", x + 24, y, w - 34, h, C_BTN_TXT, g_f[FT_BOLD],
             DT_CENTER | DT_VCENTER | DT_SINGLELINE, 2);
    } else if (b->id == B_PQUIT) {
      round_fill(hdc, x, y, w, h, 15, hot ? RGB(96, 44, 60) : RGB(56, 30, 44));
      round_stroke(hdc, x, y, w, h, 15, hot ? RGB(255, 120, 140) : RGB(150, 66, 86), 1);
      text_w(hdc, L"ENCERRAR", x, y, w, h, RGB(255, 190, 200), g_f[FT_BOLD],
             DT_CENTER | DT_VCENTER | DT_SINGLELINE, 2);
    }
  }
}

/* ------------------------------------------------ janelas */
static LRESULT CALLBACK player_wndproc(HWND hwnd, UINT msg, WPARAM wp, LPARAM lp) {
  switch (msg) {
    case WM_CREATE: {
      g_playerWnd = hwnd;
      g_hwnd = hwnd;
      player_layout();
      if (!g_runTag[0]) {
        MessageBoxW(hwnd, L"Não sei qual versão rodar (faltou o parâmetro). Use o launcher.",
                    L"Grand Pixel Game", MB_OK | MB_ICONWARNING);
        DestroyWindow(hwnd);
        return 0;
      }
      wchar_t webW[MAX_PATH * 2];
      version_web_dir(g_runTag, webW, MAX_PATH * 2);
      if (!version_installed(g_runTag)) {
        MessageBoxW(hwnd, L"O conteúdo desta versão não está instalado.\n"
                    L"Abra o launcher e clique em INSTALAR E JOGAR.",
                    L"Grand Pixel Game", MB_OK | MB_ICONINFORMATION);
        DestroyWindow(hwnd);
        return 0;
      }
      WideCharToMultiByte(CP_UTF8, 0, webW, -1, g_webRootA, sizeof(g_webRootA), NULL, NULL);
      _snprintf(g_srvVer, sizeof(g_srvVer), "%s", g_runTag);
      if (!start_server()) {
        char other[48] = "";
        if (probe_server(other, sizeof(other))) {
          if (strcmp(other, g_srvVer) == 0) {
            open_game_window();
            DestroyWindow(hwnd);
            return 0;
          }
          request_quit_server();
          if (start_server()) {
            SetTimer(hwnd, 1, 700, NULL);
            return 0;
          }
        }
        MessageBoxW(hwnd, L"Não consegui iniciar o servidor local (porta 8137 ocupada).\n\n"
                    L"Feche o programa que estiver usando a porta 8137 e tente de novo.",
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
      paint_player(mem);
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
        if (id == B_OPEN) open_game_window();
        else if (id == B_PQUIT) DestroyWindow(hwnd);
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
      layout_ui();
      status_set(L"verificando versões do jogo no GitHub…", 0);
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
      int best = -1;
      for (int i = g_verCount - 1; i >= 0; i--)
        if (!g_vers[i].installed && g_vers[i].url[0]) { best = i; break; }
      if (best >= 0) {
        if (g_autoUpd) {
          g_selIdx = best;
          wchar_t st[240];
          _snwprintf(st, 240, L"versão %hs disponível — baixando automaticamente…",
                     g_vers[best].ver);
          status_set(st, 0);
          start_download(hwnd, best);
        } else {
          g_selIdx = best;
          wchar_t st[240];
          _snwprintf(st, 240, L"versão %hs disponível — clique em INSTALAR E JOGAR.",
                     g_vers[best].ver);
          status_set(st, 0);
        }
      } else if (g_verCount > 0) {
        status_set(L"você está com a versão mais recente do jogo.", 0);
      }
      InvalidateRect(hwnd, NULL, FALSE);
      return 0;
    }
    case WM_APP_NETFAIL:
      g_fetchFailed = 1;
      g_fetching = 0;
      status_set(L"sem conexão com o GitHub — verifique sua internet.", 1);
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
        int idx = find_ver(g_dlTag);
        if (idx >= 0) {
          g_vers[idx].installed = version_installed(g_dlTag);
          g_selIdx = idx;
        }
        wchar_t st[240];
        _snwprintf(st, 240, L"%hs instalado!", g_dlTag);
        status_set(st, 0);
        InvalidateRect(hwnd, NULL, FALSE);
        if (g_autoPlay) {
          g_autoPlay = 0;
          play_or_install();
        }
        return 0;
      }
      status_set(g_dlError[0] ? g_dlError : L"falha no download. Tente de novo.", 1);
      InvalidateRect(hwnd, NULL, FALSE);
      return 0;
    }
    case WM_LBUTTONDOWN: {
      int x = GET_X_LPARAM(lp), y = GET_Y_LPARAM(lp);
      g_pressBtn = B_NONE;
      int id;
      if (btn_hit(x, y, &id)) {
        g_pressBtn = id;
        if (id == B_REFRESH) {
          if (!g_fetching && !g_downloading) {
            status_set(L"verificando versões…", 0);
            start_fetch(hwnd);
          }
          return 0;
        }
        if (id == B_PLAY) { play_or_install(); return 0; }
        if (id == B_AUTOUPD) { g_autoUpd = !g_autoUpd; InvalidateRect(hwnd, NULL, FALSE); return 0; }
        if (id == B_SITE) { open_site_releases(); return 0; }
        if (id == B_LUPDATE) { open_site_releases(); return 0; }
        return 0;
      }
      int row = list_hit_row(y);
      if (row >= 0 && x >= RV_X0 && x < RV_X0 + (W - RV_X0 - 24)) select_row(row);
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
      g_hoverRow = (x >= RV_X0 && x < RV_X0 + (W - RV_X0 - 24)) ? list_hit_row(y) : -1;
      if (oldBtn != g_hoverBtn || oldRow != g_hoverRow)
        InvalidateRect(hwnd, NULL, FALSE);
      return 0;
    }
    case WM_MOUSEWHEEL: {
      int delta = GET_WHEEL_DELTA_WPARAM(wp);
      int maxScroll = g_verCount - visible_rows();
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
                 (pt.x >= RV_X0 && pt.x < RV_X0 + (W - RV_X0 - 24) && list_hit_row(pt.y) >= 0);
      SetCursor(LoadCursor(NULL, over ? IDC_HAND : IDC_ARROW));
      return 1;
    }
    case WM_KEYDOWN:
      if (wp == VK_RETURN) { play_or_install(); return 0; }
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

/* ------------------------------------------------------- entrada */
static wchar_t g_runMutexName[160];

int WINAPI wWinMain(HINSTANCE hInst, HINSTANCE hPrev, PWSTR lpCmd, int nShow) {
  (void)hPrev;
  (void)nShow;
  g_hInst = hInst;
  HMODULE ud = LoadLibraryA("user32.dll");
  if (ud) {
    typedef BOOL(WINAPI *Fn)(int);
    Fn f = (Fn)(void *)GetProcAddress(ud, "SetProcessDpiAwarenessContext");
    if (f) f(-4);
  }
  fonts_init();
  ensure_appdir();

  int playMode = (wcsstr(lpCmd, L"--play") != NULL);
  char exePath[MAX_PATH * 2] = "";
  DWORD el = GetModuleFileNameA(NULL, exePath, sizeof(exePath));
  if (el < sizeof(exePath)) exePath[el] = 0;
  log_line("=== Grand Pixel Game Launcher v%s | modo %s | exe: %s ===",
           GPG_LAUNCHER_VER, playMode ? "jogador" : "launcher", exePath);

  static wchar_t clsLauncher[] = L"GPGLauncher_v2";
  static wchar_t clsPlayer[160];
  HANDLE runMutex = NULL;
  if (playMode) {
    const wchar_t *vp = wcsstr(lpCmd, L"--ver");
    if (vp) {
      const wchar_t *val = vp + 4;
      if (*val == L'=') val++;
      else while (*val == L' ' || *val == L'\t') val++;
      wchar_t tw[80];
      int i = 0;
      while (val[i] && val[i] != L' ' && val[i] != L'\t' && i < 79) { tw[i] = val[i]; i++; }
      tw[i] = 0;
      if (tw[0]) {
        char ta[80];
        WideCharToMultiByte(CP_UTF8, 0, tw, -1, ta, sizeof(ta), NULL, NULL);
        _snprintf(g_runTag, sizeof(g_runTag), "%s", ta);
      }
    }
    if (!g_runTag[0]) {
      _snprintf(g_runTag, sizeof(g_runTag), "v%s", "?");
    }
    char safe[80];
    _snprintf(safe, sizeof(safe), "%s", g_runTag);
    for (char *p = safe; *p; p++) if (*p == '.' || *p == '-') *p = '_';
    MultiByteToWideChar(CP_UTF8, 0, safe, -1, clsPlayer, 140);
    wcscat(clsPlayer, L"_GPGPlay");
    _snwprintf(g_runMutexName, 160, L"GrandPixelGame_Run_%hs", safe);
    runMutex = CreateMutexW(NULL, FALSE, g_runMutexName);
    if (GetLastError() == ERROR_ALREADY_EXISTS) {
      HWND ex = FindWindowW(clsPlayer, NULL);
      if (ex) { ShowWindow(ex, SW_SHOW); SetForegroundWindow(ex); }
      open_game_window();
      return 0;
    }
    (void)runMutex;
  } else {
    runMutex = CreateMutexW(NULL, FALSE, L"GrandPixelGame_Launcher");
    if (GetLastError() == ERROR_ALREADY_EXISTS) {
      HWND ex = FindWindowW(clsLauncher, NULL);
      if (ex) { ShowWindow(ex, SW_SHOW); SetForegroundWindow(ex); }
      return 0;
    }
    (void)runMutex;
  }

  WNDCLASSEXW wc;
  memset(&wc, 0, sizeof(wc));
  wc.cbSize = sizeof(wc);
  wc.hInstance = hInst;
  wc.hCursor = LoadCursor(NULL, IDC_ARROW);
  wc.hIcon = LoadIconW(hInst, MAKEINTRESOURCE(1));
  wc.hIconSm = LoadIconW(hInst, MAKEINTRESOURCE(1));
  wc.lpfnWndProc = launcher_wndproc;
  wc.lpszClassName = clsLauncher;
  RegisterClassExW(&wc);

  RECT wa = { 0, 0, GetSystemMetrics(SM_CXSCREEN), GetSystemMetrics(SM_CYSCREEN) };
  DWORD style = WS_OVERLAPPED | WS_CAPTION | WS_SYSMENU | WS_MINIMIZEBOX;
  int cw = W, ch = H;
  {
    RECT wr = { 0, 0, cw, ch };
    AdjustWindowRect(&wr, style, FALSE);
    cw = wr.right - wr.left;
    ch = wr.bottom - wr.top;
  }
  int cx = wa.left + (wa.right - wa.left - cw) / 2;
  int cy = wa.top + (wa.bottom - wa.top - ch) / 2;
  if (playMode) {
    PW = 480; PH = 240;
    wc.lpfnWndProc = player_wndproc;
    wc.lpszClassName = clsPlayer;
    RegisterClassExW(&wc);
    RECT wr = { 0, 0, PW, PH };
    AdjustWindowRect(&wr, style, FALSE);
    int pcw = wr.right - wr.left, pch = wr.bottom - wr.top;
    cx = wa.left + (wa.right - wa.left - pcw) / 2;
    cy = wa.top + (wa.bottom - wa.top - pch) / 2;
    HWND hw = CreateWindowExW(0, clsPlayer, L"Grand Pixel Game — jogando",
                              style | WS_VISIBLE, cx, cy, pcw, pch, NULL, NULL, hInst, NULL);
    if (!hw) {
      DWORD le = GetLastError();
      log_line("falha ao criar janela do jogador, erro %lu", le);
      wchar_t m[600];
      _snwprintf(m, 600, L"Não consegui abrir a janela do jogo (erro %lu).\n\n"
                 L"Detalhes em %LOCALAPPDATA%\\GrandPixelGame\\launcher.log.", le);
      MessageBoxW(NULL, m, L"Grand Pixel Game", MB_OK | MB_ICONERROR);
      return 1;
    }
    log_line("janela do jogador criada, versão=%s", g_runTag);
    ShowWindow(hw, SW_SHOW);
    SetForegroundWindow(hw);
  } else {
    HWND hw = CreateWindowExW(0, clsLauncher, L"Grand Pixel Game — Launcher",
                              style | WS_VISIBLE, cx, cy, cw, ch, NULL, NULL, hInst, NULL);
    if (!hw) {
      DWORD le = GetLastError();
      log_line("falha ao criar janela do launcher, erro %lu", le);
      wchar_t m[600];
      _snwprintf(m, 600, L"Não consegui abrir o launcher (erro %lu).\n\n"
                 L"Detalhes em %LOCALAPPDATA%\\GrandPixelGame\\launcher.log.", le);
      MessageBoxW(NULL, m, L"Grand Pixel Game", MB_OK | MB_ICONERROR);
      return 1;
    }
    log_line("janela do launcher criada (hw=%p)", (void *)hw);
    ShowWindow(hw, SW_SHOW);
    SetForegroundWindow(hw);
  }

  MSG msg;
  log_line("loop de mensagens iniciado");
  while (GetMessageW(&msg, NULL, 0, 0) > 0) {
    TranslateMessage(&msg);
    DispatchMessageW(&msg);
  }
  log_line("fim normal");
  return 0;
}
