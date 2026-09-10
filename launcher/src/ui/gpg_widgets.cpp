// Interface: peças desenhadas (botões, listas, barras), moldura da janela,
// mensagens, modais e a distribuição do quadro por tela.
#include "gpg_ui.h"

#include <cmath>
#include <algorithm>

namespace gpg {


// ------------------------------------------------------------------ peças --
void Ui::card(Canvas& c, const Rect& r, uint32_t fill, bool close) {
  c.round_rect(r.x, r.y, r.w, r.h, 14, fill);
  if (close) c.round_stroke(r.x, r.y, r.w, r.h, 14, 1, col::LINE_SOFT);
}

void Ui::button(Canvas& c, int id, const Rect& r, const char* label, int icon_id, bool primary,
                bool enabled, int index) {
  push_widget(WK_BUTTON, id, r, enabled, index);
  const Widget* w = find(id);
  float hv = w ? w->anim : 0.f;
  bool pressed = (w && w->hover && mdown_);
  uint32_t bg, fg = col::TEXT;
  if (primary) {
    uint32_t top = enabled ? col::GOLD_LIGHT : 0xFF3A3F52;
    uint32_t bot = enabled ? col::GOLD : 0xFF2C3248;
    top = 0xFF000000 | (uint32_t)(((top & 0xFF) * (1.f + hv * 0.06f)) > 255 ? 255 : ((top & 0xFF) * (1.f + hv * 0.06f)));
    bot = 0xFF000000 | (uint32_t)(((bot & 0xFF) * (1.f + hv * 0.06f)) > 255 ? 255 : ((bot & 0xFF) * (1.f + hv * 0.06f)));
    fg = enabled ? 0xFF231A05 : col::TEXT_MUTE;
    if (enabled) c.shadow(r.x, r.y + 4, r.w, r.h, r.h * 0.5f, 10 + hv * 6, 0x55F3C34E);
    c.vgrad(r.x, r.y, r.w, r.h, top, bot, r.h * 0.5f);
  } else {
    bg = enabled ? (pressed ? col::PANEL_3 : col::PANEL_2) : 0xFF141A2A;
    if (hv > 0.01f && enabled) {
      bg = 0xFF000000 | (uint32_t)std::min(255.f, ((bg & 0xFF) + 14 * hv));
      uint32_t g = ((bg >> 8) & 0xFF) + (uint32_t)(12 * hv);
      uint32_t rr = ((bg >> 16) & 0xFF) + (uint32_t)(10 * hv);
      bg = 0xFF000000 | ((rr > 255 ? 255 : rr) << 16) | ((g > 255 ? 255 : g) << 8) | (bg & 0xFF);
    }
    c.round_rect(r.x, r.y, r.w, r.h, r.h * 0.5f > 16 ? 12 : r.h * 0.5f, bg);
    c.round_stroke(r.x, r.y, r.w, r.h, r.h * 0.5f > 16 ? 12 : r.h * 0.5f, 1, col::WHITE_08);
    if (!enabled) fg = col::TEXT_MUTE;
  }
  float text_x = r.x, text_w = r.w;
  if (icon_id) {
    float s = 16.f;
    float tw = c.text_w(label, font_of(F13, true));
    float group = s + 8 + tw;
    float start = r.x + (r.w - group) * 0.5f;
    icon(c, icon_id, start + s * 0.5f, r.cy(), s, fg);
    text_x = start + s + 8;
    text_w = tw + 2;
    c.text(label, text_x, r.y, text_w, r.h, 0, font_of(F13, true), fg);
  } else {
    c.text(label, text_x, r.y, text_w, r.h, 1, font_of(F13, true), fg);
  }
}

void Ui::icon_button(Canvas& c, int id, const Rect& r, int icon_id, bool enabled) {
  push_widget(WK_ICON, id, r, enabled);
  const Widget* w = find(id);
  float hv = w ? w->anim : 0.f;
  bool pressed = (w && w->hover && mdown_);
  uint32_t bg = pressed ? col::PANEL_3 : col::WHITE_04;
  if (!enabled) bg = 0x08FFFFFF;
  c.round_rect(r.x, r.y, r.w, r.h, 10, bg);
  if (hv > 0.01f && enabled) c.round_stroke(r.x, r.y, r.w, r.h, 10, 1, col::WHITE_08);
  uint32_t fg = enabled ? (col::TEXT_DIM | 0xFF000000) : col::TEXT_MUTE;
  if (hv > 0.01f && enabled) fg = col::TEXT;
  icon(c, icon_id, r.cx(), r.cy(), 17, fg);
}

void Ui::toggle(Canvas& c, int id, const Rect& r, const char* label, const char* hint, bool& value) {
  push_widget(WK_TOGGLE, id, r, true);
  const Widget* w = find(id);
  float hv = w ? w->anim : 0.f;
  if (w && w->hover) c.round_rect(r.x - 8, r.y - 4, r.w + 16, r.h + 8, 10, col::WHITE_04);
  c.text(label, r.x, r.y, r.w - 74, r.h, 0, font_of(F13, true), col::TEXT);
  if (hint && *hint) c.text(hint, r.x, r.y + 3, r.w - 74, r.h, 0, font_of(F11), col::TEXT_MUTE);
  Rect sw{ r.r() - 62, r.cy() - 13, 52, 26 };
  uint32_t track = value ? (hv > 0.4f ? col::GOLD_LIGHT : col::GOLD) : col::PANEL_3;
  c.round_rect(sw.x, sw.y, sw.w, sw.h, 13, track);
  if (value) c.round_rect(sw.x, sw.y, sw.w, sw.h, 13, col::GOLD_SOFT);
  float knob_x = value ? sw.r() - 24 : sw.x + 4;
  c.circle(knob_x + 10, sw.cy(), 10, value ? 0xFFFFFFFF : col::TEXT_MUTE, true);
  c.circle(knob_x + 10, sw.cy(), 10, 0x33000000, false, 1);
  if (clicked(id)) {
    value = !value;
    if (eng_) eng_->save_config();
  }
}

void Ui::chip(Canvas& c, int id, const Rect& r, const char* label, bool active, int index) {
  push_widget(WK_CHIP, id, r, true, index);
  const Widget* w = find(id);
  float hv = w ? w->anim : 0.f;
  uint32_t bg = active ? col::GOLD_SOFT : (hv > 0.3f ? col::WHITE_08 : col::WHITE_04);
  uint32_t fg = active ? col::GOLD_LIGHT : col::TEXT_DIM;
  c.round_rect(r.x, r.y, r.w, r.h, r.h * 0.5f, bg);
  if (active) c.round_stroke(r.x, r.y, r.w, r.h, r.h * 0.5f, 1, 0x66F3C34E);
  c.text(label, r.x, r.y, r.w, r.h, 1, font_of(F12, active), fg);
}

void Ui::progress_bar(Canvas& c, const Rect& r, float frac, bool indeterminate, uint32_t fill) {
  c.round_rect(r.x, r.y, r.w, r.h, r.h * 0.5f, 0x33FFFFFF);
  if (indeterminate) {
    float w = r.w * 0.32f;
    float pos = (float)fmod(t_ * 0.55, 1.0) * (r.w + w) - w;
    float x0 = std::max(r.x, r.x + pos);
    float x1 = std::min(r.r(), r.x + pos + w);
    if (x1 > x0) c.round_rect(x0, r.y, x1 - x0, r.h, r.h * 0.5f, fill);
  } else if (frac > 0.001f) {
    float w = r.w * std::min(1.f, std::max(0.f, frac));
    c.round_rect(r.x, r.y, w, r.h, r.h * 0.5f, fill);
    // brilho que corre pela barra
    float shimmer = (float)fmod(t_ * 0.4, 1.0) * (r.w + 120) - 60;
    float sx0 = std::max(r.x, r.x + shimmer);
    float sx1 = std::min(r.x + w, r.x + shimmer + 60);
    if (sx1 > sx0) c.round_rect(sx0, r.y, sx1 - sx0, r.h, r.h * 0.5f, 0x22FFFFFF);
  }
}

// ------------------------------------------------------------ moldura ------
void Ui::title_bar(Canvas& c, const Rect& r) {
  c.rect(r.x, r.y, r.w, r.h, 0xFF0D1220);
  hline(c, r.x, r.b() - 1, r.w, col::LINE_SOFT);
  // marca: emblema em pixel (bloco de sol) — desenhado, não é imagem
  float bx = r.x + 20, by = r.cy() - 11, s = 22;
  c.round_rect(bx, by, s, s, 6, 0xFF1B2440);
  c.rect(bx + 5, by + 5, 5, 5, col::GOLD_LIGHT);
  c.rect(bx + 12, by + 5, 5, 5, col::GOLD);
  c.rect(bx + 5, by + 12, 5, 5, col::GOLD);
  c.rect(bx + 12, by + 12, 5, 5, col::CYAN);
  c.text("GRAND PIXEL GAME", bx + s + 12, r.y, 320, r.h, 0, font_of(F13, true), col::TEXT);
  float tw = c.text_w("GRAND PIXEL GAME", font_of(F13, true));
  Rect chip_r{ bx + s + 20 + tw, r.cy() - 10, 62, 20 };
  badge(c, chip_r, "LAUNCHER", 0xFF0F1524, col::GOLD, F11);
  // versão do launcher
  std::string v = "v" + (eng_ ? eng_->self_version() : std::string("1.0.0"));
  c.text(v, r.r() - 130, r.y, 60, r.h, 2, font_of(F11), col::TEXT_MUTE);
  // botões de janela
  Rect mn{ r.r() - 68, r.y, 34, r.h }, cl{ r.r() - 34, r.y, 34, r.h };
  push_widget(WK_ICON, W_MIN, mn);
  push_widget(WK_ICON, W_CLOSE, cl);
  const Widget* wmn = find(W_MIN);
  const Widget* wcl = find(W_CLOSE);
  if (wcl && wcl->hover) c.rect(cl.x, cl.y, cl.w, cl.h, 0xFFE0424C);
  else if (wmn && wmn->hover) c.rect(mn.x, mn.y, mn.w, mn.h, col::WHITE_08);
  icon(c, I_MIN, mn.cx(), mn.cy(), 14, col::TEXT_DIM);
  icon(c, I_CLOSE, cl.cx(), cl.cy(), 14, col::TEXT_DIM);
}

void Ui::nav_rail(Canvas& c, const Rect& r) {
  c.rect(r.x, r.y, r.w, r.h, 0xFF0E1424);
  hline(c, r.r() - 1, r.y, 1, col::LINE_SOFT);
  struct Item { int id, screen, icon; const char* label; };
  Item items[3] = {
    { W_NAV_HOME, SCR_HOME, I_HOME, "Início" },
    { W_NAV_LIB, SCR_LIBRARY, I_ARCHIVE, "Versões" },
    { W_NAV_SET, SCR_SETTINGS, I_SLIDERS, "Ajustes" },
  };
  float y = r.y + 26;
  for (int i = 0; i < 3; i++) {
    Rect it{ r.x + 12, y, r.w - 24, 68 };
    push_widget(WK_BUTTON, items[i].id, it);
    const Widget* w = find(items[i].id);
    float hv = w ? w->anim : 0.f;
    bool active = (screen_ == items[i].screen);
    uint32_t bg = active ? col::GOLD_SOFT : (hv > 0.3f ? col::WHITE_08 : 0x00000000);
    if (bg) c.round_rect(it.x, it.y, it.w, it.h, 14, bg);
    if (active) c.round_rect(it.x + 2, it.cy() - 12, 3, 24, 2, col::GOLD);
    uint32_t fg = active ? col::GOLD_LIGHT : (hv > 0.3f ? col::TEXT : col::TEXT_DIM);
    icon(c, items[i].icon, it.cx(), it.y + 24, 20, fg);
    c.text(items[i].label, it.x, it.y + 36, it.w, 20, 1, font_of(F11, active), fg);
    y += 78;
  }
  // rodapé da barra: estado da rede
  float by = r.b() - 56;
  c.circle(r.cx(), by, 4, offline_ ? col::RED : col::GREEN, true);
  c.text(offline_ ? "offline" : "online", r.x, by + 8, r.w, 16, 1, font_of(F11), col::TEXT_MUTE);
}

void Ui::status_bar(Canvas& c, const Rect& r) {
  c.rect(r.x, r.y, r.w, r.h, 0xFF0D1220);
  hline(c, r.x, r.y, r.w, col::LINE_SOFT);
  std::string left = status_.empty() ? "Pronto" : status_;
  uint32_t lc = status_err_ ? col::RED : col::TEXT_DIM;
  if (installing_ || fetching_) {
    lc = col::TEXT;
    std::string ph = phase_.empty() ? "trabalhando" : phase_;
    if (fetching_) left = "Buscando versões no GitHub…";
    else {
      std::string pct = inst_total_ > 0 ? fmt("%.0f%%", inst_frac_ * 100.0) : "";
      std::string sp = human_speed(inst_speed_);
      std::string eta;
      if (inst_total_ > 0 && inst_speed_ > 1) eta = human_eta((double)(inst_total_ - inst_got_) / inst_speed_);
      left = fmt("%s%s  %s de %s%s%s", ph.c_str(), ph.empty() ? "" : " — ", human_size(inst_got_).c_str(),
                 inst_total_ > 0 ? human_size(inst_total_).c_str() : "?", pct.c_str(), "");
      if (!sp.empty()) left += "  •  " + sp;
      if (!eta.empty()) left += "  •  faltam " + eta;
      if (!inst_tag_.empty()) left += "  •  " + inst_tag_;
    }
  }
  c.text(left, r.x + 22, r.y, r.w - 420, r.h, 0, font_of(F12), lc);

  // direita: progresso ou resumo
  Rect pr{ r.r() - 300, r.cy() - 4, 180, 8 };
  if (installing_) {
    progress_bar(c, pr, (float)inst_frac_, inst_total_ <= 0, col::GOLD);
    // botão cancelar
    Rect cx{ r.r() - 108, r.cy() - 14, 88, 28 };
    button(c, W_CANCEL_JOB, cx, "Cancelar", I_NONE, false);
  } else if (fetching_) {
    progress_bar(c, pr, 0, true, col::CYAN);
  } else {
    int ver_count = eng_ ? (int)eng_->catalog().games.size() : 0;
    int inst_count = eng_ ? (int)eng_->installs().size() : 0;
    std::string right = fmt("%d versão(ões)  •  %d instalada(s)", ver_count, inst_count);
    c.text(right, r.r() - 420, r.y, 400, r.h, 2, font_of(F12), col::TEXT_MUTE);
  }
}

void Ui::toasts(Canvas& c) {
  float y = h_ - m::STATUS_H - 18;
  for (size_t i = toasts_.size(); i-- > 0;) {
    const ToastMsg& t = toasts_[i];
    (void)t;
  }
  for (size_t i = 0; i < toasts_.size(); i++) {
    const ToastMsg& t = toasts_[i];
    float appear = (float)std::min(1.0, (5.0 - t.life) * 4.0);
    float w = 360, hh = 52;
    Rect r{ w_ - w - 22 + (1.f - appear) * 30.f, y - hh, w, hh };
    uint32_t accent = t.kind == 2 ? col::RED : (t.kind == 1 ? col::GREEN : col::CYAN);
    c.shadow(r.x, r.y + 6, r.w, r.h, 12, 16, col::SHADOW);
    c.round_rect(r.x, r.y, r.w, r.h, 12, 0xFF1A2238);
    c.round_stroke(r.x, r.y, r.w, r.h, 12, 1, col::WHITE_08);
    c.round_rect(r.x, r.y + 8, 4, r.h - 16, 2, accent);
    int ic = t.kind == 2 ? I_WARN : (t.kind == 1 ? I_CHECK : I_INFO);
    icon(c, ic, r.x + 30, r.cy(), 18, accent);
    c.text(t.text, r.x + 50, r.y, r.w - 66, r.h, 0, font_of(F12), col::TEXT);
    y -= hh + 10;
  }
}

void Ui::banner_update(Canvas& c, const Rect& r) {
  c.round_rect(r.x, r.y, r.w, r.h, 12, 0xFF241C08);
  c.round_stroke(r.x, r.y, r.w, r.h, 12, 1, 0x55F3C34E);
  icon(c, I_ROCKET, r.x + 30, r.cy(), 18, col::GOLD);
  std::string ver = eng_ ? eng_->catalog().launcher_version : std::string();
  std::string txt = "Launcher " + ver + " disponível — atualize para as melhorias mais recentes";
  c.text(txt, r.x + 50, r.y, r.w - 230, r.h, 0, font_of(F12), col::GOLD_LIGHT);
  Rect btn{ r.r() - 170, r.cy() - 16, 150, 32 };
  button(c, W_UPDATE_BANNER, btn, "Atualizar", I_DOWNLOAD, true);
}

// ----------------------------------------------------------------- modais ---
void Ui::modals(Canvas& c) {
  if (confirm_remove_ < 0 && !launcher_update_prompt_) return;
  c.rect(0, 0, (float)w_, (float)h_, col::SCRIM);
  float cw = 460, ch = 236;
  Rect r{ (w_ - cw) * 0.5f, (h_ - ch) * 0.5f, cw, ch };
  c.shadow(r.x, r.y + 10, r.w, r.h, 16, 26, col::SHADOW);
  c.round_rect(r.x, r.y, r.w, r.h, 16, 0xFF18203A);
  c.round_stroke(r.x, r.y, r.w, r.h, 16, 1, col::WHITE_08);
  if (confirm_remove_ >= 0) {
    const Release* rel = (eng_ && confirm_remove_ < (int)eng_->catalog().games.size())
                             ? &eng_->catalog().games[confirm_remove_]
                             : NULL;
    std::string title = "Remover do computador?";
    c.text(title, r.x + 26, r.y + 26, r.w - 52, 30, 0, font_of(F17, true), col::TEXT);
    std::string msg = rel ? ("O conteúdo do Grand Pixel Game " + rel->version + " será apagado.")
                          : "O conteúdo baixado será apagado.";
    c.text(msg, r.x + 26, r.y + 62, r.w - 52, 22, 0, font_of(F12), col::TEXT_DIM);
    c.text("Você pode baixar de novo quando quiser — nada da sua progressão se perde.",
           r.x + 26, r.y + 88, r.w - 52, 22, 0, font_of(F12), col::TEXT_MUTE);
    Rect yes{ r.x + 26, r.b() - 74, 190, 48 }, no{ r.r() - 216, r.b() - 74, 190, 48 };
    (void)no;
    button(c, W_CONFIRM_YES, yes, "Remover", I_TRASH, true);
    button(c, W_CONFIRM_NO, Rect{ r.x + 226, r.b() - 74, 190, 48 }, "Cancelar", I_NONE, false);
    if (clicked(W_CONFIRM_NO)) confirm_remove_ = -1;
    if (clicked(W_CONFIRM_YES)) {
      int idx = confirm_remove_;
      confirm_remove_ = -1;
      act_remove_index(idx);
    }
  } else {
    std::string ver = eng_ ? eng_->catalog().launcher_version : std::string();
    c.text("Atualizar o launcher", r.x + 26, r.y + 26, r.w - 52, 30, 0, font_of(F17, true), col::TEXT);
    c.text("Existe uma versão " + ver + " do launcher publicada.", r.x + 26, r.y + 62, r.w - 52, 22, 0,
           font_of(F12), col::TEXT_DIM);
    c.text("O download é rápido (~2 MB) e o launcher reinicia sozinho.", r.x + 26, r.y + 88,
           r.w - 52, 22, 0, font_of(F12), col::TEXT_MUTE);
    c.text("Suas versões do jogo baixadas continuam funcionando.", r.x + 26, r.y + 110, r.w - 52, 22, 0,
           font_of(F12), col::TEXT_MUTE);
    button(c, W_MODAL_UPD_YES, Rect{ r.x + 26, r.b() - 74, 210, 48 }, "Baixar e reiniciar", I_DOWNLOAD, true);
    button(c, W_MODAL_UPD_NO, Rect{ r.x + 246, r.b() - 74, 170, 48 }, "Depois", I_NONE, false);
    if (clicked(W_MODAL_UPD_NO)) launcher_update_prompt_ = false;
    if (clicked(W_MODAL_UPD_YES)) {
      launcher_update_prompt_ = false;
      request_self_update();
    }
  }
}

// ------------------------------------------------------------- filtros -----
std::vector<int> Ui::visible_indices() const {
  std::vector<int> out;
  if (!eng_) return out;
  const std::vector<Release>& gs = eng_->catalog().games;
  std::string q = lower(search_);
  for (size_t i = 0; i < gs.size(); i++) {
    const Install* ins = eng_->install_of(gs[i].tag);
    bool installed = ins && ins->valid;
    if (filter_ == 1 && !installed) continue;
    if (filter_ == 2 && installed) continue;
    if (!q.empty()) {
      std::string hay = lower(gs[i].version + " " + gs[i].title + " " + gs[i].tag);
      if (hay.find(q) == std::string::npos) continue;
    }
    out.push_back((int)i);
  }
  return out;
}

// ------------------------------------------------------------------ ações --
void Ui::act_play_primary() {
  if (!eng_) return;
  Engine::PlayPlan plan = eng_->plan_play();
  if (plan.index < 0) {
    toast(plan.reason.empty() ? "nenhuma versão disponível" : plan.reason, 2);
    return;
  }
  sel_index_ = plan.index;
  if (plan.need_download) {
    play_after_ = true;
    act_install_index(plan.index);
  } else {
    act_play_index(plan.index);
  }
}

void Ui::act_play_index(int index) {
  if (!eng_ || index < 0 || index >= (int)eng_->catalog().games.size()) return;
  const Release& rel = eng_->catalog().games[index];
  const Install* ins = eng_->install_of(rel.tag);
  if (!ins || !ins->valid) {
    play_after_ = true;
    act_install_index(index);
    return;
  }
  close_after_play_ = false;
  if (eng_->play(rel.tag)) {
    close_after_play_ = eng_->config().close_on_play;
    set_status("Grand Pixel Game " + rel.version + " aberto", false, 4.0);
  }
}

void Ui::act_install_index(int index) {
  if (!eng_ || index < 0 || index >= (int)eng_->catalog().games.size()) return;
  if (eng_->busy()) { toast("já existe um download em andamento", 2); return; }
  const Release& rel = eng_->catalog().games[index];
  installing_ = true;
  inst_got_ = 0;
  inst_total_ = rel.size;
  inst_frac_ = 0;
  inst_tag_ = rel.tag;
  phase_ = "baixando";
  sel_index_ = index;
  set_status("Baixando Grand Pixel Game " + rel.version + "…", false, 30.0);
  eng_->start_install(index, play_after_);
  play_after_ = false;
}

void Ui::act_remove_index(int index) {
  if (!eng_ || index < 0 || index >= (int)eng_->catalog().games.size()) return;
  const Release& rel = eng_->catalog().games[index];
  if (eng_->remove_install(rel.tag)) toast("Grand Pixel Game " + rel.version + " removido", 1);
}

void Ui::act_open_folder_index(int index) {
  if (!eng_ || index < 0 || index >= (int)eng_->catalog().games.size()) return;
  const Release& rel = eng_->catalog().games[index];
  std::string dir = eng_->install_root() + eng_->fs()->sep() + "versions" + eng_->fs()->sep() + rel.tag;
  eng_->plat()->open_folder(dir);
}

void Ui::open_details(int index) {
  detail_open_ = index;
  scroll_notes_ = 0;
  sel_index_ = index;
}

void Ui::request_self_update() {
  if (!eng_) return;
  if (eng_->catalog().launcher_version.empty()) {
    toast("você já está na versão mais nova do launcher", 0);
    return;
  }
  set_status("Baixando o launcher " + eng_->catalog().launcher_version + "…", false, 30.0);
  eng_->do_self_update();
}

// ----------------------------------------------------------- quadro -------
void Ui::paint(Canvas& c) {
  widgets_.clear();
  hot_ = -1;

  // fundo
  c.clear(col::BG0);
  c.vgrad(0, 0, (float)w_, (float)h_, 0xFF0B1020, 0xFF121A2E, 0);

  Rect rail{ 0, m::TITLE_H, m::RAIL_W, h_ - m::TITLE_H - m::STATUS_H };
  Rect content{ m::RAIL_W, m::TITLE_H, w_ - m::RAIL_W, h_ - m::TITLE_H - m::STATUS_H };

  // tela
  if (screen_ == SCR_SPLASH) {
    screen_splash(c, Rect{ 0, 0, (float)w_, (float)h_ });
  } else {
    nav_rail(c, rail);
    if (screen_ == SCR_HOME) screen_home(c, content);
    else if (screen_ == SCR_LIBRARY) screen_library(c, content);
    else screen_settings(c, content);
  }

  title_bar(c, Rect{ 0, 0, (float)w_, m::TITLE_H });
  status_bar(c, Rect{ 0, (float)h_ - m::STATUS_H, (float)w_, m::STATUS_H });

  // aviso de launcher novo (uma linha no rodapé do conteúdo)
  if (eng_ && eng_->catalog().launcher_newer && screen_ != SCR_SETTINGS) {
    Rect b{ m::RAIL_W + m::PAD, h_ - m::STATUS_H - 60, w_ - m::RAIL_W - m::PAD * 2, 48 };
    banner_update(c, b);
    if (clicked(W_UPDATE_BANNER)) launcher_update_prompt_ = true;
  }

  detail_panel(c, Rect{ 0, 0, (float)w_, (float)h_ });
  toasts(c);
  modals(c);

  // navegação e janela
  if (clicked(W_NAV_HOME)) set_screen(SCR_HOME);
  if (clicked(W_NAV_LIB)) set_screen(SCR_LIBRARY);
  if (clicked(W_NAV_SET)) set_screen(SCR_SETTINGS);
  if (clicked(W_MIN)) minimize_ = true;
  if (clicked(W_CLOSE)) quit_ = true;
  if (clicked(W_CANCEL_JOB) && eng_) {
    eng_->cancel_job();
    installing_ = false;
    pending_play_index_ = -1;
    set_status("download cancelado", false, 3.0);
  }
  if (pending_click_ != -1 && pending_click_ != W_SEARCH) search_focus_ = false;
  prev_ = widgets_;
  pending_click_ = -1;
}

}  // namespace gpg
