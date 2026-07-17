# Bloret PassPort OAuth API 文档

本文档描述了第三方应用如何通过 Bloret PassPort 进行用户授权（OAuth 流程）以及获取用户信息的接口规范。

## 1. OAuth 授权流程

### 1.1 发起授权请求 (浏览器跳转)

第三方应用需要将用户重定向到此地址，以请求用户授权。

*   **接口地址**: `/app/oauth`
*   **请求方式**: `GET` (浏览器重定向)

**参数说明:**

| 参数名 | 必选 | 类型 | 说明 |
| :--- | :--- | :--- | :--- |
| `app_id` | 是 | String | 注册应用时获得的应用 ID |
| `redirect_uri` | 是 | String | 授权成功后的回调地址 (必须与注册时的白名单一致) |

**示例:**
```http
https://passport.bloret.net/app/oauth?app_id=YOUR_APP_ID&redirect_uri=https://your-app.com/callback
```

**处理逻辑:**
1.  如果用户未登录，将跳转至登录页面。
2.  用户登录后，展示授权页面，列出应用申请的权限。
3.  **用户拒绝**: 重定向回 `redirect_uri` (无 code 参数)。
4.  **用户同意**: 生成授权码 (`code`)，并重定向回 `redirect_uri`。

---

### 1.2 获取授权码 (回调)

用户同意授权后，浏览器将被重定向回 `redirect_uri`，并附带 `code` 参数。

**回调示例:**
```http
https://your-app.com/callback?code=f83e...random_hex_code...
```

*   **code**: 临时授权码，有效期通常很短，且**只能使用一次**。

---

## 2. 服务端接口

### 2.1 验证授权码并获取用户信息

第三方应用服务端收到 `code` 后，调用此接口换取用户信息或长期令牌。

*   **接口地址**: `/app/verify`
*   **请求方式**: `GET`
*   **Content-Type**: `application/json`

**参数说明:**

| 参数名 | 必选 | 类型 | 说明 |
| :--- | :--- | :--- | :--- |
| `app_id` | 是 | String | 应用 ID |
| `app_secret` | 是 | String | 应用密钥 (注册时获得) |
| `code` | 是 | String | 上一步回调中获取的授权码 |

**请求示例:**
```http
GET https://passport.bloret.net/app/verify?app_id=myApp&app_secret=mySecret&code=received_code
```

**响应参数 (成功 200 OK):**
返回的字段取决于应用注册时申请的**权限 (Permissions)**。

| 字段名 | 权限要求 | 说明 |
| :--- | :--- | :--- |
| `username` | `user:name` | 用户名 |
| `avatar` | `user:head` | 用户头像链接 |
| `password` | `user:password` | 用户密码 (通常为哈希值) |
| `email` | `user:email` | 用户邮箱 (如用户已绑定) |
| `admin` | `user:admin` | 是否为管理员 (true/false) |
| `tags` | `user:tags` | 用户标签数组 |
| `apptoken` | `app:usertoken` | **重要**: 长期用户令牌，用于后续调用数据存储 API |

**响应示例:**
```json
{
    "username": "exampleUser",
    "email": "user@example.com",
    "apptoken": "a1b2c3d4e5f6..."
}
```

**错误响应:**

| HTTP 状态码 | 原因 | 响应体示例 |
| :--- | :--- | :--- |
| 400 | 缺少参数 | `{"error": "缺少必要的参数"}` |
| 401 | 密钥错误 / ID 不匹配 | `{"error": "应用密钥不正确"}` |
| 404 | 应用不存在 / Code 无效 | `{"error": "授权码无效或已过期"}` |

---

### 2.2 验证 OAuth 应用身份（无需授权码）

用于仅验证 OAuth 应用身份是否真实，不涉及用户授权信息。

*   **接口地址**: `/app/oauthapp/validate`
*   **请求方式**: `GET`
*   **Content-Type**: `application/json`

**参数说明:**

| 参数名 | 必选 | 类型 | 说明 |
| :--- | :--- | :--- | :--- |
| `appname` | 是 | String | 应用名；可传应用 `id` 或应用 `name` |
| `appsecret` | 是 | String | 应用密钥 |

**请求示例:**
```http
GET https://passport.bloret.net/app/oauthapp/validate?appname=myApp&appsecret=mySecret
```

**成功响应示例（校验通过）:**
```json
{
    "status": "success",
    "valid": true,
    "app_id": "myApp",
    "app_name": "My App",
    "official": false
}
```

**成功响应示例（校验不通过）:**
```json
{
    "status": "success",
    "valid": false,
    "message": "应用不存在或密钥不正确"
}
```

**错误响应:**

| HTTP 状态码 | 原因 | 响应体示例 |
| :--- | :--- | :--- |
| 400 | 缺少参数 | `{"status": "error", "valid": false, "message": "缺少必要参数 appname 或 appsecret"}` |
| 500 | 服务器异常 | `{"status": "error", "valid": false, "message": "服务器错误"}` |

---

## 3. 应用数据存储 API (需 apptoken)

如果应用拥有 `app:usertoken` 权限并获取到了 `apptoken`，可以使用以下接口存储与该用户相关的应用数据。

### 3.1 保存数据
*   **接口地址**: `/app/data/save`
*   **请求方式**: `GET`

| 参数名 | 说明 |
| :--- | :--- |
| `app_id` | 应用 ID |
| `app_secret` | 应用密钥 |
| `user` | 用户名 (或 "public") |
| `usertoken` | `/app/verify` 接口获取的 `apptoken` (如果 user 为 public 则不需要) |
| `key` | 数据键名 |
| `data` | 要保存的数据内容 |

### 3.2 读取数据
*   **接口地址**: `/app/data/read`
*   **请求方式**: `GET`

| 参数名 | 说明 |
| :--- | :--- |
| `app_id` | 应用 ID |
| `app_secret` | 应用密钥 |
| `user` | 用户名 |
| `usertoken` | 用户的 `apptoken` |
| `key` | 数据键名 |

### 3.3 删除数据
*   **接口地址**: `/app/data/delete`
*   **请求方式**: `GET`

参数同上。

---

## 4. 权限说明 (Scopes)

在注册 OAuth 应用时，开发者需勾选以下权限，这将决定 `/app/verify` 接口返回的数据：

*   **user:name**: 允许访问用户的用户名。
*   **user:head**: 允许访问用户的头像链接。
*   **user:password**: 允许访问用户的密码哈希（慎用）。
*   **user:email**: 允许访问用户的邮箱地址。
*   **user:admin**: 允许查看用户是否为管理员。
*   **user:tags**: 允许访问用户的标签列表。
*   **app:usertoken**: 允许生成并获取该用户的长期访问令牌 (`apptoken`)，用于应用私有数据存储。

---

## 5. 管理员 API (Admin API)

以下接口仅供管理员或拥有管理员权限的 Token 调用。

### 5.1 设置用户标签
用于为指定用户设置标签。支持覆盖、追加或删除标签操作。

*   **接口地址**: `/api/admin/set-user-tags`
*   **请求方式**: `POST`
*   **Content-Type**: `application/json`
*   **鉴权**: 需要 **Config Token** (`config.token.feishubot`)

#### 请求参数 (Body)

| 参数名 | 类型 | 必填 | 说明 |
| :--- | :--- | :--- | :--- |
| `username` | string | 是 | 目标用户名 |
| `tags` | array | 是 | 标签字符串数组，例如 `["标签A", "标签B"]` |
| `type` | string | 否 | 操作类型，默认为 `cover`。<br>`cover`: 覆盖模式<br>`add`: 追加模式 (自动去重)<br>`remove`: 删除模式 |
| `token` | string | 是 | API 访问令牌 (对应配置文件中的 `token.feishubot`) |

#### 请求示例 (追加标签)