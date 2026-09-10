// Interface: as telas (abertura, início, versões, ajustes) e o painel de uma
// versão. Todo o desenho sai das primitivas do Canvas.
#include "gpg_ui.h"

#include <cmath>
#include <algorithm>

namespace gpg {


namespace {
// estrelas do fundo: posições fixas calculadas por uma função simples
float star_x(int i) { return (float)((i * 97 + 31) % 997) / 997.f; }
float star_y(int i) { return (float)((i * 61 + 17) % 613) / 613.f; }
float star_s(int i) { return 1.f + (float)((i * 29) % 3); }
}  // namespace

void Ui::screen_splash(Canvas& c, const Rect& r) {
  float fade = splash_fade_ < 0.f ? 0.f : splash_fade_;
  c.rect(r.x, r.y, r.w, r.h, col::BG0);
  c.vgrad(r.x, r.y, r.w, r.h, 0xFF0A1020, 0xFF141C33, 0);
  // estrelas
  for (int i = 0; i < 90; i++) {
    float x = r.x + star_x(i) * r.w;
    float y = r.y + star_y(i) * r.h * 0.8f;
    float tw = 0.55f + 0.45f * sinf((float)t_ * 1.6f + (float)i);
    uint32_t a = (uint32_t)(60 + 150 * tw);
    uint32_t s = (uint32_t)star_s(i);
    c.rect(x, y, s, s, (a << 24) | 0xEEF3FF);
  }
  float cx = r.cx(), cy = r.cy() - 40;
  // emblema
  float s = 84, bx = cx - s * 0.5f, by = cy - s * 0.5f - 30;
  c.shadow(bx, by + 8, s, s, 18, 26, 0x55F3C34E | (uint32_t)(fade * 255) << 24);
  c.round_rect(bx, by, s, s, 20, 0xFF1B2440);
  c.round_stroke(bx, by, s, s, 20, 2, 0x55F3C34E);
  float u = s / 4.f;
  c.rect(bx + u * 0.5f, by + u * 0.5f, u, u, col::GOLD_LIGHT);
  c.rect(bx + u * 1.6f, by + u * 0.5f, u, u, col::GOLD);
  c.rect(bx + u * 2.7f, by + u * 0.5f, u * 0.6f, u, col::GOLD_DARK);
  c.rect(bx + u * 0.5f, by + u * 1.6f, u, u, col::GOLD);
  c.rect(bx + u * 1.6f, by + u * 1.6f, u, u, col::CYAN);
  c.rect(bx + u * 0.5f, by + u * 2.7f, u * 2.2f, u * 0.6f, col::GOLD_DARK);
  c.text("GRAND PIXEL GAME", r.x, cy + 42, r.w, 46, 1, font_of(F34, true), col::TEXT);
  c.text("mundo aberto em voxels — 70 missões, 10 artefatos, 3 chefes", r.x, cy + 84, r.w, 24, 1,
         font_of(F13), col::TEXT_DIM);
  // progresso
  Rect bar{ cx - 190, cy + 130, 380, 8 };
  progress_bar(c, bar, 0, true, col::GOLD);
  std::string msg = fetching_ ? "Buscando versões no GitHub…"
                              : (phase_.empty() ? "Preparando tudo…" : phase_);
  c.text(msg, r.x, cy + 146, r.w, 22, 1, font_of(F12), col::TEXT_MUTE);
  if (eng_ && !eng_->self_version().empty())
    c.text("launcher v" + eng_->self_version(), r.x, r.b() - 44, r.w, 20, 1, font_of(F11),
           col::TEXT_MUTE);
}

// ---------------------------------------------------------------- início ---
void Ui::screen_home(Canvas& c, const Rect& r) {
  if (!eng_) return;
  const std::vector<Release>& games = eng_->catalog().games;
  float pad = m::PAD, W = r.w - pad * 2;
  float x0 = r.x + pad;

  // Altura total do conteúdo (para rolagem)
  float total_h = 300 + m::GAP + 250 + m::GAP + 40;
  max_scroll_home_ = std::max(0.f, total_h - r.h + pad * 2);
  scroll_home_ = std::max(0.f, std::min(max_scroll_home_, scroll_home_));
  c.clip_push(r.x, r.y, r.w, r.h);
  float y = r.y + pad - scroll_home_;

  // ------------------------------------------------------------- painel ----
  Rect hero{ x0, y, W, 300 };
  c.round_rect(hero.x, hero.y, hero.w, hero.h, 18, col::PANEL);
  c.clip_push(hero.x, hero.y, hero.w, hero.h);
  if (assets_) {
    int iw = 0, ih = 0;
    c.image_size(IMG_HERO, &iw, &ih);
    if (iw > 0 && ih > 0) {
      // leve movimento (Ken Burns) sobre a arte
      float zoom = 1.06f + 0.03f * sinf(hero_zoom_ * 0.12f);
      int sw = (int)(iw / zoom), sh = (int)(ih / zoom);
      int sx = (int)((iw - sw) * (0.5f + 0.08f * sinf(hero_zoom_ * 0.07f)));
      int sy = (int)((ih - sh) * (0.5f + 0.05f * cosf(hero_zoom_ * 0.05f)));
      c.image(IMG_HERO, sx, sy, sw, sh, hero.x, hero.y, hero.w, hero.h, 1.f);
    }
  }
  c.vgrad(hero.x, hero.y + 100, hero.w, hero.h - 100, 0x000B1020, 0xF20B1020, 0);
  c.text("GRAND PIXEL GAME", hero.x + 26, hero.y + hero.h - 190, hero.w - 52, 52, 0,
         font_of(F34, true), col::TEXT);
  c.text("Explore Solaria: 10 regiões, 70 missões e 3 chefes num mundo de blocos.",
         hero.x + 26, hero.y + hero.h - 142, hero.w - 52, 24, 0, font_of(F13), col::TEXT_DIM);

  // Selos de situação
  float chx = hero.x + 26, chy = hero.y + hero.h - 106;
  if (!games.empty()) {
    const Release& newest = games.front();
    const Install* ins = eng_->install_of(newest.tag);
    bool installed = ins && ins->valid;
    Rect b1{ chx, chy, 118, 26 };
    badge(c, b1, ("v" + newest.version).c_str(), 0xFF10203A, col::CYAN);
    chx += 126;
    Rect b2{ chx, chy, 118, 26 };
    if (installed) badge(c, b2, "INSTALADA", 0xFF06240F, col::GREEN);
    else badge(c, b2, "DISPONÍVEL", 0xFF241C08, col::GOLD);
    chx += 126;
    if (installing_ && inst_tag_ == newest.tag) {
      Rect pb{ chx, chy + 8, 150, 10 };
      progress_bar(c, pb, (float)inst_frac_, inst_total_ <= 0, col::GOLD);
    }
  }
  c.clip_pop();

  // Botão principal
  Engine::PlayPlan plan = eng_->plan_play();
  bool has_plan = plan.index >= 0;
  const char* label = "JOGAR";
  int icon_play = I_PLAY;
  if (installing_) { label = "BAIXANDO…"; icon_play = I_DOWNLOAD; }
  else if (has_plan && plan.need_download) { label = "BAIXAR E JOGAR"; icon_play = I_DOWNLOAD; }
  Rect play_r{ hero.x + 26, hero.b() - 74, 236, 54 };
  button(c, W_PLAY, play_r, label, icon_play, true, has_plan && !installing_);
  Rect det_r{ play_r.r() + 12, play_r.y, 150, 54 };
  button(c, W_DETAILS, det_r, "Detalhes", I_INFO, false, !games.empty());
  // frase de contexto (o que vai acontecer ao clicar)
  if (has_plan && !installing_) {
    std::string why = plan.reason;
    if (!why.empty())
      c.text(why, det_r.r() + 16, play_r.y, hero.r() - det_r.r() - 42, play_r.h, 0, font_of(F12),
             col::TEXT_MUTE);
  }
  y += 300 + m::GAP;

  // ------------------------------------------------------- colunas ---------
  float left_w = W * 0.615f, right_w = W - left_w - m::GAP;
  float col_h = 250;

  // Novidades
  Rect news{ x0, y, left_w, col_h };
  card(c, news, col::PANEL);
  icon(c, I_SPARKLE, news.x + 30, news.y + 34, 18, col::GOLD);
  std::string head = "Novidades";
  if (!games.empty()) head += "  ·  versão " + games.front().version;
  c.text(head, news.x + 48, news.y + 16, news.w - 160, 32, 0, font_of(F15, true), col::TEXT);
  std::string date_txt = games.empty() ? "" : ("publicada em " + date_iso_to_long(games.front().date));
  c.text(date_txt, news.x + 48, news.y + 44, news.w - 160, 18, 0, font_of(F11), col::TEXT_MUTE);
  hline(c, news.x + 20, news.y + 72, news.w - 40);
  if (!games.empty()) {
    para(c, games.front().notes, Rect{ news.x + 24, news.y + 88, news.w - 48, col_h - 108 },
         font_of(F12), col::TEXT_DIM, 7);
    if (clicked(W_OPEN_DETAIL)) open_details(0);
  } else {
    c.text("Ainda não há versões publicadas no GitHub.", news.x + 24, news.y + 88, news.w - 48, 22, 0,
           font_of(F12), col::TEXT_MUTE);
  }
  Rect more{ news.r() - 128, news.b() - 42, 108, 30 };
  push_widget(WK_LINK, W_OPEN_DETAIL, more, !games.empty(), 0);
  {
    const Widget* w = find(W_OPEN_DETAIL);
    uint32_t fg = (w && w->hover) ? col::GOLD_LIGHT : col::GOLD;
    c.text("ver detalhes", more.x, more.y, more.w - 22, more.h, 0, font_of(F12, true), fg);
    icon(c, I_EXTERNAL, more.r() - 12, more.cy(), 14, fg);
  }

  // Continuar / instaladas
  Rect cont{ x0 + left_w + m::GAP, y, right_w, 118 };
  card(c, cont, col::PANEL);
  icon(c, I_CLOCK, cont.x + 30, cont.y + 34, 18, col::CYAN);
  c.text("Continuar jogando", cont.x + 48, cont.y + 16, cont.w - 90, 30, 0, font_of(F15, true),
         col::TEXT);
  const Install* last = NULL;
  int last_index = -1;
  if (!eng_->config().last_played_tag.empty())
    last = eng_->install_of(eng_->config().last_played_tag);
  if (last) {
    for (size_t i = 0; i < games.size(); i++)
      if (games[i].tag == last->tag) { last_index = (int)i; break; }
  }
  if (last) {
    c.text("Grand Pixel Game " + last->version, cont.x + 24, cont.y + 56, cont.w - 140, 24, 0,
           font_of(F13, true), col::TEXT);
    c.text("jogada por último", cont.x + 24, cont.y + 80, cont.w - 140, 20, 0, font_of(F11),
           col::TEXT_MUTE);
    Rect pb{ cont.r() - 118, cont.cy() - 19, 98, 38 };
    button(c, W_ROW_PLAY + last_index, pb, "Jogar", I_PLAY, true, last_index >= 0);
  } else {
    c.text("Você ainda não abriu nenhuma versão.", cont.x + 24, cont.y + 56, cont.w - 48, 22, 0,
           font_of(F12), col::TEXT_MUTE);
    c.text("O botão JOGAR baixa a mais nova e abre em seguida.", cont.x + 24, cont.y + 80,
           cont.w - 48, 20, 0, font_of(F11), col::TEXT_MUTE);
  }

  Rect inst{ x0 + left_w + m::GAP, y + 118 + m::GAP, right_w, col_h - 118 - m::GAP };
  card(c, inst, col::PANEL);
  icon(c, I_ARCHIVE, inst.x + 30, inst.y + 30, 18, col::GREEN);
  c.text(fmt("Instaladas (%d)", (int)eng_->installs().size()), inst.x + 48, inst.y + 12,
         inst.w - 70, 30, 0, font_of(F15, true), col::TEXT);
  hline(c, inst.x + 20, inst.y + 48, inst.w - 40);
  if (eng_->installs().empty()) {
    c.text("Nada instalado ainda. Tudo é baixado na hora de jogar.",
           inst.x + 24, inst.y + 64, inst.w - 48, 22, 0, font_of(F12), col::TEXT_MUTE);
  } else {
    float iy = inst.y + 58;
    for (size_t i = 0; i < eng_->installs().size() && i < 4; i++) {
      const Install& ins = eng_->installs()[i];
      int gi = -1;
      for (size_t k = 0; k < games.size(); k++)
        if (games[k].tag == ins.tag) { gi = (int)k; break; }
      Rect row{ inst.x + 16, iy, inst.w - 32, 34 };
      push_widget(WK_ROW, kRow + gi, row, gi >= 0, gi);
      const Widget* w = find(kRow + gi);
      if (w && w->hover) c.round_rect(row.x, row.y, row.w, row.h, 8, col::WHITE_04);
      c.circle(row.x + 12, row.cy(), 4, col::GREEN, true);
      c.text("Grand Pixel Game " + ins.version, row.x + 26, row.y, row.w - 90, row.h, 0,
             font_of(F12), col::TEXT);
      c.text(human_size(ins.size), row.x, row.y, row.w - 44, row.h, 2, font_of(F11), col::TEXT_MUTE);
      Rect pb{ row.r() - 30, row.cy() - 13, 26, 26 };
      push_widget(WK_ICON, kRowPlay + gi, pb, gi >= 0, gi);
      const Widget* wp = find(kRowPlay + gi);
      c.circle(pb.cx(), pb.cy(), 13, (wp && wp->hover) ? col::GOLD : col::PANEL_3, true);
      icon(c, I_PLAY, pb.cx() + 1, pb.cy(), 12, (wp && wp->hover) ? 0xFF231A05 : col::GOLD_LIGHT);
      iy += 40;
    }
  }
  c.clip_pop();

  // ações da tela
  if (clicked(W_PLAY)) act_play_primary();
  if (clicked(W_DETAILS) && !games.empty()) open_details(sel_index_ >= 0 ? sel_index_ : 0);
  for (size_t i = 0; i < games.size(); i++) {
    if (clicked(kRowPlay + (int)i)) { act_play_index((int)i); break; }
  }
}

// -------------------------------------------------------------- versões ----
void Ui::version_row(Canvas& c, const Rect& r, int index, bool selected) {
  if (!eng_) return;
  const Release& rel = eng_->catalog().games[index];
  const Install* ins = eng_->install_of(rel.tag);
  bool installed = ins && ins->valid;
  push_widget(WK_ROW, kRow + index, r, true, index);
  const Widget* w = find(kRow + index);
  float hv = w ? w->anim : 0.f;
  bool hover = w && w->hover;

  uint32_t bg = col::PANEL;
  if (hover) bg = col::PANEL_2;
  if (selected) bg = col::PANEL_3;
  c.round_rect(r.x, r.y, r.w, r.h, 14, bg);
  c.round_stroke(r.x, r.y, r.w, r.h, 14, 1, selected ? 0x77F3C34E : col::LINE_SOFT);
  if (selected) c.round_rect(r.x + 1, r.y + 12, 3, r.h - 24, 2, col::GOLD);

  // capa
  Rect thumb{ r.x + 16, r.cy() - 30, 60, 60 };
  c.round_rect(thumb.x, thumb.y, thumb.w, thumb.h, 10, 0xFF0E1526);
  if (assets_) {
    int iw = 0, ih = 0;
    c.image_size(IMG_COVER, &iw, &ih);
    if (iw > 0 && ih > 0) {
      c.clip_push(thumb.x, thumb.y, thumb.w, thumb.h);
      c.image(IMG_COVER, iw / 6, ih / 8, iw * 5 / 6, ih * 3 / 4, thumb.x, thumb.y, thumb.w, thumb.h, 1.f);
      c.clip_pop();
    }
  }

  float tx = thumb.r() + 18;
  c.text(("Grand Pixel Game " + rel.version), tx, r.y + 14, r.w - 320, 26, 0, font_of(F15, true),
         col::TEXT);
  std::string meta = "publicada em " + date_iso_to_br(rel.date);
  if (rel.size > 0) meta += "  •  " + human_size(rel.size);
  if (ins) meta += fmt("  •  %d arquivos no disco", ins->files);
  c.text(meta, tx, r.y + 40, r.w - 320, 20, 0, font_of(F11), col::TEXT_MUTE);

  // selos
  float bx = tx, by = r.y + 58;
  if (rel.newest) {
    Rect b{ bx, by, 62, 20 };
    badge(c, b, "NOVA", 0xFF241C08, col::GOLD);
    bx += 70;
  }
  if (installed) {
    Rect b{ bx, by, 92, 20 };
    badge(c, b, "INSTALADA", 0xFF06240F, col::GREEN);
    bx += 100;
  }
  if (installing_ && inst_tag_ == rel.tag) {
    Rect pb{ bx, by + 5, 150, 10 };
    progress_bar(c, pb, (float)inst_frac_, inst_total_ <= 0, col::GOLD);
    std::string st = inst_total_ > 0 ? fmt("%.0f%%", inst_frac_ * 100.0) : "…";
    if (inst_speed_ > 1) st += "  ·  " + human_speed(inst_speed_);
    c.text(st, bx + 158, by, 160, 20, 0, font_of(F11), col::GOLD_LIGHT);
  }

  // ações à direita
  bool busy_here = installing_ && inst_tag_ == rel.tag;
  Rect act{ r.r() - 168, r.cy() - 20, 132, 40 };
  if (busy_here) {
    button(c, kRowAction + index, act, "Baixando…", I_DOWNLOAD, false, false, index);
  } else if (installed) {
    button(c, kRowAction + index, act, "Jogar", I_PLAY, true, true, index);
  } else {
    button(c, kRowAction + index, act, "Instalar", I_DOWNLOAD, false, !eng_->busy(), index);
  }
  Rect fld{ r.r() - 216, r.cy() - 17, 34, 34 };
  icon_button(c, kRowFolder + index, fld, I_FOLDER, installed);
  if (installed) {
    Rect del{ r.r() - 258, r.cy() - 17, 34, 34 };
    icon_button(c, kRowRemove + index, del, I_TRASH, !installing_);
  }

  // cliques
  if (clicked(kRow + index)) open_details(index);
  if (clicked(kRowAction + index)) {
    if (installed) act_play_index(index);
    else act_install_index(index);
  }
  if (clicked(kRowFolder + index) && installed) act_open_folder_index(index);
  if (clicked(kRowRemove + index) && installed) confirm_remove_ = index;
}

void Ui::screen_library(Canvas& c, const Rect& r) {
  if (!eng_) return;
  float pad = m::PAD, x0 = r.x + pad, W = r.w - pad * 2;
  float y = r.y + pad;

  c.text("Biblioteca", x0, y, 320, 36, 0, font_of(F26, true), col::TEXT);
  int total = (int)eng_->catalog().games.size();
  c.text(fmt("%d versões publicadas  •  %d instaladas", total, (int)eng_->installs().size()),
         x0, y + 36, 420, 20, 0, font_of(F12), col::TEXT_MUTE);

  // busca
  Rect sb{ r.r() - pad - 300, y + 2, 300, 40 };
  push_widget(WK_INPUT, W_SEARCH, sb);
  bool focus = search_focus_;
  c.round_rect(sb.x, sb.y, sb.w, sb.h, 12, focus ? col::PANEL_3 : col::PANEL);
  c.round_stroke(sb.x, sb.y, sb.w, sb.h, 12, 1, focus ? 0x88F3C34E : col::WHITE_08);
  icon(c, I_SEARCH, sb.x + 22, sb.cy(), 16, col::TEXT_MUTE);
  std::string shown = search_.empty() ? "Procurar versão…" : search_;
  c.text(shown, sb.x + 42, sb.y, sb.w - 60, sb.h, 0, font_of(F12),
         search_.empty() ? col::TEXT_MUTE : col::TEXT);
  if (focus && fmod(t_, 1.0) < 0.55) {
    int tw = search_.empty() ? 0 : c.text_w(search_, font_of(F12));
    c.rect(sb.x + 42 + tw + 2, sb.cy() - 9, 1.5f, 18, col::GOLD);
  }
  if (clicked(W_SEARCH)) search_focus_ = true;

  // filtros
  float cy2 = y + 64;
  chip(c, W_FILTER_ALL, Rect{ x0, cy2, 92, 30 }, "Todas", filter_ == 0);
  chip(c, W_FILTER_INST, Rect{ x0 + 100, cy2, 110, 30 }, "Instaladas", filter_ == 1);
  chip(c, W_FILTER_FREE, Rect{ x0 + 218, cy2, 118, 30 }, "Disponíveis", filter_ == 2);
  if (clicked(W_FILTER_ALL)) filter_ = 0;
  if (clicked(W_FILTER_INST)) filter_ = 1;
  if (clicked(W_FILTER_FREE)) filter_ = 2;

  // lista
  Rect list{ x0, cy2 + 44, W, r.b() - pad - (cy2 + 44) };
  std::vector<int> idx = visible_indices();
  float row_h = m::ROW_H + 10;
  float content_h = idx.size() * row_h;
  max_scroll_lib_ = std::max(0.f, content_h - list.h);
  scroll_lib_ = std::max(0.f, std::min(max_scroll_lib_, scroll_lib_));
  c.clip_push(list.x, list.y, list.w, list.h);
  if (idx.empty()) {
    c.text("Nenhuma versão encontrada com esse filtro.", list.x, list.y + 40, list.w, 24, 0,
           font_of(F13), col::TEXT_MUTE);
  }
  for (size_t i = 0; i < idx.size(); i++) {
    Rect rr{ list.x, list.y + (float)i * row_h - scroll_lib_, list.w, m::ROW_H };
    if (rr.b() < list.y - 20 || rr.y > list.b() + 20) continue;
    version_row(c, rr, idx[i], idx[i] == sel_index_);
  }
  c.clip_pop();

  // barra de rolagem
  if (max_scroll_lib_ > 1.f) {
    float frac = list.h / content_h;
    float bh = std::max(40.f, list.h * frac);
    float by2 = list.y + (list.h - bh) * (scroll_lib_ / max_scroll_lib_);
    c.round_rect(list.r() - 6, by2, 5, bh, 3, col::WHITE_14);
  }
}

// ------------------------------------------------------------- ajustes -----
void Ui::screen_settings(Canvas& c, const Rect& r) {
  if (!eng_) return;
  float pad = m::PAD, x0 = r.x + pad;
  float colw = (r.w - pad * 2 - m::GAP) * 0.5f;
  float right_x = x0 + colw + m::GAP;
  float total_h = 560;
  max_scroll_set_ = std::max(0.f, total_h - r.h + pad * 2);
  scroll_set_ = std::max(0.f, std::min(max_scroll_set_, scroll_set_));
  c.clip_push(r.x, r.y, r.w, r.h);
  float y = r.y + pad - scroll_set_;

  c.text("Ajustes", x0, y, 320, 36, 0, font_of(F26, true), col::TEXT);
  y += 52;

  // ------------------------------------------------ coluna esquerda --------
  Rect g1{ x0, y, colw, 246 };
  card(c, g1, col::PANEL);
  icon(c, I_GEAR, g1.x + 30, g1.y + 32, 18, col::GOLD);
  c.text("Jogo", g1.x + 48, g1.y + 14, g1.w - 70, 30, 0, font_of(F15, true), col::TEXT);
  hline(c, g1.x + 20, g1.y + 50, g1.w - 40);
  Config& cfg = eng_->config();
  toggle(c, W_TOGGLE + 0, Rect{ g1.x + 24, g1.y + 66, g1.w - 48, 44 },
         "Usar sempre a versão mais nova", "abre o jogo já atualizado", cfg.auto_update_game);
  toggle(c, W_TOGGLE + 1, Rect{ g1.x + 24, g1.y + 122, g1.w - 48, 44 },
         "Fechar o launcher ao jogar", "o jogo abre numa janela própria", cfg.close_on_play);
  toggle(c, W_TOGGLE + 2, Rect{ g1.x + 24, g1.y + 178, g1.w - 48, 44 },
         "Manter servidor local ligado", "saves e progresso no mesmo lugar", cfg.keep_server);

  Rect g2{ x0, y + 246 + m::GAP, colw, 150 };
  card(c, g2, col::PANEL);
  icon(c, I_FOLDER, g2.x + 30, g2.y + 32, 18, col::CYAN);
  c.text("Onde o jogo fica guardado", g2.x + 48, g2.y + 14, g2.w - 70, 30, 0, font_of(F15, true),
         col::TEXT);
  hline(c, g2.x + 20, g2.y + 50, g2.w - 40);
  c.text(eng_->install_root(), g2.x + 24, g2.y + 58, g2.w - 48, 22, 0, font_of(F11), col::TEXT_DIM);
  long long total_sz = 0;
  int files = 0;
  for (size_t i = 0; i < eng_->installs().size(); i++) {
    total_sz += eng_->installs()[i].size;
    files += eng_->installs()[i].files;
  }
  c.text(fmt("%s em disco  •  %d arquivos", human_size(total_sz).c_str(), files), g2.x + 24,
         g2.y + 80, g2.w - 48, 20, 0, font_of(F11), col::TEXT_MUTE);
  Rect b1{ g2.x + 24, g2.b() - 52, 150, 36 }, b2{ g2.x + 186, g2.b() - 52, 130, 36 };
  button(c, W_PICK_FOLDER, b1, "Alterar…", I_FOLDER, false);
  button(c, W_OPEN_FOLDER, b2, "Abrir", I_EXTERNAL, false);
  if (clicked(W_PICK_FOLDER)) {
    std::string picked;
    if (eng_->plat()->pick_folder(picked, eng_->install_root()) && !picked.empty()) {
      eng_->config().install_root = picked;
      eng_->save_config();
      eng_->refresh_installs();
      toast("pasta de instalação alterada", 1);
    }
  }
  if (clicked(W_OPEN_FOLDER)) eng_->plat()->open_folder(eng_->install_root());

  // ------------------------------------------------ coluna direita ---------
  Rect g3{ right_x, y, colw, 200 };
  card(c, g3, col::PANEL);
  icon(c, I_ROCKET, g3.x + 30, g3.y + 32, 18, col::PURPLE);
  c.text("Launcher", g3.x + 48, g3.y + 14, g3.w - 70, 30, 0, font_of(F15, true), col::TEXT);
  hline(c, g3.x + 20, g3.y + 50, g3.w - 40);
  c.text("Versão instalada", g3.x + 24, g3.y + 62, g3.w - 48, 20, 0, font_of(F11), col::TEXT_MUTE);
  c.text("v" + eng_->self_version(), g3.x + 24, g3.y + 78, g3.w - 48, 26, 0, font_of(F17, true),
         col::TEXT);
  std::string upd;
  if (eng_->catalog().launcher_newer) upd = "versão " + eng_->catalog().launcher_version + " disponível";
  else if (!eng_->catalog().launcher_version.empty()) upd = "você está na versão mais nova";
  else upd = "não consegui verificar agora";
  c.text(upd, g3.x + 24, g3.y + 108, g3.w - 48, 20, 0, font_of(F12),
         eng_->catalog().launcher_newer ? col::GOLD_LIGHT : col::TEXT_MUTE);
  Rect u1{ g3.x + 24, g3.b() - 54, 170, 38 }, u2{ g3.x + 206, g3.b() - 54, 150, 38 };
  button(c, W_APPLY_UPD, u1, "Atualizar", I_DOWNLOAD, eng_->catalog().launcher_newer);
  button(c, W_CHECK_UPD, u2, "Verificar", I_REFRESH, !eng_->busy());
  if (clicked(W_APPLY_UPD)) request_self_update();
  if (clicked(W_CHECK_UPD)) {
    if (eng_->busy()) toast("já existe uma tarefa em andamento", 2);
    else { eng_->start_fetch(); set_status("verificando versões no GitHub…", false, 10.0); }
  }

  Rect g4{ right_x, y + 200 + m::GAP, colw, 196 };
  card(c, g4, col::PANEL);
  icon(c, I_INFO, g4.x + 30, g4.y + 32, 18, col::CYAN);
  c.text("Sobre", g4.x + 48, g4.y + 14, g4.w - 70, 30, 0, font_of(F15, true), col::TEXT);
  hline(c, g4.x + 20, g4.y + 50, g4.w - 40);
  para(c, "Grand Pixel Game — mundo aberto em voxels. O launcher baixa cada "
          "versão direto das publicações do projeto no GitHub e abre o jogo numa "
          "janela própria. O jogo nunca vem dentro do executável.",
       Rect{ g4.x + 24, g4.y + 62, g4.w - 48, 80 }, font_of(F12), col::TEXT_DIM, 5);
  Rect o1{ g4.x + 24, g4.b() - 54, 150, 38 }, o2{ g4.x + 186, g4.b() - 54, 150, 38 };
  button(c, W_OPEN_REPO, o1, "Repositório", I_GLOBE, false);
  button(c, W_OPEN_LOG, o2, "Ver registro", I_BOOK, false);
  if (clicked(W_OPEN_REPO)) eng_->plat()->open_url("https://github.com/Arthurowgg/htmlgame/releases");
  if (clicked(W_OPEN_LOG)) eng_->plat()->open_text_file(eng_->log_path());

  c.clip_pop();
}

// ------------------------------------------------------ painel da versão ---
void Ui::detail_panel(Canvas& c, const Rect& full) {
  if (detail_open_ < 0 || !eng_) return;
  const std::vector<Release>& games = eng_->catalog().games;
  if (detail_open_ >= (int)games.size()) { detail_open_ = -1; return; }
  const Release& rel = games[detail_open_];
  const Install* ins = eng_->install_of(rel.tag);
  bool installed = ins && ins->valid;

  c.rect(0, 0, (float)w_, (float)h_, col::SCRIM);
  float cw = std::min(760.f, (float)w_ - 80), ch = std::min(560.f, (float)h_ - 70);
  Rect r{ ((float)w_ - cw) * 0.5f, ((float)h_ - ch) * 0.5f, cw, ch };
  c.shadow(r.x, r.y + 12, r.w, r.h, 18, 30, col::SHADOW);
  c.round_rect(r.x, r.y, r.w, r.h, 18, 0xFF141B2E);
  c.round_stroke(r.x, r.y, r.w, r.h, 18, 1, col::WHITE_08);
  c.clip_push(r.x, r.y, r.w, r.h);

  // capa
  Rect art{ r.x, r.y, r.w, 200 };
  if (assets_) {
    int iw = 0, ih = 0;
    c.image_size(IMG_COVER, &iw, &ih);
    if (iw > 0 && ih > 0)
      c.image(IMG_COVER, 0, 0, iw, ih, art.x, art.y - 40, art.w, art.h + 40, 1.f);
  }
  c.vgrad(art.x, art.y + 40, art.w, art.h - 40, 0x00141B2E, 0xFF141B2E, 0);
  c.text("Grand Pixel Game", art.x + 28, art.y + art.h - 78, art.w - 200, 40, 0, font_of(F26, true),
         col::TEXT);
  c.text("versão " + rel.version + "  ·  " + date_iso_to_long(rel.date), art.x + 28,
         art.y + art.h - 38, art.w - 200, 24, 0, font_of(F12), col::TEXT_DIM);
  // selos
  float bx = art.r() - 28;
  if (installed) {
    Rect b{ bx - 92, art.y + art.h - 62, 92, 24 };
    badge(c, b, "INSTALADA", 0xFF06240F, col::GREEN);
    bx -= 100;
  }
  if (rel.newest) {
    Rect b{ bx - 62, art.y + art.h - 62, 62, 24 };
    badge(c, b, "NOVA", 0xFF241C08, col::GOLD);
  }
  // fechar
  Rect cl{ r.r() - 48, r.y + 14, 34, 34 };
  icon_button(c, W_DETAIL_CLOSE, cl, I_CLOSE);
  if (clicked(W_DETAIL_CLOSE)) { detail_open_ = -1; c.clip_pop(); return; }

  // notas
  float ny = art.b() + 16;
  c.text("Notas da versão", r.x + 28, ny, 300, 24, 0, font_of(F13, true), col::TEXT);
  float list_h = r.b() - ny - 108;
  Rect clip{ r.x + 28, ny + 30, r.w - 56, list_h };
  c.clip_push(clip.x, clip.y, clip.w, clip.h);
  std::string notes = rel.notes.empty() ? "Sem notas publicadas para esta versão." : rel.notes;
  float nh = para_height(c, notes, clip.w - 12, font_of(F12));
  max_scroll_notes_ = std::max(0.f, nh - clip.h + 10);
  float oy = (float)scroll_notes_;
  c.clip_push(clip.x, clip.y - oy + 0, clip.w, clip.h + oy);
  para(c, notes, Rect{ clip.x, clip.y - oy, clip.w - 12, nh + 40 }, font_of(F12), col::TEXT_DIM, 0);
  c.clip_pop();
  c.clip_pop();
  if (max_scroll_notes_ > 1.f) {
    float frac = clip.h / (nh + 10);
    float bh = std::max(30.f, clip.h * frac);
    float byy = clip.y + (clip.h - bh) * (scroll_notes_ / max_scroll_notes_);
    c.round_rect(clip.r() - 4, byy, 4, bh, 2, col::WHITE_14);
  }

  // ações
  Rect a1{ r.x + 28, r.b() - 78, 230, 50 };
  if (installing_ && inst_tag_ == rel.tag) {
    button(c, W_ROW_ACTION + detail_open_, a1, "Baixando…", I_DOWNLOAD, false, false, detail_open_);
    Rect pb{ a1.r() + 16, a1.cy() - 5, 200, 10 };
    progress_bar(c, pb, (float)inst_frac_, inst_total_ <= 0, col::GOLD);
  } else if (installed) {
    button(c, W_ROW_ACTION + detail_open_, a1, "JOGAR AGORA", I_PLAY, true, true, detail_open_);
  } else {
    button(c, W_ROW_ACTION + detail_open_, a1, "BAIXAR E JOGAR", I_DOWNLOAD, true, !eng_->busy(),
           detail_open_);
  }
  Rect a2{ a1.r() + 12, a1.y + 7, 130, 36 }, a3{ a1.r() + 152, a1.y + 7, 130, 36 };
  button(c, kRowFolder + detail_open_, a2, "Pasta", I_FOLDER, false, installed, detail_open_);
  button(c, kRowRemove + detail_open_, a3, "Remover", I_TRASH, false, installed && !installing_,
         detail_open_);
  if (ins) {
    std::string sha = ins->sha256.size() > 16 ? ins->sha256.substr(0, 16) + "…" : ins->sha256;
    c.text(fmt("%d arquivos  •  %s  •  sha256 %s", ins->files, human_size(ins->size).c_str(),
               sha.c_str()),
           r.x + 28, r.b() - 118, r.w - 56, 20, 0, font_of(F11), col::TEXT_MUTE);
  }
  c.clip_pop();

  if (clicked(W_ROW_ACTION + detail_open_)) {
    if (installed) act_play_index(detail_open_);
    else act_install_index(detail_open_);
  }
  if (clicked(kRowFolder + detail_open_) && installed) act_open_folder_index(detail_open_);
  if (clicked(kRowRemove + detail_open_) && installed) confirm_remove_ = detail_open_;
}

}  // namespace gpg
