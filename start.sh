#!/bin/bash
# MCSM / 面板启动入口：读取 config.json 后启动 Express
set -e
cd "$(dirname "$0")"

export PATH="/root/.nvm/versions/node/v24.13.1/bin:/usr/local/bin:/usr/bin:$PATH"

if [ ! -f config.json ]; then
  echo "[ERROR] 缺少 config.json，请复制 config.example.json 为 config.json"
  exit 1
fi

if [ ! -x node_modules/.bin/tsx ] && [ ! -f node_modules/.bin/tsx ]; then
  echo "[ERROR] 未找到 tsx，请先执行: npm install"
  exit 1
fi

exec node scripts/run-start.mjs
