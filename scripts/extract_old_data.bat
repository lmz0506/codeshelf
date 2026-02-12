@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

echo ========================================
echo   CodeShelf 旧数据提取脚本
echo ========================================
echo.

:: 设置路径
set "OLD_DATA_DIR=%LOCALAPPDATA%\codeshelf"
set "OLD_CONFIG_DIR=%APPDATA%\codeshelf"
set "OUTPUT_DIR=%~dp0extracted_data"

:: 创建输出目录
if not exist "%OUTPUT_DIR%" mkdir "%OUTPUT_DIR%"

echo 正在检查旧数据位置...
echo.

:: 检查旧数据目录
if exist "%OLD_DATA_DIR%" (
    echo [√] 找到旧数据目录: %OLD_DATA_DIR%
) else (
    echo [×] 未找到旧数据目录: %OLD_DATA_DIR%
)

if exist "%OLD_CONFIG_DIR%" (
    echo [√] 找到旧配置目录: %OLD_CONFIG_DIR%
) else (
    echo [×] 未找到旧配置目录: %OLD_CONFIG_DIR%
)

echo.
echo ========================================
echo   提取数据
echo ========================================
echo.

:: 提取项目数据
if exist "%OLD_DATA_DIR%\projects.json" (
    echo 提取: projects.json
    copy "%OLD_DATA_DIR%\projects.json" "%OUTPUT_DIR%\projects_old.json" >nul

    echo.
    echo === 项目数据预览 ===
    powershell -Command "try { $json = Get-Content '%OLD_DATA_DIR%\projects.json' -Raw | ConvertFrom-Json; if ($json.projects) { $json.projects | ForEach-Object { Write-Host ('  - ' + $_.name + ' | ' + $_.path) } } elseif ($json -is [array]) { $json | ForEach-Object { Write-Host ('  - ' + $_.name + ' | ' + $_.path) } } } catch { Write-Host '  解析失败' }"
    echo.
)

:: 提取分类数据
echo.
echo === 从项目中提取分类 ===
powershell -Command "try { $json = Get-Content '%OLD_DATA_DIR%\projects.json' -Raw | ConvertFrom-Json; $projects = if ($json.projects) { $json.projects } else { $json }; $tags = $projects | ForEach-Object { $_.tags } | Where-Object { $_ } | Select-Object -Unique | Sort-Object; Write-Host '分类列表:'; $tags | ForEach-Object { Write-Host ('  - ' + $_) }; $tags | ConvertTo-Json | Out-File '%OUTPUT_DIR%\categories_extracted.json' -Encoding UTF8 } catch { Write-Host '  提取失败' }"

:: 提取标签数据
echo.
echo === 从项目中提取标签 ===
powershell -Command "try { $json = Get-Content '%OLD_DATA_DIR%\projects.json' -Raw | ConvertFrom-Json; $projects = if ($json.projects) { $json.projects } else { $json }; $labels = $projects | ForEach-Object { $_.labels } | ForEach-Object { $_ } | Where-Object { $_ } | Select-Object -Unique | Sort-Object; Write-Host '标签列表:'; $labels | ForEach-Object { Write-Host ('  - ' + $_) }; $labels | ConvertTo-Json | Out-File '%OUTPUT_DIR%\labels_extracted.json' -Encoding UTF8 } catch { Write-Host '  提取失败' }"

:: 提取编辑器配置（如果存在）
if exist "%OLD_DATA_DIR%\editors.json" (
    echo.
    echo === 编辑器配置 ===
    copy "%OLD_DATA_DIR%\editors.json" "%OUTPUT_DIR%\editors_old.json" >nul
    powershell -Command "try { $json = Get-Content '%OLD_DATA_DIR%\editors.json' -Raw | ConvertFrom-Json; $editors = if ($json.editors) { $json.editors } else { $json }; if ($editors) { $editors | ForEach-Object { Write-Host ('  - ' + $_.name + ': ' + $_.path) } } else { Write-Host '  无数据' } } catch { Write-Host '  解析失败' }"
)

:: 提取终端配置（如果存在）
if exist "%OLD_DATA_DIR%\terminal.json" (
    echo.
    echo === 终端配置 ===
    copy "%OLD_DATA_DIR%\terminal.json" "%OUTPUT_DIR%\terminal_old.json" >nul
    type "%OLD_DATA_DIR%\terminal.json"
    echo.
)

:: 提取应用设置（如果存在）
if exist "%OLD_DATA_DIR%\app_settings.json" (
    echo.
    echo === 应用设置 ===
    copy "%OLD_DATA_DIR%\app_settings.json" "%OUTPUT_DIR%\app_settings_old.json" >nul
    type "%OLD_DATA_DIR%\app_settings.json"
    echo.
)

:: 提取 Claude 配置档案
if exist "%OLD_CONFIG_DIR%" (
    echo.
    echo === Claude 配置档案 ===
    for %%f in ("%OLD_CONFIG_DIR%\claude_profiles_*.json") do (
        echo 找到: %%~nxf
        copy "%%f" "%OUTPUT_DIR%\%%~nxf" >nul
    )
)

echo.
echo ========================================
echo   生成新数据模板
echo ========================================
echo.

:: 生成新的数据模板文件
echo 生成空数据模板...

:: projects.json 模板
echo [] > "%OUTPUT_DIR%\template_projects.json"
echo   - template_projects.json (空项目列表，格式: [{id,name,path,isFavorite,tags,labels,createdAt,updatedAt}])

:: categories.json 模板
echo ["工作", "个人", "学习", "测试"] > "%OUTPUT_DIR%\template_categories.json"
echo   - template_categories.json (分类列表，格式: ["分类1", "分类2"])

:: labels.json 模板
echo ["Java", "Python", "JavaScript", "TypeScript", "Rust", "Go", "Vue", "React"] > "%OUTPUT_DIR%\template_labels.json"
echo   - template_labels.json (标签列表，格式: ["标签1", "标签2"])

:: editors.json 模板
echo [] > "%OUTPUT_DIR%\template_editors.json"
echo   - template_editors.json (编辑器列表，格式: [{id,name,path,icon,isDefault}])

:: terminal.json 模板
echo {"terminal_type": "系统默认", "custom_path": null, "terminal_path": null} > "%OUTPUT_DIR%\template_terminal.json"
echo   - template_terminal.json

:: app_settings.json 模板
echo {"theme": "light", "view_mode": "grid", "sidebar_collapsed": false, "scan_depth": 3} > "%OUTPUT_DIR%\template_app_settings.json"
echo   - template_app_settings.json

echo.
echo ========================================
echo   完成!
echo ========================================
echo.
echo 提取的数据保存在: %OUTPUT_DIR%
echo.
echo 使用方法:
echo   1. 查看 *_old.json 和 *_extracted.json 文件了解旧数据
echo   2. 参考 template_*.json 了解新数据格式
echo   3. 将需要的数据按新格式整理后放入应用的 data 目录
echo.
echo 新数据目录位置: ^<应用安装目录^>\data\
echo.

:: 打开输出目录
explorer "%OUTPUT_DIR%"

pause
