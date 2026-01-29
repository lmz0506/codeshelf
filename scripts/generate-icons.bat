@echo off
chcp 65001 >nul 2>&1

:: 生成不透明版本的图标（单独文件）
:: 原图保持不变
:: 需要 ImageMagick: winget install ImageMagick.ImageMagick

cd /d "%~dp0..\src-tauri\icons"

echo 正在生成不透明图标...

:: === 白色背景版本 ===
magick 32x32.png -background white -alpha remove -alpha off tray-icon.png
echo done: tray-icon.png (托盘图标-白色)

magick icon.png -background white -alpha remove -alpha off icon-solid.png
magick icon-solid.png -define icon:auto-resize=256,128,64,48,32,16 app-icon.ico
echo done: app-icon.ico (安装图标-白色方形)

:: === 圆形图标版本 ===
set SIZE=256
set BG_COLOR=#3B82F6

:: 创建圆形背景 + 圆形裁剪的图标
magick -size %SIZE%x%SIZE% xc:none ^
    -fill "%BG_COLOR%" -draw "circle 128,128 128,0" ^
    ( icon.png -resize 180x180 -gravity center -extent %SIZE%x%SIZE% ) ^
    -gravity center -composite ^
    -alpha on icon-circle.png
echo done: icon-circle.png (圆形图标)

:: 生成圆形 ICO
magick icon-circle.png -define icon:auto-resize=256,128,64,48,32,16 app-icon-circle.ico
echo done: app-icon-circle.ico (安装图标-圆形)

:: === 绿色背景版本 ===
set GREEN=#10B981

magick 32x32.png -background "%GREEN%" -alpha remove -alpha off tray-icon-green.png
echo done: tray-icon-green.png (托盘图标-绿色)

magick icon.png -background "%GREEN%" -alpha remove -alpha off icon-solid-green.png
magick icon-solid-green.png -define icon:auto-resize=256,128,64,48,32,16 app-icon-green.ico
echo done: app-icon-green.ico (安装图标-绿色)

echo.
echo 完成！生成的新文件：
echo   白色背景:
echo     - tray-icon.png
echo     - app-icon.ico (方形)
echo   圆形 (蓝色背景):
echo     - icon-circle.png
echo     - app-icon-circle.ico
echo   绿色背景:
echo     - tray-icon-green.png
echo     - app-icon-green.ico
echo.
echo 原图标保持不变
echo.
echo 如需使用圆形图标，请修改 tauri.conf.json 中的 icon 配置
