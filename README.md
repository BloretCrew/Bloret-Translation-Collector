# Bloret Translation Collector

类似 Crowdin 的翻译收集平台：**组织 → 项目 → 文件 → 语言**。

- 登录： [Bloret PassPort](https://passport.bloret.net/) OAuth（见 `docs/OauthAPI.md`）
- UI： [Blora Design 2](./docs/blora-design-2/)
- 栈：**Express + EJS** · TypeScript · PostgreSQL · Drizzle ORM
- 日志：遵循 [CONSOLE-LOG-SPEC](https://github.com/BloretCrew/CONSOLE-LOG-SPEC)（`Logger` + `./log/BTC-*.log`）

> 生产启动为 **Express + 预编译 dist**（无 Next.js）。首次 `npm start` 会自动 `esbuild` 一次，之后冷启动应在数秒内完成。

## 本地启动

### 1. 依赖

```bash
npm install
```

### 2. 配置文件

所有运行配置集中在项目根目录 **`config.json`**（可从 `config.example.json` 复制）：

```bash
cp config.example.json config.json
# 编辑 config.json
```

| 字段 | 说明 |
|------|------|
| `port` | 应用监听端口，默认 `3000` |
| `database.host` | 数据库主机 |
| `database.port` | 数据库端口，默认 `5432` |
| `database.user` | 数据库用户名 |
| `database.password` | 数据库密码 |
| `database.name` | 数据库名 |
| `database.ssl` | 是否 SSL，默认 `false` |
| `sessionSecret` | 会话加密密钥（≥32 字符） |
| `cookieSecure` | HTTPS 时为 `true`；HTTP 面板部署请用 `false` |
| `appName` | 应用显示名 |
| `passport.appId` / `appSecret` | Bloret PassPort OAuth |
| `passport.baseUrl` | 默认 `https://passport.bloret.net` |
| `passport.redirectUri` | 回调地址，须与 PassPort 白名单一致 |

### 3. 数据库

```bash
docker compose up -d   # 或使用已有 PostgreSQL
npm run db:push
# 或
npm run db:generate && npm run db:migrate
```

### 4. PassPort OAuth（可选）

在 PassPort 注册应用，回调地址与 `config.json` 中 `passport.redirectUri` 一致，权限建议：`user:name`、`user:head`。

**未配置 OAuth 时**：`/auth/login?user=dev-user&dev=1` 开发登录。

### 5. 启动

```bash
# 开发（tsx watch 热重载）
npm run dev

# 生产
npm run build   # 可选；npm start 发现 dist 过期时会自动构建
npm start
# 或 MCSM 面板：
bash start.sh
```

打开 http://localhost:3000（端口以 `config.json` 为准）

## 功能（MVP）

| 能力 | 说明 |
|------|------|
| 组织 / 成员 | 创建组织；Owner 按 PassPort 用户名添加成员 |
| 项目 / 语言 | 源语言 + 多目标语言 |
| JSON 源文件 | 扁平 / 嵌套 JSON；更新源保留译文 |
| 翻译工作台 | 身份切换（翻译/审核）、筛选未译、搜索、自动保存；`?mode=translate\|proofread` |
| 进度 | 按语言完成率 |
| 导出 | 按语言下载 JSON（保留结构） |

## 脚本

| 命令 | 说明 |
|------|------|
| `npm run dev` | 开发（热重载） |
| `npm run build` | 打包 `dist/server.mjs`（加速冷启动） |
| `npm start` | 生产启动（优先跑 dist） |
| `npm run lint` | TypeScript 类型检查 |
| `npm run db:push` | 推送 schema 到数据库 |
| `npm run db:generate` | 生成迁移 |
| `npm run db:seed` | 写入 demo 组织/项目/示例 JSON |
| `npm test` | 单元测试（JSON 管道） |

## 主要页面

| 路径 | 说明 |
|------|------|
| `/` | 落地页 |
| `/app` | 组织列表 |
| `/app/o/[org]` | 组织：项目与成员 |
| `/app/o/[org]/p/[project]` | 项目：进度、源文件、上传 |
| `/app/o/[org]/p/[project]/translate` | 翻译工作台 |
| `/app/settings` | 用户设置（翻译快捷键等） |
| `/api/health` | 健康检查 |
| `/api/v1/*` | JSON API |

## 目录结构

```
src/
  server.ts          # 入口
  app.ts             # Express 应用
  routes/            # 页面 + API + Auth
  lib/               # 配置、DB、权限、业务
views/               # EJS 模板
public/              # 静态资源（Blora、CSS、JS）
```
