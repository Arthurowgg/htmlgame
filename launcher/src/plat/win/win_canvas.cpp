// Windows: desenho com GDI (dupla camada, transparência, fontes, imagens).
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <windowsx.h>
#include <wincodec.h>
#include <objbase.h>
#include <cmath>
#include <map>
#include <string>
#include <vector>

#include "win_internal.h"
#include "../../ui/gpg_ui.h"

#pragma comment(lib, "msimg32.lib")
#pragma comment(lib, "gdi32.lib")

namespace gpg {

// ---------------------------------------------------------------------------
// Canvas GDI: tudo é desenhado num bitmap de 32 bits e depois copiado com
// AlphaBlend para a janela — assim há transparência de verdade nos painéis.
// ---------------------------------------------------------------------------
class GdiCanvas : public Canvas {
public:
  GdiCanvas(HDC screen, int w, int h, float scale, Assets* assets)
      : screen_(screen), W_(w), H_(h), scale_(scale), assets_(assets) {
    mem_ = CreateCompatibleDC(screen);
    bmp_ = CreateCompatibleBitmap(screen, w, h);
    old_ = (HBITMAP)SelectObject(mem_, bmp_);
    SetBkMode(mem_, TRANSPARENT);
    SetGraphicsMode(mem_, GM_ADVANCED);
    dpi_ = (int)(96 * scale);
  }
  ~GdiCanvas() {
    for (size_t i = 0; i < fonts_.size(); i++) DeleteObject(fonts_[i]);
    for (size_t i = 0; i < images_.size(); i++) {
      if (images_[i].bmp) DeleteObject(images_[i].bmp);
      if (images_[i].dc) DeleteDC(images_[i].dc);
    }
    SelectObject(mem_, old_);
    DeleteObject(bmp_);
    DeleteDC(mem_);
  }

  float scale() const override { return scale_; }
  void  attach_assets(const std::vector<ImageData>& imgs) {
    images_.resize(imgs.size());
    for (size_t i = 0; i < imgs.size(); i++) {
      const ImageData& d = imgs[i];
      if (d.w <= 0 || d.h <= 0 || d.pixels.empty()) continue;
      BITMAPINFO bi;
      ZeroMemory(&bi, sizeof(bi));
      bi.bmiHeader.biSize = sizeof(BITMAPINFOHEADER);
      bi.bmiHeader.biWidth = d.w;
      bi.bmiHeader.biHeight = -d.h;         // top-down
      bi.bmiHeader.biPlanes = 1;
      bi.bmiHeader.biBitCount = 32;
      bi.bmiHeader.biCompression = BI_RGB;
      void* bits = NULL;
      HBITMAP bmp = CreateDIBSection(screen_, &bi, DIB_RGB_COLORS, &bits, NULL, 0);
      if (!bmp || !bits) continue;
      memcpy(bits, d.pixels.data(), d.pixels.size());
      Image& im = images_[i];
      im.w = d.w;
      im.h = d.h;
      im.bmp = bmp;
      im.dc = CreateCompatibleDC(screen_);
      im.old = SelectObject(im.dc, bmp);
    }
  }

  void clear(uint32_t argb) override { fill_rect(0, 0, (float)W_, (float)H_, argb); }

  void rect(float x, float y, float w, float h, uint32_t argb) override {
    fill_rect(x, y, w, h, argb);
  }

  void round_rect(float x, float y, float w, float h, float r, uint32_t argb) override {
    if (w <= 0 || h <= 0) return;
    if (r <= 0.5f) { fill_rect(x, y, w, h, argb); return; }
    draw_round(x, y, w, h, r, argb, true, 0, 0);
  }
  void round_stroke(float x, float y, float w, float h, float r, float lw, uint32_t argb) override {
    if (w <= 0 || h <= 0) return;
    draw_round(x, y, w, h, r, argb, false, lw, 0);
  }
  void vgrad(float x, float y, float w, float h, uint32_t top, uint32_t bottom, float r) override {
    draw_round(x, y, w, h, r, top, true, 0, bottom);
  }
  void shadow(float x, float y, float w, float h, float r, float spread, uint32_t argb) override {
    // sombra por camadas: regiões arredondadas cada vez maiores com menos alfa
    int layers = 8;
    for (int i = layers; i >= 1; i--) {
      float t = (float)i / (float)layers;
      float grow = spread * t;
      uint32_t a = (uint32_t)(((argb >> 24) & 0xFF) * (1.f - t) * 0.42f);
      if (a == 0) continue;
      uint32_t c = (a << 24) | (argb & 0x00FFFFFF);
      draw_round(x - grow, y + grow * 0.45f, w + grow * 2, h + grow * 1.2f, r + grow * 0.5f, c, true, 0, 0);
    }
  }
  void line(float x1, float y1, float x2, float y2, float lw, uint32_t argb) override {
    HPEN pen = CreatePen(PS_SOLID, (int)std::max(1.f, lw * scale_), COLORREF_RGB(argb));
    HPEN op = (HPEN)SelectObject(mem_, pen);
    MoveToEx(mem_, (int)(x1 * scale_), (int)(y1 * scale_), NULL);
    LineTo(mem_, (int)(x2 * scale_), (int)(y2 * scale_));
    SelectObject(mem_, op);
    DeleteObject(pen);
  }
  void circle(float cx, float cy, float radius, uint32_t argb, bool filled, float lw) override {
    if (filled) {
      HBRUSH br = CreateSolidBrush(COLORREF_RGB(argb));
      HBRUSH ob = (HBRUSH)SelectObject(mem_, br);
      HPEN op = (HPEN)SelectObject(mem_, GetStockObject(NULL_PEN));
      Ellipse(mem_, (int)((cx - radius) * scale_), (int)((cy - radius) * scale_),
              (int)((cx + radius) * scale_), (int)((cy + radius) * scale_));
      SelectObject(mem_, op);
      SelectObject(mem_, ob);
      DeleteObject(br);
    } else {
      HPEN pen = CreatePen(PS_SOLID, (int)std::max(1.f, lw * scale_), COLORREF_RGB(argb));
      HPEN op = (HPEN)SelectObject(mem_, pen);
      HBRUSH ob = (HBRUSH)SelectObject(mem_, GetStockObject(NULL_BRUSH));
      Ellipse(mem_, (int)((cx - radius) * scale_), (int)((cy - radius) * scale_),
              (int)((cx + radius) * scale_), (int)((cy + radius) * scale_));
      SelectObject(mem_, ob);
      SelectObject(mem_, op);
      DeleteObject(pen);
    }
  }
  void tri(float x1, float y1, float x2, float y2, float x3, float y3, uint32_t argb) override {
    POINT p[3] = { { PX(x1), PX(y1) }, { PX(x2), PX(y2) }, { PX(x3), PX(y3) } };
    HBRUSH br = CreateSolidBrush(COLORREF_RGB(argb));
    HBRUSH ob = (HBRUSH)SelectObject(mem_, br);
    HPEN op = (HPEN)SelectObject(mem_, GetStockObject(NULL_PEN));
    Polygon(mem_, p, 3);
    SelectObject(mem_, op);
    SelectObject(mem_, ob);
    DeleteObject(br);
  }
  void poly(const float* pts, int count, uint32_t argb) override {
    std::vector<POINT> p((size_t)count);
    for (int i = 0; i < count; i++) { p[i].x = PX(pts[i * 2]); p[i].y = PX(pts[i * 2 + 1]); }
    HBRUSH br = CreateSolidBrush(COLORREF_RGB(argb));
    HBRUSH ob = (HBRUSH)SelectObject(mem_, br);
    HPEN op = (HPEN)SelectObject(mem_, GetStockObject(NULL_PEN));
    Polygon(mem_, p.data(), count);
    SelectObject(mem_, op);
    SelectObject(mem_, ob);
    DeleteObject(br);
  }

  void image(int id, int sx, int sy, int sw, int sh, float dx, float dy, float dw, float dh,
             float alpha) override {
    if (id < 0 || id >= (int)images_.size()) return;
    const Image& im = images_[(size_t)id];
    if (!im.dc) return;
    if (sw <= 0 || sh <= 0) { sw = im.w; sh = im.h; }
    BLENDFUNCTION bf{ AC_SRC_OVER, 0, (BYTE)(255 * std::max(0.f, std::min(1.f, alpha))), AC_SRC_ALPHA };
    AlphaBlend(mem_, PX(dx), PX(dy), PX(dw), PX(dh), im.dc, sx, sy, sw, sh, bf);
  }
  void image_size(int id, int* w, int* h) override {
    if (id < 0 || id >= (int)images_.size()) { *w = 0; *h = 0; return; }
    *w = images_[(size_t)id].w;
    *h = images_[(size_t)id].h;
  }

  void text(const std::string& utf8, float x, float y, float w, float hh, int align, int font,
            uint32_t argb) override {
    HFONT f = font_handle(font);
    HFONT of = (HFONT)SelectObject(mem_, f);
    SetTextColor(mem_, COLORREF_RGB(argb));
    std::wstring ws = to_wide(utf8);
    RECT r;
    r.left = PX(x);
    r.top = PX(y);
    r.right = PX(x + w);
    r.bottom = PX(y + hh);
    UINT fmt = DT_SINGLELINE | DT_VCENTER | DT_NOPREFIX | DT_END_ELLIPSIS;
    if (align == 1) fmt |= DT_CENTER;
    else if (align == 2) fmt |= DT_RIGHT;
    else fmt |= DT_LEFT;
    DrawTextW(mem_, ws.c_str(), (int)ws.size(), &r, fmt);
    SelectObject(mem_, of);
  }

  int text_w(const std::string& utf8, int font) override {
    HFONT f = font_handle(font);
    HFONT of = (HFONT)SelectObject(mem_, f);
    std::wstring ws = to_wide(utf8);
    SIZE sz{ 0, 0 };
    GetTextExtentPoint32W(mem_, ws.c_str(), (int)ws.size(), &sz);
    SelectObject(mem_, of);
    return (int)(sz.cx / scale_);
  }

  void clip_push(float x, float y, float w, float hh) override {
    HRGN rgn = CreateRectRgn(PX(x), PX(y), PX(x + w), PX(y + hh));
    int saved = SaveDC(mem_);
    ExtSelectClipRgn(mem_, rgn, RGN_AND);
    DeleteObject(rgn);
    clips_.push_back(saved);
  }
  void clip_pop() override {
    if (clips_.empty()) return;
    RestoreDC(mem_, clips_.back());
    clips_.pop_back();
  }

  void finish() {
    // composição final com transparência sobre o fundo já pintado da janela
    BLENDFUNCTION bf{ AC_SRC_OVER, 0, 255, AC_SRC_ALPHA };
    HDC dst = screen_;
    AlphaBlend(dst, 0, 0, W_, H_, mem_, 0, 0, W_, H_, bf);
  }
  HBITMAP bitmap() { return bmp_; }

private:
  struct Image { HBITMAP bmp = NULL; HDC dc = NULL; HGDIOBJ old = NULL; int w = 0, h = 0; };

  static COLORREF COLORREF_RGB(uint32_t argb) {
    return RGB((argb >> 16) & 0xFF, (argb >> 8) & 0xFF, argb & 0xFF);
  }
  int PX(float v) const { return (int)lroundf(v * scale_); }

  void fill_rect(float x, float y, float w, float hh, uint32_t argb) {
    if (w <= 0 || hh <= 0) return;
    HBRUSH br = CreateSolidBrush(COLORREF_RGB(argb));
    RECT rc{ PX(x), PX(y), PX(x + w), PX(y + hh) };
    FillRect(mem_, &rc, br);
    DeleteObject(br);
  }

  // Retângulo (ou contorno) arredondado, opcionalmente com gradiente vertical.
  void draw_round(float x, float y, float w, float hh, float r, uint32_t color, bool filled,
                  float lw, uint32_t color2) {
    int px = PX(x), py = PX(y), pw = PX(w), ph = PX(hh), pr = PX(r);
    HRGN rgn = CreateRoundRectRgn(px, py, px + pw + 1, py + ph + 1, pr * 2, pr * 2);
    if (filled) {
      if (color2) {
        // gradiente vertical limitado à região
        int saved = SaveDC(mem_);
        ExtSelectClipRgn(mem_, rgn, RGN_AND);
        for (int i = 0; i < ph; i++) {
          float t = ph > 1 ? (float)i / (float)(ph - 1) : 0.f;
          uint32_t cr = lerp_color(color, color2, t);
          HBRUSH br = CreateSolidBrush(COLORREF_RGB(cr));
          RECT line{ px, py + i, px + pw, py + i + 1 };
          FillRect(mem_, &line, br);
          DeleteObject(br);
        }
        RestoreDC(mem_, saved);
      } else {
        HBRUSH br = CreateSolidBrush(COLORREF_RGB(color));
        HBRUSH ob = (HBRUSH)SelectObject(mem_, br);
        HPEN op = (HPEN)SelectObject(mem_, GetStockObject(NULL_PEN));
        FillRgn(mem_, rgn, br);
        SelectObject(mem_, op);
        SelectObject(mem_, ob);
        DeleteObject(br);
      }
    } else {
      HPEN pen = CreatePen(PS_SOLID, (int)std::max(1.f, lw * scale_), COLORREF_RGB(color));
      HPEN op = (HPEN)SelectObject(mem_, pen);
      HBRUSH ob = (HBRUSH)SelectObject(mem_, GetStockObject(NULL_BRUSH));
      RoundRect(mem_, px, py, px + pw, py + ph, pr * 2, pr * 2);
      SelectObject(mem_, ob);
      SelectObject(mem_, op);
      DeleteObject(pen);
    }
    DeleteObject(rgn);
  }

  static uint32_t lerp_color(uint32_t a, uint32_t b, float t) {
    uint32_t out = 0;
    for (int shift = 0; shift <= 24; shift += 8) {
      uint32_t ca = (a >> shift) & 0xFF, cb = (b >> shift) & 0xFF;
      uint32_t c = (uint32_t)(ca + (cb - ca) * t);
      out |= (c & 0xFF) << shift;
    }
    return out;
  }

  HFONT font_handle(int id) {
    for (size_t i = 0; i < fonts_.size(); i++)
      if (font_ids_[i] == id) return fonts_[i];
    static const int sizes[8] = { 11, 12, 13, 15, 17, 20, 26, 34 };
    int idx = id & 63;
    bool bold = (id & BOLD) != 0;
    int px = -MulDiv(sizes[idx < 8 ? idx : 4], dpi_, 72);
    HFONT f = CreateFontW(px, 0, 0, 0, bold ? FW_SEMIBOLD : FW_NORMAL, 0, 0, 0, DEFAULT_CHARSET,
                          OUT_TT_PRECIS, CLIP_DEFAULT_PRECIS, CLEARTYPE_QUALITY,
                          DEFAULT_PITCH | FF_DONTCARE, L"Segoe UI");
    fonts_.push_back(f);
    font_ids_.push_back(id);
    return f;
  }

  HDC     screen_ = NULL, mem_ = NULL;
  HBITMAP bmp_ = NULL, old_ = NULL;
  int     W_ = 0, H_ = 0, dpi_ = 96;
  float   scale_ = 1.f;
  Assets* assets_ = NULL;
  std::vector<HFONT> fonts_;
  std::vector<int>   font_ids_;
  std::vector<Image> images_;
  std::vector<int>   clips_;
};

// A tela de verdade: o cabeçalho declara esta fábrica.
Canvas* create_canvas(HDC dc, int w, int h, float scale, Assets* assets,
                      const std::vector<ImageData>& images, void** holder) {
  GdiCanvas* c = new GdiCanvas(dc, w, h, scale, assets);
  c->attach_assets(images);
  *holder = c;
  return c;
}
void destroy_canvas(void* holder) { delete (GdiCanvas*)holder; }

// Decodificação de PNG pelo WIC (já vem no Windows) — a arte entra comprimida
// no executável e é expandida só na hora de desenhar.
bool decode_png(const void* data, size_t len, ImageData& out) {
  if (!data || len == 0) return false;
  IWICImagingFactory* factory = NULL;
  HRESULT hr = CoCreateInstance(CLSID_WICImagingFactory, NULL, CLSCTX_INPROC_SERVER,
                                IID_IWICImagingFactory, (void**)&factory);
  if (FAILED(hr) || !factory) return false;
  bool ok = false;
  IWICStream* stream = NULL;
  IWICBitmapDecoder* dec = NULL;
  IWICBitmapFrameDecode* frame = NULL;
  IWICFormatConverter* conv = NULL;
  do {
    if (FAILED(factory->CreateStream(&stream)) || !stream) break;
    if (FAILED(stream->InitializeFromMemory((BYTE*)data, (DWORD)len))) break;
    if (FAILED(factory->CreateDecoderFromStream(stream, NULL, WICDecodeMetadataCacheOnDemand,
                                                &dec)) || !dec) break;
    if (FAILED(dec->GetFrame(0, &frame)) || !frame) break;
    if (FAILED(factory->CreateFormatConverter(&conv)) || !conv) break;
    if (FAILED(conv->Initialize(frame, GUID_WICPixelFormat32bppBGRA, WICBitmapDitherTypeNone, NULL,
                                0.0, WICBitmapPaletteTypeCustom))) break;
    UINT w = 0, h = 0;
    if (FAILED(conv->GetSize(&w, &h)) || w == 0 || h == 0 || w > 8192 || h > 8192) break;
    out.w = (int)w;
    out.h = (int)h;
    out.pixels.resize((size_t)w * h * 4);
    if (FAILED(conv->CopyPixels(NULL, w * 4, (UINT)out.pixels.size(), out.pixels.data()))) break;
    ok = true;
  } while (0);
  if (conv) conv->Release();
  if (frame) frame->Release();
  if (dec) dec->Release();
  if (stream) stream->Release();
  factory->Release();
  return ok;
}
void canvas_finish(void* holder) { ((GdiCanvas*)holder)->finish(); }
HBITMAP canvas_bitmap(void* holder) { return ((GdiCanvas*)holder)->bitmap(); }

}  // namespace gpg
