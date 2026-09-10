// Núcleo: CRC32, SHA-256 e leitura de arquivos ZIP (método STORE).
//
// O conteúdo do jogo é publicado como zip sem compressão (STORE). Isso deixa
// a instalação uma cópia direta — rápida e sem surpresas — e é um contrato
// entre o empacotador (build do jogo) e o launcher. Arquivos comprimidos são
// recusados com uma mensagem clara em vez de instalados pela metade.
#include "gpg_core.h"

#include <cstring>
#include <cstdio>

namespace gpg {

// ----------------------------------------------------------------- CRC32 ---
static uint32_t g_crc_table[256];
static bool g_crc_ready = false;
static void crc_init() {
  for (uint32_t i = 0; i < 256; i++) {
    uint32_t c = i;
    for (int k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320u ^ (c >> 1)) : (c >> 1);
    g_crc_table[i] = c;
  }
  g_crc_ready = true;
}
uint32_t crc32_buf(const void* data, size_t len, uint32_t seed) {
  if (!g_crc_ready) crc_init();
  const unsigned char* p = (const unsigned char*)data;
  uint32_t c = ~seed;
  for (size_t i = 0; i < len; i++) c = g_crc_table[(c ^ p[i]) & 0xFF] ^ (c >> 8);
  return ~c;
}

// ---------------------------------------------------------------- SHA-256 --
namespace {
struct Sha256 {
  uint32_t h[8];
  uint64_t bits;
  unsigned char buf[64];
  size_t buflen;

  Sha256() { reset(); }
  void reset() {
    static const uint32_t init[8] = { 0x6a09e667u, 0xbb67ae85u, 0x3c6ef372u, 0xa54ff53au,
                                      0x510e527fu, 0x9b05688cu, 0x1f83d9abu, 0x5be0cd19u };
    memcpy(h, init, sizeof(h));
    bits = 0;
    buflen = 0;
  }
  static uint32_t rotr(uint32_t x, int n) { return (x >> n) | (x << (32 - n)); }
  void block(const unsigned char* p) {
    static const uint32_t K[64] = {
      0x428a2f98u,0x71374491u,0xb5c0fbcfu,0xe9b5dba5u,0x3956c25bu,0x59f111f1u,0x923f82a4u,0xab1c5ed5u,
      0xd807aa98u,0x12835b01u,0x243185beu,0x550c7dc3u,0x72be5d74u,0x80deb1feu,0x9bdc06a7u,0xc19bf174u,
      0xe49b69c1u,0xefbe4786u,0x0fc19dc6u,0x240ca1ccu,0x2de92c6fu,0x4a7484aau,0x5cb0a9dcu,0x76f988dau,
      0x983e5152u,0xa831c66du,0xb00327c8u,0xbf597fc7u,0xc6e00bf3u,0xd5a79147u,0x06ca6351u,0x14292967u,
      0x27b70a85u,0x2e1b2138u,0x4d2c6dfcu,0x53380d13u,0x650a7354u,0x766a0abbu,0x81c2c92eu,0x92722c85u,
      0xa2bfe8a1u,0xa81a664bu,0xc24b8b70u,0xc76c51a3u,0xd192e819u,0xd6990624u,0xf40e3585u,0x106aa070u,
      0x19a4c116u,0x1e376c08u,0x2748774cu,0x34b0bcb5u,0x391c0cb3u,0x4ed8aa4au,0x5b9cca4fu,0x682e6ff3u,
      0x748f82eeu,0x78a5636fu,0x84c87814u,0x8cc70208u,0x90befffau,0xa4506cebu,0xbef9a3f7u,0xc67178f2u };
    uint32_t w[64];
    for (int i = 0; i < 16; i++)
      w[i] = ((uint32_t)p[i * 4] << 24) | ((uint32_t)p[i * 4 + 1] << 16) |
             ((uint32_t)p[i * 4 + 2] << 8) | (uint32_t)p[i * 4 + 3];
    for (int i = 16; i < 64; i++) {
      uint32_t s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >> 3);
      uint32_t s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >> 10);
      w[i] = w[i - 16] + s0 + w[i - 7] + s1;
    }
    uint32_t a = h[0], b = h[1], c = h[2], d = h[3], e = h[4], f = h[5], g = h[6], hh = h[7];
    for (int i = 0; i < 64; i++) {
      uint32_t S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      uint32_t ch = (e & f) ^ ((~e) & g);
      uint32_t t1 = hh + S1 + ch + K[i] + w[i];
      uint32_t S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      uint32_t mj = (a & b) ^ (a & c) ^ (b & c);
      uint32_t t2 = S0 + mj;
      hh = g; g = f; f = e; e = d + t1; d = c; c = b; b = a; a = t1 + t2;
    }
    h[0] += a; h[1] += b; h[2] += c; h[3] += d;
    h[4] += e; h[5] += f; h[6] += g; h[7] += hh;
  }
  void update(const void* data, size_t len) {
    const unsigned char* p = (const unsigned char*)data;
    bits += (uint64_t)len * 8;
    while (len > 0) {
      size_t take = 64 - buflen;
      if (take > len) take = len;
      memcpy(buf + buflen, p, take);
      buflen += take;
      p += take;
      len -= take;
      if (buflen == 64) { block(buf); buflen = 0; }
    }
  }
  std::string hex() {
    uint64_t lenbits = bits;
    unsigned char pad[72];
    size_t n = 0;
    pad[n++] = 0x80;
    while (((buflen + n) % 64) != 56) pad[n++] = 0;
    for (int i = 7; i >= 0; i--) pad[n++] = (unsigned char)((lenbits >> (i * 8)) & 0xFF);
    for (size_t i = 0; i < n; i++) {
      buf[buflen++] = pad[i];
      if (buflen == 64) { block(buf); buflen = 0; }
    }
    static const char* hexd = "0123456789abcdef";
    std::string out;
    for (int i = 0; i < 8; i++)
      for (int k = 3; k >= 0; k--) {
        unsigned char byte = (unsigned char)((h[i] >> (k * 8)) & 0xFF);
        out += hexd[byte >> 4];
        out += hexd[byte & 0xF];
      }
    return out;
  }
};
}  // namespace

std::string sha256_hex(const void* data, size_t len) {
  Sha256 s;
  if (len) s.update(data, len);
  return s.hex();
}

std::string sha256_file(FS* fs, const std::string& path) {
  if (!fs) return "";
  long long sz = fs->file_size(path);
  if (sz < 0) return "";
  Sha256 s;
  const size_t CH = 256 * 1024;
  std::vector<unsigned char> buf(CH);
  long long off = 0;
  while (off < sz) {
    size_t want = (size_t)((sz - off) < (long long)CH ? (sz - off) : (long long)CH);
    size_t got = 0;
    if (!fs->read_range(path, off, buf.data(), want, &got) || got == 0) return "";
    s.update(buf.data(), got);
    off += (long long)got;
  }
  return s.hex();
}

// -------------------------------------------------------------------- ZIP --
namespace {
uint32_t rd32(const unsigned char* p) {
  return (uint32_t)p[0] | ((uint32_t)p[1] << 8) | ((uint32_t)p[2] << 16) | ((uint32_t)p[3] << 24);
}
uint16_t rd16(const unsigned char* p) { return (uint16_t)((uint32_t)p[0] | ((uint32_t)p[1] << 8)); }

bool name_safe(const char* name, size_t len) {
  if (len == 0 || len > 400) return false;
  if (name[0] == '/' || name[0] == '\\' || name[0] == ':') return false;
  if (strchr(name, ':')) return false;
  for (size_t i = 0; i + 1 < len; i++)
    if (name[i] == '.' && name[i + 1] == '.' &&
        (i + 2 >= len || name[i + 2] == '/' || name[i + 2] == '\\'))
      return false;
  return true;
}

struct ZipItem {
  std::string name;
  uint32_t local_off = 0, csize = 0, usize = 0;
};

// Lê o índice central e devolve os itens (vazio + mensagem em caso de erro).
bool zip_index(FS* fs, const std::string& path, long long sz, std::vector<ZipItem>& out,
               std::string* err) {
  out.clear();
  long long tail_len = sz < (65536 + 22) ? sz : (65536 + 22);
  std::vector<unsigned char> tail((size_t)tail_len);
  size_t got = 0;
  if (!fs->read_range(path, sz - tail_len, tail.data(), (size_t)tail_len, &got) ||
      got != (size_t)tail_len) {
    if (err) *err = "não consegui ler o arquivo baixado";
    return false;
  }
  long long eocd = -1;
  for (long long i = (long long)tail_len - 22; i >= 0; i--) {
    if (tail[(size_t)i] == 'P' && tail[(size_t)i + 1] == 'K' && tail[(size_t)i + 2] == 5 &&
        tail[(size_t)i + 3] == 6) { eocd = i; break; }
  }
  if (eocd < 0) { if (err) *err = "o conteúdo baixado está corrompido (índice não encontrado)"; return false; }
  uint32_t cd_size = rd32(&tail[(size_t)eocd + 12]);
  uint32_t cd_off = rd32(&tail[(size_t)eocd + 16]);
  unsigned count = rd16(&tail[(size_t)eocd + 10]);
  if ((uint64_t)cd_off + cd_size > (uint64_t)sz) { if (err) *err = "índice do conteúdo fora do arquivo"; return false; }
  std::vector<unsigned char> cd(cd_size);
  if (cd_size) {
    size_t g2 = 0;
    if (!fs->read_range(path, cd_off, cd.data(), cd_size, &g2) || g2 != cd_size) {
      if (err) *err = "não consegui ler o índice do conteúdo";
      return false;
    }
  }
  uint32_t pos = 0;
  for (unsigned e = 0; e < count && pos + 46 <= cd_size; e++) {
    const unsigned char* c = &cd[pos];
    if (!(c[0] == 'P' && c[1] == 'K' && c[2] == 1 && c[3] == 2)) break;
    uint16_t method = rd16(c + 10);
    uint32_t csize = rd32(c + 20), usize = rd32(c + 24);
    uint16_t nlen = rd16(c + 28), xlen = rd16(c + 30), clen = rd16(c + 32);
    uint32_t off = rd32(c + 42);
    pos += 46u + nlen + xlen + clen;
    if (nlen == 0 || pos > cd_size) continue;
    std::string name((const char*)c + 46, nlen);
    if (!name_safe(name.c_str(), name.size())) { if (err) *err = "conteúdo com caminho inválido"; return false; }
    if (!name.empty() && name[name.size() - 1] == '/') continue;   // pasta: criada sob demanda
    if (method != 0) {
      if (err) *err = "o conteúdo veio compactado num formato que este launcher não lê";
      return false;
    }
    if (csize != usize) { if (err) *err = "arquivo de conteúdo inconsistente"; return false; }
    ZipItem it;
    it.name = name;
    it.local_off = off;
    it.csize = csize;
    it.usize = usize;
    out.push_back(it);
  }
  if (out.empty()) { if (err) *err = "o conteúdo baixado veio vazio"; return false; }
  return true;
}

// Cria todas as pastas necessárias para um caminho relativo dentro de out_dir.
bool ensure_parents(FS* fs, const std::string& out_dir, const std::string& rel) {
  std::string cur = out_dir;
  for (size_t i = 0; i < rel.size(); i++) {
    if (rel[i] == '/') {
      if (!fs->mkdirs(cur)) return false;
      cur += "\\";
    } else {
      cur += rel[i];
    }
  }
  return true;
}
}  // namespace

int zip_list(const std::string& path, FS* fs, std::vector<ZipEntry>& out, std::string* err) {
  out.clear();
  if (!fs) { if (err) *err = "sem sistema de arquivos"; return -1; }
  long long sz = fs->file_size(path);
  if (sz < 22) { if (err) *err = "arquivo não encontrado"; return -2; }
  std::vector<ZipItem> items;
  if (!zip_index(fs, path, sz, items, err)) return -2;
  for (size_t i = 0; i < items.size(); i++) {
    ZipEntry e;
    e.name = items[i].name;
    e.size = items[i].usize;
    out.push_back(e);
  }
  return (int)out.size();
}

int zip_extract(const std::string& path, FS* fs, const std::string& out_dir,
                std::string* err, const std::function<bool(long long, long long)>& progress) {
  if (!fs) { if (err) *err = "sem sistema de arquivos"; return -1; }
  if (!fs->mkdirs(out_dir)) { if (err) *err = "não consegui criar a pasta da versão"; return -1; }
  long long sz = fs->file_size(path);
  if (sz < 22) { if (err) *err = "arquivo de conteúdo vazio ou incompleto"; return -2; }
  std::vector<ZipItem> items;
  if (!zip_index(fs, path, sz, items, err)) return -2;

  long long total = 0;
  for (size_t i = 0; i < items.size(); i++) total += items[i].usize;

  std::vector<unsigned char> buf(256 * 1024);
  long long done = 0;
  for (size_t i = 0; i < items.size(); i++) {
    const ZipItem& it = items[i];
    // cabeçalho local: precisa ser lido para saber o tamanho real do nome/extra
    unsigned char lh[30];
    size_t g = 0;
    if (!fs->read_range(path, it.local_off, lh, 30, &g) || g != 30) {
      if (err) *err = "não consegui ler o conteúdo baixado";
      return -1;
    }
    if (!(lh[0] == 'P' && lh[1] == 'K' && lh[2] == 3 && lh[3] == 4)) {
      if (err) *err = "o conteúdo baixado está corrompido";
      return -2;
    }
    uint16_t lnlen = rd16(lh + 26), lxlen = rd16(lh + 28);
    long long data_off = (long long)it.local_off + 30 + lnlen + lxlen;
    if (data_off + it.csize > (uint64_t)sz) { if (err) *err = "conteúdo baixado incompleto"; return -2; }

    if (!ensure_parents(fs, out_dir, it.name)) {
      if (err) *err = "não consegui criar as pastas do conteúdo";
      return -1;
    }
    std::string target = fs->join(out_dir, it.name);
    fs->remove_file(target);
    uint32_t left = it.csize;
    long long off = data_off;
    uint32_t crc = 0;
    bool first = true;
    while (left > 0) {
      size_t want = left < buf.size() ? left : buf.size();
      size_t rg = 0;
      if (!fs->read_range(path, off, buf.data(), want, &rg) || rg == 0) {
        if (err) *err = "falha lendo o conteúdo baixado";
        return -1;
      }
      crc = crc32_buf(buf.data(), rg, crc);
      bool wrote = first ? fs->write_file(target, std::string((const char*)buf.data(), rg))
                         : fs->append_file(target, buf.data(), rg);
      if (!wrote) { if (err) *err = "não consegui gravar " + it.name; return -1; }
      first = false;
      off += (long long)rg;
      left -= (uint32_t)rg;
      done += (long long)rg;
      if (progress && !progress(done, total)) { if (err) *err = "cancelado"; return -5; }
    }
    if (it.csize == 0) {
      if (!fs->write_file(target, "")) { if (err) *err = "não consegui gravar " + it.name; return -1; }
    }
  }
  return (int)items.size();
}

}  // namespace gpg
