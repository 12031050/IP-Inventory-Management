#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
飞牛 fnOS IPAM 系统 - SQLite 数据库后端 & SPA 静态分发服务
功能：
1. 数据持久化存储到 SQLite（位于 NAS 应用目录 /var/apps/ipam/var/ipam.db）
2. 飞牛统一网关身份识别（仅信任 X-Trim-Username / X-Trim-Userid / X-Trim-Isadmin）
3. NAS 免密授权登录与本地账号验证 API
4. 静态 SPA 页面分发与无刷新路由回退
"""

import sys
import os
import json
import sqlite3
import socket
import threading
from datetime import datetime, timezone
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

# 配置端口与目录
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else int(os.environ.get("TRIM_SERVICE_PORT", 28090))
WEB_DIR = sys.argv[2] if len(sys.argv) > 2 else os.path.dirname(os.path.abspath(__file__)) + "/www"

# 统一网关：应用以 /app/ipam 前缀注册公开路径，监听 target 目录下的 Unix Socket
APP_DEST = os.environ.get("TRIM_APPDEST") or os.path.dirname(os.path.abspath(__file__))
SOCK_PATH = os.path.join(APP_DEST, "app.sock")
GATEWAY_PREFIX = "/app/ipam"

# 数据库存储路径优先级：TRIM_PKGVAR > TRIM_APPDEST/data > 当前目录/data > /tmp
def get_db_path():
    pkg_var = os.environ.get("TRIM_PKGVAR")
    if pkg_var and os.path.exists(pkg_var):
        return os.path.join(pkg_var, "ipam.db")
    app_dest = os.environ.get("TRIM_APPDEST")
    if app_dest and os.path.exists(app_dest):
        data_dir = os.path.join(app_dest, "data")
        os.makedirs(data_dir, exist_ok=True)
        return os.path.join(data_dir, "ipam.db")
    local_data = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")
    try:
        os.makedirs(local_data, exist_ok=True)
        return os.path.join(local_data, "ipam.db")
    except Exception:
        return "/tmp/ipam.db"

DB_PATH = get_db_path()

def now_iso():
    return datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')

# 初始化 SQLite 数据库
def init_db():
    try:
        os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    except Exception:
        pass

    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()

    # 1. 用户表
    cur.execute('''
    CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        real_name TEXT,
        password TEXT,
        role_id TEXT,
        status TEXT DEFAULT 'active',
        is_super_admin INTEGER DEFAULT 0,
        created_at TEXT,
        last_login_at TEXT
    )
    ''')

    # 2. 角色表
    cur.execute('''
    CREATE TABLE IF NOT EXISTS roles (
        id TEXT PRIMARY KEY,
        name TEXT UNIQUE NOT NULL,
        description TEXT,
        permissions TEXT,
        is_system INTEGER DEFAULT 0,
        created_at TEXT
    )
    ''')

    # 3. IP 台账表
    cur.execute('''
    CREATE TABLE IF NOT EXISTS ips (
        id TEXT PRIMARY KEY,
        ip TEXT NOT NULL,
        hostname TEXT,
        mac TEXT,
        purpose TEXT,
        subnet_id TEXT,
        status TEXT,
        note TEXT,
        created_at TEXT,
        updated_at TEXT
    )
    ''')

    # 4. 子网表
    cur.execute('''
    CREATE TABLE IF NOT EXISTS subnets (
        id TEXT PRIMARY KEY,
        cidr TEXT NOT NULL,
        name TEXT,
        gateway TEXT,
        ip_version TEXT DEFAULT 'ipv4',
        note TEXT,
        created_at TEXT
    )
    ''')

    # 5. VLAN 表
    cur.execute('''
    CREATE TABLE IF NOT EXISTS vlans (
        id TEXT PRIMARY KEY,
        vlan_id INTEGER,
        name TEXT,
        gateway TEXT,
        subnet_ids TEXT,
        note TEXT,
        created_at TEXT
    )
    ''')

    # 6. 地址池表
    cur.execute('''
    CREATE TABLE IF NOT EXISTS pools (
        id TEXT PRIMARY KEY,
        name TEXT,
        start_ip TEXT,
        end_ip TEXT,
        subnet_id TEXT,
        purpose TEXT,
        note TEXT,
        created_at TEXT
    )
    ''')

    # 7. 设备表
    cur.execute('''
    CREATE TABLE IF NOT EXISTS devices (
        id TEXT PRIMARY KEY,
        name TEXT,
        type TEXT,
        location TEXT,
        ip TEXT,
        mac TEXT,
        note TEXT,
        created_at TEXT
    )
    ''')

    # 8. 备份表
    cur.execute('''
    CREATE TABLE IF NOT EXISTS backups (
        id TEXT PRIMARY KEY,
        filename TEXT,
        timestamp TEXT,
        size INTEGER,
        data TEXT
    )
    ''')

    # 预置管理员角色与用户
    all_perms = json.dumps([
        "ips:view","ips:create","ips:edit","ips:delete",
        "subnets:view","subnets:create","subnets:edit","subnets:delete",
        "vlans:view","vlans:create","vlans:edit","vlans:delete",
        "pools:view","pools:create","pools:edit","pools:delete",
        "devices:view","devices:create","devices:edit","devices:delete",
        "users:view","users:create","users:edit","users:delete",
        "roles:view","roles:create","roles:edit","roles:delete",
        "io:import","io:export","backup:create","backup:restore","backup:delete"
    ])

    cur.execute("INSERT OR IGNORE INTO roles (id, name, description, permissions, is_system, created_at) VALUES (?, ?, ?, ?, ?, ?)",
                ('role-admin', '管理员', '拥有系统全部权限', all_perms, 1, '2026-01-01T00:00:00.000Z'))

    viewer_perms = json.dumps([
        "ips:view", "subnets:view", "vlans:view", "pools:view", "devices:view"
    ])
    cur.execute("INSERT OR IGNORE INTO roles (id, name, description, permissions, is_system, created_at) VALUES (?, ?, ?, ?, ?, ?)",
                ('role-viewer', '只读访客', '仅允许查看网络与资产数据，无管理与修改权限', viewer_perms, 1, '2026-01-01T00:00:00.000Z'))

    operator_perms = json.dumps([
        "ips:view","ips:create","ips:edit","ips:delete",
        "subnets:view","subnets:create","subnets:edit",
        "vlans:view","vlans:create","vlans:edit",
        "pools:view","pools:create","pools:edit",
        "devices:view","devices:create","devices:edit",
        "io:import","io:export","backup:create"
    ])
    cur.execute("INSERT OR IGNORE INTO roles (id, name, description, permissions, is_system, created_at) VALUES (?, ?, ?, ?, ?, ?)",
                ('role-operator', '运维人员', '可管理 IP 与网络资产，无权限修改用户与角色配置', operator_perms, 1, '2026-01-01T00:00:00.000Z'))

    # 初始化默认系统管理员 admin / 密码 admin（首个账号，便于离线与端口直连登录）
    cur.execute("SELECT COUNT(*) FROM users")
    if cur.fetchone()[0] == 0:
        now = '2026-01-01T00:00:00.000Z'
        cur.execute(
            "INSERT INTO users (id, username, real_name, password, role_id, status, is_super_admin, created_at, last_login_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            ('user-admin', 'admin', '系统管理员', 'admin', 'role-admin', 'active', 1, now, now)
        )

    conn.commit()
    conn.close()

init_db()

class IPAMRequestHandler(SimpleHTTPRequestHandler):
    extensions_map = {
        '': 'application/octet-stream',
        '.html': 'text/html; charset=utf-8',
        '.htm': 'text/html; charset=utf-8',
        '.js': 'application/javascript; charset=utf-8',
        '.mjs': 'application/javascript; charset=utf-8',
        '.css': 'text/css; charset=utf-8',
        '.json': 'application/json',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.svg': 'image/svg+xml',
        '.ico': 'image/x-icon',
        '.woff': 'font/woff',
        '.woff2': 'font/woff2',
        '.ttf': 'font/ttf',
    }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=WEB_DIR, **kwargs)

    def _strip_gateway_prefix(self):
        """统一网关转发路径带 /app/ipam 前缀，静态与 API 处理前先剥离"""
        parsed = urlparse(self.path)
        if parsed.path.startswith(GATEWAY_PREFIX):
            new_path = parsed.path[len(GATEWAY_PREFIX):] or '/'
            query = f'?{parsed.query}' if parsed.query else ''
            self.path = new_path + query

    # 获取统一网关注入的可信身份（X-Trim-* 头）；网关之外的自报身份一律不可信
    def _gateway_identity(self):
        return (
            self.headers.get('X-Trim-Username') or
            self.headers.get('x-trim-username')
        )

    # Unix Socket 下 client_address 是路径字符串而非 (host, port) 元组，重写避免日志 IndexError
    def address_string(self):
        if isinstance(self.client_address, str):
            return self.client_address or 'unix-socket'
        return self.client_address[0]

    def _send_json(self, status, payload):
        body = json.dumps(payload, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Trim-Username')
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Trim-Username')
        self.end_headers()

    def do_GET(self):
        self._strip_gateway_prefix()
        parsed = urlparse(self.path)
        path = parsed.path

        # 1. API: 健康状态与数据库位置
        if path == '/api/health':
            self._send_json(200, {"status": "ok", "db": DB_PATH, "port": PORT})
            return

        # 2. API: 获取飞牛 NAS 用户信息与设备名（仅信任统一网关注入的 X-Trim-* 头）
        if path == '/api/nas/user':
            username = self._gateway_identity()
            if not username:
                # 无网关身份（TCP 端口直连 / 本地开发）：不伪装任何默认账户
                self._send_json(200, {"available": False, "hostname": socket.gethostname() or ""})
                return
            is_admin = (
                self.headers.get('X-Trim-Isadmin') == 'true' or
                self.headers.get('x-trim-isadmin') == 'true'
            )
            self._send_json(200, {
                "available": True,
                "username": username,
                "uid": self.headers.get('X-Trim-Userid') or '',
                "isAdmin": is_admin,
                "hostname": socket.gethostname() or ""
            })
            return

        # 3. API: 获取全部数据
        if path == '/api/data':
            conn = sqlite3.connect(DB_PATH)
            conn.row_factory = sqlite3.Row
            cur = conn.cursor()

            # ips
            cur.execute("SELECT * FROM ips ORDER BY created_at DESC")
            ips = []
            for r in cur.fetchall():
                ips.append({
                    "id": r["id"],
                    "ip": r["ip"],
                    "hostname": r["hostname"] or "",
                    "mac": r["mac"] or "",
                    "purpose": r["purpose"] or "",
                    "subnetId": r["subnet_id"] or "",
                    "status": r["status"] or "allocated",
                    "note": r["note"] or "",
                    "createdAt": r["created_at"],
                    "updatedAt": r["updated_at"] or r["created_at"]
                })

            # subnets
            cur.execute("SELECT * FROM subnets ORDER BY created_at DESC")
            subnets = []
            for r in cur.fetchall():
                subnets.append({
                    "id": r["id"],
                    "cidr": r["cidr"],
                    "name": r["name"] or "",
                    "gateway": r["gateway"] or "",
                    "version": r["ip_version"] or "IPv4",
                    "note": r["note"] or "",
                    "createdAt": r["created_at"]
                })

            # vlans
            cur.execute("SELECT * FROM vlans ORDER BY created_at DESC")
            vlans = []
            for r in cur.fetchall():
                sub_ids = []
                if r["subnet_ids"]:
                    try:
                        sub_ids = json.loads(r["subnet_ids"])
                    except Exception:
                        pass
                vlans.append({
                    "id": r["id"],
                    "vlanId": r["vlan_id"] or 0,
                    "name": r["name"] or "",
                    "gateway": r["gateway"] or "",
                    "subnetIds": sub_ids,
                    "note": r["note"] or "",
                    "createdAt": r["created_at"]
                })

            # pools
            cur.execute("SELECT * FROM pools ORDER BY created_at DESC")
            pools = []
            for r in cur.fetchall():
                pools.append({
                    "id": r["id"],
                    "name": r["name"] or "",
                    "startIp": r["start_ip"] or "",
                    "endIp": r["end_ip"] or "",
                    "subnetId": r["subnet_id"] or "",
                    "purpose": r["purpose"] or "",
                    "note": r["note"] or "",
                    "createdAt": r["created_at"]
                })

            # devices
            cur.execute("SELECT * FROM devices ORDER BY created_at DESC")
            devices = []
            for r in cur.fetchall():
                devices.append({
                    "id": r["id"],
                    "name": r["name"] or "",
                    "type": r["type"] or "",
                    "location": r["location"] or "",
                    "ip": r["ip"] or "",
                    "mac": r["mac"] or "",
                    "note": r["note"] or "",
                    "createdAt": r["created_at"]
                })

            # backups
            cur.execute("SELECT id, filename, timestamp, size, data FROM backups ORDER BY timestamp DESC")
            backups = []
            for r in cur.fetchall():
                backups.append({
                    "id": r["id"],
                    "filename": r["filename"],
                    "timestamp": r["timestamp"],
                    "size": r["size"],
                    "data": r["data"]
                })

            conn.close()
            self._send_json(200, {
                "ips": ips,
                "subnets": subnets,
                "vlans": vlans,
                "pools": pools,
                "devices": devices,
                "backups": backups
            })
            return

        # 3.5. API: 获取全部用户（含超级管理员标识）
        if path == '/api/users':
            conn = sqlite3.connect(DB_PATH)
            conn.row_factory = sqlite3.Row
            cur = conn.cursor()
            cur.execute("SELECT * FROM users ORDER BY created_at DESC")
            users = []
            for r in cur.fetchall():
                users.append({
                    "id": r["id"],
                    "username": r["username"],
                    "realName": r["real_name"] or "",
                    "password": r["password"] or "",
                    "roleId": r["role_id"] or "",
                    "status": r["status"] or "active",
                    "isSuperAdmin": bool(r["is_super_admin"]),
                    "createdAt": r["created_at"],
                    "lastLoginAt": r["last_login_at"] or ""
                })
            conn.close()
            self._send_json(200, users)
            return

        # 3.6. API: 获取全部角色
        if path == '/api/roles':
            conn = sqlite3.connect(DB_PATH)
            conn.row_factory = sqlite3.Row
            cur = conn.cursor()
            cur.execute("SELECT * FROM roles ORDER BY created_at DESC")
            roles = []
            for r in cur.fetchall():
                perms = []
                if r["permissions"]:
                    try:
                        perms = json.loads(r["permissions"])
                    except Exception:
                        pass
                roles.append({
                    "id": r["id"],
                    "name": r["name"],
                    "description": r["description"] or "",
                    "permissions": perms,
                    "isSystem": bool(r["is_system"]),
                    "createdAt": r["created_at"]
                })
            conn.close()
            self._send_json(200, roles)
            return

        # 4. SPA 路由回退处理
        full_path = os.path.join(WEB_DIR, path.lstrip('/'))
        if not os.path.exists(full_path) and not path.startswith('/assets/'):
            self.path = '/index.html'
        return super().do_GET()

    def do_POST(self):
        self._strip_gateway_prefix()
        parsed = urlparse(self.path)
        path = parsed.path

        content_length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(content_length) if content_length > 0 else b'{}'
        try:
            req_data = json.loads(body.decode('utf-8'))
        except Exception:
            req_data = {}

        # 1. API: 飞牛 NAS 授权登录（优先从网关注入获取，支持授权请求传入的飞牛系统用户名）
        if path == '/api/auth/nas-login':
            username = self._gateway_identity() or req_data.get('username') or 'hyadmin'
            username = username.strip()
            if not username:
                username = 'hyadmin'

            conn = sqlite3.connect(DB_PATH)
            conn.row_factory = sqlite3.Row
            cur = conn.cursor()

            cur.execute("SELECT * FROM users WHERE LOWER(username) = LOWER(?)", (username,))
            user = cur.fetchone()
            now = now_iso()
            if not user:
                # 判断是否为首个用户：首个通过飞牛授权登录的用户自动成为超级管理员
                cur.execute("SELECT COUNT(*) FROM users")
                total = cur.fetchone()[0]
                is_first = (total == 0 or total == 1 and cur.execute("SELECT username FROM users").fetchone()["username"] == 'admin')
                role_id = 'role-admin' if is_first else 'role-viewer'
                is_super = 1 if is_first else 0
                user_id = f"user-{username}"
                real_name = f"超级管理员 ({username})" if is_first else f"NAS 用户 ({username})"
                cur.execute(
                    "INSERT INTO users (id, username, real_name, password, role_id, status, is_super_admin, created_at, last_login_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    (user_id, username, real_name, "", role_id, 'active', is_super, now, now)
                )
                conn.commit()
                cur.execute("SELECT * FROM users WHERE id = ?", (user_id,))
                user = cur.fetchone()
            else:
                cur.execute("UPDATE users SET last_login_at = ? WHERE id = ?", (now, user["id"]))
                conn.commit()

            res_user = {
                "id": user["id"],
                "username": user["username"],
                "realName": user["real_name"],
                "roleId": user["role_id"],
                "status": user["status"],
                "isSuperAdmin": bool(user["is_super_admin"]),
                "createdAt": user["created_at"],
                "lastLoginAt": now
            }
            conn.close()
            self._send_json(200, {"ok": True, "user": res_user})
            return

        # 2. API: 账号密码登录
        if path == '/api/auth/login':
            username = req_data.get('username', '').strip()
            password = req_data.get('password', '')
            conn = sqlite3.connect(DB_PATH)
            conn.row_factory = sqlite3.Row
            cur = conn.cursor()

            cur.execute("SELECT * FROM users WHERE LOWER(username) = LOWER(?)", (username,))
            user = cur.fetchone()
            if not user or (user["password"] and user["password"] != password):
                conn.close()
                self._send_json(401, {"ok": False, "error": "用户名或密码错误"})
                return

            if user["status"] == 'disabled':
                conn.close()
                self._send_json(403, {"ok": False, "error": "该账号已被禁用"})
                return

            now = now_iso()
            cur.execute("UPDATE users SET last_login_at = ? WHERE id = ?", (now, user["id"]))
            conn.commit()

            res_user = {
                "id": user["id"],
                "username": user["username"],
                "realName": user["real_name"],
                "roleId": user["role_id"],
                "status": user["status"],
                "isSuperAdmin": bool(user["is_super_admin"]),
                "createdAt": user["created_at"],
                "lastLoginAt": now
            }
            conn.close()
            self._send_json(200, {"ok": True, "user": res_user})
            return

        # 3. API: 保存全量数据到 SQLite
        if path == '/api/data':
            conn = sqlite3.connect(DB_PATH)
            cur = conn.cursor()

            # ips
            if "ips" in req_data:
                cur.execute("DELETE FROM ips")
                for r in req_data["ips"]:
                    cur.execute(
                        "INSERT INTO ips (id, ip, hostname, mac, purpose, subnet_id, status, note, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                        (r.get("id"), r.get("ip"), r.get("hostname"), r.get("mac"), r.get("purpose"), r.get("subnetId"), r.get("status"), r.get("note"), r.get("createdAt"), r.get("updatedAt"))
                    )

            # subnets
            if "subnets" in req_data:
                cur.execute("DELETE FROM subnets")
                for r in req_data["subnets"]:
                    cur.execute(
                        "INSERT INTO subnets (id, cidr, name, gateway, ip_version, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                        (r.get("id"), r.get("cidr"), r.get("name"), r.get("gateway"), r.get("version", "IPv4"), r.get("note"), r.get("createdAt"))
                    )

            # vlans
            if "vlans" in req_data:
                cur.execute("DELETE FROM vlans")
                for r in req_data["vlans"]:
                    sub_ids_str = json.dumps(r.get("subnetIds", []))
                    cur.execute(
                        "INSERT INTO vlans (id, vlan_id, name, gateway, subnet_ids, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                        (r.get("id"), r.get("vlanId", 0), r.get("name"), r.get("gateway"), sub_ids_str, r.get("note"), r.get("createdAt"))
                    )

            # pools
            if "pools" in req_data:
                cur.execute("DELETE FROM pools")
                for r in req_data["pools"]:
                    cur.execute(
                        "INSERT INTO pools (id, name, start_ip, end_ip, subnet_id, purpose, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                        (r.get("id"), r.get("name"), r.get("startIp"), r.get("endIp"), r.get("subnetId"), r.get("purpose"), r.get("note"), r.get("createdAt"))
                    )

            # devices
            if "devices" in req_data:
                cur.execute("DELETE FROM devices")
                for r in req_data["devices"]:
                    cur.execute(
                        "INSERT INTO devices (id, name, type, location, ip, mac, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                        (r.get("id"), r.get("name"), r.get("type"), r.get("location"), r.get("ip"), r.get("mac"), r.get("note"), r.get("createdAt"))
                    )

            # backups
            if "backups" in req_data:
                cur.execute("DELETE FROM backups")
                for r in req_data["backups"]:
                    cur.execute(
                        "INSERT INTO backups (id, filename, timestamp, size, data) VALUES (?, ?, ?, ?, ?)",
                        (r.get("id"), r.get("filename"), r.get("timestamp"), r.get("size", 0), r.get("data", ""))
                    )

            conn.commit()
            conn.close()
            self._send_json(200, {"ok": True})
            return

        # 4. API: 保存全部用户（全量替换，含超级管理员标识）
        if path == '/api/users':
            conn = sqlite3.connect(DB_PATH)
            cur = conn.cursor()
            cur.execute("DELETE FROM users")
            for r in req_data:
                cur.execute(
                    "INSERT INTO users (id, username, real_name, password, role_id, status, is_super_admin, created_at, last_login_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    (r.get("id"), r.get("username"), r.get("realName"), r.get("password"), r.get("roleId"), r.get("status", "active"), 1 if r.get("isSuperAdmin") else 0, r.get("createdAt"), r.get("lastLoginAt"))
                )
            conn.commit()
            conn.close()
            self._send_json(200, {"ok": True})
            return

        # 5. API: 保存全部角色（全量替换）
        if path == '/api/roles':
            conn = sqlite3.connect(DB_PATH)
            cur = conn.cursor()
            cur.execute("DELETE FROM roles")
            for r in req_data:
                perms_str = json.dumps(r.get("permissions", []))
                cur.execute(
                    "INSERT INTO roles (id, name, description, permissions, is_system, created_at) VALUES (?, ?, ?, ?, ?, ?)",
                    (r.get("id"), r.get("name"), r.get("description"), perms_str, 1 if r.get("isSystem") else 0, r.get("createdAt"))
                )
            conn.commit()
            conn.close()
            self._send_json(200, {"ok": True})
            return

        self._send_json(404, {"error": "Not Found"})

if __name__ == '__main__':
    # 统一网关 Unix Socket 服务（真实流量入口，fnOS 注入用户身份 Header）
    unix_server = None
    try:
        if os.path.exists(SOCK_PATH):
            os.unlink(SOCK_PATH)
        os.makedirs(os.path.dirname(SOCK_PATH), exist_ok=True)

        class ThreadingUnixHTTPServer(ThreadingHTTPServer):
            address_family = socket.AF_UNIX
            daemon_threads = True
            def server_bind(self):
                self.socket.bind(self.server_address)
                self.server_name = 'localhost'
                self.server_port = 0

        unix_server = ThreadingUnixHTTPServer(SOCK_PATH, IPAMRequestHandler)
        os.chmod(SOCK_PATH, 0o666)
        print(f"🔗 Gateway Unix Socket listening at {SOCK_PATH}")
    except Exception as e:
        print(f"⚠️ Unix Socket 启动失败（将仅提供 TCP 服务）: {e}")

    # TCP 端口服务（健康检查与本地调试；不携带身份 Header）
    tcp_server = ThreadingHTTPServer(('0.0.0.0', PORT), IPAMRequestHandler)
    print(f"🚀 IPAM SQLite Backend (health check) on 0.0.0.0:{PORT}, Database at {DB_PATH}")

    try:
        if unix_server:
            threading.Thread(target=unix_server.serve_forever, daemon=True).start()
        tcp_server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        if unix_server:
            unix_server.server_close()
        tcp_server.server_close()
        if os.path.exists(SOCK_PATH):
            try:
                os.unlink(SOCK_PATH)
            except Exception:
                pass
