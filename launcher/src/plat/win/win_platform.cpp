// Windows: arquivos, rede (WinHTTP), servidor local do jogo, janela do jogo,
// (des)instalação e atualização do próprio launcher.
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <winhttp.h>
#include <shlobj.h>
#include <shellapi.h>
#include <winsock2.h>
#include <ws2tcpip.h>

#include <cstdio>
#include <cstring>
#include <cstdlib>
#include <string>
#include <vector>
#include <algorithm>

#include "win_internal.h"
#include "../../core/gpg_core.h"

#pragma comment(lib, "winhttp.lib")
#pragma comment(lib, "ws2_32.lib")
#pragma comment(lib, "shell32.lib")
#pragma comment(lib, "ole32.lib")

namespace gpg {

static std::string wide_to_utf8(const std::wstring& w) { return to_utf8(w); }
static std::wstring utf8_to_wide(const std::string& s) { return to_wide(s); }

// ========================================================= sistema de arquivos
class WinFS : public FS {
public:
  bool exists(const std::string& p) override {
    return GetFileAttributesW(utf8_to_wide(p).c_str()) != INVALID_FILE_ATTRIBUTES;
  }
  bool is_dir(const std::string& p) override {
    DWORD a = GetFileAttributesW(utf8_to_wide(p).c_str());
    return a != INVALID_FILE_ATTRIBUTES && (a & FILE_ATTRIBUTE_DIRECTORY);
  }
  bool mkdirs(const std::string& p) override {
    std::wstring w = utf8_to_wide(p);
    if (w.empty()) return false;
    if (is_dir(p)) return true;
    std::wstring cur;
    for (size_t i = 0; i < w.size(); i++) {
      cur += w[i];
      if (w[i] == L'\\' || w[i] == L'/') {
        if (cur.size() > 3) CreateDirectoryW(cur.c_str(), NULL);
      }
    }
    CreateDirectoryW(w.c_str(), NULL);
    return is_dir(p);
  }
  bool read_file(const std::string& p, std::string& out) override {
    HANDLE h = CreateFileW(utf8_to_wide(p).c_str(), GENERIC_READ, FILE_SHARE_READ, NULL,
                           OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, NULL);
    if (h == INVALID_HANDLE_VALUE) return false;
    LARGE_INTEGER sz;
    if (!GetFileSizeEx(h, &sz)) { CloseHandle(h); return false; }
    out.assign((size_t)sz.QuadPart, '\0');
    DWORD got = 0, total = 0;
    while (total < (DWORD)sz.QuadPart) {
      if (!ReadFile(h, &out[total], (DWORD)sz.QuadPart - total, &got, NULL) || got == 0) break;
      total += got;
    }
    out.resize(total);
    CloseHandle(h);
    return true;
  }
  bool write_file(const std::string& p, const std::string& data) override {
    size_t slash = p.find_last_of("\\/");
    if (slash != std::string::npos) mkdirs(p.substr(0, slash));
    HANDLE h = CreateFileW(utf8_to_wide(p).c_str(), GENERIC_WRITE, 0, NULL, CREATE_ALWAYS,
                           FILE_ATTRIBUTE_NORMAL, NULL);
    if (h == INVALID_HANDLE_VALUE) return false;
    DWORD written = 0;
    bool ok = data.empty() || (WriteFile(h, data.data(), (DWORD)data.size(), &written, NULL) &&
                               written == (DWORD)data.size());
    CloseHandle(h);
    return ok;
  }
  bool remove_file(const std::string& p) override {
    return DeleteFileW(utf8_to_wide(p).c_str()) != 0 || !exists(p);
  }
  bool remove_tree(const std::string& p) override {
    std::wstring w = utf8_to_wide(p);
    if (w.empty()) return true;
    if (!is_dir(p)) return remove_file(p);
    std::wstring buf = w + L"\\*";
    WIN32_FIND_DATAW fd;
    HANDLE h = FindFirstFileExW(buf.c_str(), FindExInfoBasic, &fd, FindExSearchNameMatch, NULL, 0);
    if (h != INVALID_HANDLE_VALUE) {
      do {
        std::wstring name = fd.cFileName;
        if (name == L"." || name == L"..") continue;
        std::wstring child = w + L"\\" + name;
        if (fd.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY) remove_tree(wide_to_utf8(child));
        else DeleteFileW(child.c_str());
      } while (FindNextFileW(h, &fd));
      FindClose(h);
    }
    return RemoveDirectoryW(w.c_str()) != 0;
  }
  bool read_range(const std::string& p, long long off, void* buf, size_t len, size_t* got) override {
    HANDLE h = CreateFileW(utf8_to_wide(p).c_str(), GENERIC_READ, FILE_SHARE_READ, NULL,
                           OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, NULL);
    if (h == INVALID_HANDLE_VALUE) return false;
    LARGE_INTEGER li;
    li.QuadPart = off;
    BOOL ok = SetFilePointerEx(h, li, NULL, FILE_BEGIN);
    DWORD rd = 0;
    if (ok) ok = ReadFile(h, buf, (DWORD)len, &rd, NULL);
    *got = rd;
    CloseHandle(h);
    return ok != 0;
  }
  bool append_file(const std::string& p, const void* data, size_t len) override {
    size_t slash = p.find_last_of("\\/");
    if (slash != std::string::npos) mkdirs(p.substr(0, slash));
    HANDLE h = CreateFileW(utf8_to_wide(p).c_str(), FILE_APPEND_DATA, FILE_SHARE_READ, NULL,
                           OPEN_ALWAYS, FILE_ATTRIBUTE_NORMAL, NULL);
    if (h == INVALID_HANDLE_VALUE) return false;
    DWORD written = 0;
    bool ok = WriteFile(h, data, (DWORD)len, &written, NULL) != 0;
    CloseHandle(h);
    return ok;
  }
  long long file_size(const std::string& p) override {
    WIN32_FILE_ATTRIBUTE_DATA fad;
    if (!GetFileAttributesExW(utf8_to_wide(p).c_str(), GetFileExInfoStandard, &fad)) return -1;
    if (fad.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY) return -1;
    return ((long long)fad.nFileSizeHigh << 32) | fad.nFileSizeLow;
  }
  long long dir_size(const std::string& p, int max_files) override {
    long long total = 0;
    walk(p, max_files, total, NULL);
    return total;
  }
  int count_files(const std::string& p, int max_files) override {
    long long total = 0;
    int n = 0;
    walk(p, max_files, total, &n);
    return n;
  }
  void walk(const std::string& p, int maxf, long long& total, int* files) {
    if (!is_dir(p)) {
      long long sz = file_size(p);
      if (sz > 0) total += sz;
      if (files) (*files)++;
      return;
    }
    std::wstring buf = utf8_to_wide(p) + L"\\*";
    WIN32_FIND_DATAW fd;
    HANDLE h = FindFirstFileExW(buf.c_str(), FindExInfoBasic, &fd, FindExSearchNameMatch, NULL, 0);
    if (h == INVALID_HANDLE_VALUE) return;
    int seen = 0;
    do {
      std::wstring name = fd.cFileName;
      if (name == L"." || name == L"..") continue;
      if (++seen > maxf) break;
      std::wstring child = utf8_to_wide(p) + L"\\" + name;
      if (fd.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY) walk(wide_to_utf8(child), maxf, total, files);
      else {
        if (files) (*files)++;
        total += ((long long)fd.nFileSizeHigh << 32) | fd.nFileSizeLow;
      }
    } while (FindNextFileW(h, &fd));
    FindClose(h);
  }
  std::vector<std::string> list_dir(const std::string& p) override {
    std::vector<std::string> out;
    std::wstring buf = utf8_to_wide(p) + L"\\*";
    WIN32_FIND_DATAW fd;
    HANDLE h = FindFirstFileExW(buf.c_str(), FindExInfoBasic, &fd, FindExSearchNameMatch, NULL, 0);
    if (h == INVALID_HANDLE_VALUE) return out;
    do {
      std::wstring name = fd.cFileName;
      if (name == L"." || name == L"..") continue;
      if (fd.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY)
        out.push_back(wide_to_utf8(name));
    } while (FindNextFileW(h, &fd));
    FindClose(h);
    return out;
  }
  std::string join(const std::string& a, const std::string& b) override {
    std::string bb = b;
    for (size_t i = 0; i < bb.size(); i++) if (bb[i] == '/') bb[i] = '\\';
    if (a.empty()) return bb;
    if (a[a.size() - 1] == '\\') return a + bb;
    return a + "\\" + bb;
  }
  const char* sep() override { return "\\"; }
};

// ==================================================================== rede ===
class WinNet : public Net {
public:
  bool download(const std::string& url, const std::string& dest_path, std::string* body_out,
                bool allow_resume, const NetProgFn& progress, std::string* err) override {
    std::wstring wurl = utf8_to_wide(url);
    URL_COMPONENTS uc;
    ZeroMemory(&uc, sizeof(uc));
    uc.dwStructSize = sizeof(uc);
    wchar_t host[256] = L"", path[2048] = L"";
    uc.lpszHostName = host; uc.dwHostNameLength = 255;
    uc.lpszUrlPath = path;  uc.dwUrlPathLength = 2047;
    std::wstring full = wurl;
    if (!WinHttpCrackUrl(full.c_str(), (DWORD)full.size(), 0, &uc)) {
      if (err) *err = "endereço inválido";
      return false;
    }
    bool https = (uc.nScheme == INTERNET_SCHEME_HTTPS);
    HINTERNET hs = WinHttpOpen(L"GrandPixelGame-Launcher/1.1 (Windows)", WINHTTP_ACCESS_TYPE_AUTOMATIC_PROXY,
                               WINHTTP_NO_PROXY_NAME, WINHTTP_NO_PROXY_BYPASS, 0);
    if (!hs) {
      hs = WinHttpOpen(L"GrandPixelGame-Launcher/1.1", WINHTTP_ACCESS_TYPE_DEFAULT_PROXY,
                       WINHTTP_NO_PROXY_NAME, WINHTTP_NO_PROXY_BYPASS, 0);
    }
    if (!hs) { if (err) *err = "não consegui iniciar a conexão"; return false; }
    DWORD t = 45000;
    WinHttpSetTimeouts(hs, t, t, t, t);
    HINTERNET hc = WinHttpConnect(hs, host, uc.nPort, 0);
    HINTERNET hr = hc ? WinHttpOpenRequest(hc, L"GET", path, NULL, WINHTTP_NO_REFERER,
                                           WINHTTP_DEFAULT_ACCEPT_TYPES,
                                           https ? WINHTTP_FLAG_SECURE : 0)
                      : NULL;
    bool ok = false;
    std::string out;
    long long existing = 0;
    if (hr) {
      DWORD redir = WINHTTP_OPTION_REDIRECT_POLICY_ALWAYS;
      WinHttpSetOption(hr, WINHTTP_OPTION_REDIRECT_POLICY, &redir, sizeof(redir));
      WinHttpAddRequestHeaders(hr, L"User-Agent: GrandPixelGame-Launcher\r\nAccept: */*\r\n",
                               (DWORD)-1L, WINHTTP_ADDREQ_FLAG_ADD);
      if (allow_resume && !dest_path.empty()) {
        existing = 0;
        WIN32_FILE_ATTRIBUTE_DATA fad;
        if (GetFileAttributesExW(utf8_to_wide(dest_path).c_str(), GetFileExInfoStandard, &fad))
          existing = ((long long)fad.nFileSizeHigh << 32) | fad.nFileSizeLow;
        if (existing > 0) {
          wchar_t range[128];
          _snwprintf(range, 128, L"Range: bytes=%lld-\r\n", existing);
          WinHttpAddRequestHeaders(hr, range, (DWORD)-1L, WINHTTP_ADDREQ_FLAG_ADD);
        }
      }
      if (WinHttpSendRequest(hr, WINHTTP_NO_ADDITIONAL_HEADERS, 0, WINHTTP_NO_REQUEST_DATA, 0, 0, 0) &&
          WinHttpReceiveResponse(hr, NULL)) {
        DWORD status = 0, len = sizeof(status);
        WinHttpQueryHeaders(hr, WINHTTP_QUERY_STATUS_CODE | WINHTTP_QUERY_FLAG_NUMBER,
                            WINHTTP_HEADER_NAME_BY_INDEX, &status, &len, WINHTTP_NO_HEADER_INDEX);
        long long total = -1;
        {
          wchar_t cl[64];
          DWORD l2 = sizeof(cl);
          if (WinHttpQueryHeaders(hr, WINHTTP_QUERY_CONTENT_LENGTH, WINHTTP_HEADER_NAME_BY_INDEX,
                                  cl, &l2, WINHTTP_NO_HEADER_INDEX))
            total = _wtoi64(cl);
        }
        bool resuming = (status == 206 && existing > 0);
        if (!resuming) existing = 0;
        if (status == 200 || resuming) {
          if (total >= 0 && resuming) total += existing;
          HANDLE f = INVALID_HANDLE_VALUE;
          if (!dest_path.empty()) {
            f = CreateFileW(utf8_to_wide(dest_path).c_str(),
                            existing > 0 ? FILE_APPEND_DATA : GENERIC_WRITE, 0, NULL,
                            existing > 0 ? OPEN_ALWAYS : CREATE_ALWAYS, FILE_ATTRIBUTE_NORMAL, NULL);
            if (f == INVALID_HANDLE_VALUE) {
              if (err) *err = "não consegui gravar o arquivo baixado";
              goto cleanup;
            }
          }
          long long got = existing;
          DWORD last_tick = GetTickCount();
          long long last_bytes = got;
          std::vector<char> buf(128 * 1024);
          for (;;) {
            DWORD rd = 0;
            if (!WinHttpReadData(hr, buf.data(), (DWORD)buf.size(), &rd)) break;
            if (rd == 0) break;
            if (f != INVALID_HANDLE_VALUE) {
              DWORD written = 0;
              if (!WriteFile(f, buf.data(), rd, &written, NULL) || written != rd) {
                if (err) *err = "falha ao gravar no disco (sem espaço?)";
                CloseHandle(f);
                goto cleanup;
              }
            }
            out.append(buf.data(), rd);
            got += rd;
            DWORD now = GetTickCount();
            if (now - last_tick >= 250) {
              NetProgress np;
              np.got = got;
              np.total = total;
              double secs = (double)(now - last_tick) / 1000.0;
              np.speed = secs > 0 ? (double)(got - last_bytes) / secs : 0;
              last_tick = now;
              last_bytes = got;
              if (progress && !progress(np)) {
                if (f != INVALID_HANDLE_VALUE) CloseHandle(f);
                if (err) *err = "cancelado";
                goto cleanup;
              }
            }
          }
          if (f != INVALID_HANDLE_VALUE) CloseHandle(f);
          NetProgress np;
          np.got = got;
          np.total = total;
          if (progress) progress(np);
          ok = true;
        } else if (err) {
          *err = fmt("o GitHub respondeu %lu ao pedir o arquivo", (unsigned long)status);
        }
      } else if (err) {
        *err = "sem conexão (verifique a internet)";
      }
    }
  cleanup:
    if (hr) WinHttpCloseHandle(hr);
    if (hc) WinHttpCloseHandle(hc);
    WinHttpCloseHandle(hs);
    if (ok && body_out) *body_out = out;
    return ok;
  }
};

// ============================================================ plataforma =====
extern HWND g_main_hwnd;

class WinPlatform : public Platform {
public:
  void open_url(const std::string& url) override {
    ShellExecuteW(NULL, L"open", utf8_to_wide(url).c_str(), NULL, NULL, SW_SHOWNORMAL);
  }
  void open_folder(const std::string& path) override {
    std::wstring dir = utf8_to_wide(path);
    DWORD a = GetFileAttributesW(dir.c_str());
    if (a == INVALID_FILE_ATTRIBUTES) {
      // abre a pasta existente mais próxima
      size_t e = dir.find_last_of(L'\\');
      if (e != std::wstring::npos) dir = dir.substr(0, e);
    }
    ShellExecuteW(NULL, L"open", dir.c_str(), NULL, NULL, SW_SHOWNORMAL);
  }
  bool pick_folder(std::string& out, const std::string& current) override {
    BROWSEINFOW bi;
    ZeroMemory(&bi, sizeof(bi));
    bi.hwndOwner = g_main_hwnd;
    bi.lpszTitle = L"Escolha a pasta onde o Grand Pixel Game guarda as versões";
    bi.ulFlags = BIF_RETURNONLYFSDIRS | BIF_NEWDIALOGSTYLE;
    wchar_t cur[1024];
    MultiByteToWideChar(CP_UTF8, 0, current.c_str(), -1, cur, 1024);
    bi.lpfn = NULL;
    bi.lParam = 0;
    LPITEMIDLIST pidl = SHBrowseForFolderW(&bi);
    if (!pidl) return false;
    wchar_t buf[MAX_PATH * 2];
    bool ok = SHGetPathFromIDListW(pidl, buf) != 0;
    CoTaskMemFree(pidl);
    if (!ok) return false;
    out = wide_to_utf8(buf);
    return true;
  }
  bool open_text_file(const std::string& path) override {
    std::wstring w = utf8_to_wide(path);
    if (GetFileAttributesW(w.c_str()) == INVALID_FILE_ATTRIBUTES) return false;
    std::wstring cmd = L"notepad.exe \"" + w + L"\"";
    STARTUPINFOW si;
    PROCESS_INFORMATION pi;
    ZeroMemory(&si, sizeof(si));
    si.cb = sizeof(si);
    ZeroMemory(&pi, sizeof(pi));
    std::vector<wchar_t> bufv(cmd.begin(), cmd.end());
    bufv.push_back(0);
    if (!CreateProcessW(NULL, bufv.data(), NULL, NULL, FALSE, 0, NULL, NULL, &si, &pi)) return false;
    CloseHandle(pi.hThread);
    CloseHandle(pi.hProcess);
    return true;
  }
  std::string default_install_root() override {
    wchar_t base[MAX_PATH * 2] = L"";
    if (!SUCCEEDED(SHGetFolderPathW(NULL, CSIDL_LOCAL_APPDATA, NULL, 0, base)) || !base[0]) {
      if (!GetTempPathW(MAX_PATH * 2, base)) return "C:\\GrandPixelGame";
    }
    std::wstring dir = std::wstring(base) + L"\\GrandPixelGame";
    CreateDirectoryW(dir.c_str(), NULL);
    return wide_to_utf8(dir);
  }
  std::string self_exe_path() override {
    wchar_t buf[MAX_PATH * 2];
    DWORD n = GetModuleFileNameW(NULL, buf, MAX_PATH * 2);
    return n ? wide_to_utf8(std::wstring(buf, n)) : "";
  }
  // Aplica a atualização: um processo auxiliar espera o launcher fechar e troca
  // o executável, então abre o novo. Nada de sobrescrever a si mesmo em execução.
  bool apply_self_update(const std::string& new_exe, const std::string& target_exe) override {
    (void)new_exe;
    (void)target_exe;
    if (update_exe_.empty() || update_target_.empty()) return false;
    wchar_t tmp[MAX_PATH * 2];
    GetTempPathW(MAX_PATH * 2, tmp);
    std::wstring script = std::wstring(tmp) + L"gpg_update.bat";
    FILE* f = _wfopen(script.c_str(), L"wb");
    if (!f) return false;
    DWORD pid = GetCurrentProcessId();
    std::wstring nl = L"\r\n";
    std::string s;
    s += "@echo off" + to_utf8(nl);
    s += "echo Atualizando o Grand Pixel Game Launcher..." + to_utf8(nl);
    s += "for /l %%i in (1,1,120) do (" + to_utf8(nl);
    s += "  tasklist /FI \"PID eq " + fmt("%lu", (unsigned long)pid) + "\" | find \"" + fmt("%lu", (unsigned long)pid) + "\" >nul || goto swap" + to_utf8(nl);
    s += "  ping 127.0.0.1 -n 2 >nul" + to_utf8(nl);
    s += ")" + to_utf8(nl);
    s += ":swap" + to_utf8(nl);
    s += "copy /y \"" + to_utf8(update_exe_) + "\" \"" + to_utf8(update_target_) + "\" >nul" + to_utf8(nl);
    s += "start \"\" \"" + to_utf8(update_target_) + "\"" + to_utf8(nl);
    s += "del \"%~f0\"" + to_utf8(nl);
    fwrite(s.data(), 1, s.size(), f);
    fclose(f);
    std::wstring cmd = L"cmd.exe /c \"" + script + L"\"";
    STARTUPINFOW si;
    PROCESS_INFORMATION pi;
    ZeroMemory(&si, sizeof(si));
    si.cb = sizeof(si);
    si.dwFlags = STARTF_USESHOWWINDOW;
    si.wShowWindow = SW_HIDE;
    ZeroMemory(&pi, sizeof(pi));
    std::vector<wchar_t> bufv(cmd.begin(), cmd.end());
    bufv.push_back(0);
    bool ok = CreateProcessW(NULL, bufv.data(), NULL, NULL, FALSE, CREATE_NO_WINDOW, NULL, NULL, &si,
                             &pi) != 0;
    if (ok) {
      CloseHandle(pi.hThread);
      CloseHandle(pi.hProcess);
      // sai para liberar o arquivo do executável
      PostMessageW(g_main_hwnd, WM_CLOSE, 0, 0);
    }
    return ok;
  }
  void set_update_target(const std::string& new_exe, const std::string& target) {
    update_exe_ = utf8_to_wide(new_exe);
    update_target_ = utf8_to_wide(target);
  }
  void notify(const std::string& title, const std::string& text) override {
    MessageBoxW(NULL, utf8_to_wide(text).c_str(), utf8_to_wide(title).c_str(), MB_OK | MB_ICONINFORMATION);
  }

  // ---------------------------------------------------- servidor e jogo -----
  bool start_game_server(const std::string& web_dir, int port, std::string* err) override {
    if (server_thread_ && served_dir_ == web_dir && server_port_ == port) return true;  // reaproveita
    stop_game_server();
    served_dir_ = web_dir;
    server_port_ = port;
    WSADATA wsa;
    if (WSAStartup(MAKEWORD(2, 2), &wsa) != 0) {
      if (err) *err = "não consegui iniciar a rede local";
      return false;
    }
    SOCKET s = socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
    if (s == INVALID_SOCKET) { if (err) *err = "não consegui abrir o servidor local"; return false; }
    int yes = 1;
    setsockopt(s, SOL_SOCKET, SO_REUSEADDR, (const char*)&yes, sizeof(yes));
    sockaddr_in addr;
    ZeroMemory(&addr, sizeof(addr));
    addr.sin_family = AF_INET;
    addr.sin_port = htons((u_short)port);
    addr.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
    if (bind(s, (sockaddr*)&addr, sizeof(addr)) != 0 ||
        listen(s, 16) != 0) {
      closesocket(s);
      if (err) *err = "a porta " + fmt("%d", port) + " está ocupada — feche o outro launcher";
      return false;
    }
    listen_sock_ = s;
    stop_flag_ = 0;
    server_thread_ = CreateThread(NULL, 0, &WinPlatform::server_tramp, this, 0, NULL);
    if (!server_thread_) {
      closesocket(s);
      listen_sock_ = INVALID_SOCKET;
      if (err) *err = "não consegui iniciar o servidor local";
      return false;
    }
    return true;
  }
  void stop_game_server() override {
    if (listen_sock_ != INVALID_SOCKET) {
      stop_flag_ = 1;
      closesocket(listen_sock_);
      listen_sock_ = INVALID_SOCKET;
    }
    if (server_thread_) {
      WaitForSingleObject(server_thread_, 1500);
      CloseHandle(server_thread_);
      server_thread_ = NULL;
    }
    served_dir_.clear();
  }
  bool server_running() const { return server_thread_ != NULL; }

  static DWORD WINAPI server_tramp(LPVOID self) {
    ((WinPlatform*)self)->server_loop();
    return 0;
  }
  void server_loop() {
    while (!stop_flag_) {
      SOCKET c = accept(listen_sock_, NULL, NULL);
      if (c == INVALID_SOCKET) break;
      serve_client(c);
      closesocket(c);
    }
  }
  void serve_client(SOCKET c) {
    std::string req;
    char buf[4096];
    int n = recv(c, buf, sizeof(buf) - 1, 0);
    if (n <= 0) return;
    buf[n] = 0;
    req = buf;
    if (req.compare(0, 4, "GET ") != 0) return;
    size_t sp = req.find(' ');
    std::string raw = req.substr(4, sp - 4);
    std::string path = raw;
    size_t q = path.find('?');
    if (q != std::string::npos) path = path.substr(0, q);
    if (path == "/" || path.empty()) path = "/index.html";
    // impede escapar da pasta servida
    if (path.find("..") != std::string::npos) {
      send_str(c, "HTTP/1.1 400 Bad Request\r\nContent-Length: 0\r\n\r\n");
      return;
    }
    std::string file = served_dir_;
    for (size_t i = 0; i < path.size(); i++) file += (path[i] == '/' ? '\\' : path[i]);
    HANDLE h = CreateFileW(utf8_to_wide(file).c_str(), GENERIC_READ, FILE_SHARE_READ, NULL,
                           OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, NULL);
    if (h == INVALID_HANDLE_VALUE) {
      std::string body = "<h1>404</h1>";
      send_str(c, "HTTP/1.1 404 Not Found\r\nContent-Type: text/html; charset=utf-8\r\n"
                  "Content-Length: " + fmt("%d", (int)body.size()) + "\r\nConnection: close\r\n\r\n" + body);
      return;
    }
    LARGE_INTEGER sz;
    GetFileSizeEx(h, &sz);
    std::string head = "HTTP/1.1 200 OK\r\nContent-Type: " + mime_of(path) +
                       "\r\nContent-Length: " + fmt("%lld", (long long)sz.QuadPart) +
                       "\r\nCache-Control: no-cache\r\nConnection: close\r\n\r\n";
    send_str(c, head);
    std::vector<char> out(65536);
    DWORD rd = 0;
    while (ReadFile(h, out.data(), (DWORD)out.size(), &rd, NULL) && rd > 0) {
      int sent = 0;
      while (sent < (int)rd) {
        int w = send(c, out.data() + sent, (int)rd - sent, 0);
        if (w <= 0) break;
        sent += w;
      }
      if (sent < (int)rd) break;
    }
    CloseHandle(h);
  }
  static std::string mime_of(const std::string& p) {
    std::string e;
    size_t dot = p.find_last_of('.');
    if (dot != std::string::npos) e = lower(p.substr(dot + 1));
    if (e == "html" || e == "htm") return "text/html; charset=utf-8";
    if (e == "js" || e == "mjs") return "text/javascript; charset=utf-8";
    if (e == "css") return "text/css; charset=utf-8";
    if (e == "json") return "application/json; charset=utf-8";
    if (e == "png") return "image/png";
    if (e == "jpg" || e == "jpeg") return "image/jpeg";
    if (e == "gif") return "image/gif";
    if (e == "svg") return "image/svg+xml";
    if (e == "ico") return "image/x-icon";
    if (e == "mp3") return "audio/mpeg";
    if (e == "ogg") return "audio/ogg";
    if (e == "wav") return "audio/wav";
    if (e == "woff2") return "font/woff2";
    if (e == "txt") return "text/plain; charset=utf-8";
    if (e == "map") return "application/json";
    return "application/octet-stream";
  }
  static void send_str(SOCKET c, const std::string& data) {
    int sent = 0;
    while (sent < (int)data.size()) {
      int w = send(c, data.data() + sent, (int)data.size() - sent, 0);
      if (w <= 0) break;
      sent += w;
    }
  }

  // Abre a janela do jogo: modo aplicativo do Edge (janela limpa, sem barra de
  // navegador). Se o Edge não estiver disponível, cai no navegador padrão.
  bool launch_game_window(const std::string& tag, int port, std::string* err) override {
    std::string url = fmt("http://127.0.0.1:%d/", port);
    std::wstring wurl = utf8_to_wide(url);
    std::wstring args = L"--app=" + wurl + L" --window-size=1280,800 --window-position=center";
    std::wstring edge = find_edge();
    if (!edge.empty()) {
      std::wstring cmd = L"\"" + edge + L"\" " + args;
      if (spawn(cmd)) { game_pid_ = 0; return true; }
    }
    // alternativas: navegador padrão
    if (ShellExecuteW(NULL, L"open", wurl.c_str(), NULL, NULL, SW_SHOWNORMAL)) return true;
    if (err) *err = "não consegui abrir o navegador para o jogo";
    (void)tag;
    return false;
  }
  bool game_window_open() override { return server_thread_ != NULL; }

private:
  static std::wstring find_edge() {
    const wchar_t* cands[] = {
      L"C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
      L"C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
      NULL
    };
    for (int i = 0; cands[i]; i++)
      if (GetFileAttributesW(cands[i]) != INVALID_FILE_ATTRIBUTES) return cands[i];
    return L"";
  }
  static bool spawn(const std::wstring& cmd) {
    STARTUPINFOW si;
    PROCESS_INFORMATION pi;
    ZeroMemory(&si, sizeof(si));
    si.cb = sizeof(si);
    ZeroMemory(&pi, sizeof(pi));
    std::vector<wchar_t> buf(cmd.begin(), cmd.end());
    buf.push_back(0);
    if (!CreateProcessW(NULL, buf.data(), NULL, NULL, FALSE, 0, NULL, NULL, &si, &pi)) return false;
    CloseHandle(pi.hThread);
    CloseHandle(pi.hProcess);
    return true;
  }

  SOCKET   listen_sock_ = INVALID_SOCKET;
  HANDLE   server_thread_ = NULL;
  volatile LONG stop_flag_ = 0;
  std::string served_dir_;
  int      server_port_ = 0;
  DWORD    game_pid_ = 0;
  std::wstring update_exe_, update_target_;
};

// instâncias únicas
static WinFS g_fs;
static WinNet g_net;
static WinPlatform g_plat;

FS* create_win_fs() { return &g_fs; }
Net* create_win_net() { return &g_net; }
Platform* create_win_platform() { return &g_plat; }
WinPlatform* win_platform() { return &g_plat; }

}  // namespace gpg
