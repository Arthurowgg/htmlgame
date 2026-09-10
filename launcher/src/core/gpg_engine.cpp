// Núcleo: catálogo do GitHub, estado local (config/instalações) e o motor de
// atualização que a interface usa — buscar, baixar, instalar, jogar.
#include "gpg_core.h"

#include <algorithm>
#include <cstring>
#include <cstdlib>
#include <ctime>
#include <thread>
#include <mutex>
#include <deque>
#include <atomic>

namespace gpg {

// ============================================================ catálogo ====
const Release* Catalog::by_tag(const std::string& tag) const {
  for (size_t i = 0; i < games.size(); i++)
    if (games[i].tag == tag) return &games[i];
  return NULL;
}

std::string Catalog::launcher_download_url(const std::string& raw_base) const {
  if (launcher_version.empty()) return "";
  return raw_base + launcher_tag + "/launcher/dist/GrandPixelGameLauncher-v" +
         launcher_version + "-win64.exe";
}

bool Catalog::parse(const std::string& json_text, const std::string& self_version,
                    const std::string& raw_base, bool include_prerelease) {
  games.clear();
  launcher_tag.clear();
  launcher_version.clear();
  launcher_newer = false;
  ok = false;
  error.clear();

  Json root;
  if (!json_parse(json_text, root) || root.type != Json::Arr) {
    error = "a resposta do GitHub não veio no formato esperado";
    return false;
  }
  for (size_t i = 0; i < root.arr.size(); i++) {
    const Json& r = root.arr[i];
    if (r.type != Json::Obj) continue;
    const Json* jtag = r.get("tag_name");
    if (!jtag) continue;
    std::string tag = jtag->str();
    bool draft = r.get("draft") ? r.get("draft")->flag(false) : false;
    bool pre = r.get("prerelease") ? r.get("prerelease")->flag(false) : false;
    if (draft) continue;
    if (pre && !include_prerelease) continue;
    if (!valid_tag(tag)) continue;

    std::string ver = tag_version(tag);
    Version pv = parse_version(ver);
    if (!pv.valid) continue;                       // tag fora do padrão vX.Y.Z
    std::string date;
    if (const Json* jd = r.get("published_at")) date = jd->str().substr(0, 10);
    std::string title;
    if (const Json* jn = r.get("name")) title = trim(jn->str());
    std::string body;
    if (const Json* jb = r.get("body")) body = jb->str();

    if (starts_with(tag, "launcher-v")) {
      if (launcher_version.empty() || version_less(launcher_version, ver)) {
        launcher_version = ver;
        launcher_tag = tag;
      }
      continue;                                    // launcher não é jogo
    }
    if (!starts_with(tag, "game-v")) continue;      // ignora tags de outra natureza

    Release rel;
    rel.tag = tag;
    rel.version = ver;
    rel.title = title.empty() ? ("Grand Pixel Game " + ver) : title;
    rel.notes = strip_markdown(body);
    rel.date = date;
    // asset anexado (opcional); senão, o zip versionado na árvore da tag
    if (const Json* ja = r.get("assets")) {
      for (size_t k = 0; k < ja->arr.size(); k++) {
        const Json& a = ja->arr[k];
        std::string an = a.get("name") ? a.get("name")->str() : "";
        if (ends_with(an, "-web.zip")) {
          rel.asset_name = an;
          rel.download_url = a.get("browser_download_url") ? a.get("browser_download_url")->str() : "";
          rel.size = a.get("size") ? a.get("size")->num(0) : 0;
          break;
        }
      }
    }
    if (rel.download_url.empty())
      rel.download_url = raw_base + tag + "/game/dist/" + game_zip_name(ver);

    games.push_back(rel);
  }
  std::sort(games.begin(), games.end(), [](const Release& a, const Release& b) {
    return version_less(b.version, a.version);      // mais novo primeiro
  });
  for (size_t i = 0; i < games.size(); i++) games[i].newest = (i == 0);
  if (games.empty()) {
    error = "nenhuma versão do jogo publicada ainda";
    return false;
  }
  if (!launcher_version.empty())
    launcher_newer = version_less(self_version, launcher_version);
  ok = true;
  return true;
}

// ============================================================ utilidades ===
static std::string now_iso() {
  time_t t = time(NULL);
  struct tm tmv;
#ifdef _WIN32
  localtime_s(&tmv, &t);
#else
  localtime_r(&t, &tmv);
#endif
  char buf[32];
  snprintf(buf, sizeof(buf), "%04d-%02d-%02dT%02d:%02d:%02d", tmv.tm_year + 1900,
           tmv.tm_mon + 1, tmv.tm_mday, tmv.tm_hour, tmv.tm_min, tmv.tm_sec);
  return buf;
}

// ================================================================ motor ====
struct Engine::Impl {
  std::thread worker;
  std::atomic<bool> cancel{false};
  std::atomic<int> job{0};                        // Job como int
  std::mutex mu;
  std::deque<Event> events;
  std::atomic<int> busy{0};
};

Engine::Engine(FS* fs, Net* net, Platform* plat, const std::string& self_version)
    : fs_(fs), net_(net), plat_(plat), self_ver_(self_version) {
  p_ = new Impl();
}
Engine::~Engine() {
  if (p_->worker.joinable()) p_->worker.join();
  delete p_;
}

std::string Engine::install_root() const {
  if (!cfg_.install_root.empty()) return cfg_.install_root;
  return plat_->default_install_root();
}
const Install* Engine::install_of(const std::string& tag) const {
  for (size_t i = 0; i < installs_.size(); i++)
    if (installs_[i].tag == tag) return &installs_[i];
  return NULL;
}
std::string Engine::log_path() const { return log_path_; }
Job Engine::job() const { return (Job)p_->job.load(); }
bool Engine::busy() const { return p_->busy.load() != 0; }

void Engine::log(const std::string& line) {
  if (!fs_ || log_path_.empty()) return;
  char stamp[32];
  time_t t = time(NULL);
  struct tm tmv;
#ifdef _WIN32
  localtime_s(&tmv, &t);
#else
  localtime_r(&t, &tmv);
#endif
  snprintf(stamp, sizeof(stamp), "[%02d:%02d:%02d] ", tmv.tm_hour, tmv.tm_min, tmv.tm_sec);
  fs_->append_file(log_path_, (std::string(stamp) + line + "\r\n").data(),
                   (std::string(stamp) + line + "\r\n").size());
}

std::string Engine::logs_tail(int max_lines) {
  std::string all;
  if (!fs_ || !fs_->read_file(log_path_, all)) return "(sem registro ainda)";
  std::vector<std::string> lines = split_lines(all);
  int from = (int)lines.size() - max_lines;
  if (from < 0) from = 0;
  std::string out;
  for (size_t i = (size_t)from; i < lines.size(); i++) out += lines[i] + "\r\n";
  return out;
}

// ------------------------------------------------------ estado local ------
bool Engine::load_state(std::string* err) {
  if (!plat_->default_install_root().size()) { if (err) *err = "sem pasta do usuário"; return false; }
  std::string root = install_root();
  std::string P = fs_->sep();
  fs_->mkdirs(root);
  fs_->mkdirs(root + P + "versions");
  fs_->mkdirs(root + P + "cache");
  config_path_ = root + P + "launcher.json";
  cache_path_ = root + P + "cache" + P + "releases.json";
  log_path_ = root + P + "launcher.log";

  std::string cfgtext;
  if (fs_->read_file(config_path_, cfgtext)) {
    Json j;
    if (json_parse(cfgtext, j) && j.type == Json::Obj) {
      if (const Json* v = j.get("auto_update_game")) cfg_.auto_update_game = v->flag(true);
      if (const Json* v = j.get("close_on_play")) cfg_.close_on_play = v->flag(true);
      if (const Json* v = j.get("keep_server")) cfg_.keep_server = v->flag(true);
      if (const Json* v = j.get("show_beta")) cfg_.show_beta = v->flag(false);
      if (const Json* v = j.get("install_root")) cfg_.install_root = v->str();
      if (const Json* v = j.get("last_played_tag")) cfg_.last_played_tag = v->str();
      if (const Json* v = j.get("last_played_at")) cfg_.last_played_at = v->str();
      if (const Json* v = j.get("port")) cfg_.port = (int)v->num(8137);
    }
  }
  if (cfg_.install_root.empty()) cfg_.install_root = root;
  // catálogo em cache: o launcher abre já com a lista mesmo sem internet
  std::string cache;
  if (fs_->read_file(cache_path_, cache)) cat_.parse(cache, self_ver_, raw_base_default(), cfg_.show_beta);
  refresh_installs();
  log(fmt("Launcher %s iniciado (cats=%d instaladas=%d)", self_ver_.c_str(),
          (int)cat_.games.size(), (int)installs_.size()));
  booted_ = true;
  return true;
}

std::string Engine::raw_base() const { return raw_base_default(); }
std::string Engine::raw_base_default() {
  return "https://github.com/Arthurowgg/htmlgame/raw/refs/tags/";
}

void Engine::save_config() {
  std::string j = "{\n";
  j += fmt("  \"auto_update_game\": %s,\n", cfg_.auto_update_game ? "true" : "false");
  j += fmt("  \"close_on_play\": %s,\n", cfg_.close_on_play ? "true" : "false");
  j += fmt("  \"keep_server\": %s,\n", cfg_.keep_server ? "true" : "false");
  j += fmt("  \"show_beta\": %s,\n", cfg_.show_beta ? "true" : "false");
  j += fmt("  \"port\": %d,\n", cfg_.port);
  j += fmt("  \"install_root\": \"%s\",\n", json_escape(cfg_.install_root).c_str());
  j += fmt("  \"last_played_tag\": \"%s\",\n", json_escape(cfg_.last_played_tag).c_str());
  j += fmt("  \"last_played_at\": \"%s\"\n", json_escape(cfg_.last_played_at).c_str());
  j += "}\n";
  fs_->write_file(config_path_, j);
}

void Engine::refresh_installs() {
  installs_.clear();
  std::string P = fs_->sep();
  std::string vroot = install_root() + P + "versions";
  std::vector<std::string> dirs = fs_->list_dir(vroot);
  for (size_t i = 0; i < dirs.size(); i++) {
    std::string tag = dirs[i];
    if (!valid_tag(tag)) continue;
    Install ins;
    ins.tag = tag;
    ins.version = tag_version(tag);
    std::string web = vroot + P + tag + P + "web";
    ins.valid = fs_->exists(web + "\\index.html");
    std::string man;
    if (fs_->read_file(vroot + P + tag + P + "install.json", man)) {
      Json j;
      if (json_parse(man, j) && j.type == Json::Obj) {
        if (const Json* v = j.get("version")) ins.version = v->str(ins.version);
        if (const Json* v = j.get("date")) ins.date = v->str();
        if (const Json* v = j.get("installed_at")) ins.installed_at = v->str();
        if (const Json* v = j.get("sha256")) ins.sha256 = v->str();
        if (const Json* v = j.get("size")) ins.size = v->num(0);
        if (const Json* v = j.get("files")) ins.files = (int)v->num(0);
      }
    }
    if (ins.size == 0) ins.size = fs_->dir_size(web);
    if (ins.files == 0) ins.files = fs_->count_files(web);
    if (ins.valid) installs_.push_back(ins);
  }
  std::sort(installs_.begin(), installs_.end(), [](const Install& a, const Install& b) {
    return version_less(b.version, a.version);
  });
}

// ------------------------------------------------------------- eventos ----
void Engine::post_event(const Event& ev) {
  std::lock_guard<std::mutex> lk(p_->mu);
  if (p_->events.size() > 512) p_->events.pop_front();
  p_->events.push_back(ev);
}
bool Engine::poll_event(Event& ev) {
  std::lock_guard<std::mutex> lk(p_->mu);
  if (p_->events.empty()) return false;
  ev = p_->events.front();
  p_->events.pop_front();
  return true;
}

// ------------------------------------------------------------- buscar -----
void Engine::start_fetch() {
  if (p_->busy.load() != 0) return;
  p_->busy.store(1);
  p_->job.store((int)Job::Fetch);
  p_->cancel.store(false);
  p_->worker = std::thread([this]() { worker_fetch(); });
  p_->worker.detach();
}

void Engine::worker_fetch() {
  Event ev;
  ev.hook = Hook::Fetching;
  post_event(ev);
  std::string body, err;
  NetProgFn prog = [this](const NetProgress& np) {
    Event e;
    e.hook = Hook::Progress;
    e.got = np.got;
    e.total = np.total;
    e.speed = np.speed;
    e.text = "buscando";
    post_event(e);
    return !p_->cancel.load();
  };
  bool ok = net_->download(
      "https://api.github.com/repos/Arthurowgg/htmlgame/releases?per_page=100", "", &body, false,
      prog, &err);
  Event done;
  if (ok && cat_.parse(body, self_ver_, raw_base_default(), cfg_.show_beta)) {
    fs_->write_file(cache_path_, body);
    done.hook = Hook::CatalogReady;
    done.ok = true;
    done.text = fmt("%d versão(ões) encontrada(s)", (int)cat_.games.size());
    log("catálogo atualizado do GitHub");
  } else {
    done.hook = cat_.games.empty() ? Hook::CatalogFailed : Hook::CatalogReady;
    done.ok = !cat_.games.empty();
    done.text = err.empty() ? cat_.error : err;
    if (done.text.empty()) done.text = "não consegui falar com o GitHub";
    log("falha ao buscar catálogo: " + done.text);
  }
  post_event(done);
  p_->busy.store(0);
  p_->job.store((int)Job::None);
}

// ------------------------------------------------------------ instalar ----
void Engine::start_install(int index, bool play_after) {
  if (p_->busy.load() != 0) return;
  if (index < 0 || index >= (int)cat_.games.size()) return;
  p_->busy.store(1);
  p_->job.store((int)Job::Install);
  p_->cancel.store(false);
  p_->worker = std::thread([this, index, play_after]() { worker_install(index, play_after); });
  p_->worker.detach();
}

void Engine::cancel_job() {
  if (p_->busy.load() != 0) {
    p_->cancel.store(true);
    log("job cancelado pelo usuário");
  }
}

bool Engine::extract_zip(const std::string& zip, const std::string& dir, const std::string& tag) {
  (void)tag;
  std::string err;
  int n = zip_extract(zip, fs_, dir, &err, [this](long long got, long long total) {
    Event e;
    e.hook = Hook::Progress;
    e.got = got;
    e.total = total;
    e.text = "instalando";
    post_event(e);
    return !p_->cancel.load();
  });
  if (n < 0) {
    log("erro ao extrair conteúdo: " + err);
    return false;
  }
  log(fmt("conteúdo extraído: %d arquivo(s)", n));
  return true;
}

void Engine::worker_install(int index, bool play_after) {
  Release rel = cat_.games[index];
  std::string root = install_root();
  std::string P = fs_->sep();
  fs_->mkdirs(root + P + "versions");
  std::string vdir = root + P + "versions" + P + rel.tag;
  std::string part = vdir + ".part";
  std::string err;
  log("baixando " + rel.tag + " de " + rel.download_url);

  NetProgFn prog = [this, &rel](const NetProgress& np) {
    Event e;
    e.hook = Hook::Progress;
    e.got = np.got;
    e.total = np.total;
    e.speed = np.speed;
    e.tag = rel.tag;
    e.text = "baixando";
    post_event(e);
    return !p_->cancel.load();
  };
  bool ok = net_->download(rel.download_url, part, NULL, true, prog, &err);

  if (ok) {
    long long sz = fs_->file_size(part);
    if (rel.size > 0 && sz != rel.size) {
      ok = false;
      err = fmt("o download veio incompleto (%lld de %lld bytes)", sz, rel.size);
      log(err);
    } else {
      std::string sha = sha256_file(fs_, part);
      fs_->remove_tree(vdir);
      fs_->mkdirs(vdir);
      if (!extract_zip(part, vdir + P + "web", rel.tag)) {
        ok = false;
        err = "não consegui instalar o conteúdo baixado";
      } else {
        finish_install(rel.tag, rel.version, rel.date, part, sz, play_after);
        (void)sha;
      }
    }
    fs_->remove_file(part);
  } else if (err.empty()) {
    err = "o download falhou";
  }

  if (!ok) {
    Event e;
    e.hook = Hook::InstallDone;
    e.ok = false;
    e.tag = rel.tag;
    e.index = index;
    e.text = err;
    post_event(e);
    log("falha ao instalar " + rel.tag + ": " + err);
  }
  p_->busy.store(0);
  p_->job.store((int)Job::None);
}

void Engine::finish_install(const std::string& tag, const std::string& ver, const std::string& date,
                            const std::string& zip, long long size, bool play_after) {
  std::string root = install_root();
  std::string vdir = root + fs_->sep() + "versions" + fs_->sep() + tag;
  std::vector<ZipEntry> entries;
  std::string zerr;
  zip_list(vdir + ".part", fs_, entries, &zerr);
  int files = (int)entries.size();
  std::string sha = sha256_file(fs_, zip);
  std::string man = "{\n";
  man += fmt("  \"tag\": \"%s\",\n", json_escape(tag).c_str());
  man += fmt("  \"version\": \"%s\",\n", json_escape(ver).c_str());
  man += fmt("  \"date\": \"%s\",\n", json_escape(date).c_str());
  man += fmt("  \"installed_at\": \"%s\",\n", now_iso().c_str());
  man += fmt("  \"size\": %lld,\n", (long long)size);
  man += fmt("  \"files\": %d,\n", files);
  man += fmt("  \"sha256\": \"%s\"\n", sha.c_str());
  man += "}\n";
  fs_->write_file(vdir + fs_->sep() + "install.json", man);
  refresh_installs();
  Event e;
  e.hook = Hook::InstallDone;
  e.ok = true;
  e.tag = tag;
  e.text = fmt("versão %s pronta (%d arquivos)", ver.c_str(), files);
  post_event(e);
  log(e.text);
  if (play_after) play(tag);
}

// --------------------------------------------------------------- jogar ----
Engine::PlayPlan Engine::plan_play() const {
  PlayPlan plan;
  if (cat_.games.empty()) { plan.reason = "nenhuma versão publicada ainda"; return plan; }
  const Release* newest = cat_.newest();
  const Install* ins = install_of(newest->tag);
  if (cfg_.auto_update_game) {
    plan.index = 0;
    plan.tag = newest->tag;
    if (ins && ins->valid) { plan.reason = "mais nova já instalada"; return plan; }
    plan.need_download = true;
    plan.reason = "baixar a versão mais nova (" + newest->version + ")";
    return plan;
  }
  // sem atualização automática: continua de onde parou, se estiver instalado
  if (!cfg_.last_played_tag.empty()) {
    const Install* last = install_of(cfg_.last_played_tag);
    if (last && last->valid) {
      plan.tag = last->tag;
      for (size_t i = 0; i < cat_.games.size(); i++)
        if (cat_.games[i].tag == last->tag) { plan.index = (int)i; break; }
      plan.reason = "continuando a versão " + last->version;
      return plan;
    }
  }
  if (!installs_.empty()) {
    const Install& first = installs_.front();
    plan.tag = first.tag;
    for (size_t i = 0; i < cat_.games.size(); i++)
      if (cat_.games[i].tag == first.tag) { plan.index = (int)i; break; }
    plan.reason = "versão instalada " + first.version;
    return plan;
  }
  plan.index = 0;
  plan.tag = newest->tag;
  plan.need_download = true;
  plan.reason = "baixar a versão " + newest->version;
  return plan;
}

bool Engine::play(const std::string& tag) {
  const Install* ins = install_of(tag);
  if (!ins || !ins->valid) {
    post_event(Event{ Hook::Error, tag, "essa versão ainda não está instalada" });
    return false;
  }
  std::string web = install_root() + fs_->sep() + "versions" + fs_->sep() + tag + fs_->sep() + "web";
  std::string err;
  if (!plat_->start_game_server(web, cfg_.port, &err)) {
    Event e;
    e.hook = Hook::Error;
    e.tag = tag;
    e.text = err.empty() ? "não consegui iniciar o servidor local do jogo" : err;
    post_event(e);
    return false;
  }
  if (!plat_->launch_game_window(tag, cfg_.port, &err)) {
    Event e;
    e.hook = Hook::Error;
    e.tag = tag;
    e.text = err.empty() ? "não consegui abrir a janela do jogo" : err;
    post_event(e);
    return false;
  }
  cfg_.last_played_tag = tag;
  cfg_.last_played_at = now_iso();
  save_config();
  Event ok_ev;
  ok_ev.hook = Hook::PlayReady;
  ok_ev.tag = tag;
  ok_ev.text = "jogo aberto";
  post_event(ok_ev);
  log("jogo aberto: " + tag);
  return true;
}

bool Engine::remove_install(const std::string& tag) {
  std::string vdir = install_root() + fs_->sep() + "versions" + fs_->sep() + tag;
  if (!fs_->remove_tree(vdir)) {
    Event e;
    e.hook = Hook::Error;
    e.text = "não consegui apagar os arquivos dessa versão (talvez o jogo esteja aberto)";
    post_event(e);
    return false;
  }
  log("versão removida: " + tag);
  refresh_installs();
  return true;
}

// ------------------------------------------------- atualizar o launcher ---
void Engine::do_self_update() {
  if (p_->busy.load() != 0) return;
  if (cat_.launcher_version.empty()) return;
  p_->busy.store(1);
  p_->job.store((int)Job::UpdateSelf);
  p_->cancel.store(false);
  p_->worker = std::thread([this]() { worker_self_update(); });
  p_->worker.detach();
}

void Engine::worker_self_update() {
  std::string url = cat_.launcher_download_url(raw_base_default());
  std::string root = install_root();
  std::string P = fs_->sep();
  std::string dir = root + P + "update";
  fs_->mkdirs(dir);
  std::string ver = cat_.launcher_version;
  std::string dest = dir + P + "GrandPixelGameLauncher-v" + ver + "-win64.exe";
  std::string err;
  log("baixando launcher " + ver + " de " + url);
  NetProgFn prog = [this](const NetProgress& np) {
    Event e;
    e.hook = Hook::Progress;
    e.got = np.got;
    e.total = np.total;
    e.speed = np.speed;
    e.text = "atualizando o launcher";
    post_event(e);
    return !p_->cancel.load();
  };
  bool ok = net_->download(url, dest, NULL, true, prog, &err);
  Event ev;
  ev.hook = Hook::SelfUpdateReady;
  ev.ok = ok;
  ev.text = ok ? ("launcher " + ver + " baixado") : (err.empty() ? "download falhou" : err);
  if (ok) {
    ev.ok = plat_->apply_self_update(dest, plat_->self_exe_path());
    if (!ev.ok) ev.text = "não consegui aplicar a atualização — abra a pasta de download";
  }
  if (!ev.ok) ev.hook = Hook::SelfUpdateFailed;
  post_event(ev);
  log("auto-atualização: " + ev.text);
  p_->busy.store(0);
  p_->job.store((int)Job::None);
}

}  // namespace gpg
