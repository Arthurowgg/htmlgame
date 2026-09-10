// Windows: janela principal, laço de mensagens, bandeja e ligação com o motor.
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <windowsx.h>
#include <shellapi.h>
#include <objbase.h>

#ifndef GPG_LAUNCHER_VER
#define GPG_LAUNCHER_VER "1.1.0"
#endif

#include <cstdio>

#include "win_internal.h"
#include "../../core/gpg_core.h"
#include "../../ui/gpg_ui.h"

#pragma comment(lib, "user32.lib")
#pragma comment(lib, "shell32.lib")

namespace gpg {
HWND g_main_hwnd = NULL;
}

using namespace gpg;

namespace {
const wchar_t* kClassName = L"GrandPixelGameLauncherWnd";
const int  kTimer = 1;
const UINT kTrayMsg = WM_APP + 11;
const UINT kTrayId = 7;
const int  WM_TRAY_RESTORE = 40001;
const int  WM_TRAY_QUIT = 40002;

struct App {
  Ui*      ui = NULL;
  Engine*  eng = NULL;
  void*    canvas = NULL;
  void*    canvas_holder = NULL;
  HDC      memdc = NULL;
  int      w = 0, h = 0;
  float    scale = 1.f;
  bool     tray = false;
  bool     closing = false;
  DWORD    last_tick = 0;
  double   acc = 0;
};
App* g_app = NULL;

HICON load_app_icon(int size) {
  HICON ico = (HICON)LoadImageW(GetModuleHandleW(NULL), L"MAINICON", IMAGE_ICON, size, size,
                                LR_DEFAULTCOLOR);
  if (!ico) ico = LoadIconW(GetModuleHandleW(NULL), L"MAINICON");
  if (!ico) ico = LoadIconW(NULL, IDI_APPLICATION);
  return ico;
}

void tray_add(HWND hwnd, HICON ico) {
  NOTIFYICONDATAW nid;
  ZeroMemory(&nid, sizeof(nid));
  nid.cbSize = sizeof(nid);
  nid.hWnd = hwnd;
  nid.uID = kTrayId;
  nid.uFlags = NIF_ICON | NIF_MESSAGE | NIF_TIP;
  nid.uCallbackMessage = kTrayMsg;
  nid.hIcon = ico;
  lstrcpynW(nid.szTip, L"Grand Pixel Game — jogo aberto (clique para voltar ao launcher)", 128);
  Shell_NotifyIconW(NIM_ADD, &nid);
}
void tray_remove(HWND hwnd) {
  NOTIFYICONDATAW nid;
  ZeroMemory(&nid, sizeof(nid));
  nid.cbSize = sizeof(nid);
  nid.hWnd = hwnd;
  nid.uID = kTrayId;
  Shell_NotifyIconW(NIM_DELETE, &nid);
}

void rebuild_canvas(App* a, HWND hwnd) {
  if (a->canvas_holder) { destroy_canvas(a->canvas_holder); a->canvas_holder = NULL; a->canvas = NULL; }
  if (a->memdc) { DeleteDC(a->memdc); a->memdc = NULL; }
  RECT rc;
  GetClientRect(hwnd, &rc);
  int pw = rc.right - rc.left, ph = rc.bottom - rc.top;
  if (pw <= 0 || ph <= 0) return;
  HDC screen = GetDC(hwnd);
  a->memdc = CreateCompatibleDC(screen);
  Assets assets;
  std::vector<ImageData> images(IMG_COUNT);
  for (int i = 0; i < IMG_COUNT; i++) {
    size_t len = 0;
    const ImageBlob* blob = embedded_png(i, &len);
    if (blob && blob->data && len) decode_png(blob->data, len, images[(size_t)i]);
  }
  void* holder = NULL;
  a->canvas = create_canvas(a->memdc, pw, ph, a->scale, &assets, images, &holder);
  a->canvas_holder = holder;
  ReleaseDC(hwnd, screen);
}

void do_paint(App* a, HWND hwnd) {
  PAINTSTRUCT ps;
  HDC dc = BeginPaint(hwnd, &ps);
  if (!a->canvas) rebuild_canvas(a, hwnd);
  if (a->canvas) {
    a->ui->resize((int)(a->w / a->scale), (int)(a->h / a->scale), a->scale);
    a->ui->paint(*(Canvas*)a->canvas);
    canvas_finish(a->canvas);
  }
  EndPaint(hwnd, &ps);
}

void tick(App* a, HWND hwnd) {
  DWORD now = GetTickCount();
  double dt = (now - a->last_tick) / 1000.0;
  a->last_tick = now;
  if (dt > 0.25) dt = 0.25;
  // eventos do motor
  Event ev;
  while (a->eng->poll_event(ev)) a->ui->on_engine_event(ev);
  a->ui->tick(dt);
  if (a->ui->wants_minimize()) {
    a->ui->clear_minimize();
    ShowWindow(hwnd, SW_MINIMIZE);
  }
  if (a->ui->wants_close_after_play()) {
    a->ui->clear_close_flag();
    // o launcher continua servindo o jogo: vai para a bandeja
    if (ShowWindow(hwnd, SW_HIDE)) tray_add(hwnd, load_app_icon(16));
    a->tray = true;
  }
  if (a->ui->wants_quit()) { PostMessageW(hwnd, WM_CLOSE, 0, 0); return; }
  InvalidateRect(hwnd, NULL, FALSE);
}

}  // namespace

LRESULT CALLBACK WndProc(HWND hwnd, UINT msg, WPARAM wp, LPARAM lp) {
  App* a = g_app;
  switch (msg) {
    case WM_CREATE:
      SetTimer(hwnd, kTimer, 33, NULL);
      if (a) a->last_tick = GetTickCount();
      return 0;

    case WM_NCCALCSIZE:
      if (wp == TRUE) return 0;      // janela sem moldura: desenhamos tudo
      break;

    case WM_NCHITTEST: {
      if (!a) break;
      RECT rc;
      GetWindowRect(hwnd, &rc);
      int x = GET_X_LPARAM(lp) - rc.left;
      int y = GET_Y_LPARAM(lp) - rc.top;
      const int b = (int)(6 * a->scale);
      bool top = y < b, bottom = y > rc.bottom - rc.top - b;
      bool left = x < b, right = x > rc.right - rc.left - b;
      if (top && left) return HTTOPLEFT;
      if (top && right) return HTTOPRIGHT;
      if (bottom && left) return HTBOTTOMLEFT;
      if (bottom && right) return HTBOTTOMRIGHT;
      if (top) return HTTOP;
      if (bottom) return HTBOTTOM;
      if (left) return HTLEFT;
      if (right) return HTRIGHT;
      // barra de título: arrasta a janela (menos nos botões)
      float ly = (float)y / a->scale;
      float lx = (float)x / a->scale;
      if (ly < m::TITLE_H && !(lx > a->w / a->scale - 80)) return HTCAPTION;
      return HTCLIENT;
    }

    case WM_GETMINMAXINFO: {
      MINMAXINFO* mmi = (MINMAXINFO*)lp;
      mmi->ptMinTrackSize.x = (LONG)(1000 * (a ? a->scale : 1.f));
      mmi->ptMinTrackSize.y = (LONG)(660 * (a ? a->scale : 1.f));
      return 0;
    }

    case WM_SIZE:
      if (a) {
        a->w = LOWORD(lp);
        a->h = HIWORD(lp);
        rebuild_canvas(a, hwnd);
      }
      return 0;

    case WM_DPICHANGED: {
      if (a) {
        a->scale = (float)HIWORD(wp) / 96.f;
        RECT* nr = (RECT*)lp;
        SetWindowPos(hwnd, NULL, nr->left, nr->top, nr->right - nr->left, nr->bottom - nr->top,
                     SWP_NOZORDER | SWP_NOACTIVATE);
        rebuild_canvas(a, hwnd);
      }
      return 0;
    }

    case WM_ERASEBKGND:
      return 1;

    case WM_PAINT:
      if (a) do_paint(a, hwnd);
      else { PAINTSTRUCT ps; BeginPaint(hwnd, &ps); EndPaint(hwnd, &ps); }
      return 0;

    case WM_TIMER:
      if (a && wp == kTimer) tick(a, hwnd);
      return 0;

    case WM_MOUSEMOVE:
      if (a) {
        a->ui->on_mouse_move((float)GET_X_LPARAM(lp) / a->scale, (float)GET_Y_LPARAM(lp) / a->scale);
        TRACKMOUSEEVENT tme{ sizeof(tme), TME_LEAVE, hwnd, 0 };
        TrackMouseEvent(&tme);
      }
      return 0;

    case WM_MOUSELEAVE:
      if (a) a->ui->on_mouse_move(-1000, -1000);
      return 0;

    case WM_LBUTTONDOWN:
      if (a) {
        SetFocus(hwnd);
        a->ui->on_mouse_down((float)GET_X_LPARAM(lp) / a->scale, (float)GET_Y_LPARAM(lp) / a->scale);
      }
      return 0;

    case WM_LBUTTONUP:
      if (a) a->ui->on_mouse_up((float)GET_X_LPARAM(lp) / a->scale, (float)GET_Y_LPARAM(lp) / a->scale);
      return 0;

    case WM_MOUSEWHEEL:
      if (a) a->ui->on_wheel((float)GET_WHEEL_DELTA_WPARAM(wp) / (float)WHEEL_DELTA);
      return 0;

    case WM_KEYDOWN:
      if (a) {
        if (wp == VK_F5) {
          a->eng->start_fetch();
        } else {
          a->ui->on_key((int)wp);
        }
      }
      return 0;

    case WM_CHAR:
      if (a && wp >= 32 && wp != 127) {
        wchar_t wc = (wchar_t)wp;
        std::wstring ws(1, wc);
        a->ui->on_text(to_utf8(ws));
      }
      return 0;

    case WM_SYSCOMMAND:
      if ((wp & 0xFFF0) == SC_KEYMENU) return 0;
      break;

    case kTrayMsg:
      if (LOWORD(lp) == WM_LBUTTONUP || LOWORD(lp) == WM_LBUTTONDBLCLK) {
        ShowWindow(hwnd, SW_RESTORE);
        SetForegroundWindow(hwnd);
        if (a && a->tray) { tray_remove(hwnd); a->tray = false; }
        InvalidateRect(hwnd, NULL, FALSE);
      } else if (LOWORD(lp) == WM_RBUTTONUP) {
        POINT pt;
        GetCursorPos(&pt);
        HMENU m = CreatePopupMenu();
        AppendMenuW(m, MF_STRING, WM_TRAY_RESTORE, L"Abrir o launcher");
        AppendMenuW(m, MF_SEPARATOR, 0, NULL);
        AppendMenuW(m, MF_STRING, WM_TRAY_QUIT, L"Sair (o jogo para de carregar)");
        SetForegroundWindow(hwnd);
        int cmd = TrackPopupMenu(m, TPM_RETURNCMD | TPM_RIGHTBUTTON, pt.x, pt.y, 0, hwnd, NULL);
        DestroyMenu(m);
        if (cmd == WM_TRAY_RESTORE) {
          ShowWindow(hwnd, SW_RESTORE);
          SetForegroundWindow(hwnd);
          if (a && a->tray) { tray_remove(hwnd); a->tray = false; }
        } else if (cmd == WM_TRAY_QUIT) {
          PostMessageW(hwnd, WM_CLOSE, 0, 0);
        }
      }
      return 0;

    case WM_CLOSE:
      if (a && a->tray) { tray_remove(hwnd); a->tray = false; }
      DestroyWindow(hwnd);
      return 0;

    case WM_DESTROY:
      if (a) {
        if (a->tray) tray_remove(hwnd);
        a->eng->save_config();
        a->eng->plat()->stop_game_server();
        KillTimer(hwnd, kTimer);
      }
      PostQuitMessage(0);
      return 0;
    default: break;
  }
  return DefWindowProcW(hwnd, msg, wp, lp);
}

int WINAPI wWinMain(HINSTANCE hInst, HINSTANCE, LPWSTR cmdline, int) {
  // DPI: usa a escala real do monitor
  SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);
  CoInitializeEx(NULL, COINIT_APARTMENTTHREADED | COINIT_DISABLE_OLE1DDE);

  // instância única: se já existe um launcher, traz ele para a frente
  HANDLE once = CreateMutexW(NULL, FALSE, L"GrandPixelGameLauncherMutex");
  bool already = (once && GetLastError() == ERROR_ALREADY_EXISTS);
  HWND existing = FindWindowW(kClassName, NULL);
  if (already && existing) {
    ShowWindow(existing, SW_RESTORE);
    SetForegroundWindow(existing);
    return 0;
  }
  (void)cmdline;

  App app;
  g_app = &app;

  FS* fs = create_win_fs();
  Net* net = create_win_net();
  Platform* plat = create_win_platform();
  Engine eng(fs, net, plat, GPG_LAUNCHER_VER);
  Ui ui(&eng);
  app.eng = &eng;
  app.ui = &ui;

  std::string err;
  eng.load_state(&err);
  eng.save_config();

  WNDCLASSEXW wc;
  ZeroMemory(&wc, sizeof(wc));
  wc.cbSize = sizeof(wc);
  wc.style = CS_HREDRAW | CS_VREDRAW | CS_DBLCLKS;
  wc.lpfnWndProc = WndProc;
  wc.hInstance = hInst;
  wc.hCursor = LoadCursorW(NULL, IDC_ARROW);
  wc.hbrBackground = NULL;
  wc.lpszClassName = kClassName;
  wc.hIcon = load_app_icon(32);
  wc.hIconSm = load_app_icon(16);
  RegisterClassExW(&wc);

  int sw = GetSystemMetrics(SM_CXSCREEN), sh = GetSystemMetrics(SM_CYSCREEN);
  int W = (int)(1160 * 1.0f), H = (int)(720 * 1.0f);
  if (W > sw - 60) W = sw - 60;
  if (H > sh - 80) H = sh - 80;
  HWND hwnd = CreateWindowExW(0, kClassName, L"Grand Pixel Game — Launcher",
                              WS_POPUP | WS_THICKFRAME | WS_MINIMIZEBOX | WS_MAXIMIZEBOX |
                              WS_CLIPCHILDREN,
                              (sw - W) / 2, (sh - H) / 2, W, H, NULL, NULL, hInst, NULL);
  if (!hwnd) return 1;
  g_main_hwnd = hwnd;
  // arredonda os cantos (Windows 11)
  {
    enum { DWMWA_WINDOW_CORNER_PREFERENCE = 33 };
    int pref = 2;  // DWMWCP_ROUND
    typedef HRESULT(WINAPI * Fn)(HWND, DWORD, LPCVOID, DWORD);
    if (HMODULE dwm = LoadLibraryW(L"dwmapi.dll")) {
      Fn setattr = (Fn)GetProcAddress(dwm, "DwmSetWindowAttribute");
      if (setattr) setattr(hwnd, DWMWA_WINDOW_CORNER_PREFERENCE, &pref, sizeof(pref));
    }
  }
  ShowWindow(hwnd, SW_SHOWNORMAL);
  UpdateWindow(hwnd);

  app.scale = (float)GetDpiForWindow(hwnd) / 96.f;
  RECT rc;
  GetClientRect(hwnd, &rc);
  app.w = rc.right - rc.left;
  app.h = rc.bottom - rc.top;

  // primeira busca de versões
  eng.start_fetch();

  MSG msg;
  while (GetMessageW(&msg, NULL, 0, 0)) {
    TranslateMessage(&msg);
    DispatchMessageW(&msg);
  }
  return 0;
}
