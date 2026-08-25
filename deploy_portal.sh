#!/bin/bash
# AI 招商智能体平台 · 前台门户部署脚本
# 用法：在 Mac 终端运行  bash /Users/a-6/WorkBuddy/2026-08-14-22-52-30/ai-zhaoshang/deploy_portal.sh
# 说明：脚本会从当前目录打包前端/后端更新文件，scp 到阿里云并重启 pm2。
#       scp/ssh 会提示输入服务器密码，请输入：Xd199217
set -e
cd "$(dirname "$0")"

echo "[1/3] 打包更新文件 (server.js + 前台 portal.html + 后台接入) ..."
tar czf /tmp/portal_update.tar.gz server.js public/index.html public/app.js public/portal.html

echo "[2/3] 上传到 39.96.36.29 （输入服务器密码: Xd199217）..."
scp -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null /tmp/portal_update.tar.gz root@39.96.36.29:/tmp/

echo "[3/3] 解压并重启服务 ..."
ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null root@39.96.36.29 \
  "cd /opt/ai-zhaoshang && tar xzf /tmp/portal_update.tar.gz && (pm2 restart ai-zhaoshang || pm2 restart all) && sleep 2 && pm2 list && echo DEPLOY_DONE"

echo ""
echo "✅ 部署完成"
echo "   前台门户(投资客商自助): http://39.96.36.29/ai-zhaoshang/portal.html"
echo "   运营后台(线索跟进):     http://39.96.36.29/ai-zhaoshang/   (admin / 123456)"
