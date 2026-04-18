#!/usr/bin/env bash
# 推送前校验 release.yml 的构建能跑通：前端 tsc+vite + 后端 cargo 编译校验。
# 严格对齐 CI 里 tauri-action 真正跑的东西：不强制 clippy、不跑 tests，
# 只抓 release 模式编译/类型错。完整 bundle 请自行：
#   npm run tauri build -- --target aarch64-apple-darwin --config src-tauri/tauri.release.conf.json

set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> [1/2] Frontend: npm install + tsc + vite build"
if [ -f package-lock.json ]; then
  npm ci
else
  npm install
fi
npm run build

echo "==> [2/2] Rust: cargo check --release (lib only, 对齐 tauri build)"
(cd src-tauri && cargo check --release --lib --bins)

echo
echo "✅ verify-release 通过。可以安全推到 release/** 分支。"
echo "   tip: 如需跑 clippy（可能报历史告警），单独执行："
echo "        (cd src-tauri && cargo clippy --release)"

