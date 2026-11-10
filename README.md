# IP-Inventory-Management · IP 台账管理系统

面向弱电运维 / 飞牛 OS（fnOS）NAS 的一体化 **IP 地址管理（IPAM）** 工具。前端 React 18 + Vite + Tailwind + shadcn/ui，后端为轻量 Python `http.server` + **SQLite** 单文件服务，数据**本地存储**、离线可用，可打包为 **FPK** 一键部署到飞牛 NAS，也支持纯前端本地浏览器运行（localStorage 兜底）。

## ✨ 功能特性

- **网络概览 Dashboard**：IP 总数、已用率、子网 / VLAN 数量统计与利用率进度条
- **IP 台账**：IP 记录 CRUD、解析（hostname）、搜索、**IP / MAC / 域名冲突检测**、分配 / 预订 / 离线状态
- **子网管理**：新增 IPv4/IPv6 子网（CIDR 校验）、网关、**CIDR 利用率计算**、查看子网内 IP
- **VLAN 管理**：创建 VLAN、**多选关联子网**、启用 / 停用
- **地址池池**：创建地址池（开始/结束掩码）、按池**自动分配**空闲 IP
- **设备资产**：设备 IP / MAC / 类型 / 位置管理
- **导入导出**：IP / 子网 / 设备 **CSV 导入、Excel 导入导出（xlsx）**，带列头映射
- **备份恢复**：导出 / 导入 **JSON 全量备份**、历史备份记录
- **登录认证**：本地登录注册（localStorage；fnOS 统一部署下走 `/api/auth/nas-login` 网关头）+ 账号密码登录、首个用户自动超管
- 深湛运维**暗色主题**，侧边栏布局，响应式适配平板 / 移动端

## 🚀 本地运行

### 前置
- Node.js ≥ 18（推荐 20）与 `pnpm`（`npm i -g pnpm`）
- Python ≥ 3.8（Python http.server + sqlite3，零第三方依赖）

### 前端（热更新开发）
```bash
pnpm install        # 安装依赖（若遇问题改用 npm install）
pnpm dev            # 本地开发服务器（热更新）
```
浏览器打开终端提示的本地地址（默认 `5173`）。**未启动后端时，应用会自动使用浏览器 localStorage 作数据存储**，功能完整可用。

### 后端（可选，真实持久化）
启动场库后端后，数据会写入 SQLite 而非浏览器：
```bash
python3 packaging/templates-cgi/app/server.py
```

### 代码检查（本项目自定义）
```bash
pnpm lint           # tsgo 类型检查 + biome lint + tailwindcss 语法检查
```

### 移动加密开发进阶脚本
综合导向 `/scripts/package-fpk-*.py` 与 `package-fpk.mjs`，用于**打包为飞牛 FPK 安装包**（详见下节）。

## 📦 飞牛 OS（fnOS）部署

FPK 打包产物在 `packaging/` 下（如 `packaging/ipam-1.2.6.fpk`）。
```bash
# 以网关模式打包（Vite 会加 --base /app/ipam/ 前缀，server.py 会剥离前缀路由）
python3 scripts/package-fpk-gateway.py
```
在飞牛应用中心「手动安装」选择生成的 `.fpk` 即可。卸载时脚本会**清理数据目录**，请联系备份。

> 网络拓扑：NAT/公网留言 `http://<nas-ip>:28090`（server.py 端口，可改）。

## 🏗️ 技术栈

| 层 | 技术 |
|---|---|
| 前端 | React 18、TypeScript、Vite、Tailwind CSS、shadcn/ui、React Router、bun |
| 后端 | Python `http.server`、SQLite（无 ORM） |
| 导入导出 | [xlsx](https://github.com/SheetJS/sheetjs)、PapaParse 风格 CSV |
| 图表 | Recharts（Dashboard 利用率） |
| 部署 | 飞牛 OS **FPK**（fnpack）+ 统一网关 `/app/ipam` |

## 📁 项目结构
```
src/
  ├─ contexts/    # DataContext（数据源 + 冲突检测）、AuthContext（本地认证）
  ├─ pages/       # Ip/Side/Subnet/Vlan/Pool/Device/Backup/Login 等页面
  ├─ components/  # AppLayout、ui/(shadcn)、admin/、common/
  └─ lib/         # util、import-xlsx、validate（CIDR/MAC/冲突检测）
packaging/
  ├─ templates-cgi/app/server.py   # 后端单文件服务（含 /app/ipam 前缀剥离）
  └─ *.fpk                        # fnpack 产物
scripts/          # FPK 打包脚本（gateway / v126 等）
```

## 📄 License

MIT

---
> 提示：项目未提供独立 Docker / CI 配置；如需自行扩展部署方式，欢迎提 Issue / PR。
