#!/bin/bash
# 招商门户三版 UI 静态演示页部署脚本
# 用法：在 Mac 终端运行：bash /Users/a-6/WorkBuddy/2026-08-14-22-52-30/ai-zhaoshang/deploy_portal_preview.sh
# 说明：把本地 portal-preview/ 目录打包上传到阿里云 39.96.36.29 的 /var/www/html/portal-preview/
#       scp/ssh 会提示输入服务器密码，请输入：Xd199217
# 客户访问：http://39.96.36.29/portal-preview/

set -e
cd "$(dirname "$0")"

SERVER_IP="39.96.36.29"
SERVER_USER="root"
REMOTE_WEB_ROOT="/var/www/html"
PREVIEW_DIR="portal-preview"
LOCAL_DIR="/Users/a-6/WorkBuddy/2026-08-14-22-52-30/portal-preview"

echo "[1/3] 打包 UI 演示页 ..."
cd "$(dirname "$LOCAL_DIR")"
tar czf /tmp/portal-preview.tar.gz "$PREVIEW_DIR"

echo "[2/3] 上传到 ${SERVER_IP}（输入服务器密码: Xd199217）..."
scp -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null /tmp/portal-preview.tar.gz ${SERVER_USER}@${SERVER_IP}:/tmp/portal-preview.tar.gz

echo "[3/3] 解压到网站目录并授权 ..."
ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null ${SERVER_USER}@${SERVER_IP} \
  "rm -rf ${REMOTE_WEB_ROOT}/${PREVIEW_DIR} && mkdir -p ${REMOTE_WEB_ROOT}/${PREVIEW_DIR} && tar xzf /tmp/portal-preview.tar.gz -C ${REMOTE_WEB_ROOT}/ && chown -R www-data:www-data ${REMOTE_WEB_ROOT}/${PREVIEW_DIR} && echo DEPLOY_DONE"

echo ""
echo "✅ 部署完成"
echo "   客户访问地址：http://${SERVER_IP}/${PREVIEW_DIR}/"
echo ""
echo "   若页面未显示，可在服务器执行：nginx -s reload 或 systemctl restart nginx"
