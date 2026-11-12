#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
飞牛 fnOS IPAM .fpk 打包脚本（统一网关模式 · v1.2.0）
- 前端以 /app/ipam/ 为 base 构建（静态资源带网关前缀，规避白屏）
- app/ui/config 使用 gatewayPrefix/gatewaySocket 统一网关入口
- server.py 监听 ${TRIM_APPDEST}/app.sock（TCP 仅健康检查）
- 产物：packaging/ipam-1.2.0.fpk 并复制为 packaging/ipam.fpk
"""
import os, sys, json, tarfile, hashlib, shutil, subprocess, tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIST = os.path.join(ROOT, "dist")
TEMPLATES = os.path.join(ROOT, "packaging", "templates-cgi")
COMMON = os.path.join(ROOT, "packaging", "fnos-app", "ipam")
V113 = os.path.join(ROOT, "packaging", "build_v113", "fpk_stage")
OUT_DIR = os.path.join(ROOT, "packaging")

APP_STAGE = os.path.join(tempfile.gettempdir(), "ipam120_app")
STAGE = os.path.join(tempfile.gettempdir(), "ipam120_stage")
VERSION = "1.2.0"


def sh(cmd):
    print(">>", cmd)
    subprocess.run(cmd, shell=True, cwd=ROOT, check=True)


def clean(p):
    if os.path.exists(p):
        shutil.rmtree(p)
    os.makedirs(p, exist_ok=True)


def md5(p):
    h = hashlib.md5()
    with open(p, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            h.update(chunk)
    return h.hexdigest()


def make_tgz(src, out):
    with tarfile.open(out, "w:gz") as tar:
        for root, dirs, files in os.walk(src):
            for name in dirs:
                fp = os.path.join(root, name)
                rel = os.path.relpath(fp, src)
                ti = tar.gettarinfo(fp, arcname=rel)
                ti.mode = 0o755
                ti.uid = ti.gid = 0
                tar.addfile(ti)
            for name in files:
                fp = os.path.join(root, name)
                rel = os.path.relpath(fp, src)
                ti = tar.gettarinfo(fp, arcname=rel)
                exe = rel.endswith(".cgi") or rel.endswith(".sh") or "cmd/" in rel
                ti.mode = 0o755 if exe else 0o644
                ti.uid = ti.gid = 0
                with open(fp, "rb") as f:
                    tar.addfile(ti, f)


# 1. 前端构建（统一网关 base 前缀）
sh("npx vite build --base /app/ipam/")

# 2. 组装 app_stage
clean(APP_STAGE)
# server.py（后端唯一文件）
shutil.copy(os.path.join(TEMPLATES, "app", "server.py"), os.path.join(APP_STAGE, "server.py"))
# www（前端构建产物）
shutil.copytree(DIST, os.path.join(APP_STAGE, "www"))
# data 目录占位
os.makedirs(os.path.join(APP_STAGE, "data"), exist_ok=True)
# ui
ui = os.path.join(APP_STAGE, "ui")
os.makedirs(os.path.join(ui, "images"), exist_ok=True)
shutil.copy(os.path.join(TEMPLATES, "app", "ui", "config"), os.path.join(ui, "config"))
shutil.copy(os.path.join(TEMPLATES, "app", "ui", "index.cgi"), os.path.join(ui, "index.cgi"))
os.chmod(os.path.join(ui, "index.cgi"), 0o755)
shutil.copy(os.path.join(COMMON, "app", "ui", "images", "icon_64.png"), os.path.join(ui, "images", "icon_64.png"))
shutil.copy(os.path.join(COMMON, "app", "ui", "images", "icon_256.png"), os.path.join(ui, "images", "icon_256.png"))

# 3. 组装 fpk_stage
clean(STAGE)
# app.tgz
app_tgz = os.path.join(STAGE, "app.tgz")
make_tgz(APP_STAGE, app_tgz)
checksum = md5(app_tgz)
print(">> app.tgz MD5:", checksum)

# manifest
manifest = f"""appname = ipam
version = {VERSION}
display_name = IP台账管理
desc = 面向飞牛fnOS系统的IP地址管理工具，用于网络设备IP地址的集中规划、分配和监控，解决地址冲突与资源浪费问题。系统以Web应用形式部署，支持跨浏览器访问，提供网络资源台账化管理与数据持久化能力。
platform = all
source = thirdparty
maintainer = 梦非常浪漫
distributor = 梦非常浪漫
desktop_uidir = ui
desktop_applaunchname = ipam.main
service_port = 28090
checkport = true
ctl_stop = true
checksum = {checksum}
"""
with open(os.path.join(STAGE, "manifest"), "w", encoding="utf-8") as f:
    f.write(manifest)

# cmd 生命周期脚本（沿用 v113，main 已支持 TCP+UnixSocket 双监听）
cmd_dir = os.path.join(STAGE, "cmd")
os.makedirs(cmd_dir, exist_ok=True)
for name in ["main", "install_init", "install_callback", "config_init", "config_callback",
             "upgrade_init", "upgrade_callback", "uninstall_init", "uninstall_callback"]:
    src = os.path.join(V113, "cmd", name)
    dst = os.path.join(cmd_dir, name)
    shutil.copy(src, dst)
    os.chmod(dst, 0o755)

# config
cfg = os.path.join(STAGE, "config")
os.makedirs(cfg, exist_ok=True)
shutil.copy(os.path.join(TEMPLATES, "config", "privilege"), os.path.join(cfg, "privilege"))
shutil.copy(os.path.join(TEMPLATES, "config", "resource"), os.path.join(cfg, "resource"))

# health.json（TCP 健康检查端口 28090）
with open(os.path.join(STAGE, "health.json"), "w", encoding="utf-8") as f:
    json.dump({"protocol": "http", "port": 28090, "path": "/api/health", "interval": 10, "timeout": 5}, f, indent=2)

# ICON
shutil.copy(os.path.join(COMMON, "ICON.PNG"), os.path.join(STAGE, "ICON.PNG"))
shutil.copy(os.path.join(COMMON, "ICON_256.PNG"), os.path.join(STAGE, "ICON_256.PNG"))

# wizard
os.makedirs(os.path.join(STAGE, "wizard"), exist_ok=True)
open(os.path.join(STAGE, "wizard", ".keep"), "w").close()

# 4. 打包 .fpk
fpk = os.path.join(OUT_DIR, f"ipam-{VERSION}.fpk")
make_tgz(STAGE, fpk)
shutil.copy(fpk, os.path.join(OUT_DIR, "ipam.fpk"))

print(">> 打包完成:")
print("   主包:", fpk, f"({os.path.getsize(fpk)} bytes)")
print("   副本:", os.path.join(OUT_DIR, "ipam.fpk"))

# 清理临时目录
shutil.rmtree(APP_STAGE, ignore_errors=True)
shutil.rmtree(STAGE, ignore_errors=True)
