@echo off
chcp 65001 >nul 2>&1

:: 生成托盘图标和安装图标
:: 需要 ImageMagick: winget install ImageMagick.ImageMagick

cd /d "%~dp0..\src-tauri\icons"

echo 正在生成图标...

:: 托盘图标 (白色背景，不透明)
magick 32x32.png -background white -alpha remove -alpha off tray-icon.png
echo done: tray-icon.png (托盘图标)

:: 圆形安装图标 (蓝色背景)
set SIZE=256
set BG_COLOR=#3B82F6

magick -size %SIZE%x%SIZE% xc:none ^
    -fill "%BG_COLOR%" -draw "circle 128,128 128,0" ^
    ( icon.png -resize 180x180 -gravity center -extent %SIZE%x%SIZE% ) ^
    -gravity center -composite ^
    -depth 8 -alpha on icon-circle-tmp.png

magick icon-circle-tmp.png -depth 8 -define icon:auto-resize=256,128,64,48,32,16 app-icon-circle.ico
del /q icon-circle-tmp.png 2>nul
echo done: app-icon-circle.ico (安装图标)

echo.
echo 完成！
