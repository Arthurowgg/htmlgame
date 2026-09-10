// Testes do núcleo do launcher, rodando nativamente (sem Windows).
// Uso: g++ -std=c++17 -O1 -I src/core src/core/*.cpp tests/test_core.cpp -o /tmp/t && /tmp/t
//
// Cobre o que pode quebrar em produção sem aviso: versões, JSON da API do
// GitHub, catálogo, ZIP (STORE), SHA-256 e o ciclo instalar/jogar do motor.
#include "gpg_core.h"

#include <cstdio>
#include <cstring>
#include <cstdlib>
#include <dirent.h>
#include <sys/stat.h>
#include <unistd.h>
#include <functional>
#include <fstream>

using namespace gpg;

static int g_fail = 0, g_pass = 0;
static void check(const char* what, bool ok, const std::string& info = "") {
  if (ok) { g_pass++; printf("  ok   %s\n", what); }
  else { g_fail++; printf("  FAIL %s %s\n", what, info.c_str()); }
}

// ------------------------------------------------------- FS de teste (POSIX)
class TestFS : public FS {
public:
  std::string root;
  explicit TestFS(std::string r) : root(r) {}
  std::string real(const std::string& p) const {
    std::string q = p;
    for (size_t i = 0; i < q.size(); i++) if (q[i] == '\\') q[i] = '/';
    return q;
  }
  bool exists(const std::string& p) override {
    struct stat st;
    return stat(real(p).c_str(), &st) == 0;
  }
  bool is_dir(const std::string& p) override {
    struct stat st;
    if (stat(real(p).c_str(), &st) != 0) return false;
    return S_ISDIR(st.st_mode);
  }
  bool mkdirs(const std::string& p) override {
    std::string q = real(p), cur;
    std::vector<std::string> parts;
    std::string buf;
    for (size_t i = 0; i < q.size(); i++) {
      if (q[i] == '/') { parts.push_back(buf); buf.clear(); }
      else buf += q[i];
    }
    parts.push_back(buf);
    cur = (parts.size() && parts[0].empty()) ? "/" : "";
    for (size_t i = 0; i < parts.size(); i++) {
      if (parts[i].empty()) continue;
      cur += parts[i];
      ::mkdir(cur.c_str(), 0755);
      cur += "/";
    }
    return is_dir(p);
  }
  bool read_file(const std::string& p, std::string& out) override {
    std::ifstream f(real(p).c_str(), std::ios::binary);
    if (!f) return false;
    out.assign((std::istreambuf_iterator<char>(f)), std::istreambuf_iterator<char>());
    return true;
  }
  bool write_file(const std::string& p, const std::string& d) override {
    size_t slash = p.find_last_of("\\/");
    if (slash != std::string::npos) mkdirs(p.substr(0, slash));
    std::ofstream f(real(p).c_str(), std::ios::binary | std::ios::trunc);
    if (!f) return false;
    f.write(d.data(), (std::streamsize)d.size());
    return f.good();
  }
  bool remove_file(const std::string& p) override { return ::remove(real(p).c_str()) == 0; }
  bool remove_tree(const std::string& p) override {
    if (!exists(p)) return true;
    if (!is_dir(p)) return remove_file(p);
    DIR* d = opendir(real(p).c_str());
    if (!d) return false;
    struct dirent* e;
    while ((e = readdir(d)) != NULL) {
      std::string n = e->d_name;
      if (n == "." || n == "..") continue;
      remove_tree(p + "/" + n);
    }
    closedir(d);
    return ::rmdir(real(p).c_str()) == 0;
  }
  bool read_range(const std::string& p, long long off, void* buf, size_t len, size_t* got) override {
    std::ifstream f(real(p).c_str(), std::ios::binary);
    if (!f) return false;
    f.seekg((std::streamoff)off);
    f.read((char*)buf, (std::streamsize)len);
    *got = (size_t)f.gcount();
    return true;
  }
  bool append_file(const std::string& p, const void* data, size_t len) override {
    size_t slash = p.find_last_of("\\/");
    if (slash != std::string::npos) mkdirs(p.substr(0, slash));
    std::ofstream f(real(p).c_str(), std::ios::binary | std::ios::app);
    if (!f) return false;
    f.write((const char*)data, (std::streamsize)len);
    return f.good();
  }
  long long file_size(const std::string& p) override {
    struct stat st;
    if (stat(real(p).c_str(), &st) != 0) return -1;
    return (long long)st.st_size;
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
      long long s = file_size(p);
      if (s > 0) total += s;
      if (files) (*files)++;
      return;
    }
    DIR* d = opendir(real(p).c_str());
    if (!d) return;
    struct dirent* e;
    int seen = 0;
    while ((e = readdir(d)) != NULL && seen < maxf) {
      std::string n = e->d_name;
      if (n == "." || n == "..") continue;
      seen++;
      walk(p + "/" + n, maxf, total, files);
    }
    closedir(d);
  }
  std::vector<std::string> list_dir(const std::string& p) override {
    std::vector<std::string> out;
    DIR* d = opendir(real(p).c_str());
    if (!d) return out;
    struct dirent* e;
    while ((e = readdir(d)) != NULL) {
      std::string n = e->d_name;
      if (n == "." || n == "..") continue;
      if (is_dir(p + "/" + n)) out.push_back(n);
    }
    closedir(d);
    return out;
  }
  std::string join(const std::string& a, const std::string& b) override {
    return a + "/" + real(b);
  }
  const char* sep() override { return "/"; }
};

// ------------------------------------------------- rede de teste (arquivos)
class TestNet : public Net {
public:
  TestFS* fs;
  std::string base;      // pasta com respostas simuladas
  bool fail = false;
  explicit TestNet(TestFS* f, std::string b) : fs(f), base(b) {}
  bool download(const std::string& url, const std::string& dest_path, std::string* body_out,
                bool allow_resume, const NetProgFn& progress, std::string* err) override {
    (void)allow_resume;
    if (fail) { if (err) *err = "sem conexão (teste)"; return false; }
    std::string file = base + "/" + url.substr(url.find_last_of('/') + 1);
    std::string data;
    if (!fs->read_file(file, data)) { if (err) *err = "404 (teste)"; return false; }
    for (size_t i = 0; i < data.size(); i += 8192) {
      NetProgress np;
      np.got = (long long)(i + 8192 > data.size() ? data.size() : i + 8192);
      np.total = (long long)data.size();
      np.speed = 1024.0 * 512;
      if (progress && !progress(np)) { if (err) *err = "cancelado"; return false; }
    }
    if (body_out) *body_out = data;
    if (!dest_path.empty()) fs->write_file(dest_path, data);
    return true;
  }
};

class TestPlat : public Platform {
public:
  std::string root;
  int server_port = 0;
  std::string served;
  bool launched = false;
  explicit TestPlat(std::string r) : root(r) {}
  void open_url(const std::string&) override {}
  void open_folder(const std::string&) override {}
  bool pick_folder(std::string&, const std::string&) override { return false; }
  bool open_text_file(const std::string&) override { return false; }
  std::string default_install_root() override { return root; }
  std::string self_exe_path() override { return "/tmp/gpg-launcher-fake.exe"; }
  bool apply_self_update(const std::string&, const std::string&) override { return true; }
  void notify(const std::string&, const std::string&) override {}
  bool start_game_server(const std::string& web_dir, int port, std::string*) override {
    served = web_dir; server_port = port; return true;
  }
  void stop_game_server() override { server_port = 0; }
  bool launch_game_window(const std::string&, int port, std::string*) override {
    launched = (port == server_port && server_port != 0); return launched;
  }
  bool game_window_open() override { return launched; }
};

// ------------------------------------------------------- zip de teste ------
static void wr32(std::string& s, uint32_t v) {
  s += (char)(v & 0xFF); s += (char)((v >> 8) & 0xFF); s += (char)((v >> 16) & 0xFF);
  s += (char)((v >> 24) & 0xFF);
}
static void wr16(std::string& s, uint16_t v) { s += (char)(v & 0xFF); s += (char)((v >> 8) & 0xFF); }
// Escreve um zip STORE igual ao que o empacotador do jogo produz.
static std::string make_zip(const std::vector<std::pair<std::string, std::string>>& files) {
  std::string out, cd;
  for (size_t i = 0; i < files.size(); i++) {
    const std::string& name = files[i].first;
    const std::string& data = files[i].second;
    uint32_t crc = crc32_buf(data.data(), data.size());
    uint32_t off = (uint32_t)out.size();
    out += "PK\x03\x04";
    wr16(out, 20); wr16(out, 0); wr16(out, 0); wr16(out, 0); wr16(out, 0);
    wr32(out, crc); wr32(out, (uint32_t)data.size()); wr32(out, (uint32_t)data.size());
    wr16(out, (uint16_t)name.size()); wr16(out, 0);
    out += name; out += data;
    cd += "PK\x01\x02";
    wr16(cd, 20); wr16(cd, 20); wr16(cd, 0); wr16(cd, 0); wr16(cd, 0); wr16(cd, 0);
    wr32(cd, crc); wr32(cd, (uint32_t)data.size()); wr32(cd, (uint32_t)data.size());
    wr16(cd, (uint16_t)name.size()); wr16(cd, 0); wr16(cd, 0); wr16(cd, 0); wr16(cd, 0);
    wr32(cd, 0); wr32(cd, off);
    cd += name;
  }
  uint32_t cd_off = (uint32_t)out.size();
  out += cd;
  out += "PK\x05\x06";
  wr16(out, 0); wr16(out, 0); wr16(out, (uint16_t)files.size()); wr16(out, (uint16_t)files.size());
  wr32(out, (uint32_t)cd.size()); wr32(out, cd_off); wr16(out, 0);
  return out;
}

int main() {
  printf("== launcher: testes do núcleo ==\n");

  printf("\n[versões e strings]\n");
  check("parse game-v1.2.3", parse_version("game-v1.2.3").minor == 2);
  check("parse v1.3", parse_version("v1.3").valid && parse_version("v1.3").patch == 0);
  check("tag_version", tag_version("launcher-v1.10.2") == "1.10.2", tag_version("launcher-v1.10.2"));
  check("1.10 > 1.9", compare_version("v1.10.0", "v1.9.9") > 0);
  check("2.0.0 > 1.99.99", compare_version("game-v2.0.0", "game-v1.99.99") > 0);
  check("iguais", compare_version("1.0.0", "v1.0.0") == 0);
  check("tag inválida", !valid_tag("../etc/passwd"));
  check("tag válida", valid_tag("game-v1.1.0"));
  check("tamanho humano", human_size(1536) == "1.50 KB", human_size(1536));
  check("data BR", date_iso_to_br("2026-09-10T12:00:00Z") == "10/09/2026");
  check("zip nome", game_zip_name("1.1.0") == "GrandPixelGame-v1.1.0-web.zip");
  check("utf8/wide ida e volta", to_utf8(to_wide("Ação ção ü")) == "Ação ção ü", to_utf8(to_wide("Ação ção ü")));
  check("marca de lista", strip_markdown("- item\n**negrito** ok").find("•  item") == 0);

  printf("\n[json]\n");
  Json j;
  check("parse objeto", json_parse("{\"a\":[1,2,{\"b\":\"x\\u00e9\"}],\"c\":true}", j));
  check("array", j.get("a") && j.get("a")->size() == 3);
  check("aninhado", j.get("a")->at(2)->get("b")->str() == "xé", j.get("a")->at(2)->get("b")->str());
  check("bool", j.get("c")->flag(false));
  check("número negativo", json_parse("[ -42 ]", j) && j.at(0)->num() == -42);
  check("lixo", !json_parse("{\"a\":", j));
  check("gigante ok", json_parse(std::string(20000, ' ') + "[1]", j));

  printf("\n[sha256 / crc32]\n");
  check("sha vazio", sha256_hex("", 0) ==
        "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855", sha256_hex("", 0));
  check("sha abc", sha256_hex("abc", 3) ==
        "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad", sha256_hex("abc", 3));
  check("sha longo", sha256_hex(std::string(1000000, 'a').data(), 1000000) ==
        "cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0",
        sha256_hex(std::string(1000000, 'a').data(), 1000000));
  check("crc32 123456789", crc32_buf("123456789", 9) == 0xCBF43926u, fmt("%08x", crc32_buf("123456789", 9)));

  // ------------------------------------------------------------- ambiente --
  std::string tmp = "/tmp/gpg_test_" + fmt("%d", (int)getpid());
  TestFS fs(tmp);
  // End-to-end opcional: extrai o pacote real de uma release e confere o contrato
  {
    const char* real = getenv("GPG_REAL_ZIP");
    if (real && *real) {
      printf("\n[pacote real: %s]\n", real);
      std::vector<ZipEntry> entries;
      std::string zerr;
      int n = zip_list(real, &fs, entries, &zerr);
      check("pacote real abre", n > 0, zerr);
      bool has_index = false, has_main = false;
      for (size_t i = 0; i < entries.size(); i++) {
        if (entries[i].name == "index.html") has_index = true;
        if (entries[i].name == "js/main.js") has_main = true;
      }
      check("index.html na raiz do pacote", has_index);
      check("js/main.js presente", has_main);
      std::string exerr;
      int extracted = zip_extract(real, &fs, tmp + "/real", &exerr, nullptr);
      check("pacote real extrai inteiro", extracted == n, exerr);
      std::string mainjs;
      check("js/main.js extraído igual", fs.read_file(tmp + "/real/js/main.js", mainjs) &&
            mainjs.find("const VERSION") != std::string::npos);
    }
  }

  fs.remove_tree(tmp);
  fs.mkdirs(tmp);
  TestPlat plat(tmp);
  TestNet net(&fs, tmp);
  plat.root = tmp;

  printf("\n[zip]\n");
  std::string zipdata = make_zip({
      {"index.html", "<html>oi</html>"},
      {"js/main.js", "console.log(1);"},
      {"css/style.css", "body{margin:0}"},
      {"assets/music/leia.txt", "coloque a musica aqui"},
  });
  fs.write_file(tmp + "/conteudo.zip", zipdata);
  std::vector<ZipEntry> entries;
  std::string zerr;
  int n = zip_list(tmp + "/conteudo.zip", &fs, entries, &zerr);
  check("lista 4 entradas", n == 4, fmt("%d %s", n, zerr.c_str()));
  std::string exerr;
  int extracted = zip_extract(tmp + "/conteudo.zip", &fs, tmp + "/saida", &exerr, nullptr);
  check("extrai 4 arquivos", extracted == 4, fmt("%d %s", extracted, exerr.c_str()));
  std::string html;
  check("index.html saiu", fs.read_file(tmp + "/saida/index.html", html) && html == "<html>oi</html>");
  check("subpasta js", fs.exists(tmp + "/saida/js/main.js"));
  check("subpasta funda", fs.exists(tmp + "/saida/assets/music/leia.txt"));
  // zip corrompido é recusado com mensagem, sem meia-instalação
  fs.write_file(tmp + "/ruim.zip", "PK\x03\x04 lixo lixo lixo");
  check("zip corrompido recusado",
        zip_extract(tmp + "/ruim.zip", &fs, tmp + "/saida2", &exerr, nullptr) < 0 && !exerr.empty());
  // arquivo com caminho malicioso é recusado
  std::string evil = make_zip({{"../escaped.txt", "x"}});
  fs.write_file(tmp + "/evil.zip", evil);
  check("caminho ../ recusado",
        zip_extract(tmp + "/evil.zip", &fs, tmp + "/saida3", &exerr, nullptr) < 0);

  printf("\n[catálogo do GitHub]\n");
  std::string api = R"([{"tag_name":"game-v1.0.0","name":"Grand Pixel Game 1.0.0","body":"# Notas\n- item **um**\n- item dois","published_at":"2026-09-01T10:00:00Z","draft":false,"prerelease":false,"assets":[]},
    {"tag_name":"launcher-v1.2.0","name":"Launcher","body":"","published_at":"2026-09-05T10:00:00Z","draft":false,"prerelease":false,"assets":[]},
    {"tag_name":"game-v1.1.0","name":"Grand Pixel Game 1.1.0","body":"Novidades","published_at":"2026-09-09T10:00:00Z","draft":false,"prerelease":false,"assets":[]},
    {"tag_name":"v0.9.0","name":"esquema antigo","body":"","published_at":"2026-08-01T10:00:00Z","draft":false,"prerelease":false,"assets":[]},
    {"tag_name":"game-v0.5.0-rascunho","name":"rascunho","body":"","published_at":"2026-08-01T10:00:00Z","draft":true,"prerelease":false,"assets":[]},
    {"tag_name":"game-v9.9.9","name":"beta","body":"","published_at":"2026-09-10T10:00:00Z","draft":false,"prerelease":true,"assets":[]}])";
  Catalog cat;
  check("catálogo ok", cat.parse(api, "1.0.0", Engine::raw_base_default()));
  check("2 versões do jogo", cat.games.size() == 2, fmt("%d", (int)cat.games.size()));
  check("mais nova primeiro", cat.games[0].version == "1.1.0", cat.games[0].version);
  check("rascunho fora", cat.by_tag("game-v0.5.0-rascunho") == NULL);
  check("prerelease fora por padrão", cat.by_tag("game-v9.9.9") == NULL);
  check("tag antiga ignorada", cat.by_tag("v0.9.0") == NULL);
  check("notas limpas", cat.games[0].notes == "Novidades");
  check("link do zip na árvore da tag",
        cat.games[0].download_url ==
        "https://github.com/Arthurowgg/htmlgame/raw/refs/tags/game-v1.1.0/game/dist/GrandPixelGame-v1.1.0-web.zip",
        cat.games[0].download_url);
  check("launcher novo detectado", cat.launcher_newer && cat.launcher_version == "1.2.0");
  check("link do launcher", cat.launcher_download_url(Engine::raw_base_default()) ==
        "https://github.com/Arthurowgg/htmlgame/raw/refs/tags/launcher-v1.2.0/launcher/dist/"
        "GrandPixelGameLauncher-v1.2.0-win64.exe");
  check("sem releases do jogo = erro claro",
        !Catalog().parse("[{\"tag_name\":\"launcher-v1.0.0\",\"draft\":false,\"assets\":[]}]", "1.0.0",
                         Engine::raw_base_default()));

  printf("\n[motor: buscar → instalar → jogar]\n");
  // cache do catálogo para o boot offline, e o conteúdo do zip como resposta da rede
  fs.mkdirs(tmp + "/cache");
  fs.write_file(tmp + "/cache/releases.json", api);
  fs.write_file(tmp + "/GrandPixelGame-v1.1.0-web.zip", zipdata);

  Engine eng(&fs, &net, &plat, "1.0.0");
  std::string lerr;
  check("estado carregado", eng.load_state(&lerr), lerr);
  check("catálogo do cache no boot", eng.catalog().games.size() == 2);
  check("nada instalado ainda", eng.installs().empty());
  Engine::PlayPlan plan = eng.plan_play();
  check("plano: baixar a mais nova", plan.tag == "game-v1.1.0" && plan.need_download, plan.reason);

  eng.start_fetch();
  for (int i = 0; i < 200 && eng.busy(); i++) usleep(20000);
  Event ev;
  bool ready = false, failed = false;
  while (eng.poll_event(ev)) {
    if (ev.hook == Hook::CatalogReady) ready = true;
    if (ev.hook == Hook::CatalogFailed) failed = true;
  }
  check("catálogo buscado", ready && !failed);

  eng.start_install(0, false);
  for (int i = 0; i < 500 && eng.busy(); i++) usleep(20000);
  bool installed_ev = false, progress_seen = false;
  while (eng.poll_event(ev)) {
    if (ev.hook == Hook::InstallDone && ev.ok) installed_ev = true;
    if (ev.hook == Hook::Progress && ev.text == "baixando") progress_seen = true;
  }
  check("eventos de progresso", progress_seen);
  check("instalação concluída", installed_ev);
  check("1 instalação registrada", eng.installs().size() == 1);
  check("versão instalada correta", !eng.installs().empty() && eng.installs()[0].version == "1.1.0");
  check("arquivos contados", !eng.installs().empty() && eng.installs()[0].files == 4);
  check("hash guardado", !eng.installs().empty() && eng.installs()[0].sha256.size() == 64);
  check("part removido", !fs.exists(tmp + "/versions/game-v1.1.0.part"));
  check("manifesto existe", fs.exists(tmp + "/versions/game-v1.1.0/install.json"));
  check("web/index.html no lugar", fs.exists(tmp + "/versions/game-v1.1.0/web/index.html"));

  Engine::PlayPlan plan2 = eng.plan_play();
  check("plano pós-instalação", plan2.tag == "game-v1.1.0" && !plan2.need_download, plan2.reason);

  check("jogar abre servidor + janela", eng.play("game-v1.1.0"));
  check("porta do servidor", plat.server_port == 8137);
  check("caminho servido", plat.served == tmp + "/versions/game-v1.1.0/web", plat.served);
  check("última versão salva na config", eng.config().last_played_tag == "game-v1.1.0");
  while (eng.poll_event(ev)) {}
  check("config gravada em disco", fs.exists(tmp + "/launcher.json"));

  printf("\n[registro]\n");
  eng.log("linha de teste");
  check("log escrito", eng.logs_tail(10).find("linha de teste") != std::string::npos);

  printf("\n[remoção]\n");
  check("remover versão", eng.remove_install("game-v1.1.0"));
  check("pasta apagada", !fs.exists(tmp + "/versions/game-v1.1.0/web/index.html"));
  check("lista vazia", eng.installs().empty());

  printf("\n[estado persistente entre execuções]\n");
  {
    Engine eng2(&fs, &net, &plat, "1.0.0");
    eng2.load_state(&lerr);
    check("config relida", eng2.config().last_played_tag == "game-v1.1.0" ||
                          eng2.config().auto_update_game == true);
    check("catálogo do cache na 2ª execução", eng2.catalog().games.size() == 2);
  }

  printf("\n[sem internet]\n");
  net.fail = true;
  {
    Engine eng3(&fs, &net, &plat, "1.0.0");
    eng3.load_state(&lerr);
    eng3.start_fetch();
    for (int i = 0; i < 200 && eng3.busy(); i++) usleep(20000);
    bool any = false;
    while (eng3.poll_event(ev)) any = true;
    check("falha de rede gera evento", any);
    check("lista em cache continua", eng3.catalog().games.size() == 2);
  }

  // End-to-end opcional: extrai o pacote real de uma release e confere o contrato
  {
    const char* real = getenv("GPG_REAL_ZIP");
    if (real && *real) {
      printf("\n[pacote real: %s]\n", real);
      std::vector<ZipEntry> entries;
      std::string zerr;
      int n = zip_list(real, &fs, entries, &zerr);
      check("pacote real abre", n > 0, zerr);
      bool has_index = false, has_main = false;
      for (size_t i = 0; i < entries.size(); i++) {
        if (entries[i].name == "index.html") has_index = true;
        if (entries[i].name == "js/main.js") has_main = true;
      }
      check("index.html na raiz do pacote", has_index);
      check("js/main.js presente", has_main);
      std::string exerr;
      int extracted = zip_extract(real, &fs, tmp + "/real", &exerr, nullptr);
      check("pacote real extrai inteiro", extracted == n, exerr);
      std::string mainjs;
      check("js/main.js extraído igual", fs.read_file(tmp + "/real/js/main.js", mainjs) &&
            mainjs.find("const VERSION") != std::string::npos);
    }
  }

  fs.remove_tree(tmp);
  printf("\n== %d passaram, %d falharam ==\n", g_pass, g_fail);
  return g_fail == 0 ? 0 : 1;
}
