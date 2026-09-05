# AI 招商智能体平台

Node.js 单体应用，包含前台智能招商工作台、后台运营管理、客商线索跟进、知识审核、评分/信号计算、资料解析和 Excel 导出。

## 本地启动

要求 Node.js 20 或更高版本。

```bash
npm ci
INITIAL_ADMIN_PASSWORD='请替换为至少12位强密码' npm start
```

管理端访问 `http://127.0.0.1:8765/`，前台访问 `http://127.0.0.1:8765/portal.html`。运行时数据保存在 `data/`，不会提交到 Git。

## 生产部署

1. 复制 `.env.example` 为 `.env`，设置强管理员密码和所需第三方 API Key。
2. 执行 `docker build -t ai-zhaoshang .`，再执行 `docker run -d --name ai-zhaoshang --restart unless-stopped --env-file .env -p 127.0.0.1:8765:8765 -v ai-zhaoshang-data:/app/data ai-zhaoshang`；或在现有 PM2 服务器上运行 `DEPLOY_HOST=user@host bash deploy_portal.sh`。
3. 定期备份 `data/` 持久化目录，限制服务器及环境变量的访问权限。

## 验收范围

- 无第三方依赖：前台资源匹配、会话与私有资料、报告、留资，后台项目、线索分配/跟进/提醒、知识审核、评分和信号、用户权限、站内信、审计及 Excel 导入导出。
- 资料上传支持 TXT、Markdown、CSV、XLSX/XLS、DOCX 和带文字层的 PDF；扫描件 PDF 需另外接入 OCR。
- 第三方边界：天眼查、企查查、正式招投标数据等需客户凭据和最终接口文档；未接入时界面明确显示“待接入客户 API”。

生产密钥只从环境变量读取，不能通过管理页面保存。上线前必须轮换历史提交中曾出现过的 DeepSeek Key。

### 招投标测试采集

“招投标采集配置”页面可手动采集中国政府采购网公开招标公告和中标公告。测试采集器只读取无需登录的公开列表，不绕过验证码或反爬限制；数据会按公开链接去重，并与启用的订阅关键词匹配。该功能用于联调和演示，正式上线应替换为客户授权的数据 API。

## 上线边界

当前 JSON 文件存储适合单实例、低并发场景。多实例部署、较高并发、复杂查询或严格事务要求，应先迁移到 PostgreSQL，并使用 Redis 或数据库会话。第三方工商数据接口需要按供应商正式文档完成签名、字段映射和错误码适配后才能作为真实业务数据验收。
