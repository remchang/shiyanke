# Ghost 6.10.3 Windows 手动安装与启动脚本
# 适用：Windows 10/11 + Node 18+（本机实测 Node v22.23.2），无 WSL、无 Docker
# 用途：实验01 冷启动复现；把 Ghost 6.10.3 跑在本地 2368 端口
# 用法：打开 PowerShell，cd 到本仓库，然后执行  .\scripts\anzhuang.ps1
# 说明：本脚本是可重复执行的一份“安装说明书”，核心原理全部来自 README.md 的安装记录。

param(
    [string]$MuLu = "D:\shiyanke-yunxing"
)

$ErrorActionPreference = "Stop"

# ---------- 0. 检查环境 ----------
Write-Host "==> 检查 Node / npm / git"
node --version
npm --version
git --version

# ---------- 1. 建运行目录 ----------
if (-not (Test-Path $MuLu)) {
    New-Item -ItemType Directory -Path $MuLu | Out-Null
}
Set-Location $MuLu

# ---------- 2. 准备 package.json（版本号必须和 Ghost 一致，否则主题会被按 v1 校验）----------
$PackageNeirong = @"
{
  "name": "shiyanke-ghost-yunxing",
  "version": "6.10.3",
  "private": true,
  "description": "实验01 Ghost 6.10.3 手动运行目录",
  "scripts": {
    "start": "node node_modules/ghost/ghost.js",
    "test": "node ..\\tests\\zidong\\ceshi.js"
  }
}
"@
if (-not (Test-Path "package.json")) {
    Set-Content -Path "package.json" -Value $PackageNeirong -Encoding UTF8
}

# ---------- 3. 配 npm 国内镜像 + 缓存放 D 盘（C 盘空间不够才这么干）----------
npm config set registry https://registry.npmmirror.com
npm config set cache D:\npm-cache

# ---------- 4. 装 Ghost 的普通依赖 ----------
if (-not (Test-Path "node_modules\ghost\ghost.js")) {
    Write-Host "==> 安装 Ghost 依赖（先装依赖，最后再解包，否则 npm 会把 ghost 当冗余删掉）"
    npm init -y | Out-Null
    npm install ghost@6.10.3 --legacy-peer-deps --ignore-scripts 2>&1 | Select-Object -Last 3
}

# ---------- 5. 解包 Ghost 本体（从 npm 缓存里的 tgz 或直接重新下载）----------
if (-not (Test-Path "node_modules\ghost\ghost.js")) {
    Write-Host "==> 解包 ghost-6.10.3.tgz"
    # 先找 npm 缓存的 tgz；找不到就用 gh-pages 等位置，或者手工放一个 ghost-6.10.3.tgz 在运行目录
    $Tgz = Get-ChildItem -Path "D:\npm-cache" -Recurse -Filter "ghost-6.10.3.tgz" -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($Tgz) {
        New-Item -ItemType Directory -Path "node_modules\ghost" -Force | Out-Null
        tar -xzf $Tgz.FullName -C "node_modules\ghost"
        # 把内置 i18n 组件解到 @tryghost/i18n（Ghost 包依赖它但 npm 不会自动装）
        $I18nTgz = Get-ChildItem -Path "D:\npm-cache" -Recurse -Filter "tryghost-i18n-6.10.3.tgz" -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($I18nTgz) {
            New-Item -ItemType Directory -Path "node_modules\@tryghost\i18n" -Force | Out-Null
            tar -xzf $I18nTgz.FullName -C "node_modules\@tryghost\i18n"
        }
    } else {
        Write-Host "没找到 ghost-6.10.3.tgz 缓存，请手工下载 Ghost 6.10.3 源码包放到 $MuLu 再解包。"
    }
}

# ---------- 6. 修几个依赖坑 ----------
# 6.1 lodash.template 固定 4.5.0（4.18.0 的 assignWith 未定义）
npm install lodash.template@4.5.0 --legacy-peer-deps --ignore-scripts 2>&1 | Select-Object -Last 1
# 6.2 i18next 版本补装
npm install i18next@23.16.8 --legacy-peer-deps --ignore-scripts 2>&1 | Select-Object -Last 1
# 6.3 sqlite3 用 npmmirror 预编译二进制（本机没有 VS 工具链，源码编译必挂）
if (Test-Path "node_modules\sqlite3\lib\binding\node-v127-win32-x64\sqlite3.node") {
    Write-Host "sqlite3 预编译二进制已就位"
} else {
    Write-Host "==> 下载 sqlite3 预编译二进制（npmmirror）"
    $SqliteUrl = "https://cdn.npmmirror.com/binaries/sqlite3/v5.1.7/sqlite3-v5.1.7-napi-v6-win32-x64.tar.gz"
    Invoke-WebRequest -Uri $SqliteUrl -OutFile "D:\sqlite3-prebuilt.tar.gz"
    New-Item -ItemType Directory -Path "node_modules\sqlite3\lib\binding" -Force | Out-Null
    tar -xzf "D:\sqlite3-prebuilt.tar.gz" -C "node_modules\sqlite3\lib\binding"
    Remove-Item "D:\sqlite3-prebuilt.tar.gz"
}

# ---------- 7. 配置 config.development.json ----------
$PeiZhi = @{
    url = "http://127.0.0.1:2368/"
    server = @{ port = 2368; host = "127.0.0.1" }
    security = @{ staffDeviceVerification = $false }
    comments = @{ url = "/assets/js/comments-ui.min.js" }
    database = @{
        client = "sqlite3"
        connection = @{ filename = "content/data/ghost-dev.db" }
        useNullAsDefault = $true
    }
    paths = @{ contentPath = "content/" }
    mail = @{
        transport = "smtp"
        options = @{ host = "127.0.0.1"; port = 25 }
    }
}
if (-not (Test-Path "config.development.json")) {
    $PeiZhi | ConvertTo-Json -Depth 6 | Set-Content -Path "config.development.json" -Encoding UTF8
}

# ---------- 8. 放主题（把 theme 目录复制进 content/themes）----------
$ZhutiYuan = Join-Path (Split-Path $PSScriptRoot -Parent) "theme\shiyanke-theme"
if (-not (Test-Path "content\themes\shiyanke-theme")) {
    New-Item -ItemType Directory -Path "content\themes" -Force | Out-Null
    Copy-Item -Path $ZhutiYuan -Destination "content\themes\shiyanke-theme" -Recurse
}

# ---------- 9. 初始化站点（第一次需要建管理员账号）----------
if (-not (Test-Path "content\data\ghost-dev.db")) {
    Write-Host "==> 数据库还不存在，启动一次让 Ghost 建库，然后打开 http://127.0.0.1:2368/ghost/ 完成初始化"
}

# ---------- 10. 启动 ----------
Write-Host "==> 启动 Ghost（前台），看到 Ghost booted 后访问 http://127.0.0.1:2368/"
$env:NODE_ENV = "development"
node node_modules\ghost\ghost.js
