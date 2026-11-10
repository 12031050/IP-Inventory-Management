# 飞牛OS（fnOS）开放 API 完整参考

> 来源：飞牛开发者平台官方文档 developer.fnnas.com/api/（2026-07-31 新增的第一期系统能力开放）。
> 当应用需要：在页面内完成文件/目录授权、打开系统页面（文件/文件管理器/应用设置/外部链接）、读取宿主语言主题、后端查询授权结果、检查文件权限、转换展示路径时，阅读本文件。
> **版本要求：系统版本 ≥ 1.2.0401，App 版本 ≥ 1.34.0。**

## 目录

1. 概述与设计目标
2. 调用方式（Scope 声明、JS SDK、运行环境、授权回调、后端 API、token）
3. 平台配置
4. 授权与文件概览
5. 应用共享授权路径（管理员）
6. 用户个人授权路径（当前用户）
7. 文件权限检查
8. 路径转换
9. 页面路由
10. 页面交互
11. 错误码

---

## 1. 概述与设计目标

开放 API 让第三方应用更自然地接入 fnOS：在自己的页面里完成文件授权、打开系统页面、读取界面语言和主题，后端查询授权结果、检查文件权限、转换路径。

这是系统能力开放**第一期**，重点是文件授权、页面路由、界面状态、后端查询。目标不是绕过系统权限，而是在体验与安全之间平衡：

- **提升体验**：用户不必离开应用去系统设置手动授权，可在应用流程内完成目录/文件选择
- **权限边界清晰**：访问用户文件前仍需用户/管理员明确授权；拿到授权路径后也不能绕过当前用户的文件权限
- **多用户场景**：结合统一网关识别当前使用用户，按用户查询授权目录、检查文件权限
- **复用系统页面**：打开文件、文件管理器、文件详情、应用设置、外部链接
- **适配宿主状态**：读取语言、主题、系统版本，Web 宿主中监听语言/主题变化

## 2. 调用方式

两类接口：

- **前端 JS SDK**：在应用页面调用，用于打开授权页、文件管理器、应用设置，读取平台配置、监听主题/语言变化
- **后端 API**：在应用服务端调用，用于查询授权路径、检查文件权限、读取平台配置

### 2.1 API Scope 声明（在 config/resource 中）

| 能力 | 需声明的 Scope |
|---|---|
| 应用共享授权管理 | `trim.file.sharedAccess` |
| 用户授权管理 | `trim.file.userAccess` |
| 文件权限检查 | `trim.file.userAcl` |
| 路径转换 | `trim.file.path` |
| 平台配置读取 | `trim.system.getPlatformConfig` |

```json
{
  "api-scope": [
    "trim.file.userAccess",
    "trim.file.userAcl"
  ]
}
```

**只声明确实会用到的 Scope，不要无脑写满。** 声明只是接入前提，实际可访问仍取决于用户授权、管理员设置和 token 校验。

### 2.2 前端 JS SDK

- **必须在 manifest 声明 `micro_app=true`**，否则页面不按微应用环境加载，JS SDK 无法初始化
- npm 包：`@trimjs/web-app`

```js
import { TrimApp } from '@trimjs/web-app';
const sdk = new TrimApp();
const config = await sdk.getPlatformConfig();
```

### 2.3 区分运行环境

| 属性 | 类型 | 说明 |
|---|---|---|
| `isWeb` | boolean | 当前运行时是否 Web 环境（移动端 App 内嵌页面通常为 `false`） |
| `isStandaloneWeb` | boolean | 是否独立浏览器页面（`true` 表示没运行在宿主环境中） |

文件选择/授权能力按 `isStandaloneWeb` 选择入口：

- `isStandaloneWeb === false`：宿主内，直接调 `pickSharedFile`、`pickUserFile`
- `isStandaloneWeb === true`：独立浏览器，调 `openAppAuth` 打开授权页，通过 `redirectUri` 接收结果

> 路由授权建议结合**统一网关**使用，保证应用页面、授权页、`redirectUri` 回调页同域，便于回调页 `postMessage` 同源校验。

`$on` 监听主题/语言变化**只支持 Web 宿主环境**（`isWeb === true && isStandaloneWeb === false`）。

### 2.4 处理授权回调

`openAppAuth` 建议默认 `target: '_blank'` 打开系统授权页，授权完成后系统跳转到 `redirectUri` 带回结果。回调页需完成两件事：

1. 用 `parseAppAuthCallback` 解析 URL 中的授权结果
2. 校验 `state` 后 `window.opener.postMessage` 通知原页面，再 `window.close()`

```js
// 回调页
import { TrimApp } from '@trimjs/web-app';
const sdk = new TrimApp();
const result = sdk.parseAppAuthCallback(window.location.href);
// 校验 result 中的 state
if (window.opener && !window.opener.closed) {
  window.opener.postMessage({ type: 'your-app:auth-result', result }, window.location.origin);
}
window.close();
```

```js
// 原页面监听
window.addEventListener('message', (event) => {
  if (event.origin !== window.location.origin) return;
  if (event.data?.type !== 'your-app:auth-result') return;
  refreshAccessiblePaths();
});
```

注意：

- `createAuthState()` 生成业务 `state`，回调页用它确认结果来自本次请求
- 部分浏览器（移动端/平板）`_blank` 可能开新标签页导致 `window.opener` 不存在 → **原页面保留"刷新授权状态"按钮**
- 也可用 `target: '_self'` 让回调链路更稳定（会跳转原页面）
- **必须由用户点击按钮触发 `openAppAuth`**，页面加载/定时器/异步回调里自动打开会被浏览器拦截

### 2.5 后端 API

统一入口：`POST /api/v1/trimapp`，**只能由应用服务端通过 Unix Socket `/var/run/trim_open_gateway_apiscope.socket` 访问**。不要在前端直接调用，不要把 token 暴露给前端。

```bash
curl --unix-socket /var/run/trim_open_gateway_apiscope.socket \
  -X POST http://localhost/api/v1/trimapp \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <token>' \
  -d '{"reqId":"1","req":"trim.system.getPlatformConfig","appName":"your-app","data":{}}'
```

请求结构：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `reqId` | string | 否 | 请求 ID，响应原样返回 |
| `req` | string | 是 | 后端能力标识 |
| `appName` | string | 是 | 应用名 |
| `data` | object | 否 | 具体接口参数 |

响应结构：

| 字段 | 类型 | 说明 |
|---|---|---|
| `reqId` | string | 对应请求 reqId |
| `code` | number | 业务码，`0` 成功 |
| `msg` | string | 错误/状态消息 |
| `data` | any | 接口响应数据 |

### 2.6 接口调用认证（token）

- token 由系统在调用应用脚本时自动注入到环境变量 **`TRIM_API_TOKEN`**，应用无需自己申请
- 后端进程从 `process.env.TRIM_API_TOKEN` 读取，放入 `Authorization` 头
- **`TRIM_API_TOKEN` 可能在重新注册/安装/环境变化后更新**：每次调用从当前进程环境变量读取，**不要持久化到数据库/文件/配置，不要写进前端或静态文件**

```js
const token = process.env.TRIM_API_TOKEN;
const result = await request({
  socketPath: '/var/run/trim_open_gateway_apiscope.socket',
  path: '/api/v1/trimapp',
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  body: { reqId: String(Date.now()), req: 'trim.system.getPlatformConfig', appName: 'your-app', data: {} },
});
```

## 3. 平台配置

| 接口 | 类型 | Scope |
|---|---|---|
| `getPlatformConfig` | 前端 JS SDK | 无 |
| `trim.system.getPlatformConfig` | 后端 API | `trim.system.getPlatformConfig` |

前端页面初始化**优先用 JS SDK `getPlatformConfig`**；只有后端渲染/后端逻辑需要判断系统语言版本时才用后端 API。

JS SDK 返回 `PlatformConfig`：

```js
{
  theme: 'light',            // 'dark' | 'light'
  language: 'zh-CN',
  systemLanguage: 'zh-CN',   // 可能为空
  appVersion: '...',         // 可能为空
  systemVersion: '1.2.0301',
  format: { date: 'YYYY-MM-DD', time: '24h' }
}
```

后端 `trim.system.getPlatformConfig` **只返回 `systemLanguage` 和 `systemVersion`**，`data` 传空对象。

## 4. 授权与文件概览

- 应用服务通常以**独立应用用户**运行（非当前登录用户），系统需把目标路径的 **ACL 权限授予应用用户**后才能访问
- 未接入授权接口时，只能引导用户去应用设置手动添加授权目录；接入后可在页面内直接打开选择框
- **选择器调用会直接返回本次授权结果**；后端查询授权结果主要用于页面刷新、服务重启后重新同步、后端业务读取已有授权路径
- **拿到授权路径和 ACL ≠ 绕过当前使用用户的系统权限**：返回内容前仍需按当前用户权限决定是否展示/读写/删除

选择授权方式：

- 不按使用用户区分内容 → 应用共享授权路径
- 按使用用户提供不同内容 → 用户个人授权路径

## 5. 应用共享授权路径（管理员操作，仅目录）

| 接口 | 类型 | Scope |
|---|---|---|
| `pickSharedFile` | 前端 JS SDK | `trim.file.sharedAccess` |
| `authorizeSharedFile` | 前端 JS SDK | `trim.file.sharedAccess` |
| `trim.file.getSharedAccessibleFolders` | 后端 API | `trim.file.sharedAccess` |
| `trim.file.delSharedAccessibleFolder` | 后端 API | `trim.file.sharedAccess` |

- **由管理员操作**；普通用户调用失败：宿主内直调返回 `code: 1` + `msg: "仅管理员可进行此操作"`；授权路由回调返回 `status: "error"` + `error: "access_denied"`
- **只支持目录授权**，不支持文件

```js
// 打开目录选择器
const result = await sdk.pickSharedFile({
  title: '选择授权目录',
  okText: '确认授权',
  sidebarGroup: ['myFiles', 'otherShare', 'favorites'],
});
```

- `authorizeSharedFile(path)`：已知目录重新申请授权
- 后端 `trim.file.getSharedAccessibleFolders`：查询授权目录，返回 `data.paths: string[]`
- 后端 `trim.file.delSharedAccessibleFolder`：`data: { path }`，返回 `data.suc: true`

`SharedFilePickerParams`：`title`、`okText`、`sidebarGroup`、`creatable`、`disabledPaths`。

## 6. 用户个人授权路径（当前用户，目录+文件）

| 接口 | 类型 | Scope |
|---|---|---|
| `pickUserFile` | 前端 JS SDK | `trim.file.userAccess` |
| `authorizeUserFile` | 前端 JS SDK | `trim.file.userAccess` |
| `trim.file.getUserAccessibleFolders` | 后端 API | `trim.file.userAccess` |
| `trim.file.delUserAccessibleFolder` | 后端 API | `trim.file.userAccess` |

- **建议结合统一网关**：用当前使用用户的 `uid` 查询/管理目录授权
- **目录授权只支持单选**（即使传 `multiple` 也按单个目录处理）
- **文件授权不会写入目录列表**，调用成功后直接用返回的文件路径

```js
// 目录授权
const result = await sdk.pickUserFile({ directory: true, title: '选择授权目录' });
// 文件授权，可限制扩展名
const files = await sdk.pickUserFile({ directory: false, accept: ['.jpeg', '.png'], sidebarGroup: ['myFiles'] });
```

- 后端 `trim.file.getUserAccessibleFolders`：`data: { uid }`（必填），返回 `data.paths`（仅目录）
- 后端 `trim.file.delUserAccessibleFolder`：`data: { uid, path }`

`FilePickerParams`：`multiple`、`directory`、`accept`、`sidebarGroup`、`title`、`okText`、`creatable`、`disabledPaths`。

`SidebarGroup` 枚举：`myFiles`（我的文件）、`otherShare`（他人共享）、`external`（外接存储）、`remote`（远程挂载）、`favorites`（我的收藏）、`team`（团队空间）。

`AppBridgeResponse<T>`：`{ code, msg, data }`，`code === 0` 成功。

## 7. 文件权限检查

后端 API `trim.file.checkUserACL`，Scope `trim.file.userAcl`。授权后不要直接把内容给所有用户；返回列表/预览/写入/删除前，用当前用户 `uid` 检查权限。

请求 `data: { uid, path }`，`path` 可为单个或数组。响应 `data` 为数组：

```json
[{ "path": "/vol1/1000/data/test.txt", "readable": true, "writable": false, "deletable": false }]
```

- 只返回 `readable: true` 的内容；写入/删除再查 `writable`/`deletable`
- **路径不存在或应用无权读取状态时，返回 `readable/writable/deletable` 均为 `false`**

## 8. 路径转换

后端 API `trim.file.convertPath`，Scope `trim.file.path`。页面不要直接展示 `/vol1/...` 内部路径。

请求 `data: { path, language }`，`path` 单个或数组，**`language` 必传**（按当前界面语言）。响应：

```json
{ "status": 0, "result": [{ "path": "/vol1/1000/photo", "semanticPath": "存储空间1/admin 的文件/photo" }] }
```

## 9. 页面路由（前端 JS SDK，无 Scope）

| 方法 | 作用 |
|---|---|
| `openFile(path)` | 用系统方式打开文件 |
| `showFileDetails(paths[], options?)` | 打开文件详情页（元数据/权限调整） |
| `openFileManager(path)` | 打开文件管理器并定位路径 |
| `openAppSetting()` | 打开当前应用设置页 |
| `openURL(url, target?, features?)` | 打开外部地址（Web 遵循 window.open；移动 WebView 用系统浏览器） |

打开文件/文件管理器/文件详情前，应确保目标路径来自授权范围并按需检查当前用户权限。**页面路由只负责打开页面，不做授权或权限判断。**

## 10. 页面交互（前端 JS SDK，无 Scope）

| 方法 | 作用 |
|---|---|
| `setTitle(title)` | 更新窗口标题 |
| `$on('os/theme', cb)` | 监听主题变化（仅 Web 宿主） |
| `$on('os/language', cb)` | 监听语言变化（仅 Web 宿主） |
| `setExitPageTips({title?,content?})` | 设置离开提示；不带参调用清除 |
| `close()` | 关闭当前应用页面 |

`$on` **只支持 Web 宿主环境**（`isWeb === true && isStandaloneWeb === false`），移动端 App 内嵌页面和独立浏览器页面不支持，不要展示依赖 `$on` 的功能入口。

典型用法：初始化先 `getPlatformConfig` 应用当前主题/语言，再在 Web 宿主下 `$on` 监听后续变化。

## 11. 错误码

`code` 为 `0` 成功，非 `0` 失败。前端看 JSSDK 错误码；后端先看 HTTP 状态码 + `code` + `msg`。

### JSSDK 错误码

| code | 含义 | 处理 |
|---|---|---|
| `0` | 成功 | - |
| `1000000` | 服务/内部异常 | 刷新状态重试 |
| `1000001` | 登录/认证失败 | 重新登录/认证 |
| `1000002` | 管理员权限或 API Scope 不足 | 检查 Scope 声明 |
| `1000030` | 请求不合法/路径不支持 | 检查参数、路径类型、能力状态 |
| `1000300` | 未找到已安装应用 | 确认应用已安装且运行中 |
| `1000701` | 路径不存在 | 提示重新选择 |
| `1003103` | 应用权限校验失败 | 尝试重新安装应用 |
| `1003201` | 管理员已关闭普通用户授权 | 提示仅管理员可操作 |

普通用户调用共享授权入口：宿主内直调 `code: 1` + "仅管理员可进行此操作"；路由回调 `status:"error"` + `error:"access_denied"`。

### 后端 API 错误码

| HTTP | code | msg | 处理 |
|---|---|---|---|
| 200/400 | `200001` | Invalid Params | 检查 JSON 格式、字段类型 |
| 401 | `200004` | Unauthorized | 检查后端是否拿到有效 token |
| 403 | `200003` | Forbidden | 检查 API Scope 声明、token 是否含该 Scope |
| 404 | `200005` | Not Found | 检查 `req` 拼写、接口是否注册、系统版本是否支持 |
| 200/500 | `200006` | Internal Error | 业务模块内部错误 |

---

## 接入清单（速查）

1. manifest 加 `micro_app=true`（要用 JS SDK 时）
2. `config/resource` 声明实际用到的 `api-scope`
3. 前端 `npm install @trimjs/web-app`，`new TrimApp()`
4. 按 `isStandaloneWeb` 决定直调还是 `openAppAuth` 路由授权；路由授权结合统一网关同域
5. 后端通过 Unix Socket `/var/run/trim_open_gateway_apiscope.socket` 调 `POST /api/v1/trimapp`，token 从 `TRIM_API_TOKEN` 读取、不持久化不暴露前端
6. 授权后返回内容前用 `checkUserACL` 按当前用户 `uid` 校验；展示路径用 `convertPath`
7. 系统版本 ≥ 1.2.0401、App ≥ 1.34.0
