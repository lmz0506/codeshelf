# CodeShelf Old Data Extractor
# 从 WebView localStorage (LevelDB) 中提取旧数据

# 可能的 localStorage 目录位置
$possibleDirs = @(
    "$env:LOCALAPPDATA\com.codeshelf.desktop\EBWebView\Default\Local Storage\leveldb",
    "$env:APPDATA\com.codeshelf.desktop\EBWebView\Default\Local Storage\leveldb",
    "$env:LOCALAPPDATA\com.codeshelf.desktop\Local Storage\leveldb",
    "$env:APPDATA\com.codeshelf.desktop\Local Storage\leveldb"
)

Write-Host ""
Write-Host "========================================"
Write-Host "  CodeShelf Old Data Viewer"
Write-Host "========================================"
Write-Host ""

# 查找存在的目录
$leveldbDir = $null
foreach ($dir in $possibleDirs) {
    Write-Host "Checking: $dir"
    if (Test-Path $dir) {
        $leveldbDir = $dir
        break
    }
}

Write-Host ""

if (-not $leveldbDir) {
    Write-Host "[X] localStorage directory not found!"
    Write-Host ""
    Write-Host "Searched locations:"
    $possibleDirs | ForEach-Object { Write-Host "  - $_" }
    Write-Host ""
    Read-Host "Press Enter to exit"
    exit
}

Write-Host "[Y] Found: $leveldbDir"
Write-Host ""
Write-Host "========================================"
Write-Host "  Extracting Data"
Write-Host "========================================"
Write-Host ""

# 读取所有 LevelDB 文件内容
$rawContent = ""
$files = Get-ChildItem $leveldbDir -File | Where-Object { $_.Extension -in '.log', '.ldb', '' }

Write-Host "Reading files:"
foreach ($f in $files) {
    try {
        $bytes = [System.IO.File]::ReadAllBytes($f.FullName)
        $text = [System.Text.Encoding]::UTF8.GetString($bytes)
        $rawContent += $text
        Write-Host "  $($f.Name) - $($bytes.Length) bytes"
    } catch {
        Write-Host "  $($f.Name) - Error: $_"
    }
}

Write-Host ""
Write-Host "Raw content length: $($rawContent.Length) characters"

# 清理二进制数据：移除 null 字节和不可打印字符
# 保留 JSON 相关字符和中文
$content = $rawContent -replace '[\x00-\x08\x0B\x0C\x0E-\x1F]', ''
Write-Host "Cleaned content length: $($content.Length) characters"

# Debug: 检查是否找到关键字
$hasCodeshelf = $content -match 'codeshelf'
$hasCategories = $content -match '"categories"'
$hasEditors = $content -match '"editors"'
$hasState = $content -match '"state"'
Write-Host "Found 'codeshelf': $hasCodeshelf"
Write-Host "Found 'categories': $hasCategories"
Write-Host "Found 'editors': $hasEditors"
Write-Host "Found 'state': $hasState"
Write-Host ""

# 查找 codeshelf-storage 的数据（zustand persist 格式）
# 格式: {"state":{"categories":[...],"labels":[...],"editors":[...],...},"version":0}
$storeData = $null

# 方法1：尝试提取完整的 JSON（从 {"state": 开始到匹配的 } 结束）
$jsonStartIdx = $content.IndexOf('{"state":{')
if ($jsonStartIdx -ge 0) {
    Write-Host "Found JSON start at position: $jsonStartIdx"
    # 从这个位置开始，找到完整的 JSON
    $braceCount = 0
    $jsonEnd = -1
    $inString = $false
    $escape = $false

    for ($i = $jsonStartIdx; $i -lt $content.Length -and $i -lt ($jsonStartIdx + 50000); $i++) {
        $char = $content[$i]

        if ($escape) {
            $escape = $false
            continue
        }

        if ($char -eq '\') {
            $escape = $true
            continue
        }

        if ($char -eq '"') {
            $inString = -not $inString
            continue
        }

        if (-not $inString) {
            if ($char -eq '{') { $braceCount++ }
            elseif ($char -eq '}') {
                $braceCount--
                if ($braceCount -eq 0) {
                    $jsonEnd = $i
                    break
                }
            }
        }
    }

    if ($jsonEnd -gt $jsonStartIdx) {
        $jsonStr = $content.Substring($jsonStartIdx, $jsonEnd - $jsonStartIdx + 1)
        Write-Host "Extracted JSON length: $($jsonStr.Length)"
        try {
            $storeData = $jsonStr | ConvertFrom-Json -ErrorAction Stop
            Write-Host "Successfully parsed JSON!"
        } catch {
            Write-Host "JSON parse error: $_"
            # 尝试清理 JSON 中的非法字符
            $cleanJson = $jsonStr -replace '[^\x20-\x7E\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]', ''
            try {
                $storeData = $cleanJson | ConvertFrom-Json -ErrorAction Stop
                Write-Host "Successfully parsed cleaned JSON!"
            } catch {
                Write-Host "Cleaned JSON parse also failed"
            }
        }
    }
}

Write-Host ""

# 提取分类
Write-Host "=== Categories ==="
$foundCategories = $false

if ($storeData -and $storeData.state -and $storeData.state.categories) {
    $cats = $storeData.state.categories
    if ($cats.Count -gt 0) {
        $cats | ForEach-Object { Write-Host "  $_" }
        $foundCategories = $true
    }
}

if (-not $foundCategories) {
    # 备用方法：直接搜索 categories 数组
    $catMatches = [regex]::Matches($content, '"categories"\s*:\s*\[((?:"[^"]*"(?:\s*,\s*)?)*)\]')
    foreach ($m in $catMatches) {
        $catContent = $m.Groups[1].Value
        if ($catContent -and $catContent.Trim()) {
            $cats = [regex]::Matches($catContent, '"([^"]+)"') | ForEach-Object { $_.Groups[1].Value }
            if ($cats.Count -gt 0) {
                $cats | ForEach-Object { Write-Host "  $_" }
                $foundCategories = $true
                break
            }
        }
    }
}

if (-not $foundCategories) {
    Write-Host "  (not found or empty)"
}

# 提取标签
Write-Host ""
Write-Host "=== Labels ==="
$foundLabels = $false

if ($storeData -and $storeData.state -and $storeData.state.labels) {
    $labels = $storeData.state.labels
    if ($labels.Count -gt 0) {
        $labels | ForEach-Object { Write-Host "  $_" }
        $foundLabels = $true
    }
}

if (-not $foundLabels) {
    # 备用方法：查找顶层 labels 数组（排除 projects 内嵌的 labels）
    # 顶层 labels 通常有多个预设标签
    $labelMatches = [regex]::Matches($content, '"labels"\s*:\s*\[((?:"[^"]*"(?:\s*,\s*)?)*)\]')
    foreach ($m in $labelMatches) {
        $labelContent = $m.Groups[1].Value
        if ($labelContent -and $labelContent.Trim()) {
            $labels = [regex]::Matches($labelContent, '"([^"]+)"') | ForEach-Object { $_.Groups[1].Value }
            # 只处理包含多个标签的（顶层标签列表通常有很多预设）
            if ($labels.Count -ge 5) {
                $labels | ForEach-Object { Write-Host "  $_" }
                $foundLabels = $true
                break
            }
        }
    }
}

if (-not $foundLabels) {
    Write-Host "  (not found or using defaults)"
}

# 提取编辑器
Write-Host ""
Write-Host "=== Editors ==="
$foundEditors = $false

if ($storeData -and $storeData.state -and $storeData.state.editors) {
    $editors = $storeData.state.editors
    if ($editors.Count -gt 0) {
        $editors | ForEach-Object {
            Write-Host "  $($_.name) -> $($_.path)"
        }
        $foundEditors = $true
    }
}

if (-not $foundEditors) {
    # 备用方法：搜索 editors 数组中的对象
    # 格式: "editors":[{"id":"...","name":"...","path":"..."},...]
    $editorMatches = [regex]::Matches($content, '"editors"\s*:\s*\[(\{[^\]]+)\]')
    foreach ($m in $editorMatches) {
        $editorContent = '[' + $m.Groups[1].Value + ']'
        try {
            # 尝试修复可能不完整的 JSON
            if (-not $editorContent.EndsWith('}]')) {
                $editorContent = $editorContent -replace ',?\s*$', ']'
            }
            $editors = $editorContent | ConvertFrom-Json -ErrorAction Stop
            if ($editors.Count -gt 0) {
                $editors | ForEach-Object {
                    if ($_.name -and $_.path) {
                        Write-Host "  $($_.name) -> $($_.path)"
                    }
                }
                $foundEditors = $true
                break
            }
        } catch {}
    }
}

if (-not $foundEditors) {
    Write-Host "  (not found or empty)"
}

# 提取项目路径
Write-Host ""
Write-Host "=== Project Paths ==="
$foundProjects = $false

if ($storeData -and $storeData.state -and $storeData.state.projects) {
    $projects = $storeData.state.projects
    if ($projects.Count -gt 0) {
        $projects | ForEach-Object {
            if ($_.path) {
                Write-Host "  $($_.path)"
            }
        }
        $foundProjects = $true
    }
}

if (-not $foundProjects) {
    # 备用方法：搜索所有 path 字段
    $pathMatches = [regex]::Matches($content, '"path"\s*:\s*"([^"]+)"')
    $paths = $pathMatches | ForEach-Object { $_.Groups[1].Value } | Select-Object -Unique | Where-Object { $_ -match '^[A-Za-z]:' -or $_ -match '^/' }
    if ($paths) {
        $paths | ForEach-Object { Write-Host "  $_" }
        $foundProjects = $true
    }
}

if (-not $foundProjects) {
    Write-Host "  (not found)"
}

Write-Host ""
Write-Host "========================================"
Write-Host ""
Write-Host "New data location: <App Install Dir>\data\"
Write-Host ""

Read-Host "Press Enter to exit"
