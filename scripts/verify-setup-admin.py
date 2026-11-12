#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""「创建管理员帐号」向导端到端冒烟测试。

在临时目录复制一份 server.py 并启动，不读写项目内数据。
运行：python scripts/verify-setup-admin.py
退出码：0 全部通过，1 存在失败项。
"""

import json
import os
import shutil
import socket
import sqlite3
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SOURCE = os.path.join(ROOT, 'packaging', 'templates-cgi', 'app', 'server.py')
HASH_PREFIX = 'pbkdf2_sha256$'


def free_port():
    s = socket.socket()
    s.bind(('127.0.0.1', 0))
    port = s.getsockname()[1]
    s.close()
    return port


class Client:
    def __init__(self, base):
        self.base = base

    def request(self, path, method='GET', data=None, headers=None):
        body = json.dumps(data).encode('utf-8') if data is not None else None
        merged = {'Content-Type': 'application/json'}
        if headers:
            merged.update(headers)
        req = urllib.request.Request(self.base + path, data=body, method=method, headers=merged)
        try:
            with urllib.request.urlopen(req, timeout=3) as resp:
                raw = resp.read().decode('utf-8', errors='replace')
                return resp.status, self.parse(raw), dict(resp.headers)
        except urllib.error.HTTPError as e:
            raw = e.read().decode('utf-8', errors='replace')
            return e.code, self.parse(raw), dict(e.headers)
        except Exception as e:
            return 'ERR', str(e), {}

    @staticmethod
    def parse(raw):
        stripped = raw.strip()
        if stripped.startswith(('{', '[')):
            try:
                return json.loads(raw)
            except Exception:
                return raw[:300]
        return raw[:300]

    def wait_ready(self, timeout=12):
        deadline = time.time() + timeout
        while time.time() < deadline:
            if self.request('/api/health')[0] == 200:
                return True
            time.sleep(0.2)
        return False


def main():
    if not os.path.isfile(SOURCE):
        print('FAIL 未找到 server.py:', SOURCE)
        return 1

    tmp = tempfile.mkdtemp(prefix='ipam-setup-test-')
    proc = None
    failures = []

    def check(label, cond, detail=''):
        print(('  PASS  ' if cond else '  FAIL  ') + label + ((' | ' + str(detail)) if detail else ''))
        if not cond:
            failures.append(label)

    try:
        shutil.copy(SOURCE, os.path.join(tmp, 'server.py'))
        www = os.path.join(tmp, 'www')
        os.makedirs(www)
        with open(os.path.join(www, 'index.html'), 'w', encoding='utf-8') as f:
            f.write('<html>ok</html>')

        env = dict(os.environ, TRIM_APPDEST=tmp)
        env.pop('TRIM_PKGVAR', None)
        port = free_port()
        proc = subprocess.Popen(
            [sys.executable, os.path.join(tmp, 'server.py'), str(port), www],
            env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )
        api = Client('http://127.0.0.1:%d' % port)
        db_path = os.path.join(tmp, 'data', 'ipam.db')
        nas_header = {'X-Trim-Username': 'jiaxue'}

        def db_row(username):
            conn = sqlite3.connect(db_path)
            conn.row_factory = sqlite3.Row
            row = conn.execute(
                'SELECT * FROM users WHERE LOWER(username) = LOWER(?)', (username,)
            ).fetchone()
            conn.close()
            return row

        if not api.wait_ready():
            print('FAIL 后端未在超时时间内就绪')
            return 1

        print('== 首次部署：授权后进入创建管理员向导 ==')
        status, data, _ = api.request('/api/users')
        check('初始用户表为空', status == 200 and data == [], data)
        status, data, _ = api.request('/api/auth/nas-login', 'POST', {}, nas_header)
        check('授权返回 needSetup=create',
              status == 200 and data.get('needSetup') is True and data.get('setupMode') == 'create', data)
        check('向导用户名取自网关身份',
              isinstance(data, dict) and data.get('nasUser', {}).get('username') == 'jiaxue',
              data.get('nasUser') if isinstance(data, dict) else data)
        check('授权阶段未提前创建账号', api.request('/api/users')[1] == [])
        status, data, _ = api.request('/api/auth/nas-login', 'POST', {})
        check('无网关身份的授权被拒绝', status == 401, data)

        print('== 设置密码与创建超管 ==')
        status, data, _ = api.request('/api/auth/setup-admin', 'POST', {'password': '123'}, nas_header)
        check('短密码被拒绝', status == 400, data)
        status, data, _ = api.request('/api/auth/setup-admin', 'POST', {'password': 'MyPass123'}, nas_header)
        check('创建超管成功',
              status == 200 and isinstance(data, dict) and data.get('user', {}).get('isSuperAdmin') is True, data)
        check('返回体不含密码', isinstance(data, dict) and 'password' not in data.get('user', {}),
              list(data.get('user', {}).keys()) if isinstance(data, dict) else data)
        row = db_row('jiaxue')
        check('数据库存 PBKDF2 加盐哈希', bool(row) and (row['password'] or '').startswith(HASH_PREFIX),
              (row['password'] or '')[:34] if row else None)
        check('数据库 is_super_admin=1', bool(row) and row['is_super_admin'] == 1,
              row['is_super_admin'] if row else None)

        print('== 登录校验 ==')
        status, data, _ = api.request('/api/users')
        check('GET /api/users 不下发密码',
              isinstance(data, list) and all('password' not in u for u in data), data)
        check('响应未开放 CORS 通配', True)  # 下方单独取响应头验证
        status, _, headers = api.request('/api/health')
        check('响应头无 Access-Control-Allow-Origin',
              'Access-Control-Allow-Origin' not in headers, dict(headers))
        status, data, _ = api.request('/api/auth/login', 'POST',
                                      {'username': 'jiaxue', 'password': 'wrong'})
        check('错误密码被拒绝', status == 401, data)
        status, data, _ = api.request('/api/auth/login', 'POST',
                                      {'username': 'jiaxue', 'password': ''})
        check('空密码被拒绝', status == 401, data)
        status, data, _ = api.request('/api/auth/login', 'POST',
                                      {'username': 'jiaxue', 'password': 'MyPass123'})
        check('正确密码可登录',
              status == 200 and isinstance(data, dict) and data.get('user', {}).get('username') == 'jiaxue', data)

        print('== 前端全量写回不破坏凭据 ==')
        _, users, _ = api.request('/api/users')
        payload = [dict(u, isSuperAdmin=False) for u in users]
        status, data, _ = api.request('/api/users', 'POST', payload)
        check('写回用户表成功', status == 200, data)
        row = db_row('jiaxue')
        check('写回后密码哈希仍在', bool(row) and (row['password'] or '').startswith(HASH_PREFIX),
              (row['password'] or '')[:34] if row else None)
        check('写回后超管标记不被前端改写', bool(row) and row['is_super_admin'] == 1,
              row['is_super_admin'] if row else None)
        status, _, _ = api.request('/api/auth/login', 'POST',
                                   {'username': 'jiaxue', 'password': 'MyPass123'})
        check('写回后仍能正常登录', status == 200)

        print('== 幂等性与其它账号 ==')
        status, data, _ = api.request('/api/auth/setup-admin', 'POST',
                                      {'password': 'Another123'}, nas_header)
        check('重复初始化被拒绝', status == 403, data)
        status, data, _ = api.request('/api/auth/nas-login', 'POST', {}, nas_header)
        check('再次授权直接放行',
              status == 200 and isinstance(data, dict) and data.get('ok') is True
              and not data.get('needSetup'), data)
        status, data, _ = api.request('/api/auth/nas-login', 'POST', {},
                                      {'X-Trim-Username': 'other'})
        check('第二个 NAS 用户为只读访客',
              status == 200 and isinstance(data, dict)
              and data.get('user', {}).get('roleId') == 'role-viewer', data)
        status, data, _ = api.request('/api/auth/login', 'POST',
                                      {'username': 'other', 'password': 'anything'})
        check('NAS 访客不能用密码登录', status == 401, data)

        print('== 旧版本明文密码透明升级 ==')
        conn = sqlite3.connect(db_path)
        conn.execute("UPDATE users SET password = 'legacy123' WHERE username = 'other'")
        conn.commit()
        conn.close()
        status, data, _ = api.request('/api/auth/login', 'POST',
                                      {'username': 'other', 'password': 'legacy123'})
        check('旧明文密码仍可登录', status == 200, data)
        row = db_row('other')
        check('登录后自动升级为哈希', bool(row) and (row['password'] or '').startswith(HASH_PREFIX),
              (row['password'] or '')[:34] if row else None)

        print('== 旧版本空密码超管升级路径 ==')
        conn = sqlite3.connect(db_path)
        conn.execute("UPDATE users SET password = '' WHERE username = 'jiaxue'")
        conn.commit()
        conn.close()
        status, data, _ = api.request('/api/auth/nas-login', 'POST', {}, nas_header)
        check('空密码超管被拦到 setPassword',
              status == 200 and isinstance(data, dict)
              and data.get('setupMode') == 'setPassword', data)
        status, data, _ = api.request('/api/auth/setup-admin', 'POST',
                                      {'password': 'NewPass456'}, nas_header)
        check('补设密码成功', status == 200, data)
        status, _, _ = api.request('/api/auth/login', 'POST',
                                   {'username': 'jiaxue', 'password': 'NewPass456'})
        check('补设后可用新密码登录', status == 200)
    finally:
        if proc:
            proc.terminate()
            try:
                proc.wait(timeout=3)
            except Exception:
                proc.kill()
        shutil.rmtree(tmp, ignore_errors=True)

    print('\n结果：' + ('全部通过' if not failures else '%d 项失败 -> %s' % (len(failures), failures)))
    return 1 if failures else 0


if __name__ == '__main__':
    sys.exit(main())
