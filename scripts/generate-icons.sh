#!/usr/bin/env bash

# 生成托盘图标和安装图标
# 需要 ImageMagick: sudo apt-get install imagemagick

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ICONS_DIR="$(dirname "$SCRIPT_DIR")/src-tauri/icons"

cd "$ICONS_DIR" || exit 1

echo "正在生成图标..."

# 托盘图标 (白色背景，不透明)
convert 32x32.png -background white -alpha remove -alpha off tray-icon.png
echo "done: tray-icon.png (托盘图标)"

# 圆形安装图标 (蓝色背景)
SIZE=256
BG_COLOR="#3B82F6"

convert -size ${SIZE}x${SIZE} xc:none \
    -fill "$BG_COLOR" -draw "circle 128,128 128,0" \
    \( icon.png -resize 180x180 -gravity center -extent ${SIZE}x${SIZE} \) \
    -gravity center -composite \
    -depth 8 -alpha on icon-circle-tmp.png

convert icon-circle-tmp.png -depth 8 -define icon:auto-resize=256,128,64,48,32,16 app-icon-circle.ico
rm -f icon-circle-tmp.png
echo "done: app-icon-circle.ico (安装图标)"

echo ""
echo "完成！"
