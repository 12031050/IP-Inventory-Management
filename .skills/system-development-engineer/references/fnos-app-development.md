# 飞牛OS（fnOS）应用开发完整参考

> 来源：飞牛开发者平台官方文档 developer.fnnas.com（开发指南）。当用户要在飞牛OS 上开发、打包、上架应用，或询问 manifest、生命周期脚本、应用入口、统一网关、index.cgi、向导、权限、共享目录等细节时，阅读本文件。

## 目录

1. 平台与工具链概览
2. 应用包结构与 manifest 字段
3. 安装后目录框架与生命周期脚本
4. 环境变量完整清单
5. 应用权限 config/privilege
6. 应用资源 config/resource
7. 用户向导 wizard
8. 应用入口与三种访问模型
9. index.cgi 详解
10. 统一网关详解
11. 运行时与中间件依赖
12. 图标规范
13. 发布上架流程与测试清单

---

## 1. 平台与工具链概览

- fnOS 2024 年 8 月开放公测，定位"存储系统界的 Windows"，底层基于 Debian
- 官方开发工具：
  - `fnpack`：应用打包工具，产出 `.fpk` 安装包
  - `appcenter-cli`：应用中心命令行工具
- 开发者文档站：https://developer.fnnas.com
- 应用来源：第三方应用在 manifest 中标记 `source=thirdparty`

## 2. 应用包结构与 manifest 字段

应用包根目录必须包含无扩展名的 `manifest` 文件，采用 `key=value` 格式。

### 基础信息

| 字段 | 说明 |
|---|---|
| `appname` | 应用唯一标识 |
| `version` | 版本号，如 `1.0.0` 或 `2.1.3-beta` |
| `display_name` | 应用中心与用户界面显示名 |
| `desc` | 描述，可用 HTML |
| `source` | 第三方应用填 `thirdparty` |

### 平台与兼容

| 字段 | 说明 |
|---|---|
| `platform` | `x86` / `arm` / `all`（`all` 仅用于无架构相关二进制的包） |
| `os_min_version` | 支持的最低 fnOS 版本 |
| `os_max_version` | 支持的最高 fnOS 版本（有明确兼容上限时填写） |

注意：兼容范围按实际测试过的版本声明，不要虚报。

### 开发者信息

`maintainer`、`maintainer_url`、`distributor`、`distributor_url`

### 运行与安装控制

| 字段 | 说明 |
|---|---|
| `ctl_stop` | `true` 显示启动/停止；`false` 隐藏（静态页面、配置型应用用 `false`） |
| `install_type` | 空值由用户选存储位置；`root` 安装到系统分区 |
| `install_dep_apps` | 依赖应用，多个用 `:` 分隔，`>` 声明最低版本，如 `database>2.2.2:cache` |
| `service_port` | 应用服务端口 |
| `checkport` | 启动前是否检查端口，默认 `true`；不监听固定端口可设 `false` |
| `disable_authorization_path` | `true` 隐藏应用设置中的授权目录设置（仅当应用无需用户文件授权时） |
| `changelog` | 更新说明，简洁、面向用户 |

### 桌面集成

| 字段 | 说明 |
|---|---|
| `desktop_uidir` | UI 目录（相对应用目录），默认 `ui` |
| `desktop_applaunchname` | 多入口时指定应用中心卡片打开的入口 ID |

### manifest 示例

```ini
appname=HelloFnos
version=1.0.0
display_name=Hello fnOS
desc=一个最小的飞牛 fnOS 应用。
source=thirdparty
platform=all

maintainer=Example Team
maintainer_url=https://example.com

os_min_version=1.2.0

desktop_uidir=ui
desktop_applaunchname=HelloFnos.Application

ctl_stop=false
checkport=false
```

### 依赖声明规则

- 多个依赖用 `:` 分隔，**从右到左**依次安装启用：`install_dep_apps=database:cache` 表示 `cache` 先就绪
- 用 `>` 声明最低版本：`database>2.2.2`
- **嵌套依赖不递归解析**：需要的依赖都要在当前应用直接声明
- 只声明直接需要的依赖，依赖缺失时给用户可见的清晰错误

## 3. 安装后目录框架与生命周期脚本

### 安装后目录结构

应用安装到 `/var/apps/{appname}`：

```
/var/apps/{appname}
├── cmd/
│   ├── install_init        # 安装文件应用前执行
│   ├── install_callback    # 安装文件应用后执行
│   ├── main                # 处理 start / stop / status
│   ├── upgrade_init        # 升级前执行
│   ├── upgrade_callback    # 升级后执行（数据/配置迁移、兼容性检查）
│   ├── uninstall_init      # 卸载前执行
│   ├── uninstall_callback  # 卸载清理后执行
│   ├── config_init         # 配置变更应用前执行
│   └── config_callback     # 配置变更应用后执行
├── config/
│   ├── privilege           # 运行身份声明
│   └── resource            # 资源声明
├── manifest
├── ICON.PNG                # 64x64
├── ICON_256.PNG            # 256x256
├── target -> /vol{n}/@appcenter/{appname}   # 已安装应用文件与运行资源
├── etc    -> /vol{n}/@appconf/{appname}     # 应用配置
├── var    -> /vol{n}/@appdata/{appname}     # 需保留的运行数据
├── tmp    -> /vol{n}/@apptemp/{appname}     # 临时文件
├── home   -> /vol{n}/@apphome/{appname}     # 应用用户数据
├── meta
├── shares/                 # config/resource 声明的共享目录
└── wizard/
    ├── install / upgrade / uninstall / config
```

要点：

- **脚本中一律使用 `TRIM_APPDEST`、`TRIM_PKGETC`、`TRIM_PKGVAR` 等环境变量定位目录，不要硬编码路径**
- 生命周期脚本应具备**可重复执行能力**（安装/升级/配置流程可能被重跑）
- 卸载逻辑尊重用户数据：可在 `wizard/uninstall` 收集"保留或删除数据"选择
- 脚本失败前把清晰错误信息写入 `TRIM_TEMP_LOGFILE`，会展示给用户

### cmd/main 模板与退出码

```bash
#!/bin/bash

case "$1" in
  start)
    # 启动应用服务
    exit 0
    ;;
  stop)
    # 停止应用服务
    exit 0
    ;;
  status)
    # 运行中返回 0，未运行返回 3
    exit 0
    ;;
  *)
    exit 1
    ;;
esac
```

退出码约定：`0` 成功（status 中表示运行中）；`1` 失败；`3` 仅用于 status 表示未运行。

用户可见错误示例：

```bash
if [ ! -f "$TRIM_PKGETC/config.conf" ]; then
  echo "Missing configuration file." > "$TRIM_TEMP_LOGFILE"
  exit 1
fi
```

## 4. 环境变量完整清单

### 应用信息

- `TRIM_APPNAME`（= manifest.appname）、`TRIM_APPVER`、`TRIM_OLD_APPVER`（升级时旧版本）
- `TRIM_APP_STATUS`：当前操作，`INSTALL` / `START` / `UPGRADE` / `UNINSTALL` / `STOP` / `CONFIG`

### 应用路径

- `TRIM_APPDEST`（target 目录）、`TRIM_PKGETC`、`TRIM_PKGVAR`、`TRIM_PKGTMP`、`TRIM_PKGHOME`、`TRIM_PKGMETA`
- `TRIM_APPDEST_VOL`：应用安装所在存储空间路径

### 用户与权限上下文

- 应用用户：`TRIM_USERNAME` / `TRIM_GROUPNAME` / `TRIM_UID` / `TRIM_GID`
- 当前执行脚本用户：`TRIM_RUN_USERNAME` / `TRIM_RUN_GROUPNAME` / `TRIM_RUN_UID` / `TRIM_RUN_GID`（特权操作中与应用用户可能不同）

### 网络与资源

- `TRIM_SERVICE_PORT`：manifest.service_port 声明的端口
- `TRIM_DATA_SHARE_PATHS`：共享数据路径，`:` 分隔；也可经 `/var/apps/{appname}/share/` 软链访问
- `TRIM_DATA_ACCESSIBLE_PATHS`：用户授权的可访问路径，`:` 分隔
- `TRIM_API_TOKEN`：调用飞牛开放 API 的认证 token

### 日志与临时

- `TRIM_TEMP_LOGFILE`（用户可见错误输出）、`TRIM_TEMP_UPGRADE_FOLDER`、`TRIM_PKGINST_TEMP_DIR`、`TRIM_TEMP_TPKFILE`

### 系统上下文

- `TRIM_SYS_VERSION` / `_MAJOR` / `_MINOR` / `_BUILD`、`TRIM_SYS_ARCH`、`TRIM_KERNEL_VERSION`、`TRIM_SYS_MACHINE_ID`、`TRIM_SYS_LANGUAGE`
- 用于诊断与兼容性检查；不要让实际行为与 manifest 声明的支持范围冲突

### 向导变量

- 向导字段值会成为**同名环境变量**，不带 `TRIM_` 前缀
- 自定义向导字段建议 `wizard_` 前缀；**禁止使用 `TRIM_` 前缀**（保留给系统变量）
- 字段名要稳定：改字段名 = 改环境变量名

### cmd/main 实用示例

```bash
#!/bin/bash

case "$1" in
  start)
    echo "Starting $TRIM_APPNAME $TRIM_APPVER"
    if [ ! -f "$TRIM_PKGETC/config.conf" ]; then
      cp "$TRIM_APPDEST/config.conf.example" "$TRIM_PKGETC/config.conf"
    fi
    cd "$TRIM_APPDEST"
    ./myapp \
      --config "$TRIM_PKGETC/config.conf" \
      --data "$TRIM_PKGVAR" \
      --port "$TRIM_SERVICE_PORT" \
      --log "$TRIM_TEMP_LOGFILE" &
    ;;
  status)
    if pgrep -f "myapp.*$TRIM_SERVICE_PORT" > /dev/null; then
      exit 0
    fi
    exit 3
    ;;
  stop)
    pkill -f "myapp.*$TRIM_SERVICE_PORT"
    ;;
  *)
    echo "Unknown command: $1" > "$TRIM_TEMP_LOGFILE"
    exit 1
    ;;
esac
```

通用建议：引用变量加引号；用路径变量前先检查目录存在；向导值和请求值都视为不可信输入。

## 5. 应用权限 config/privilege

### 包用户模式（默认推荐）

```json
{
  "defaults": {
    "run-as": "package"
  },
  "username": "myapp_user",
  "groupname": "myapp_group"
}
```

- `run-as=package`：以专用应用用户运行，与系统级权限隔离
- `username`/`groupname` 省略时按 `manifest.appname` 自动生成

### 附加用户组 join-groups

应用需访问受系统用户组保护的资源（如 GPU、硬件加速视频输出）时：

```json
{
  "defaults": { "run-as": "package" },
  "username": "media_app",
  "groupname": "media_app",
  "join-groups": ["video", "render"]
}
```

只加入确实需要的组——每加一个组，进程可访问范围就扩大。

### Root 模式（尽量避免）

```json
{
  "defaults": { "run-as": "root" },
  "username": "myapp_user",
  "groupname": "myapp_group"
}
```

- 仅当生命周期脚本确实要做特权准备（系统集成、访问包用户无法处理的设备）时使用
- **长期对外服务的进程不要以 root 运行**；root 脚本中用 `runuser` 降权：

```bash
runuser -u "$TRIM_USERNAME" -- /var/apps/myapp/target/server/myapp
```

- 选 root 前先确认：能否用资源声明、join-groups、用户授权或更窄的服务设计达成目标

### 用户文件访问

应用默认无用户文件广泛访问权。两种方式获得授权：

1. 用户在应用设置中授权目录（对应 `TRIM_DATA_ACCESSIBLE_PATHS`）
2. 应用在 `config/resource` 中声明共享数据目录（data-share）

## 6. 应用资源 config/resource

### 共享数据目录 data-share

```json
{
  "data-share": {
    "shares": [
      { "name": "myapp/documents" },
      { "name": "myapp/backups" }
    ]
  }
}
```

- 安装时自动创建；使用 **Windows ACL 权限模型（非 POSIX ACL）**，系统自动为应用运行用户授予 ACL 权限
- 应用通过 `TRIM_DATA_SHARE_PATHS` 或 `/var/apps/{appname}/share/` 下软链访问（如 `/var/apps/myapp/share/documents`）
- 建议用应用名作顶级目录，按用途分子目录，减少命名冲突
- 可选 `permission` 字段给其他用户/应用授权：`"permission": { "rw": ["other_app_user"], "ro": ["report_reader"] }`，大多数场景不需要

### 系统链接 usr-local-linker

```json
{
  "usr-local-linker": {
    "bin": ["bin/myapp-cli"],
    "lib": ["lib/mylib.so"],
    "etc": ["etc/myapp.conf"]
  }
}
```

- 分别链接到 `/usr/local/bin/`、`/usr/local/lib/`、`/usr/local/etc/`
- 只暴露其他命令/应用确实需要的稳定接口
- 命令名带应用标识（如 `myapp-cli`），避免 `cli`、`server`、`tool` 这类通用名

### Docker 项目 docker-project

```json
{
  "docker-project": {
    "projects": [
      { "name": "myapp-stack", "path": "docker" }
    ]
  }
}
```

- `path` 相对 `app` 目录，该目录含 `docker-compose.yaml`（即 `app/docker/docker-compose.yaml`）
- 适合多服务应用、依赖数据库/缓存、需要受控运行环境的应用

## 7. 用户向导 wizard

四种向导文件：`wizard/install`、`wizard/upgrade`、`wizard/uninstall`、`wizard/config`（安装后从应用设置修改配置）。收集值成为同名环境变量供生命周期脚本使用。

### 基本结构（JSON 数组）

```json
[
  {
    "stepTitle": "Setup",
    "items": [
      {
        "type": "text",
        "field": "wizard_username",
        "label": "Username",
        "initValue": "admin",
        "rules": [
          { "required": true, "message": "Enter a username" }
        ]
      }
    ]
  }
]
```

### 字段类型

| 类型 | 用途 |
|---|---|
| `text` | 短文本、端口、路径、用户名 |
| `password` | 密钥、令牌（不明文显示） |
| `radio` | 少量互斥选项 |
| `checkbox` | 多选 |
| `select` | 较长互斥列表（配 `options` 数组） |
| `switch` | 布尔开关 |
| `tips` | 只读提示文本（用 `helpText`） |

### 校验规则 rules

`required`、`min`、`max`、`len`、`pattern`（正则）。示例：

```json
{
  "type": "text",
  "field": "wizard_port",
  "label": "Service port",
  "rules": [
    { "required": true, "message": "Enter a port" },
    { "pattern": "^[0-9]+$", "message": "Use numbers only" }
  ]
}
```

### 设计建议

- 只问必需值，提供合理默认值，密钥用 `password` 类型且不写日志
- 字段名稳定、自定义字段加 `wizard_` 前缀、禁用 `TRIM_` 前缀
- 生命周期脚本中把向导值按字符串处理并再次校验

## 8. 应用入口与三种访问模型

入口定义在 `app/ui/config` 的 `.url` 字段下（需 manifest 中 `desktop_uidir=ui`）。入口 ID 用应用名前缀，如 `myapp.main`。

### 入口字段

| 字段 | 说明 |
|---|---|
| `title` | 用户看到的入口名 |
| `icon` | 相对 UI 目录，`{0}` 表示尺寸占位，如 `images/icon_{0}.png` |
| `type` | `iframe`（桌面窗口内打开）/ `url`（浏览器标签页打开） |
| `protocol` | `http` / `https` / 空字符串自适应 |
| `port` | 服务端口，可用 `${wizard_port}` 引用向导收集值 |
| `url` | 打开路径，可用 `${wizard_path}` |
| `allUsers` | 是否对所有用户可见 |
| `fileTypes` | 文件入口支持的扩展名数组 |
| `noDisplay` | 桌面隐藏但保留文件操作入口 |
| `control.accessPerm` | `editable` / `readonly` / `hidden`（应用设置中的入口设置行为） |

### 三种访问模型对比

| 能力 | index.cgi | 统一网关 | 端口服务 |
|---|---|---|---|
| 简单静态页面 | 适合 | 支持 | 可用 |
| 常驻服务 | 不推荐 | 适合 | 适合 |
| WebSocket | 不支持 | 支持 | 支持 |
| NAS 登录态 | 调用 CGI 前校验 | 转发前校验并提供用户 Header | 无（应用自理） |
| 性能 | 每请求启动 CGI 进程 | 转发到长期运行服务 | 转发到长期运行服务 |
| 常见路径 | `/cgi/ThirdParty/{appname}/index.cgi/` | `/app/{appname}` | `http://nas-ip:{port}` |

选择建议：独立服务且无需 NAS 登录态 → 端口服务；轻量页面/简单兼容 → index.cgi；复用系统域名、WebSocket、需要用户上下文 → 统一网关。

### 端口服务入口示例

```json
{
  ".url": {
    "myapp.main": {
      "title": "My App",
      "icon": "images/icon_{0}.png",
      "type": "iframe",
      "protocol": "http",
      "port": "8080",
      "url": "/",
      "allUsers": true
    }
  }
}
```

仅管理员可见入口：`"allUsers": false` + `"control": { "accessPerm": "readonly" }`。

### 文件打开方式

```json
{
  ".url": {
    "myapp.editor": {
      "title": "Text Editor",
      "icon": "images/editor_{0}.png",
      "type": "iframe",
      "protocol": "http",
      "port": "8080",
      "url": "/edit",
      "allUsers": true,
      "fileTypes": ["txt", "md", "json"],
      "noDisplay": true
    }
  }
}
```

用户打开文件时系统追加 `path` 查询参数（如 `/edit?path=/vol1/Users/admin/Documents/example.txt`）。**文件路径视为用户输入，读写前验证访问权限。**

## 9. index.cgi 详解

- 可执行文件放 `app/ui/index.cgi`；打包工具处理可执行权限（手动测试时自行确认）
- 路径形如 `/cgi/ThirdParty/{appname}/index.cgi/`；`protocol`、`port` 不参与 CGI 路由
- fnOS 在调用 CGI 前校验 NAS 用户登录态
- 仅适合普通 HTTP 请求；**不支持 WebSocket**、流式响应、长请求、高流量 API

### 静态文件服务 CGI 示例要点（Bash 实现）

核心逻辑：把 `index.cgi` 后的请求路径映射到 `$TRIM_APPDEST/www` 下文件：

```bash
#!/bin/bash
BASE_PATH="/var/apps/HelloFnos/target/www"
URI_NO_QUERY="${REQUEST_URI%%\?*}"
REL_PATH="/"
case "$URI_NO_QUERY" in
  *index.cgi*) REL_PATH="${URI_NO_QUERY#*index.cgi}" ;;
esac
if [ -z "$REL_PATH" ] || [ "$REL_PATH" = "/" ]; then
  REL_PATH="/index.html"
fi
TARGET_FILE="${BASE_PATH}${REL_PATH}"

# 拒绝目录穿越
if echo "$TARGET_FILE" | grep -q '\.\.'; then
  echo "Status: 400 Bad Request"; echo "Content-Type: text/plain; charset=utf-8"; echo ""
  echo "Bad Request"; exit 0
fi

if [ ! -f "$TARGET_FILE" ]; then
  echo "Status: 404 Not Found"; echo "Content-Type: text/plain; charset=utf-8"; echo ""
  echo "404 Not Found"; exit 0
fi

# 按扩展名输出 MIME，然后 cat 文件
case "${TARGET_FILE##*.}" in
  html|htm) mime="text/html; charset=utf-8" ;;
  css) mime="text/css; charset=utf-8" ;;
  js) mime="application/javascript; charset=utf-8" ;;
  png) mime="image/png" ;;
  jpg|jpeg) mime="image/jpeg" ;;
  svg) mime="image/svg+xml" ;;
  *) mime="application/octet-stream" ;;
esac
echo "Content-Type: $mime"; echo ""
cat "$TARGET_FILE"
```

安全铁律：每个请求路径都是用户输入；拒绝 `..`；只从预期目录提供文件；不执行请求参数；不把请求路径拼进 shell 命令。

## 10. 统一网关详解

### 工作方式

1. 应用以 `gatewayPrefix` 注册公开路径（`/app/{appname}` 或 `/app/{appname}/{customPath}`）
2. 应用服务监听 `gatewaySocket` 声明的 Unix Socket（放在 `target` 目录，如 `app.sock`）
3. 用户访问 `/app/myapp` → fnOS 校验会话 → 转发到 `/var/apps/myapp/target/app.sock`
4. 应用读取网关转发的用户 Header 获取身份上下文

### 入口配置

```json
{
  ".url": {
    "myapp.main": {
      "title": "My App",
      "icon": "images/icon_{0}.png",
      "type": "iframe",
      "protocol": "",
      "gatewayPrefix": "/app/myapp",
      "gatewaySocket": "app.sock",
      "url": "/app/myapp",
      "allUsers": true
    }
  }
}
```

注意：网关入口中 `protocol` 和 `port` **被忽略**；`gatewaySocket` 只写 Socket 文件名；路径版本间保持稳定、URL 安全、避免点号。

### 用户身份 Header

| Header | 说明 | 示例 |
|---|---|---|
| `X-Trim-Userid` | 当前用户 UID | `1000` |
| `X-Trim-Isadmin` | 是否管理员 | `true` / `false` |
| `X-Trim-Username` | 用户名 | `admin` |

Node.js 读取示例：

```js
function getGatewayUser(req) {
  return {
    uid: req.headers["x-trim-userid"],
    isAdmin: req.headers["x-trim-isadmin"] === "true",
    username: req.headers["x-trim-username"]
  };
}
```

**网关只校验登录态，业务鉴权仍是应用的责任**：用户只能访问自己的数据、管理接口要管理员身份、文件路径和记录 ID 结合当前用户校验。

### WebSocket

- 复用同一网关前缀，建议稳定子路径如 `/app/myapp/ws`
- 前端：`ws(s)://{host}/app/myapp/ws`
- 连接建立时同样获得身份 Header；**把连接绑定到 `X-Trim-Userid`，不信任消息体内客户端自报的 user ID**

### Docker 应用接入网关

把 `${TRIM_APPDEST}` 挂载进容器，让容器内服务在该目录创建对应 Socket 文件即可。

### 文件访问安全

- 标准化请求路径、拒绝 `..` 穿越、只从预期目录提供文件
- 不暴露密钥、数据库、配置文件、私有日志
- OAuth 回调等公开路径保持窄而明确，未鉴权路径只开放必需的 HTTP 方法和数据

## 11. 运行时与中间件依赖

### 运行时（manifest 中 install_dep_apps 声明）

| 运行时 | 依赖名 | 用法 |
|---|---|---|
| Python | `python312` | `export PATH=/var/apps/python312/target/bin:$PATH`，再 `python3 -m venv .venv && pip install -r requirements.txt` |
| Node.js | `nodejs_v22` | `export PATH=/var/apps/nodejs_v22/target/bin:$PATH` |
| Java | `java-21-openjdk` | `export PATH=/var/apps/java-21-openjdk/target/bin:$PATH` |

### 中间件（同样经 install_dep_apps 声明）

- **Redis**（`redis`）：127.0.0.1:6379，建议独立 db 编号或 key 前缀避免冲突
- **MinIO**（`minio`）：127.0.0.1:9000，密钥安全保存，不硬编码进应用包
- **RabbitMQ**（`rabbitmq`）：127.0.0.1:5672，guest/guest，使用应用专属队列/交换机/路由键

通用建议：只声明实际需要的依赖；在干净 fnOS 设备上测试安装；依赖不可用时给用户可见的清晰错误；凭据不进源码仓库；数据库/桶/队列/key 使用命名空间隔离。

## 12. 图标规范

### 包图标（应用包根目录必需）

- `ICON.PNG`：64 x 64 px
- `ICON_256.PNG`：256 x 256 px
- PNG 或 JPG、sRGB、单文件 ≤ 1024 KB、正方形画布
- 视觉主体用**圆角矩形风格**（与系统图标一致），不要直角满铺方块；64px 下仍清晰可辨，重要内容不贴边、不依赖过细文字

### 入口图标

- 放 `app/ui/images/` 下，如 `icon_64.png`、`icon_256.png`
- `app/ui/config` 中 `"icon": "images/icon_{0}.png"`，系统把 `{0}` 替换为所需尺寸

## 13. 发布上架流程与测试清单

### 发布材料

1. `fnpack` 生成的最终 `.fpk` 包
2. 应用图标
3. 截图（展示真实界面和核心流程，不用占位页/临时设计图）
4. manifest 字段准确（名称、描述、版本、维护者、系统版本范围、平台、更新说明）

### 提交方式

- 开发者后台上线前：加入飞牛粉丝群（官网扫码）→ 联系社区主理人 → 加入"应用中心开发者先锋交流群"→ 按指引提交应用信息、应用包和测试材料
- 开发者后台上线后：以后续平台流程为准

### 发布前测试清单

不要只依赖一次成功安装，在计划支持的 fnOS 版本和硬件架构上测试：

- 应用可按预期安装、打开、运行
- 主要流程可完成，无非预期错误
- 用户数据的增删改查正确
- 用户无法访问未授权的数据或操作
- 本地 API、网络端口和后台任务只暴露真正需要的能力
- 依赖外部服务/数据库/硬件/大模型时，测试依赖不可用、配置错误、资源不足的表现

---

## 开发最佳实践速查

1. 路径一律用 `TRIM_*` 环境变量，不硬编码
2. 生命周期脚本幂等、失败前写 `TRIM_TEMP_LOGFILE`
3. 默认 `run-as=package`；root 只用于特权准备并尽快 `runuser` 降权
4. 访问模型三选一：静态 → index.cgi；常驻+登录态/WebSocket → 统一网关；独立服务 → 端口服务
5. manifest 兼容范围按实测声明，依赖不递归、直接声明
6. 向导值、请求路径、用户 ID 都视为不可信输入，二次校验
7. 打包前过一遍图标检查清单与发布测试清单
