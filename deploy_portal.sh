#!/bin/bash
# AI 招商智能体平台 · 前台门户部署脚本
# 用法：在项目目录运行 bash deploy_portal.sh
# 说明：需要提前配置 SSH 密钥，并通过环境变量 DEPLOY_HOST 指定服务器。
set -e
cd "$(dirname "$0")"

if [ -z "${DEPLOY_HOST:-}" ]; then
  echo "请先设置 DEPLOY_HOST，例如：DEPLOY_HOST=user@example.com bash deploy_portal.sh"
  exit 1
fi

echo "[1/3] 打包更新文件 (server.js + 前台 portal.html + 后台接入) ..."
tar czf /tmp/portal_update.tar.gz server.js portal-service.js public/index.html public/app.js public/portal.html public/portal-workspace.css public/portal-workspace.js public/portal-tools.js public/portal-tools.css

echo "[2/3] 上传更新包 ..."
scp /tmp/portal_update.tar.gz "${DEPLOY_HOST}:/tmp/"

echo "[3/3] 解压并重启服务 ..."
ssh "${DEPLOY_HOST}" \
  "cd /opt/ai-zhaoshang && tar xzf /tmp/portal_update.tar.gz && (pm2 restart ai-zhaoshang || pm2 restart all) && sleep 2 && pm2 list && echo DEPLOY_DONE"

echo ""
echo "✅ 部署完成"
echo "请按实际部署地址访问前台门户和运营后台。"
