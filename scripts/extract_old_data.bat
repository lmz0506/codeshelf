@echo off
chcp 65001 >nul

echo.
echo ========================================
echo   CodeShelf 旧数据查看工具
echo ========================================
echo.

:: 设置可能的旧数据路径
set "OLD_DIR_1=%APPDATA%\com.codeshelf.desktop"
set "OLD_DIR_2=%LOCALAPPDATA%\com.codeshelf.desktop"
set "OLD_DIR_3=%APPDATA%\codeshelf"
set "OLD_DIR_4=%LOCALAPPDATA%\codeshelf"

:: 查找存在的目录
set "DATA_DIR="
if exist "%OLD_DIR_1%" set "DATA_DIR=%OLD_DIR_1%"
if exist "%OLD_DIR_2%" if "%DATA_DIR%"=="" set "DATA_DIR=%OLD_DIR_2%"
if exist "%OLD_DIR_3%" if "%DATA_DIR%"=="" set "DATA_DIR=%OLD_DIR_3%"
if exist "%OLD_DIR_4%" if "%DATA_DIR%"=="" set "DATA_DIR=%OLD_DIR_4%"

:: 检查是否找到
echo 检查旧数据目录...
echo.
if exist "%OLD_DIR_1%" (echo [√] %OLD_DIR_1%) else (echo [×] %OLD_DIR_1%)
if exist "%OLD_DIR_2%" (echo [√] %OLD_DIR_2%) else (echo [×] %OLD_DIR_2%)
if exist "%OLD_DIR_3%" (echo [√] %OLD_DIR_3%) else (echo [×] %OLD_DIR_3%)
if exist "%OLD_DIR_4%" (echo [√] %OLD_DIR_4%) else (echo [×] %OLD_DIR_4%)

if "%DATA_DIR%"=="" (
    echo.
    echo 未找到任何旧数据目录!
    echo.
    pause
    exit /b
)

echo.
echo 使用数据目录: %DATA_DIR%
echo.
echo ========================================
echo   旧数据内容
echo ========================================

:: 显示项目
echo.
echo === 项目列表 ===
if exist "%DATA_DIR%\projects.json" (
    powershell -NoProfile -Command "$json = Get-Content '%DATA_DIR%\projects.json' -Raw -Encoding UTF8 | ConvertFrom-Json; $p = if($json.projects){$json.projects}elseif($json.data){$json.data}else{$json}; if($p){$p|ForEach-Object{Write-Host('  '+$_.name+' -> '+$_.path)}}else{Write-Host '  (空)'}"
) else (
    echo   (文件不存在)
)

:: 显示分类
echo.
echo === 分类列表 ===
if exist "%DATA_DIR%\categories.json" (
    powershell -NoProfile -Command "$json = Get-Content '%DATA_DIR%\categories.json' -Raw -Encoding UTF8 | ConvertFrom-Json; $c = if($json.data){$json.data}else{$json}; if($c){$c|ForEach-Object{Write-Host('  '+$_)}}else{Write-Host '  (空)'}"
) else (
    echo   (文件不存在)
)

:: 显示标签
echo.
echo === 标签列表 ===
if exist "%DATA_DIR%\labels.json" (
    powershell -NoProfile -Command "$json = Get-Content '%DATA_DIR%\labels.json' -Raw -Encoding UTF8 | ConvertFrom-Json; $l = if($json.data){$json.data}else{$json}; if($l){$l|ForEach-Object{Write-Host('  '+$_)}}else{Write-Host '  (空)'}"
) else (
    echo   (文件不存在)
)

:: 显示编辑器
echo.
echo === 编辑器配置 ===
if exist "%DATA_DIR%\editors.json" (
    powershell -NoProfile -Command "$json = Get-Content '%DATA_DIR%\editors.json' -Raw -Encoding UTF8 | ConvertFrom-Json; $e = if($json.data){$json.data}else{$json}; if($e){$e|ForEach-Object{Write-Host('  '+$_.name+' -> '+$_.path)}}else{Write-Host '  (空)'}"
) else (
    echo   (文件不存在)
)

:: 显示 Claude 配置
echo.
echo === Claude 配置档案 ===
if exist "%DATA_DIR%\claude_profiles_host.json" (
    echo   [Host] claude_profiles_host.json - 存在
) else (
    echo   [Host] - 不存在
)
if exist "%DATA_DIR%\claude_profiles_wsl.json" (
    echo   [WSL] claude_profiles_wsl.json - 存在
) else (
    echo   [WSL] - 不存在
)

:: 列出目录中的所有 json 文件
echo.
echo === 目录中的所有数据文件 ===
dir /b "%DATA_DIR%\*.json" 2>nul
if errorlevel 1 echo   (无 json 文件)

echo.
echo ========================================
echo.
echo 新版本数据位置: 应用安装目录\data\
echo.

pause
