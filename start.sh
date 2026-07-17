#!/bin/bash
# MCSM / 面板启动入口：读取 config.json 后启动 Express
set -e
cd "$(dirname "$0")"

export PATH="/root/.nvm/versions/node/v24.13.1/bin:/usr/local/bin:/usr/bin:$PATH"

if [ ! -f config.json ]; then
  echo -e "\033[31m[ERROR]\033[0m 缺少 config.json，请复制 config.example.json 为 config.json"
  exit 1
fi

if [ ! -d node_modules ]; then
  echo -e "\033[31m[ERROR]\033[0m 未找到 node_modules，请先执行: npm install"
  exit 1
fi

# First start may build dist/server.mjs (esbuild); later starts are plain node
exec node scripts/run-start.mjs
