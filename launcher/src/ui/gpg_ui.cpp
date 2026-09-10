// Interface: infraestrutura de desenho, ícones, widgets, barras, mensagens.
#include "gpg_ui.h"

#include <cmath>
#include <cstring>
#include <algorithm>

namespace gpg {


Ui::Ui(Engine* eng) : eng_(eng) {}

void Ui::resize(int w, int h, float scale) {
  w_ = w; h_ = h; scale_ = scale;
}

// -------------------------------------------------------------- utilidades --
void Ui::hline(Canvas& c, float x, float y, float w, uint32_t color) {
  c.rect(x, y, w, 1.0f, color);
}

void Ui::badge(Canvas& c, const Rect& r, const char* text, uint32_t fg, uint32_t bg, int font) {
  c.round_rect(r.x, r.y, r.w, r.h, r.h * 0.5f, bg);
  c.text(text, r.x, r.y, r.w, r.h, 1, font, fg);
}

void Ui::para(Canvas& c, const std::string& text, const Rect& r, int font, uint32_t color,
              int max_lines, float* out_h) {
  std::vector<std::string> lines = split_lines(text);
  float y = r.y;
  int used = 0;
  for (size_t li = 0; li < lines.size(); li++) {
    std::string line = lines[li];
    if (line.empty()) { y += 8; continue; }
    // quebra por palavras
    std::string cur;
    size_t i = 0;
    while (i <= line.size()) {
      size_t sp = line.find(' ', i);
      std::string word = line.substr(i, (sp == std::string::npos ? line.size() : sp) - i);
      std::string probe = cur.empty() ? word : (cur + " " + word);
      if (!cur.empty() && c.text_w(probe, font) > (int)r.w) {
        c.text(cur, r.x, y, r.w, 20, 0, font, color);
        y += 22;
        used++;
        if (max_lines > 0 && used >= max_lines) { if (out_h) *out_h = y - r.y; return; }
        cur = word;
      } else {
        cur = probe;
      }
      if (sp == std::string::npos) break;
      i = sp + 1;
    }
    if (!cur.empty()) {
      c.text(cur, r.x, y, r.w, 20, 0, font, color);
      y += 22;
      used++;
      if (max_lines > 0 && used >= max_lines) { if (out_h) *out_h = y - r.y; return; }
    }
  }
  if (out_h) *out_h = y - r.y;
}

float Ui::para_height(Canvas& c, const std::string& text, float w, int font, int max_lines) {
  std::vector<std::string> lines = split_lines(text);
  float y = 0;
  int used = 0;
  for (size_t li = 0; li < lines.size(); li++) {
    std::string line = lines[li];
    if (line.empty()) { y += 8; continue; }
    std::string cur;
    size_t i = 0;
    while (i <= line.size()) {
      size_t sp = line.find(' ', i);
      std::string word = line.substr(i, (sp == std::string::npos ? line.size() : sp) - i);
      std::string probe = cur.empty() ? word : (cur + " " + word);
      if (!cur.empty() && c.text_w(probe, font) > (int)w) {
        y += 22; used++; cur = word;
        if (max_lines > 0 && used >= max_lines) return y;
      } else {
        cur = probe;
      }
      if (sp == std::string::npos) break;
      i = sp + 1;
    }
    if (!cur.empty()) {
      y += 22; used++;
      if (max_lines > 0 && used >= max_lines) return y;
    }
  }
  return y;
}

// ------------------------------------------------------------------ ícones --
void Ui::icon(Canvas& c, int which, float cx, float cy, float s, uint32_t color) {
  float a = s * 0.5f;
  switch (which) {
    case I_PLAY:
      c.tri(cx - a * 0.75f, cy - a, cx - a * 0.75f, cy + a, cx + a * 0.95f, cy, color);
      break;
    case I_DOWNLOAD: {
      c.rect(cx - s * 0.09f, cy - a, s * 0.18f, s * 0.72f, color);
      c.tri(cx - a * 0.62f, cy + s * 0.10f, cx + a * 0.62f, cy + s * 0.10f, cx, cy + a * 0.82f, color);
      c.rect(cx - a, cy + a * 0.95f, s, s * 0.16f, color);
      break;
    }
    case I_TRASH:
      c.rect(cx - a * 0.78f, cy - a * 0.62f, s * 0.78f, s * 1.5f, color);
      c.rect(cx - a, cy - a * 0.95f, s, s * 0.20f, color);
      c.rect(cx - a * 0.30f, cy - a * 1.20f, s * 0.30f, s * 0.25f, color);
      break;
    case I_FOLDER:
      c.round_rect(cx - a, cy - a * 0.62f, s * 0.52f, s * 0.36f, s * 0.10f, color);
      c.round_rect(cx - a, cy - a * 0.30f, s, s * 0.86f, s * 0.10f, color);
      break;
    case I_GEAR: {
      c.circle(cx, cy, a * 0.86f, color, false, s * 0.16f);
      c.circle(cx, cy, a * 0.30f, color, false, s * 0.16f);
      for (int i = 0; i < 6; i++) {
        float ang = (float)i * 3.14159f / 3.0f;
        float x1 = cx + cosf(ang) * a * 0.80f, y1 = cy + sinf(ang) * a * 0.80f;
        float x2 = cx + cosf(ang) * a * 1.30f, y2 = cy + sinf(ang) * a * 1.30f;
        c.line(x1, y1, x2, y2, s * 0.18f, color);
      }
      break;
    }
    case I_REFRESH: {
      float pts[16];
      for (int i = 0; i < 8; i++) {
        float ang = -1.4f + (float)i * (4.4f / 7.0f);
        pts[i * 2] = cx + cosf(ang) * a * 0.92f;
        pts[i * 2 + 1] = cy + sinf(ang) * a * 0.92f;
      }
      for (int i = 0; i < 7; i++)
        c.line(pts[i * 2], pts[i * 2 + 1], pts[i * 2 + 2], pts[i * 2 + 3], s * 0.15f, color);
      float ax = pts[14], ay = pts[15];
      c.tri(ax, ay - a * 0.34f, ax + a * 0.42f, ay + a * 0.10f, ax - a * 0.30f, ay + a * 0.22f, color);
      break;
    }
    case I_SEARCH:
      c.circle(cx - a * 0.18f, cy - a * 0.18f, a * 0.72f, color, false, s * 0.16f);
      c.line(cx + a * 0.34f, cy + a * 0.34f, cx + a * 0.92f, cy + a * 0.92f, s * 0.17f, color);
      break;
    case I_CHECK:
      c.line(cx - a * 0.78f, cy + a * 0.05f, cx - a * 0.20f, cy + a * 0.62f, s * 0.17f, color);
      c.line(cx - a * 0.20f, cy + a * 0.62f, cx + a * 0.82f, cy - a * 0.60f, s * 0.17f, color);
      break;
    case I_STAR: {
      float pts[20];
      for (int i = 0; i < 10; i++) {
        float rr = (i % 2 == 0) ? a : a * 0.44f;
        float ang = -1.5708f + (float)i * 0.62832f;
        pts[i * 2] = cx + cosf(ang) * rr;
        pts[i * 2 + 1] = cy + sinf(ang) * rr;
      }
      c.poly(pts, 10, color);
      break;
    }
    case I_CHEVRON_D:
      c.line(cx - a * 0.70f, cy - a * 0.28f, cx, cy + a * 0.36f, s * 0.17f, color);
      c.line(cx, cy + a * 0.36f, cx + a * 0.70f, cy - a * 0.28f, s * 0.17f, color);
      break;
    case I_EXTERNAL:
      c.round_stroke(cx - a, cy - a * 0.55f, s * 0.78f, s * 0.78f, s * 0.12f, s * 0.14f, color);
      c.line(cx - a * 0.05f, cy - a * 0.62f, cx + a * 0.92f, cy - a * 0.62f, s * 0.15f, color);
      c.line(cx + a * 0.92f, cy - a * 0.62f, cx + a * 0.92f, cy + a * 0.30f, s * 0.15f, color);
      c.line(cx - a * 0.10f, cy - a * 0.05f, cx + a * 0.90f, cy - a * 0.60f, s * 0.15f, color);
      break;
    case I_INFO:
      c.circle(cx, cy, a * 0.94f, color, false, s * 0.14f);
      c.rect(cx - s * 0.07f, cy - s * 0.04f, s * 0.14f, s * 0.44f, color);
      c.circle(cx, cy - a * 0.46f, s * 0.09f, color, true);
      break;
    case I_WARN:
      c.tri(cx, cy - a, cx + a, cy + a * 0.78f, cx - a, cy + a * 0.78f, color);
      c.rect(cx - s * 0.07f, cy - a * 0.34f, s * 0.14f, s * 0.66f, col::BG0);
      c.circle(cx, cy + a * 0.52f, s * 0.08f, col::BG0, true);
      break;
    case I_CLOSE:
      c.line(cx - a * 0.72f, cy - a * 0.72f, cx + a * 0.72f, cy + a * 0.72f, s * 0.16f, color);
      c.line(cx + a * 0.72f, cy - a * 0.72f, cx - a * 0.72f, cy + a * 0.72f, s * 0.16f, color);
      break;
    case I_MIN:
      c.rect(cx - a * 0.76f, cy - s * 0.06f, s * 0.76f, s * 0.13f, color);
      break;
    case I_ROCKET: {
      c.tri(cx, cy - a, cx + a * 0.44f, cy + a * 0.30f, cx - a * 0.44f, cy + a * 0.30f, color);
      c.tri(cx - a * 0.48f, cy + a * 0.45f, cx - a * 0.95f, cy + a * 0.95f, cx - a * 0.20f, cy + a * 0.80f, color);
      c.tri(cx + a * 0.48f, cy + a * 0.45f, cx + a * 0.95f, cy + a * 0.95f, cx + a * 0.20f, cy + a * 0.80f, color);
      c.tri(cx - s * 0.10f, cy + a * 0.40f, cx + s * 0.10f, cy + a * 0.40f, cx, cy + a * 1.05f, color);
      break;
    }
    case I_SLIDERS:
      for (int i = 0; i < 3; i++) {
        float yy = cy - a * 0.66f + (float)i * a * 0.66f;
        c.rect(cx - a, yy - s * 0.045f, s, s * 0.09f, color);
        float kx = cx + ((i == 0) ? -a * 0.42f : (i == 1 ? a * 0.36f : -a * 0.10f));
        c.circle(kx, yy, s * 0.15f, color, true);
      }
      break;
    case I_GLOBE:
      c.circle(cx, cy, a * 0.94f, color, false, s * 0.13f);
      c.circle(cx, cy, a * 0.30f, color, false, s * 0.11f);
      c.line(cx - a * 0.94f, cy, cx + a * 0.94f, cy, s * 0.13f, color);
      break;
    case I_SPARKLE: {
      float pts[16] = { cx, cy - a, cx + a * 0.22f, cy - a * 0.22f, cx + a, cy,
                        cx + a * 0.22f, cy + a * 0.22f, cx, cy + a, cx - a * 0.22f, cy + a * 0.22f,
                        cx - a, cy, cx - a * 0.22f, cy - a * 0.22f };
      c.poly(pts, 8, color);
      break;
    }
    case I_BOOK:
      c.round_rect(cx - a, cy - a * 0.82f, s * 0.94f, s * 1.64f, s * 0.12f, color);
      c.rect(cx - a + s * 0.12f, cy - a * 0.82f, s * 0.10f, s * 1.64f, col::BG0);
      break;
    case I_HOME:
      c.tri(cx, cy - a, cx + a, cy - a * 0.10f, cx - a, cy - a * 0.10f, color);
      c.rect(cx - a * 0.70f, cy - a * 0.14f, s * 0.70f, s * 0.88f, color);
      break;
    case I_ARCHIVE:
      c.round_rect(cx - a, cy - a * 0.72f, s, s * 0.40f, s * 0.08f, color);
      c.round_rect(cx - a * 0.88f, cy - a * 0.34f, s * 0.88f, s * 1.06f, s * 0.08f, color);
      c.rect(cx - a * 0.40f, cy + a * 0.10f, s * 0.40f, s * 0.16f, col::BG0);
      break;
    case I_SHIELD:
      c.tri(cx - a, cy - a * 0.85f, cx + a, cy - a * 0.85f, cx, cy + a, color);
      break;
    case I_CLOCK:
      c.circle(cx, cy, a * 0.94f, color, false, s * 0.13f);
      c.line(cx, cy, cx, cy - a * 0.55f, s * 0.13f, color);
      c.line(cx, cy, cx + a * 0.44f, cy + a * 0.16f, s * 0.13f, color);
      break;
    default: break;
  }
}

// ---------------------------------------------------------------- widgets --
void Ui::push_widget(WidgetKind kind, int id, const Rect& r, bool enabled, int index,
                     const std::string& tag) {
  Widget w;
  w.id = id;
  w.kind = kind;
  w.r = r;
  w.enabled = enabled;
  w.index = index;
  w.tag = tag;
  w.hover = enabled && r.contains(mx_, my_);
  // animação suave de realce
  const Widget* prev = NULL;
  for (size_t i = 0; i < prev_.size(); i++)
    if (prev_[i].id == id) { prev = &prev_[i]; break; }
  w.anim = prev ? prev->anim : 0.f;
  float target = (w.hover || (kind == WK_TOGGLE)) ? 1.f : 0.f;
  w.anim += (target - w.anim) * 0.35f;
  if (w.hover) hot_ = id;
  widgets_.push_back(w);
}

Widget* Ui::find(int id) {
  for (size_t i = 0; i < prev_.size(); i++)
    if (prev_[i].id == id) return &prev_[i];
  return NULL;
}

bool Ui::clicked(int id) {
  if (pending_click_ != id) return false;
  pending_click_ = -1;
  return true;
}

void Ui::toast(const std::string& text, int kind) {
  ToastMsg t;
  t.text = text;
  t.kind = kind;
  t.life = 5.0;
  toasts_.push_back(t);
  if (toasts_.size() > 4) toasts_.erase(toasts_.begin());
  status_ = text;
  status_err_ = (kind == 2);
  status_age_ = 0;
}

void Ui::set_status(const std::string& text, bool error, double seconds) {
  status_ = text;
  status_err_ = error;
  status_life_ = seconds;
  status_age_ = 0;
}

void Ui::set_screen(int s) {
  screen_ = s;
  detail_open_ = -1;
  confirm_remove_ = -1;
}

// ----------------------------------------------------------- entrada -------
void Ui::on_mouse_move(float x, float y) { mx_ = x; my_ = y; }

void Ui::on_mouse_down(float x, float y) {
  mx_ = x; my_ = y; mdown_ = true;
  press_x_ = x; press_y_ = y;
}

void Ui::on_mouse_up(float x, float y) {
  mx_ = x; my_ = y;
  bool was_down = mdown_;
  mdown_ = false;
  if (!was_down) return;
  // clique curto; se o ponteiro andou muito, foi arrasto (rolagem) — ignora
  if (fabsf(x - press_x_) + fabsf(y - press_y_) > 8.f) return;
  for (size_t i = prev_.size(); i-- > 0;) {
    const Widget& w = prev_[i];
    if (!w.enabled || !w.r.contains(x, y)) continue;
    pending_click_ = w.id;
    return;
  }
  // clique em área vazia fecha o painel de detalhes
  if (detail_open_ >= 0 && confirm_remove_ < 0) detail_open_ = -1;
}

void Ui::on_wheel(float delta) {
  float step = delta * 56.f;
  if (confirm_remove_ >= 0 || launcher_update_prompt_) return;
  if (detail_open_ >= 0) {
    scroll_notes_ = std::max(0.f, std::min(max_scroll_notes_, scroll_notes_ - step));
    return;
  }
  if (screen_ == SCR_HOME) scroll_home_ = std::max(0.f, std::min(max_scroll_home_, scroll_home_ - step));
  else if (screen_ == SCR_LIBRARY) scroll_lib_ = std::max(0.f, std::min(max_scroll_lib_, scroll_lib_ - step));
  else if (screen_ == SCR_SETTINGS) scroll_set_ = std::max(0.f, std::min(max_scroll_set_, scroll_set_ - step));
}

void Ui::on_key(int vk) {
  const int VK_ESCAPE = 0x1B, VK_RETURN = 0x0D, VK_TAB = 0x09, VK_BACK = 0x08;
  if (vk == VK_ESCAPE) {
    if (confirm_remove_ >= 0) { confirm_remove_ = -1; return; }
    if (launcher_update_prompt_) { launcher_update_prompt_ = false; return; }
    if (detail_open_ >= 0) { detail_open_ = -1; return; }
    if (screen_ != SCR_HOME) { set_screen(SCR_HOME); return; }
    quit_ = true;
    return;
  }
  if (vk == VK_RETURN) {
    if (confirm_remove_ >= 0) { act_remove_index(confirm_remove_); confirm_remove_ = -1; return; }
    if (launcher_update_prompt_) { request_self_update(); launcher_update_prompt_ = false; return; }
    if (screen_ == SCR_LIBRARY) { act_play_index(sel_index_); return; }
    act_play_primary();
    return;
  }
  if (vk == VK_BACK) {
    if (search_focus_ && !search_.empty()) {
      // remove o último caractere (e sua continuação UTF-8, se houver)
      size_t n = search_.size();
      while (n > 0 && ((unsigned char)search_[n - 1] & 0xC0) == 0x80) n--;
      search_.erase(n > 0 ? n - 1 : 0);
    }
    return;
  }
  if (vk == VK_TAB) {
    search_focus_ = !search_focus_;
    return;
  }
}

void Ui::on_text(const std::string& utf8) {
  if (search_focus_ && screen_ == SCR_LIBRARY && search_.size() < 40) search_ += utf8;
}

void Ui::on_engine_event(const Event& ev) {
  switch (ev.hook) {
    case Hook::Fetching:
      fetching_ = true;
      phase_ = "Buscando versões no GitHub";
      break;
    case Hook::CatalogReady:
      fetching_ = false;
      splash_done_ = true;
      offline_ = ev.text.find("não consegui") != std::string::npos ||
                 ev.text.find("sem conexão") != std::string::npos;
      if (!ev.text.empty()) set_status(ev.text, false, 3.0);
      if (eng_) {
        if (detail_open_ >= 0 && detail_open_ < (int)eng_->catalog().games.size()) { /* mantém */ }
        else detail_open_ = -1;
      }
      break;
    case Hook::CatalogFailed:
      fetching_ = false;
      splash_done_ = true;
      offline_ = true;
      toast(ev.text.empty() ? "não consegui falar com o GitHub" : ev.text, 2);
      break;
    case Hook::Progress:
      if (ev.text == "baixando" || ev.text == "instalando" || ev.text == "buscando" ||
          ev.text == "atualizando o launcher") {
        phase_ = ev.text;
        inst_got_ = ev.got;
        inst_total_ = ev.total;
        inst_speed_ = ev.speed;
        inst_frac_ = ev.total > 0 ? (double)ev.got / (double)ev.total : 0.0;
      }
      break;
    case Hook::InstallDone:
      installing_ = false;
      if (ev.ok) {
        toast(ev.text.empty() ? "instalação concluída" : ev.text, 1);
      } else {
        pending_play_index_ = -1;
        toast(ev.text.empty() ? "a instalação falhou" : ev.text, 2);
      }
      break;
    case Hook::PlayReady:
      if (close_after_play_) close_after_play_ = true;
      break;
    case Hook::SelfUpdateReady:
      toast(ev.text.empty() ? "launcher atualizado" : ev.text, 1);
      break;
    case Hook::SelfUpdateFailed:
      toast(ev.text.empty() ? "não consegui atualizar o launcher" : ev.text, 2);
      break;
    case Hook::Error:
      pending_play_index_ = -1;
      toast(ev.text.empty() ? "algo deu errado" : ev.text, 2);
      break;
    default: break;
  }
}

void Ui::tick(double dt) {
  t_ += dt;
  if (screen_ == SCR_SPLASH && !splash_done_ && eng_ && !fetching_) {
    if (!eng_->catalog().games.empty() || t_ > 5.0) splash_done_ = true;
  }
  if (screen_ == SCR_SPLASH && splash_done_ && splash_fade_ <= 0.f) set_screen(SCR_HOME);
  spin_ += dt;
  pulse_ += dt;
  status_age_ += dt;
  hero_zoom_ += (float)dt;
  if (screen_ == SCR_SPLASH && splash_fade_ > 0.f && splash_done_) splash_fade_ -= (float)dt * 1.6f;
  for (size_t i = toasts_.size(); i-- > 0;) {
    toasts_[i].life -= dt;
    if (toasts_[i].life <= 0) toasts_.erase(toasts_.begin() + (long)i);
  }
}

}  // namespace gpg
