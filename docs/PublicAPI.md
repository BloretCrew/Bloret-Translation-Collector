# Bloret Translation — 公开 API

面向启动器、站点与第三方程序的 **只读** 接口。  
基址示例：`https://tr.bloret.net`（以实际部署为准）。

| 接口 | 用途 |
|------|------|
| [项目 Manifest](#1-项目-manifest) | 获取公开项目的元数据、语言列表、贡献者、链接 |
| [实时译文文件](#2-实时译文文件) | 按源文件结构，实时返回填好译文的完整文件正文 |

---

## 通用约定

### Base path

```
/api/v1
```

### 鉴权

| 接口 | 公开项目 | 私有项目 |
|------|----------|----------|
| Manifest | **无需登录**（仅当组织与项目均为 `public`） | 不可见（404） |
| 实时译文文件 | **无需登录**（项目 `visibility === public`） | 需登录且对该项目有访问权限 |

- 公开接口挂在认证门之前；私有资源**不**用 403 区分「不存在 / 无权限」时，对匿名请求尽量返回 **404**，避免枚举。
- 需要登录时，与站点相同：携带会话 Cookie（`bloret_translation_session`），或先走 PassPort 登录（见 `docs/OauthAPI.md`）。

### 错误响应

失败时一般为 JSON：

```json
{ "error": "说明文字", "code": "可选错误码" }
```

| HTTP | 常见含义 |
|------|----------|
| `400` | 参数错误（如缺少 `locale`、语言未启用） |
| `401` | 未登录（私有项目拉译文时） |
| `403` | 已登录但无权限 |
| `404` | 组织 / 项目 / 文件不存在，或非公开资源对匿名不可见 |
| `500` | 服务器错误 |

### 路径参数

| 参数 | 说明 |
|------|------|
| `orgSlug` | 组织 URL 标识（如 `bloret`） |
| `projectSlug` | 项目 URL 标识（如 `bloret-launcher`） |
| `fileId` | 源文件 UUID（在项目「源文件」页或内部 API 可获得） |

---

## 1. 项目 Manifest

获取**公开**项目的展示用元数据：目标语言、约定文件名、贡献者用户名、项目链接等。  
适合启动器语言列表、关于页、贡献者墙。

### 请求

```http
GET /api/v1/orgs/{orgSlug}/projects/{projectSlug}/manifest
```

- **鉴权**：无需登录  
- **可见条件**：组织 `visibility = public` **且** 项目 `visibility = public`；否则 **404**

**示例：**

```http
GET https://tr.bloret.net/api/v1/orgs/bloret/projects/bloret-launcher/manifest
```

```bash
curl -sS "https://tr.bloret.net/api/v1/orgs/bloret/projects/bloret-launcher/manifest"
```

### 成功响应 `200 OK`

`Content-Type: application/json`

```json
{
  "lang": {
    "en": {
      "name": "英语",
      "file": "en.json",
      "contributor": []
    },
    "gt": {
      "name": "梗体中文",
      "file": "gt.json",
      "contributor": ["Detrital", "Rhedar"]
    },
    "ru": {
      "name": "俄语",
      "file": "ru.json",
      "contributor": []
    }
  },
  "project": {
    "owner": "Detrital",
    "link": "https://tr.bloret.net/app/o/bloret/p/bloret-launcher",
    "name": "Bloret Launcher",
    "slug": "bloret-launcher",
    "description": "…",
    "sourceLocale": "zh-CN",
    "iconUrl": "https://img.bloret.net/img/…",
    "org": "Bloret",
    "orgSlug": "bloret"
  }
}
```

#### `lang`（对象，key = locale 代码）

| 字段 | 类型 | 说明 |
|------|------|------|
| `name` | string | 显示名（项目里配置的 `displayName`，否则为 locale 代码） |
| `file` | string | 约定导出名：`{locale}.json`（展示用，不代表磁盘上真实源路径） |
| `contributor` | string[] | 该语言下提交过**非空译文建议**的用户名（去重） |

仅包含项目中 **enabled** 的目标语言。

#### `project`

| 字段 | 类型 | 说明 |
|------|------|------|
| `owner` | string | 组织 **owner** 成员用户名；若无则回退为组织名称 |
| `link` | string | 项目在本站的绝对 URL（由 OAuth `redirectUri` 推导站点源） |
| `name` | string | 项目名称 |
| `slug` | string | 项目 slug |
| `description` | string \| null | 简介 |
| `sourceLocale` | string | 源语言代码 |
| `iconUrl` | string \| null | 项目图标 URL |
| `org` | string | 组织名称 |
| `orgSlug` | string | 组织 slug |

### 失败示例

```http
GET /api/v1/orgs/bloret/projects/does-not-exist/manifest
→ 404 { "error": "未找到", "code": "NOT_FOUND" }
```

私有组织或私有项目对匿名同样 **404**。

### 客户端用法提示

1. 用 `lang` 的 key 作为 UI 语言列表；`name` 作展示。  
2. `contributor` 仅反映「提交过建议」的用户，**不要求**已批准。  
3. `file` 为约定文件名；若要下载**真实译文文件内容**，请用下方 [实时译文文件](#2-实时译文文件) 接口（需 `fileId`）。

---

## 2. 实时译文文件

对**某一个源文件** + **某一个目标语言**，按源文件原始结构（键序、缩进等尽量保真）填入当前译文，**HTTP body 即为完整文件正文**（不是 ZIP、不是 `Content-Disposition: attachment`、不是再包一层 JSON）。

适合：启动器按语言拉 `lang/xx.json`、CI 同步、实时预览。

### 请求

```http
GET /api/v1/orgs/{orgSlug}/projects/{projectSlug}/files/{fileId}/translated
```

**Query 参数：**

| 参数 | 必选 | 默认 | 说明 |
|------|------|------|------|
| `locale` | **是** | — | 目标语言代码（须为项目已启用的目标语言） |
| `mode` | 否 | `top_voted` | 译文选取策略，见下表 |
| `fallbackMt` | 否 | 关 | `1` 或 `true`：缺失项用已上传的**机器翻译文件**兜底 |

**`mode` 取值：**

| 值 | 含义 |
|----|------|
| `top_voted` | **默认**。已批准优先；否则取该串最高票（或最新）非空建议 |
| `approved` | 仅已批准译文；无批准则按「缺省」规则（通常为空串，见导出逻辑） |
| `source` | 无译文时保留**源文** |
| `empty` | 无译文时写**空串** |

**`fallbackMt=1` 时的优先级：**

1. 按 `mode` 得到的人工译文（批准 / 建议等）  
2. 该项目该语言下已上传的机器翻译（`machine_translations`）  
3. 再按 `mode` 的 source / empty 行为  

**鉴权：**

| 项目可见性 | 访问 |
|------------|------|
| `public` | 匿名可读 |
| 非公开 | 需登录 + 项目访问权限；未登录 → **401** |

**示例：**

```http
GET https://tr.bloret.net/api/v1/orgs/bloret/projects/bloret-launcher/files/cd3f495d-eb9e-466f-888e-93df7eeef861/translated?locale=gt&mode=top_voted
```

```bash
# 公开项目，匿名拉取
curl -sS \
  "https://tr.bloret.net/api/v1/orgs/bloret/projects/bloret-launcher/files/<fileId>/translated?locale=ru&mode=top_voted&fallbackMt=1" \
  -o ru.json

# 查看元数据头
curl -sS -D - -o /dev/null \
  "https://tr.bloret.net/api/v1/orgs/bloret/projects/bloret-launcher/files/<fileId>/translated?locale=gt"
```

### 如何取得 `fileId`

- 登录后打开：`/app/o/{org}/p/{project}/sources`  
- 或调用需登录的源文件相关 API（工作台 / 项目 API 返回的 `files[].id`）  
- Manifest **不**返回 `fileId`；需自行维护或从站内获取

### 成功响应 `200 OK`

- **Body**：完整译文文件文本（如 JSON 对象文本、`.properties` 文本）  
- **不设** `Content-Disposition: attachment`（便于 `fetch` / `curl` 当普通资源读）

**响应头：**

| 头 | 说明 |
|----|------|
| `Content-Type` | 按源格式，如 `application/json; charset=utf-8` 或 properties 对应类型 |
| `X-File-Path` | 源文件在项目内的 path（如 `zh-cn.json`） |
| `X-Locale` | 本次目标语言 |
| `X-Export-Mode` | 实际使用的 `mode` |
| `X-Export-Fidelity` | `exact`（有原文 `rawContent` 保真写出）或 `best-effort` |
| `Cache-Control` | `no-store`（译文会变，客户端勿长期缓存） |

**Body 示例（结构示意）：**

```json
{
  "texts": {
    "设置": "Настройки",
    "登录": "Войти"
  }
}
```

具体键结构与源文件一致。

### 失败示例

| 场景 | HTTP |
|------|------|
| 缺少 `locale` | 400 |
| `locale` 未在项目启用 | 400 |
| 公开项目、错误 `fileId` | 404 |
| 私有项目、未登录 | 401 |
| 私有项目、无权限 | 403 |

```json
{ "error": "缺少 locale" }
```

```json
{ "error": "未找到", "code": "NOT_FOUND" }
```

### 与站内「导出」页的关系

| | 本接口 | `/api/v1/.../export`（导出页） |
|--|--------|--------------------------------|
| 登录 | 公开项目可不登录 | 必须登录 |
| 形态 | **单文件 body** | 可 ZIP / Bundle / 附件下载 |
| 用途 | 程序实时拉取 | 人工下载整包 |

内部共用同一套导出/保真逻辑（`exportFileLocale`）。

---

## 典型集成流程（启动器）

```
1. GET .../projects/{slug}/manifest
   → 得到语言列表、贡献者、项目 link

2. 用站内或配置得到源文件 fileId（若只有一个源文件可写死/缓存）

3. 对用户所选 locale：
   GET .../files/{fileId}/translated?locale={locale}&mode=top_voted
   → 保存为本地 lang 文件或载入内存
```

可选：`fallbackMt=1` 在人工译文不全时用项目方上传的机器翻译补洞。

### 本站 UI 自用（dogfood）

`tr.bloret.net` 自身界面文案也走上述两接口：在 `config.json` 中配置 `uiI18n`（`orgSlug` / `projectSlug` / `fileId` / `localeMap`），由 `src/lib/ui-i18n-live.ts` 在请求中间件中按 TTL 刷新 `en`/`ru` 等目录并与磁盘 `lang/*.json` 合并。这保证公开 API 与站内体验同源。

---

## 版本与变更

| 接口 | 引入说明 |
|------|----------|
| Manifest | 公开项目元数据，供第三方展示 |
| Translated file | 公开/授权下实时单文件译文正文 |

实现位置：`src/routes/api/orgs.ts`（`publicOrgsRouter`），挂载于 `src/routes/api/index.ts` 认证门之前。

相关文档：

- 登录 OAuth：`docs/OauthAPI.md`  
- 项目总览：`README.md`
