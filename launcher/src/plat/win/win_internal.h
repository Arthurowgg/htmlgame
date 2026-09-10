// Windows: ponte entre a janela, o desenho e o núcleo do launcher.
#ifndef GPG_WIN_INTERNAL_H
#define GPG_WIN_INTERNAL_H

#include <windows.h>
#include <string>
#include <vector>
#include <cstdint>

namespace gpg {

struct ImageData {
  int w = 0, h = 0;
  std::vector<uint8_t> pixels;   // BGRA, top-down
  bool valid() const { return w > 0 && h > 0 && pixels.size() == (size_t)w * h * 4; }
};

// Arte embutida no .exe (PNG comprimido, decodificado na hora com o WIC).
// Gerado no build por tools/assets.py — mantém o executável pequeno.
struct ImageBlob { const unsigned char* data; size_t size; };
const ImageBlob* embedded_png(int id, size_t* size);   // 0 = arte larga, 1 = capa
bool decode_png(const void* data, size_t len, ImageData& out);
extern const wchar_t* EMBEDDED_ASSETS_VERSION;

// Criação do desenho (win_canvas.cpp)
Canvas* create_canvas(HDC dc, int w, int h, float scale, Assets* assets,
                      const std::vector<ImageData>& images, void** holder);
void    destroy_canvas(void* holder);
void    canvas_finish(void* holder);       // compõe o quadro na janela
HBITMAP canvas_bitmap(void* holder);

// Implementações de sistema (win_platform.cpp)
FS*       create_win_fs();
Net*      create_win_net();
Platform* create_win_platform();
HICON     create_app_icon(int size);       // ícone desenhado em pixel art

}  // namespace gpg
#endif  // GPG_WIN_INTERNAL_H
