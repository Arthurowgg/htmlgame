// ============================================================================
// Launcher — interface do usuário (independente de sistema operacional).
//
// Toda a aparência é desenhada por cima de uma camada de primitivas (Canvas),
// implementada com GDI no Windows. Assim a mesma interface pode ser testada e
// reaproveitada, e o desenho fica em um lugar só.
// ============================================================================
#ifndef GPG_UI_H
#define GPG_UI_H

#include "../core/gpg_core.h"
#include <string>
#include <vector>

namespace gpg {

// ------------------------------------------------------------------ cores --
// Formato 0xAARRGGBB.
namespace col {
enum : uint32_t {
  BG0        = 0xFF0A0E18,
  BG1        = 0xFF121829,
  PANEL      = 0xFF161D31,
  PANEL_2    = 0xFF1B2440,
  PANEL_3    = 0xFF212C4C,
  LINE       = 0x22FFFFFF,
  LINE_SOFT  = 0x11FFFFFF,
  TEXT       = 0xFFEDF1FA,
  TEXT_DIM   = 0xFF9AA7C7,
  TEXT_MUTE  = 0xFF6C7899,
  GOLD       = 0xFFF3C34E,
  GOLD_DARK  = 0xFFB98A22,
  GOLD_LIGHT = 0xFFFFE49A,
  GOLD_SOFT  = 0x33F3C34E,
  CYAN       = 0xFF5AD4FF,
  GREEN      = 0xFF56D98B,
  RED        = 0xFFFF6E6E,
  PURPLE     = 0xFFB08CFF,
  WHITE_04   = 0x0AFFFFFF,
  WHITE_08   = 0x14FFFFFF,
  WHITE_14   = 0x24FFFFFF,
  SHADOW     = 0x66000000,
  SCRIM      = 0xB0060A14,
};
}  // namespace col


// Ids de widget (usados pelo teste de clique e pelas telas).
enum Wid {
  W_MIN = 1, W_CLOSE,
  W_NAV_HOME = 10, W_NAV_LIB, W_NAV_SET,
  W_PLAY = 100, W_DETAILS, W_CANCEL_JOB, W_OPEN_DETAIL,
  W_SEARCH = 120, W_FILTER_ALL = 130, W_FILTER_INST, W_FILTER_FREE,
  W_ROW = 200, W_ROW_ACTION = 400, W_ROW_FOLDER = 600, W_ROW_REMOVE = 800, W_ROW_PLAY = 1000,
  W_TOGGLE = 2000,
  W_PICK_FOLDER = 2100, W_OPEN_FOLDER, W_OPEN_LOG, W_OPEN_REPO, W_CHECK_UPD, W_APPLY_UPD,
  W_RESET = 2200,
  W_CONFIRM_YES = 2300, W_CONFIRM_NO, W_MODAL_UPD_YES, W_MODAL_UPD_NO, W_DETAIL_CLOSE,
  W_UPDATE_BANNER = 2400,
};

// Métricas do leiaute (em pixels lógicos, escaladas pelo DPI).
namespace m {
const float TITLE_H = 48;
const float RAIL_W  = 92;
const float STATUS_H = 38;
const float PAD     = 22;
const float GAP     = 14;
const float ROW_H   = 86;
}  // namespace m

// Atalhos de id usados pelas telas
constexpr int kRow       = (int)W_ROW;
constexpr int kRowAction = (int)W_ROW_ACTION;
constexpr int kRowFolder = (int)W_ROW_FOLDER;
constexpr int kRowRemove = (int)W_ROW_REMOVE;
constexpr int kRowPlay   = (int)W_ROW_PLAY;
constexpr int kToggle    = (int)W_TOGGLE;

struct Rect {
  float x = 0, y = 0, w = 0, h = 0;
  bool contains(float px, float py) const {
    return px >= x && px <= x + w && py >= y && py <= y + h;
  }
  Rect inset(float d) const { return Rect{ x + d, y + d, w - 2 * d, h - 2 * d }; }
  Rect grow(float d) const { return Rect{ x - d, y - d, w + 2 * d, h + 2 * d }; }
  float cx() const { return x + w * 0.5f; }
  float cy() const { return y + h * 0.5f; }
  float r() const { return x + w; }
  float b() const { return y + h; }
};

// ------------------------------------------------------------------ fontes -
enum FontId {
  F11 = 0, F12, F13, F15, F17, F20, F26, F34,
};
enum { BOLD = 64 };
inline int font_of(FontId f, bool bold = false) { return (int)f + (bold ? BOLD : 0); }

// -------------------------------------------------------------- desenho ----
// Ids de imagem embutidas (geradas por tools/embed_assets.py no build).
enum ImgId { IMG_HERO = 0, IMG_COVER = 1, IMG_COUNT = 2 };

// Ícones desenhados com primitivas (nada de fontes de ícone externas).
enum Icon {
  I_NONE = 0, I_PLAY, I_DOWNLOAD, I_TRASH, I_FOLDER, I_GEAR, I_REFRESH, I_SEARCH, I_CHECK,
  I_STAR, I_CHEVRON_D, I_EXTERNAL, I_INFO, I_WARN, I_CLOSE, I_MIN, I_ROCKET, I_SLIDERS,
  I_GLOBE, I_SPARKLE, I_BOOK, I_HOME, I_ARCHIVE, I_SHIELD, I_CLOCK,
};

struct Canvas {
  virtual ~Canvas() {}
  virtual float scale() const = 0;
  virtual void clear(uint32_t argb) = 0;
  virtual void rect(float x, float y, float w, float h, uint32_t argb) = 0;
  virtual void round_rect(float x, float y, float w, float h, float r, uint32_t argb) = 0;
  virtual void round_stroke(float x, float y, float w, float h, float r, float lw, uint32_t argb) = 0;
  virtual void vgrad(float x, float y, float w, float h, uint32_t top, uint32_t bottom, float r = 0) = 0;
  virtual void shadow(float x, float y, float w, float h, float r, float spread, uint32_t argb) = 0;
  virtual void line(float x1, float y1, float x2, float y2, float lw, uint32_t argb) = 0;
  virtual void circle(float cx, float cy, float radius, uint32_t argb, bool filled, float lw = 1) = 0;
  virtual void tri(float x1, float y1, float x2, float y2, float x3, float y3, uint32_t argb) = 0;
  virtual void poly(const float* pts, int count, uint32_t argb) = 0;
  virtual void image(int id, int sx, int sy, int sw, int sh, float dx, float dy, float dw, float dh,
                     float alpha) = 0;
  virtual void image_size(int id, int* w, int* h) = 0;
  // Texto: alinhamento 0=esq, 1=centro, 2=dir (vertical sempre centralizado na caixa)
  virtual void text(const std::string& utf8, float x, float y, float w, float h, int align, int font,
                    uint32_t argb) = 0;
  virtual int  text_w(const std::string& utf8, int font) = 0;
  virtual void clip_push(float x, float y, float w, float h) = 0;
  virtual void clip_pop() = 0;
};

// -------------------------------------------------------------- widgets ---
enum WidgetKind { WK_NONE, WK_BUTTON, WK_TOGGLE, WK_ROW, WK_CHIP, WK_INPUT, WK_ICON, WK_LINK };

struct Widget {
  int         id = 0;
  WidgetKind  kind = WK_NONE;
  Rect        r;
  bool        enabled = true;
  int         index = -1;         // índice da versão, quando aplicável
  std::string tag;
  bool        hover = false;
  float       anim = 0;           // realce animado
};

// --------------------------------------------------------------- telas -----
enum Screen { SCR_SPLASH = 0, SCR_HOME, SCR_LIBRARY, SCR_SETTINGS };

class Engine;
struct Assets { int count = IMG_COUNT; };

class Ui {
public:
  explicit Ui(Engine* eng);
  void set_assets(const Assets* a) { assets_ = a; }

  void resize(int w, int h, float scale);
  void paint(Canvas& c);
  void tick(double dt);
  void on_mouse_move(float x, float y);
  void on_mouse_down(float x, float y);
  void on_mouse_up(float x, float y);
  void on_wheel(float delta);
  void on_key(int vk);                    // teclas de controle (Esc, Enter, Tab, setas…)
  void on_text(const std::string& utf8);  // digitação (campo de busca)
  void on_engine_event(const Event& ev);

  bool  wants_close_after_play() const { return close_after_play_; }
  void  clear_close_flag() { close_after_play_ = false; }
  bool  wants_quit() const { return quit_; }
  bool  wants_minimize() const { return minimize_; }
  void  clear_minimize() { minimize_ = false; }
  void  request_self_update();
  void  open_details(int index);
  void  set_status(const std::string& text, bool error, double seconds);
  int   screen() const { return screen_; }

private:
  // ---- infraestrutura de desenho
  void  push_widget(WidgetKind kind, int id, const Rect& r, bool enabled = true, int index = -1,
                    const std::string& tag = "");
  Widget* find(int id);
  bool  clicked(int id);                  // processado no começo do frame
  void  toast(const std::string& text, int kind);     // 0 info, 1 ok, 2 erro
  void  set_screen(int s);

  // ---- ícones e peças
  void  icon(Canvas& c, int which, float cx, float cy, float size, uint32_t color);
  void  para(Canvas& c, const std::string& text, const Rect& r, int font, uint32_t color,
             int max_lines = 0, float* out_h = nullptr);
  float para_height(Canvas& c, const std::string& text, float w, int font, int max_lines = 0);
  void  hline(Canvas& c, float x, float y, float w, uint32_t color = col::LINE);
  void  badge(Canvas& c, const Rect& r, const char* text, uint32_t fg, uint32_t bg, int font = F11);
  std::vector<int> visible_indices() const;
  void  button(Canvas& c, int id, const Rect& r, const char* label, int icon, bool primary,
               bool enabled = true, int index = -1);
  void  icon_button(Canvas& c, int id, const Rect& r, int icon, bool enabled = true);
  void  toggle(Canvas& c, int id, const Rect& r, const char* label, const char* hint, bool& value);
  void  chip(Canvas& c, int id, const Rect& r, const char* label, bool active, int index = -1);
  void  progress_bar(Canvas& c, const Rect& r, float frac, bool indeterminate, uint32_t fill);
  void  card(Canvas& c, const Rect& r, uint32_t fill, bool close = true);
  void  title_bar(Canvas& c, const Rect& r);
  void  nav_rail(Canvas& c, const Rect& r);
  void  status_bar(Canvas& c, const Rect& r);
  void  toasts(Canvas& c);
  void  modals(Canvas& c);
  void  banner_update(Canvas& c, const Rect& r);

  // ---- telas
  void screen_splash(Canvas& c, const Rect& r);
  void screen_home(Canvas& c, const Rect& r);
  void screen_library(Canvas& c, const Rect& r);
  void screen_settings(Canvas& c, const Rect& r);
  void detail_panel(Canvas& c, const Rect& r);
  void version_row(Canvas& c, const Rect& r, int index, bool selected);

  // ---- ações
  void act_play_primary();
  void act_play_index(int index);
  void act_install_index(int index);
  void act_remove_index(int index);
  void act_open_folder_index(int index);

  Engine*  eng_ = nullptr;
  const Assets* assets_ = nullptr;

  int    w_ = 1120, h_ = 700;
  float  scale_ = 1.f;
  double t_ = 0;                      // tempo para animações
  int    screen_ = SCR_SPLASH;
  float  splash_fade_ = 1.f;
  bool   splash_done_ = false;

  // entrada
  float  mx_ = -100, my_ = -100;
  bool   mdown_ = false;
  float  press_x_ = 0, press_y_ = 0;
  std::vector<Widget> widgets_;
  std::vector<Widget> prev_;
  int    pending_click_ = -1;
  int    hot_ = -1;

  // rolagem
  float  scroll_home_ = 0, scroll_lib_ = 0, scroll_set_ = 0, scroll_notes_ = 0;
  float  max_scroll_home_ = 0, max_scroll_lib_ = 0, max_scroll_set_ = 0, max_scroll_notes_ = 0;

  // estado da tela
  int    sel_index_ = 0;              // versão destacada na biblioteca
  int    filter_ = 0;                 // 0 todas, 1 instaladas, 2 disponíveis
  std::string search_;
  bool   search_focus_ = false;
  int    detail_open_ = -1;           // índice do painel de detalhes (-1 = fechado)
  int    confirm_remove_ = -1;
  bool   confirm_quit_ = false;
  double notes_scroll_ = 0;
  float  hero_zoom_ = 0.f;

  // mensagens
  struct ToastMsg { std::string text; int kind; double life; };
  std::vector<ToastMsg> toasts_;
  std::string status_;
  bool   status_err_ = false;
  double status_life_ = 4.0;
  double status_age_ = 0;

  // estado do motor (copiado dos eventos para desenhar)
  bool   fetching_ = false;
  bool   installing_ = false;
  double inst_frac_ = 0;
  long long inst_got_ = 0, inst_total_ = -1;
  double inst_speed_ = 0;
  std::string inst_tag_, phase_;
  bool   play_after_ = false;
  bool   offline_ = false;
  bool   close_after_play_ = false;
  bool   quit_ = false;
  bool   minimize_ = false;
  int    pending_play_index_ = -1;
  double spin_ = 0;
  double pulse_ = 0;
  bool   launcher_update_prompt_ = false;
};

}  // namespace gpg
#endif  // GPG_UI_H
