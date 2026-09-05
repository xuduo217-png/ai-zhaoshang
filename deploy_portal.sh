#!/bin/bash
# AI 招商智能体平台 · 前台门户部署脚本
# 用法：在项目目录运行 bash deploy_portal.sh
# 说明：需要提前配置 SSH 密钥，并通过环境变量 DEPLOY_HOST 指定服务器。
set -euo pipefail
cd "$(dirname "$0")"

if [ -z "${DEPLOY_HOST:-}" ]; then
  echo "请先设置 DEPLOY_HOST，例如：DEPLOY_HOST=user@example.com bash deploy_portal.sh"
  exit 1
fi

ARCHIVE="$(mktemp /tmp/ai-zhaoshang-update-XXXXXX.tar.gz)"
trap 'rm -f "$ARCHIVE"' EXIT

echo "[1/3] 打包应用与锁定依赖 ..."
tar czf "$ARCHIVE" package.json package-lock.json server.js portal-service.js public/index.html public/app.js public/portal.html public/portal-workspace.css public/portal-workspace.js public/portal-tools.js public/portal-tools.css

echo "[2/3] 上传更新包 ..."
scp "$ARCHIVE" "${DEPLOY_HOST}:/tmp/ai-zhaoshang-update.tar.gz"

echo "[3/3] 解压并重启服务 ..."
ssh "${DEPLOY_HOST}" 'bash -s' <<'REMOTE'
set -euo pipefail
APP_DIR=/opt/ai-zhaoshang
BACKUP_DIR="$(mktemp -d /opt/ai-zhaoshang-before-deploy-XXXXXX)"
cd "$APP_DIR"
cp --parents package.json package-lock.json server.js portal-service.js public/index.html public/app.js public/portal.html public/portal-workspace.css public/portal-workspace.js public/portal-tools.js public/portal-tools.css "$BACKUP_DIR"
rollback() {
  echo "部署失败，正在恢复 $BACKUP_DIR"
  cp -a "$BACKUP_DIR"/. "$APP_DIR"/
  npm ci --omit=dev
  pm2 restart ai-zhaoshang
}
trap rollback ERR
tar xzf /tmp/ai-zhaoshang-update.tar.gz
node --check server.js
node --check portal-service.js
node --check public/app.js
npm ci --omit=dev
pm2 restart ai-zhaoshang
sleep 2
curl --fail --silent http://127.0.0.1:3002/api/health >/dev/null
trap - ERR
pm2 list
echo "DEPLOY_DONE backup=$BACKUP_DIR"
REMOTE

echo ""
echo "✅ 部署完成"
echo "请按实际部署地址访问前台门户和运营后台。"
