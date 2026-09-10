// Núcleo: strings, conversão UTF-8/UTF-16 portátil, versões, datas, formatos.
#include "gpg_core.h"

#include <cstdio>
#include <cstring>
#include <cstdarg>
#include <cctype>
#include <cmath>
#include <ctime>

namespace gpg {

// ------------------------------------------------------- UTF-8 <-> UTF-16 --
std::string to_utf8(const std::wstring& w) {
  std::string out;
  out.reserve(w.size());
  for (size_t i = 0; i < w.size(); i++) {
    uint32_t cp = (uint16_t)w[i];
    if (cp >= 0xD800 && cp <= 0xDBFF && i + 1 < w.size()) {
      uint32_t lo = (uint16_t)w[i + 1];
      if (lo >= 0xDC00 && lo <= 0xDFFF) { cp = 0x10000 + ((cp - 0xD800) << 10) + (lo - 0xDC00); i++; }
    }
    if (cp < 0x80) out += (char)cp;
    else if (cp < 0x800) { out += (char)(0xC0 | (cp >> 6)); out += (char)(0x80 | (cp & 0x3F)); }
    else if (cp < 0x10000) {
      out += (char)(0xE0 | (cp >> 12));
      out += (char)(0x80 | ((cp >> 6) & 0x3F));
      out += (char)(0x80 | (cp & 0x3F));
    } else {
      out += (char)(0xF0 | (cp >> 18));
      out += (char)(0x80 | ((cp >> 12) & 0x3F));
      out += (char)(0x80 | ((cp >> 6) & 0x3F));
      out += (char)(0x80 | (cp & 0x3F));
    }
  }
  return out;
}

std::wstring to_wide(const std::string& s) {
  std::wstring out;
  out.reserve(s.size());
  size_t i = 0;
  while (i < s.size()) {
    unsigned char c = (unsigned char)s[i];
    uint32_t cp = c;
    int extra = 0;
    if (c >= 0xF0) { cp = c & 0x07; extra = 3; }
    else if (c >= 0xE0) { cp = c & 0x0F; extra = 2; }
    else if (c >= 0xC0) { cp = c & 0x1F; extra = 1; }
    else if (c >= 0x80) { i++; continue; }   // byte solto: ignora
    for (int k = 0; k < extra && i + 1 < s.size(); k++) {
      i++;
      unsigned char cc = (unsigned char)s[i];
      if ((cc & 0xC0) != 0x80) break;
      cp = (cp << 6) | (cc & 0x3F);
    }
    i++;
    if (cp < 0x10000) out += (wchar_t)cp;
    else {
      cp -= 0x10000;
      out += (wchar_t)(0xD800 + (cp >> 10));
      out += (wchar_t)(0xDC00 + (cp & 0x3FF));
    }
  }
  return out;
}

// -------------------------------------------------------------- strings ----
std::string lower(std::string s) {
  for (size_t i = 0; i < s.size(); i++) s[i] = (char)tolower((unsigned char)s[i]);
  return s;
}
std::string trim(const std::string& s) {
  size_t a = 0, b = s.size();
  while (a < b && (unsigned char)s[a] <= ' ') a++;
  while (b > a && (unsigned char)s[b - 1] <= ' ') b--;
  return s.substr(a, b - a);
}
bool starts_with(const std::string& s, const std::string& pre) {
  return s.size() >= pre.size() && s.compare(0, pre.size(), pre) == 0;
}
bool ends_with(const std::string& s, const std::string& suf) {
  return s.size() >= suf.size() && s.compare(s.size() - suf.size(), suf.size(), suf) == 0;
}
std::string fmt(const char* f, ...) {
  char buf[4096];
  va_list ap;
  va_start(ap, f);
  vsnprintf(buf, sizeof(buf), f, ap);
  va_end(ap);
  return std::string(buf);
}
std::vector<std::string> split_lines(const std::string& s) {
  std::vector<std::string> out;
  std::string cur;
  for (size_t i = 0; i < s.size(); i++) {
    if (s[i] == '\n') { out.push_back(cur); cur.clear(); }
    else if (s[i] != '\r') cur += s[i];
  }
  out.push_back(cur);
  return out;
}

std::string human_size(long long bytes) {
  if (bytes < 0) return "—";
  const char* u[] = { "B", "KB", "MB", "GB" };
  double v = (double)bytes;
  int k = 0;
  while (v >= 1024.0 && k < 3) { v /= 1024.0; k++; }
  if (k == 0) return fmt("%lld B", bytes);
  return fmt(v < 10 ? "%.2f %s" : "%.1f %s", v, u[k]);
}
std::string human_speed(double bps) {
  if (bps <= 1) return "";
  return human_size((long long)bps) + "/s";
}
std::string human_eta(double seconds) {
  if (seconds < 0 || seconds > 86400) return "";
  int s = (int)(seconds + 0.5);
  if (s < 60) return fmt("%ds", s);
  int m = s / 60;
  if (m < 60) return fmt("%dm %02ds", m, s % 60);
  return fmt("%dh %02dm", m / 60, m % 60);
}

std::string month_name_pt(int m) {
  static const char* names[] = { "", "janeiro", "fevereiro", "março", "abril", "maio", "junho",
                                 "julho", "agosto", "setembro", "outubro", "novembro", "dezembro" };
  if (m < 1 || m > 12) return "";
  return names[m];
}
std::string date_iso_to_br(const std::string& iso) {
  if (iso.size() < 10) return iso;
  return iso.substr(8, 2) + "/" + iso.substr(5, 2) + "/" + iso.substr(0, 4);
}
std::string date_iso_to_long(const std::string& iso) {
  if (iso.size() < 10) return iso;
  int m = atoi(iso.substr(5, 2).c_str());
  int d = atoi(iso.substr(8, 2).c_str());
  return fmt("%d de %s de %s", d, month_name_pt(m).c_str(), iso.substr(0, 4).c_str());
}

// -------------------------------------------------------------- versões ----
Version parse_version(const std::string& tag) {
  Version v;
  std::string s = tag;
  // aceita "game-v1.2.3", "launcher-v1.2.3", "v1.2.3" e "1.2.3"
  size_t pos = s.find('v');
  if (pos != std::string::npos && pos > 0 && s[pos - 1] == '-') s = s.substr(pos + 1);
  else if (!s.empty() && s[0] == 'v') s = s.substr(1);
  int a = 0, b = 0, c = 0;
  if (sscanf(s.c_str(), "%d.%d.%d", &a, &b, &c) < 2) return v;
  if (a < 0 || b < 0 || c < 0) return v;
  v.major = a; v.minor = b; v.patch = c; v.valid = true;
  return v;
}
std::string tag_version(const std::string& tag) {
  Version v = parse_version(tag);
  if (!v.valid) return tag;
  return fmt("%d.%d.%d", v.major, v.minor, v.patch);
}
int compare_version(const std::string& a, const std::string& b) {
  Version x = parse_version(a), y = parse_version(b);
  if (!x.valid || !y.valid) return a.compare(b);
  if (x.major != y.major) return x.major < y.major ? -1 : 1;
  if (x.minor != y.minor) return x.minor < y.minor ? -1 : 1;
  if (x.patch != y.patch) return x.patch < y.patch ? -1 : 1;
  return 0;
}
bool version_less(const std::string& a, const std::string& b) { return compare_version(a, b) < 0; }

bool valid_tag(const std::string& tag) {
  if (tag.empty() || tag.size() > 64) return false;
  for (size_t i = 0; i < tag.size(); i++) {
    char c = tag[i];
    bool ok = (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') ||
              c == '-' || c == '.' || c == '_';
    if (!ok) return false;
  }
  return tag.find("..") == std::string::npos;
}
std::string game_zip_name(const std::string& version) {
  return fmt("GrandPixelGame-v%s-web.zip", version.c_str());
}

// ------------------------------------------------- markdown -> texto puro --
std::string strip_markdown(const std::string& md, int max_lines) {
  std::vector<std::string> lines = split_lines(md);
  std::string out;
  int used = 0;
  bool prev_blank = true;
  for (size_t li = 0; li < lines.size(); li++) {
    std::string l = trim(lines[li]);
    // títulos viram linhas com destaque simples
    size_t h = 0;
    while (h < l.size() && l[h] == '#') h++;
    if (h > 0 && h < l.size() && l[h] == ' ') l = trim(l.substr(h + 1));
    // listas
    bool bullet = false;
    if (l.size() > 1 && (l[0] == '-' || l[0] == '*') && l[1] == ' ') { bullet = true; l = trim(l.substr(2)); }
    // remove marcações inline
    std::string clean;
    for (size_t i = 0; i < l.size(); i++) {
      char c = l[i];
      if (c == '*' || c == '_' || c == '`') {
        if (c != '`') clean += c;
        continue;
      }
      if (c == '[') {                       // [texto](link) -> texto
        size_t close = l.find(']', i);
        if (close != std::string::npos && close + 1 < l.size() && l[close + 1] == '(') {
          clean += l.substr(i + 1, close - i - 1);
          size_t par = l.find(')', close);
          i = (par == std::string::npos) ? l.size() : par;
          continue;
        }
      }
      if (c == '<') {                       // remove html simples
        size_t gt = l.find('>', i);
        if (gt != std::string::npos) { i = gt; continue; }
      }
      clean += (unsigned char)c < 128 ? c : c;
    }
    clean = trim(clean);
    if (clean.empty()) {
      if (!prev_blank && used > 0) { out += "\n"; prev_blank = true; }
      continue;
    }
    if (!prev_blank) out += "\n";
    out += (bullet ? std::string("•  ") : std::string()) + clean + "\n";
    prev_blank = false;
    used++;
    if (max_lines > 0 && used >= max_lines) break;
  }
  return trim(out);
}

}  // namespace gpg
