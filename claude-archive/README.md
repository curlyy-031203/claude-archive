# Claude 档案 · 卷卷

一个端到端加密的 Claude 对话归档站，可以：

- 把 Claude.ai 的 Export Data zip 一键导入
- 手动粘贴单段对话保存
- 加密存到你的 Supabase，跨设备同步
- 选择若干段对话，用 DeepSeek 生成「上下文卡片」，粘贴到新 Claude 窗口让它快速进入状态

所有内容用主密码端到端加密（AES-GCM + PBKDF2 250k iterations）。主密码不存任何地方。

---

## 部署到 GitHub Pages

1. 把所有文件 push 到你的 `claude-archive` repo（保持目录结构）
2. repo → Settings → Pages → Source 选 `Deploy from a branch`，Branch 选 `main` / `(root)`，Save
3. 等 1-2 分钟，刷新这页，最上面出现 `Your site is live at https://你的用户名.github.io/claude-archive/`

## 第一次打开

会出现「初次启程」表单。填四样东西：

- **Supabase Project URL**（Supabase Dashboard → Project Settings → API）
- **Supabase anon public key**（同一页）
- **DeepSeek API key**（platform.deepseek.com → API keys）
- **主密码**（至少 12 字符，**忘了无法恢复**）

提交后会自动测试 Supabase 连接，成功就进主界面。

## 第二次起

只需要输主密码。可以勾选「本次会话内记住」，关掉标签页就清掉。

## 导入 Claude 对话

1. Claude.ai → Settings → Privacy → Export Data → 等邮件
2. 下载 zip
3. 主界面右上「导入」→ 选「从 Claude 导出包」→ 上传 zip
4. 可选地填默认标签 → 导入

## 生成上下文卡片

1. 右上「生成卡片」
2. 勾选要被「记住」的对话（最多 20 段）
3. 下一步：设标题、填可选的强调指令、选长度
4. 生成 → 可以编辑 → 复制或保存

把生成的卡片粘贴到新 Claude 窗口的第一条消息，它就能立刻进入你最近的状态。

---

## 数据安全

- 所有 title 和 content 都是 AES-GCM 加密后才进 Supabase
- DeepSeek API key 用主密码加密后存在 localStorage
- 主密码本身从不持久化（除非你勾选「会话内记住」，那也只在 sessionStorage）
- Supabase 后台、查源代码的人、抓包的人——都看不到你的明文内容
- 唯一一个明文出去的地方：生成卡片时，选中对话会被发到 DeepSeek API（这是必须的，它要读内容才能摘要）。DeepSeek 的 ToS 是不用于训练，但服务器侧有日志留存

## 重置

主界面右上 🔒 图标 = 锁定当前会话（不丢数据，下次输密码即可）

解锁页底部的「重置」按钮 = **清空本地凭据**，下次重新走 setup 流程。Supabase 里的数据不会被删，但如果你忘了主密码就再也解不开了。

## 技术栈

- 前端：纯 HTML/CSS/JS，无构建步骤
- 字体：Fraunces + DM Sans + LXGW WenKai + 思源宋体
- 加密：Web Crypto API (PBKDF2-SHA256 + AES-GCM 256bit)
- 存储：Supabase
- AI：DeepSeek API (`deepseek-chat`)
- 解析：JSZip

## 文件结构

```
claude-archive/
├── index.html
├── styles.css
├── README.md
└── js/
    ├── crypto.js     端到端加密
    ├── storage.js    localStorage 凭据管理
    ├── supabase.js   数据库 CRUD
    ├── deepseek.js   AI 摘要调用
    ├── parser.js     Claude export 解析
    ├── ui.js         界面交互
    └── app.js        启动入口
```
