/* 注入脚本：把桌面原型 HTML 生成为数据驱动的前端 public/index.html
 * 保留全部 CSS/视觉，仅注入：弹窗样式 + 登录模态 + 通用 CRUD 弹窗 + app.js
 */
const fs = require('fs');
const path = require('path');
const ROOT = __dirname;
const SRC = process.env.PROTOTYPE_HTML || path.join(ROOT, 'prototype.html');
const OUT = path.join(ROOT, 'public', 'index.html');

let html = fs.readFileSync(SRC, 'utf8');

const style = `<style>
.modal-mask{position:fixed;inset:0;background:rgba(2,8,20,.72);backdrop-filter:blur(6px);display:none;align-items:center;justify-content:center;z-index:9999}
.modal-card{background:#ffffff;border:1px solid var(--border);border-radius:16px;padding:22px;width:460px;max-width:92vw;max-height:86vh;overflow:auto;box-shadow:0 20px 60px rgba(15,23,42,.18)}
.modal-head{display:flex;justify-content:space-between;align-items:center;font-size:15px;font-weight:600;color:var(--txt-0);margin-bottom:14px}
.modal-close{cursor:pointer;font-size:22px;color:var(--txt-3);line-height:1}
.modal-body{display:flex;flex-direction:column;gap:12px}
.modal-foot{display:flex;justify-content:flex-end;gap:10px;margin-top:18px}
.form-row{display:flex;flex-direction:column;gap:5px}
.form-row label{font-size:12px;color:var(--txt-2)}
.form-row input,.form-row select{background:var(--panel-2);border:1px solid var(--border);color:var(--txt-0);border-radius:8px;padding:9px 11px;font-size:13px;width:100%;outline:none}
.form-row input:focus,.form-row select:focus{border-color:var(--dh-blue-2)}
#loginMask .logo-text{margin-bottom:6px}
</style>`;

const login = `<div id="loginMask" class="modal-mask" style="display:none">
  <div class="modal-card" style="width:360px">
    <div class="logo-text" style="margin-bottom:18px"><span class="lt1">AI招商智能体平台</span><span class="lt2">管理端登录</span></div>
    <div class="form-row"><label>账号</label><input id="loginUser" type="text" placeholder="请输入账号" autocomplete="username"></div>
    <div class="form-row"><label>密码</label><input id="loginPass" type="password" placeholder="请输入密码" autocomplete="current-password"></div>
    <button class="btn btn-blue" style="width:100%;margin-top:10px;padding:11px" onclick="ZS.login()">登 录</button>
  </div>
</div>`;

const crud = `<div id="crudModal" class="modal-mask" style="display:none">
  <div class="modal-card">
    <div class="modal-head"><span id="crudTitle">新增</span><span class="modal-close" onclick="ZS.close()">×</span></div>
    <div id="crudForm" class="modal-body"></div>
    <div class="modal-foot"><button class="btn btn-ghost" onclick="ZS.close()">取消</button><button class="btn btn-blue" onclick="ZS.save()">保存</button></div>
  </div>
</div>`;

const inject = style + '\n' + login + '\n' + crud + '\n<script src="app.js"></script>\n';
html = html.replace('</body>', inject + '</body>');

fs.writeFileSync(OUT, html);
console.log('OK ->', OUT, '(', html.length, 'bytes )');
