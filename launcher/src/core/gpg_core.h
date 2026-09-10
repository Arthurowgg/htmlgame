// ============================================================================
// Grand Pixel Game — Launcher
// Núcleo portátil: strings, versões, JSON, CRC/SHA, ZIP, catálogo do GitHub,
// estado local, configuração e motor de atualização.
//
// Nada aqui depende do Windows: as partes de sistema entram pelas interfaces
// FS, Net e Platform, o que permite testar o núcleo nativamente (tests/).
// ============================================================================
#ifndef GPG_CORE_H
#define GPG_CORE_H

#include <cstdint>
#include <cstddef>
#include <string>
#include <vector>
#include <functional>

namespace gpg {

// ---------------------------------------------------------------- strings --
std::string  to_utf8(const std::wstring& w);
std::wstring to_wide(const std::string& s);
std::string  lower(std::string s);
std::string  trim(const std::string& s);
bool starts_with(const std::string& s, const std::string& pre);
bool ends_with(const std::string& s, const std::string& suf);
std::string  fmt(const char* f, ...);
std::vector<std::string> split_lines(const std::string& s);
std::string  human_size(long long bytes);
std::string  human_speed(double bytes_per_s);
std::string  human_eta(double seconds);
std::string  date_iso_to_br(const std::string& iso);     // 2026-09-10T.. -> 10/09/2026
std::string  date_iso_to_long(const std::string& iso);   // -> 10 de setembro de 2026
std::string  month_name_pt(int m);

// --------------------------------------------------------------- versões --
struct Version { int major = 0, minor = 0, patch = 0; bool valid = false; };
Version     parse_version(const std::string& tag);        // "game-v1.2.3"/"v1.2.3" -> 1.2.3
std::string tag_version(const std::string& tag);          // "game-v1.2.3" -> "1.2.3"
int         compare_version(const std::string& a, const std::string& b);
bool        version_less(const std::string& a, const std::string& b);

// ------------------------------------------------------------------ JSON --
struct Json {
  enum Type { Null, Bool, Num, Str, Arr, Obj } type = Null;
  bool b = false;
  double n = 0;
  std::string s;
  std::vector<Json> arr;
  std::vector<std::pair<std::string, Json>> obj;

  const Json* get(const std::string& key) const;      // membro de objeto
  const Json* at(size_t i) const;                     // item de array
  size_t size() const { return type == Arr ? arr.size() : obj.size(); }
  std::string str(const std::string& def = "") const { return type == Str ? s : def; }
  long long   num(long long def = 0) const;
  bool        flag(bool def = false) const;
  bool        is_null() const { return type == Null; }
};
bool json_parse(const std::string& text, Json& out);
std::string json_escape(const std::string& s);

// ------------------------------------------------------- interfaces de SO --
class FS {
public:
  virtual ~FS() {}
  virtual bool        exists(const std::string& p) = 0;
  virtual bool        is_dir(const std::string& p) = 0;
  virtual bool        mkdirs(const std::string& p) = 0;
  virtual bool        read_file(const std::string& p, std::string& out) = 0;
  virtual bool        write_file(const std::string& p, const std::string& data) = 0;
  virtual bool        remove_file(const std::string& p) = 0;
  virtual bool        remove_tree(const std::string& p) = 0;
  virtual long long   file_size(const std::string& p) = 0;          // -1 se não existe
  virtual bool        read_range(const std::string& p, long long off, void* buf, size_t len, size_t* got) = 0;
  virtual bool        append_file(const std::string& p, const void* data, size_t len) = 0;
  virtual long long   dir_size(const std::string& p, int max_files = 20000) = 0;
  virtual int         count_files(const std::string& p, int max_files = 20000) = 0;
  virtual std::vector<std::string> list_dir(const std::string& p) = 0;
  virtual std::string join(const std::string& a, const std::string& b) = 0;
  virtual const char* sep() = 0;   // separador de caminho do sistema
};

struct NetProgress { long long got = 0, total = -1; double speed = 0; };
typedef std::function<bool(const NetProgress&)> NetProgFn;   // retorna false p/ cancelar

class Net {
public:
  virtual ~Net() {}
  // Baixa para arquivo (ou texto, se dest_path vazio). allow_resume retoma .part.
  virtual bool download(const std::string& url, const std::string& dest_path,
                        std::string* body_out, bool allow_resume,
                        const NetProgFn& progress, std::string* err) = 0;
};

class Platform {
public:
  virtual ~Platform() {}
  virtual void open_url(const std::string& url) = 0;
  virtual void open_folder(const std::string& path) = 0;
  virtual bool pick_folder(std::string& out, const std::string& current) = 0;
  virtual bool open_text_file(const std::string& path) = 0;
  virtual std::string default_install_root() = 0;
  virtual std::string self_exe_path() = 0;
  virtual bool apply_self_update(const std::string& new_exe, const std::string& target_exe) = 0;
  virtual void notify(const std::string& title, const std::string& text) = 0;
  // Servidor local que entrega o conteúdo + janela do jogo (implementado por SO).
  virtual bool start_game_server(const std::string& web_dir, int port, std::string* err) = 0;
  virtual void stop_game_server() = 0;
  virtual bool launch_game_window(const std::string& tag, int port, std::string* err) = 0;
  virtual bool game_window_open() = 0;
};

// --------------------------------------------------------------- hashes ---
uint32_t crc32_buf(const void* data, size_t len, uint32_t seed = 0);
std::string sha256_hex(const void* data, size_t len);
std::string sha256_file(FS* fs, const std::string& path);

// ------------------------------------------------------------------ ZIP ---
struct ZipEntry { std::string name; long long size = 0; uint32_t crc = 0; };
// Os releases do jogo usam zip sem compressão (STORE) — contrato documentado
// em game/README.md. A leitura é rápida (cópia direta) e não precisa de
// inflate; arquivos comprimidos são recusados com erro claro.
int zip_list(const std::string& path, FS* fs, std::vector<ZipEntry>& out, std::string* err);
int zip_extract(const std::string& path, FS* fs, const std::string& out_dir,
                std::string* err, const std::function<bool(long long, long long)>& progress);

// -------------------------------------------------------------- catálogo --
struct Release {
  std::string tag;           // game-v1.1.0
  std::string version;       // 1.1.0
  std::string title;         // nome amigável da release
  std::string notes;         // corpo (texto simples, markdown leve)
  std::string date;          // 2026-09-10
  std::string download_url;  // zip de conteúdo
  std::string asset_name;
  long long   size = 0;
  bool        newest = false;
};

struct Catalog {
  std::vector<Release> games;        // mais novo primeiro
  std::string launcher_tag;          // launcher-vX.Y.Z mais novo publicado
  std::string launcher_version;      // X.Y.Z
  bool launcher_newer = false;       // existe launcher mais novo que o rodando
  bool ok = false;
  std::string error;

  const Release* by_tag(const std::string& tag) const;
  const Release* newest() const { return games.empty() ? nullptr : &games.front(); }
  // O launcher monta o link direto da árvore da tag quando a release não tem
  // asset anexado (é sempre o caso: publicamos o zip versionado no repositório).
  bool parse(const std::string& json_text, const std::string& self_version,
             const std::string& raw_base, bool include_prerelease = false);
  std::string launcher_download_url(const std::string& raw_base) const;
};

// ------------------------------------------------------------------ estado -
struct Install {
  std::string tag, version, date, sha256, installed_at;
  long long   size = 0;
  int         files = 0;
  bool        valid = false;    // index.html presente e manifest legível
};

struct Config {
  bool        auto_update_game = true;   // baixar a mais nova antes de jogar
  bool        close_on_play = true;      // fechar o launcher ao abrir o jogo
  bool        keep_server = true;        // reusar o servidor local (saves)
  bool        show_beta = false;         // mostrar releases pré-lançamento
  std::string install_root;              // raiz das versões do jogo
  std::string last_played_tag;
  std::string last_played_at;
  int         port = 8137;
};

// ------------------------------------------------------------------ motor --
enum class Job { None, Fetch, Install, UpdateSelf };
enum class Hook { Boot, Fetching, CatalogReady, CatalogFailed, Progress, InstallDone,
                  SelfUpdateReady, SelfUpdateFailed, PlayReady, Error };

struct Event {
  Hook        hook = Hook::Boot;
  std::string tag;
  std::string text;
  long long   got = 0, total = -1;
  double      speed = 0;
  bool        ok = false;
  int         index = -1;
};

class Engine {
public:
  Engine(FS* fs, Net* net, Platform* plat, const std::string& self_version);
  ~Engine();

  FS* fs() { return fs_; }
  Net* net() { return net_; }
  Platform* plat() { return plat_; }

  Config&  config() { return cfg_; }
  Catalog& catalog() { return cat_; }
  const std::vector<Install>& installs() const { return installs_; }
  const Install* install_of(const std::string& tag) const;
  std::string self_version() const { return self_ver_; }
  bool        booted() const { return booted_; }
  std::string install_root() const;

  // Ciclo de vida
  bool load_state(std::string* err);            // config + instalações + cache
  void save_config();
  void refresh_installs();
  void start_fetch();                           // busca o catálogo (assíncrono)
  void start_install(int index, bool play_after);
  void cancel_job();
  bool busy() const;
  Job  job() const;

  // Eventos (consumidos pela UI na thread principal)
  bool poll_event(Event& ev);
  void post_event(const Event& ev);

  // Decisão do botão JOGAR: qual versão rodar e o que baixar antes.
  struct PlayPlan { int index = -1; bool need_download = false; std::string tag; std::string reason; };
  PlayPlan plan_play() const;

  // Instalação/remoção
  bool remove_install(const std::string& tag);
  bool play(const std::string& tag);               // prepara servidor + abre a janela
  void do_self_update();                           // baixa e aplica o launcher novo
  std::string log_path() const;
  std::string raw_base() const;
  static std::string raw_base_default();
  void log(const std::string& line);
  std::string logs_tail(int max_lines);

private:
  void worker_fetch();
  void worker_install(int index, bool play_after);
  void worker_self_update();
  bool extract_zip(const std::string& zip, const std::string& dir, const std::string& tag);
  void finish_install(const std::string& tag, const std::string& ver, const std::string& date,
                      const std::string& zip, long long size, bool play_after);

  FS* fs_;
  Net* net_;
  Platform* plat_;
  std::string self_ver_;
  Config cfg_;
  Catalog cat_;
  std::vector<Install> installs_;
  bool booted_ = false;
  std::string cache_path_, config_path_, log_path_;

  // thread/eventos
  struct Impl;
  Impl* p_;
};

// ------------------------------------------------------------ utilidades ---
std::string strip_markdown(const std::string& md, int max_lines = 0);
std::string game_zip_name(const std::string& version);   // GrandPixelGame-vX.Y.Z-web.zip
bool        valid_tag(const std::string& tag);

}  // namespace gpg
#endif  // GPG_CORE_H
