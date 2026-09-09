/* zipstore — extrator mínimo de .zip (método STORE apenas), puro C/stdio.
 * Usado pelo launcher para instalar o conteúdo de cada versão do jogo.
 * Portável: compila no Windows (launcher) e em Linux/CI (testes). */
#ifndef GPG_ZIPSTORE_H
#define GPG_ZIPSTORE_H
#ifdef __cplusplus
extern "C" {
#endif
/* Extrai arquivos (não-compactados, método 0) de zip_path para out_dir.
 * Cria subdiretórios. Retorna o número de arquivos extraídos; negativo = erro:
 *  -1 arquivo não lido, -2 zip inválido, -3 entrada compactada (método != 0),
 *  -4 nome de arquivo perigoso/absurdo. */
int zip_extract_store(const char *zip_path, const char *out_dir);
#ifdef __cplusplus
}
#endif
#endif
