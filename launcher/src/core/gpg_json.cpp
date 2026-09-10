// Núcleo: parser JSON (DOM mínimo) — lê a resposta da API do GitHub.
#include "gpg_core.h"

#include <cstdlib>
#include <cstring>

namespace gpg {

namespace {
struct P {
  const char* s;
  size_t len, pos;
  int depth;
  bool ok;
};

void skip_ws(P* p) {
  while (p->pos < p->len) {
    char c = p->s[p->pos];
    if (c == ' ' || c == '\t' || c == '\n' || c == '\r') p->pos++;
    else break;
  }
}
bool parse_value(P* p, Json& out);

std::string parse_string(P* p) {
  std::string out;
  if (p->pos >= p->len || p->s[p->pos] != '"') { p->ok = false; return out; }
  p->pos++;
  while (p->pos < p->len) {
    char c = p->s[p->pos++];
    if (c == '"') return out;
    if (c == '\\') {
      if (p->pos >= p->len) break;
      char e = p->s[p->pos++];
      switch (e) {
        case 'n': out += '\n'; break;
        case 't': out += '\t'; break;
        case 'r': out += '\r'; break;
        case 'b': out += '\b'; break;
        case 'f': out += '\f'; break;
        case 'u': {
          if (p->pos + 4 > p->len) { p->ok = false; return out; }
          unsigned cp = 0;
          for (int i = 0; i < 4; i++) {
            char h = p->s[p->pos + i];
            unsigned d = (h >= '0' && h <= '9') ? (unsigned)(h - '0')
                       : (h >= 'a' && h <= 'f') ? (unsigned)(h - 'a' + 10)
                       : (h >= 'A' && h <= 'F') ? (unsigned)(h - 'A' + 10) : 0xFFFFFFFF;
            if (d == 0xFFFFFFFF) { p->ok = false; return out; }
            cp = (cp << 4) | d;
          }
          p->pos += 4;
          if (cp >= 0xD800 && cp <= 0xDBFF && p->pos + 6 <= p->len && p->s[p->pos] == '\\' &&
              p->s[p->pos + 1] == 'u') {
            unsigned lo = 0;
            bool ok2 = true;
            for (int i = 0; i < 4; i++) {
              char h = p->s[p->pos + 2 + i];
              unsigned d = (h >= '0' && h <= '9') ? (unsigned)(h - '0')
                         : (h >= 'a' && h <= 'f') ? (unsigned)(h - 'a' + 10)
                         : (h >= 'A' && h <= 'F') ? (unsigned)(h - 'A' + 10) : 0xFFFFFFFF;
              if (d == 0xFFFFFFFF) { ok2 = false; break; }
              lo = (lo << 4) | d;
            }
            if (ok2 && lo >= 0xDC00 && lo <= 0xDFFF) {
              cp = 0x10000 + ((cp - 0xD800) << 10) + (lo - 0xDC00);
              p->pos += 6;
            }
          }
          std::wstring w(1, (wchar_t)cp);
          if (cp >= 0x10000) {
            cp -= 0x10000;
            w = std::wstring();
            w += (wchar_t)(0xD800 + (cp >> 10));
            w += (wchar_t)(0xDC00 + (cp & 0x3FF));
          }
          out += to_utf8(w);
          break;
        }
        default: out += e; break;
      }
    } else {
      out += c;
    }
  }
  p->ok = false;
  return out;
}

bool parse_value(P* p, Json& out) {
  if (++p->depth > 64) { p->ok = false; p->depth--; return false; }
  skip_ws(p);
  if (p->pos >= p->len) { p->ok = false; p->depth--; return false; }
  char c = p->s[p->pos];
  if (c == '{') {
    p->pos++;
    out.type = Json::Obj;
    skip_ws(p);
    if (p->pos < p->len && p->s[p->pos] == '}') { p->pos++; p->depth--; return true; }
    for (;;) {
      skip_ws(p);
      if (p->pos >= p->len || p->s[p->pos] != '"') { p->ok = false; break; }
      std::string key = parse_string(p);
      if (!p->ok) break;
      skip_ws(p);
      if (p->pos >= p->len || p->s[p->pos] != ':') { p->ok = false; break; }
      p->pos++;
      Json v;
      if (!parse_value(p, v)) break;
      out.obj.push_back(std::make_pair(key, v));
      skip_ws(p);
      if (p->pos < p->len && p->s[p->pos] == ',') { p->pos++; continue; }
      if (p->pos < p->len && p->s[p->pos] == '}') { p->pos++; break; }
      p->ok = false;
      break;
    }
  } else if (c == '[') {
    p->pos++;
    out.type = Json::Arr;
    skip_ws(p);
    if (p->pos < p->len && p->s[p->pos] == ']') { p->pos++; p->depth--; return true; }
    for (;;) {
      Json v;
      if (!parse_value(p, v)) break;
      out.arr.push_back(v);
      skip_ws(p);
      if (p->pos < p->len && p->s[p->pos] == ',') { p->pos++; continue; }
      if (p->pos < p->len && p->s[p->pos] == ']') { p->pos++; break; }
      p->ok = false;
      break;
    }
  } else if (c == '"') {
    out.type = Json::Str;
    out.s = parse_string(p);
  } else if (c == 't' && p->pos + 4 <= p->len && strncmp(p->s + p->pos, "true", 4) == 0) {
    out.type = Json::Bool; out.b = true; p->pos += 4;
  } else if (c == 'f' && p->pos + 5 <= p->len && strncmp(p->s + p->pos, "false", 5) == 0) {
    out.type = Json::Bool; out.b = false; p->pos += 5;
  } else if (c == 'n' && p->pos + 4 <= p->len && strncmp(p->s + p->pos, "null", 4) == 0) {
    out.type = Json::Null; p->pos += 4;
  } else if (c == '-' || (c >= '0' && c <= '9')) {
    out.type = Json::Num;
    char* end = NULL;
    out.n = strtod(p->s + p->pos, &end);
    if (end == p->s + p->pos) { p->ok = false; p->depth--; return false; }
    p->pos = (size_t)(end - p->s);
  } else {
    p->ok = false;
  }
  p->depth--;
  return p->ok;
}
}  // namespace

bool json_parse(const std::string& text, Json& out) {
  P p;
  p.s = text.c_str();
  p.len = text.size();
  p.pos = 0;
  p.depth = 0;
  p.ok = true;
  out = Json();
  bool r = parse_value(&p, out);
  return r && p.ok;
}

const Json* Json::get(const std::string& key) const {
  if (type != Obj) return NULL;
  for (size_t i = 0; i < obj.size(); i++)
    if (obj[i].first == key) return &obj[i].second;
  return NULL;
}
const Json* Json::at(size_t i) const {
  if (type != Arr || i >= arr.size()) return NULL;
  return &arr[i];
}
long long Json::num(long long def) const {
  if (type == Num) return (long long)(n + (n < 0 ? -0.5 : 0.5));
  if (type == Str) return atoll(s.c_str());
  return def;
}
bool Json::flag(bool def) const {
  if (type == Bool) return b;
  if (type == Num) return n != 0;
  return def;
}

std::string json_escape(const std::string& s) {
  std::string out;
  for (size_t i = 0; i < s.size(); i++) {
    char c = s[i];
    if (c == '"' || c == '\\') { out += '\\'; out += c; }
    else if (c == '\n') out += "\\n";
    else if (c == '\r') out += "\\r";
    else if (c == '\t') out += "\\t";
    else if ((unsigned char)c < 0x20) { char b[8]; snprintf(b, sizeof(b), "\\u%04x", c); out += b; }
    else out += c;
  }
  return out;
}

}  // namespace gpg
