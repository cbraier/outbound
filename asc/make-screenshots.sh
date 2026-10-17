#!/bin/bash
# Gera os screenshots da App Store nos tamanhos exigidos.
# 1) Coloque as imagens originais (PNG) em asc/screenshots/
# 2) Rode:  bash asc/make-screenshots.sh
# Saída: asc/out/6.7/ (1290x2796) e asc/out/6.5/ (1242x2688)
set -e
cd "$(dirname "$0")"
SRC="screenshots"
mkdir -p out/6.7 out/6.5

shopt -s nullglob
files=("$SRC"/*.png "$SRC"/*.PNG "$SRC"/*.jpg "$SRC"/*.jpeg)
if [ ${#files[@]} -eq 0 ]; then
  echo "Nenhuma imagem encontrada em $SRC/. Coloque as telas (.png) ali e rode de novo."
  exit 1
fi

i=0
for f in "${files[@]}"; do
  i=$((i+1))
  base=$(printf "%02d" "$i")
  # 6.7" (iPhone 15/16 Pro Max)
  sips -s format png -z 2796 1290 "$f" --out "out/6.7/${base}.png" >/dev/null
  # 6.5" (iPhone XS Max / 11 Pro Max)
  sips -s format png -z 2688 1242 "$f" --out "out/6.5/${base}.png" >/dev/null
  echo "OK ${base}  <-  $(basename "$f")"
done
echo
echo "Prontos: asc/out/6.7/ e asc/out/6.5/  (${#files[@]} imagens cada)"
