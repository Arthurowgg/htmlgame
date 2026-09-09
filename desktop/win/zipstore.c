/* zipstore.c — implementação do extrator mínimo de .zip (STORE). */
#include "zipstore.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#ifdef _WIN32
#include <direct.h>
#define GPG_MKDIR(p) _mkdir(p)
#else
#include <sys/stat.h>
#include <sys/types.h>
#define GPG_MKDIR(p) mkdir(p, 0755)
#endif

static unsigned rd16(const unsigned char *p) { return (unsigned)p[0] | ((unsigned)p[1] << 8); }
static unsigned long rd32(const unsigned char *p) {
  return (unsigned long)p[0] | ((unsigned long)p[1] << 8) |
         ((unsigned long)p[2] << 16) | ((unsigned long)p[3] << 24);
}

static void mkdirs(const char *dir) {
  /* cria a cadeia de diretórios a partir de dir (com separador local) */
  char *d = (char *)malloc(strlen(dir) + 1);
  if (!d) return;
  strcpy(d, dir);
  size_t n = strlen(d);
  for (size_t i = 0; i < n; i++) {
#ifdef _WIN32
    if (d[i] == '/') d[i] = '\\';
#endif
    if (d[i] == '\\' || d[i] == '/') {
      char c = d[i];
      d[i] = 0;
      if (d[0]) GPG_MKDIR(d);
      d[i] = c;
    }
  }
  if (d[0]) GPG_MKDIR(d);
  free(d);
}

static int name_ok(const char *name, size_t len) {
  if (len == 0 || len > 400) return 0;
  if (name[0] == '/' || name[0] == '\\') return 0;
  /* sem segmentos ".." e sem ':' */
  const char *s = name;
  for (size_t i = 0; i <= len; i++) {
    char c = (i < len) ? name[i] : '/';
    if (c == '/' || c == '\\' || c == ':') {
      if (s < name + len && (size_t)(s - name) == 2 && s[0] == '.' && s[1] == '.') return 0;
      if ((size_t)(s - name) == 1 && s[0] == '.') return 0;
      s = name + i + 1;
    }
  }
  return 1;
}

int zip_extract_store(const char *zip_path, const char *out_dir) {
  FILE *f = fopen(zip_path, "rb");
  if (!f) return -1;
  if (fseek(f, 0, SEEK_END) != 0) { fclose(f); return -1; }
  long sz = ftell(f);
  if (sz < 22) { fclose(f); return -2; }
  rewind(f);
  unsigned char *buf = (unsigned char *)malloc((size_t)sz);
  if (!buf) { fclose(f); return -1; }
  if (fread(buf, 1, (size_t)sz, f) != (size_t)sz) { free(buf); fclose(f); return -1; }
  fclose(f);

  /* EOCD: procura nos últimos 64 KB+22 */
  long eocd = -1;
  long from = (sz - 22 - 65536) > 0 ? (sz - 22 - 65536) : 0;
  for (long i = sz - 22; i >= from; i--) {
    if (buf[i] == 'P' && buf[i + 1] == 'K' && buf[i + 2] == 5 && buf[i + 3] == 6) { eocd = i; break; }
  }
  if (eocd < 0) { free(buf); return -2; }
  unsigned long cd_off = rd32(buf + eocd + 16);
  unsigned long cd_count = rd16(buf + eocd + 10);

  size_t outlen = strlen(out_dir);
  char outbuf[1024];
  int extracted = 0;
  unsigned long pos = cd_off;
  for (unsigned long e = 0; e < cd_count && pos + 46 <= (unsigned long)sz; e++) {
    const unsigned char *c = buf + pos;
    if (!(c[0] == 'P' && c[1] == 'K' && c[2] == 1 && c[3] == 2)) break;
    unsigned method = rd16(c + 10);
    unsigned long csize = rd32(c + 20);
    unsigned long usize = rd32(c + 24);
    unsigned nlen = rd16(c + 28), xlen = rd16(c + 30), clen = rd16(c + 32);
    unsigned long loff = rd32(c + 42);
    pos += 46 + nlen + xlen + clen;
    if (nlen == 0 || !name_ok((const char *)(c + 46), nlen)) return -4;
    int is_dir = (c[46 + nlen - 1] == '/') || (c[46 + nlen - 1] == '\\');
    if (is_dir || method != 0) continue;           /* entradas dir: pula; compactadas: pula (não usamos) */
    /* local header */
    if (loff + 30 + nlen > (unsigned long)sz) return -2;
    const unsigned char *l = buf + loff;
    if (!(l[0] == 'P' && l[1] == 'K' && l[2] == 3 && l[3] == 4)) return -2;
    unsigned lnlen = rd16(l + 26), lxlen = rd16(l + 28);
    unsigned long data = loff + 30 + lnlen + lxlen;
    if (data + csize > (unsigned long)sz || csize != usize) return -2;

    /* caminho de saída */
    size_t need = outlen + 1 + nlen + 1;
    if (need > sizeof(outbuf)) return -4;
    memcpy(outbuf, out_dir, outlen);
    outbuf[outlen] = '/';
    memcpy(outbuf + outlen + 1, c + 46, nlen);
    outbuf[need - 1] = 0;
#ifdef _WIN32
    for (size_t i = 0; i < need - 1; i++) if (outbuf[i] == '/') outbuf[i] = '\\';
#endif
    /* cria diretório pai */
    char parent[1024];
    strncpy(parent, outbuf, sizeof(parent) - 1);
    parent[sizeof(parent) - 1] = 0;
    char *slash = strrchr(parent, '\\');
    if (!slash) slash = strrchr(parent, '/');
    if (slash) { *slash = 0; if (parent[0]) mkdirs(parent); }
    FILE *o = fopen(outbuf, "wb");
    if (!o) { free(buf); return -1; }
    if (csize && fwrite(buf + data, 1, csize, o) != csize) { fclose(o); free(buf); return -1; }
    fclose(o);
    extracted++;
  }
  free(buf);
  return extracted;
}
