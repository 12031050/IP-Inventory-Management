#!/usr/bin/env node
/**
 * 飞牛 fnOS .fpk 打包脚本（CGI 免 Docker 版本）
 * 1. 构建 React SPA 前端 (dist -> www)
 * 2. 相对路径适配 (index.html: /assets/ -> ./assets/)
 * 3. 组装 app.tgz (www + ui + index.cgi)
 * 4. 计算 app.tgz MD5 写入 manifest
 * 5. 生成标准规范的 .fpk 安装包
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const OUT_DIR = path.join(ROOT, 'packaging');
const TEMPLATES = path.join(OUT_DIR, 'templates-cgi');
const COMMON_DIR = path.join(OUT_DIR, 'fnos-app/ipam');
const STAGE = '/tmp/fnos-fpk-cgi-stage';
const APP_STAGE = '/tmp/fnos-fpk-cgi-app';

function sh(cmd, cwd = ROOT) {
  return execSync(cmd, { cwd, stdio: 'inherit' });
}

function rm(p) {
  if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true });
}

function md5File(filePath) {
  const buf = fs.readFileSync(filePath);
  return crypto.createHash('md5').update(buf).digest('hex');
}

console.log('==================================================');
console.log('飞牛 fnOS 应用打包（CGI 免 Docker 模式）');
console.log('==================================================');

// 1. 构建前端
console.log('>> 构建前端 dist ...');
sh('npx vite build');

// 2. 准备阶段目录
rm(STAGE);
rm(APP_STAGE);
fs.mkdirSync(STAGE, { recursive: true });
fs.mkdirSync(APP_STAGE, { recursive: true });

// 复制 www 并调整为相对路径
console.log('>> 复制 www 静态资源并优化路径 ...');
const WWW_DIR = path.join(APP_STAGE, 'www');
fs.cpSync(DIST, WWW_DIR, { recursive: true });

const indexPath = path.join(WWW_DIR, 'index.html');
if (fs.existsSync(indexPath)) {
  let html = fs.readFileSync(indexPath, 'utf-8');
  // 将 /assets/ 转换为 ./assets/，确保在 CGI 子路径下资源定位准确
  html = html.replaceAll('href="/assets/', 'href="./assets/');
  html = html.replaceAll('src="/assets/', 'src="./assets/');
  html = html.replaceAll('href="/favicon', 'href="./favicon');
  fs.writeFileSync(indexPath, html, 'utf-8');
  console.log('   已将 index.html 资源引用转换为相对路径');
}

// 复制 ui 到 APP_STAGE
console.log('>> 组装 app/ui ...');
const UI_STAGE = path.join(APP_STAGE, 'ui');
fs.mkdirSync(UI_STAGE, { recursive: true });
fs.copyFileSync(path.join(TEMPLATES, 'app/ui/config'), path.join(UI_STAGE, 'config'));
fs.copyFileSync(path.join(TEMPLATES, 'app/ui/index.cgi'), path.join(UI_STAGE, 'index.cgi'));

// 确保图标完整
const IMAGES_DIR = path.join(UI_STAGE, 'images');
fs.mkdirSync(IMAGES_DIR, { recursive: true });
fs.copyFileSync(path.join(COMMON_DIR, 'app/ui/images/icon_64.png'), path.join(IMAGES_DIR, 'icon_64.png'));
fs.copyFileSync(path.join(COMMON_DIR, 'app/ui/images/icon_256.png'), path.join(IMAGES_DIR, 'icon_256.png'));

// 设置 index.cgi 可执行权限
fs.chmodSync(path.join(UI_STAGE, 'index.cgi'), 0o755);

// 3. 组装 app.tgz
console.log('>> 打包 app.tgz ...');
const APP_TGZ = path.join(STAGE, 'app.tgz');
sh(`python3 -c '
import os, tarfile
stage = "${APP_STAGE}"
out_tgz = "${APP_TGZ}"
with tarfile.open(out_tgz, "w:gz") as tar:
    for root, dirs, files in os.walk(stage):
        for name in dirs:
            fp = os.path.join(root, name)
            rel = os.path.relpath(fp, stage)
            ti = tar.gettarinfo(fp, arcname=rel)
            ti.mode = 0o755
            ti.uid = ti.gid = 0
            tar.addfile(ti)
        for name in files:
            fp = os.path.join(root, name)
            rel = os.path.relpath(fp, stage)
            ti = tar.gettarinfo(fp, arcname=rel)
            ti.mode = 0o755 if rel.endswith(".cgi") or rel.endswith(".sh") else 0o644
            ti.uid = ti.gid = 0
            with open(fp, "rb") as f:
                tar.addfile(ti, f)
'`, ROOT);

// 4. 计算 checksum 并写入 manifest
const checksum = md5File(APP_TGZ);
console.log(`>> app.tgz MD5: ${checksum}`);

let manifestContent = fs.readFileSync(path.join(TEMPLATES, 'manifest'), 'utf-8');
manifestContent = manifestContent.replace('__APP_TGZ_MD5__', checksum);
fs.writeFileSync(path.join(STAGE, 'manifest'), manifestContent, 'utf-8');

// 复制其他根文件
fs.mkdirSync(path.join(STAGE, 'config'), { recursive: true });
fs.copyFileSync(path.join(TEMPLATES, 'config/privilege'), path.join(STAGE, 'config/privilege'));
fs.copyFileSync(path.join(TEMPLATES, 'config/resource'), path.join(STAGE, 'config/resource'));

fs.mkdirSync(path.join(STAGE, 'wizard'), { recursive: true });
fs.writeFileSync(path.join(STAGE, 'wizard/.keep'), '');

fs.copyFileSync(path.join(COMMON_DIR, 'ICON.PNG'), path.join(STAGE, 'ICON.PNG'));
fs.copyFileSync(path.join(COMMON_DIR, 'ICON_256.PNG'), path.join(STAGE, 'ICON_256.PNG'));

// 写入健康检查
const healthJson = {
  version: '1.0',
  type: 'static',
  description: 'Pure static CGI application without daemon'
};
fs.writeFileSync(path.join(STAGE, 'health.json'), JSON.stringify(healthJson, null, 2));

// 5. 打包 .fpk
console.log('>> 打包 .fpk ...');
fs.mkdirSync(OUT_DIR, { recursive: true });
const FPK = path.join(OUT_DIR, 'ipam-1.0.1.fpk');
const FPK_CGI = path.join(OUT_DIR, 'ipam-cgi-1.0.1.fpk');
rm(FPK);
rm(FPK_CGI);

sh(`python3 -c '
import os, tarfile
stage = "${STAGE}"
fpk_out = "${FPK}"
with tarfile.open(fpk_out, "w:gz") as tar:
    for root, dirs, files in os.walk(stage):
        for name in dirs:
            fp = os.path.join(root, name)
            rel = os.path.relpath(fp, stage)
            ti = tar.gettarinfo(fp, arcname=rel)
            ti.mode = 0o755
            ti.uid = ti.gid = 0
            tar.addfile(ti)
        for name in files:
            fp = os.path.join(root, name)
            rel = os.path.relpath(fp, stage)
            ti = tar.gettarinfo(fp, arcname=rel)
            ti.mode = 0o755 if "cmd/" in rel or rel.endswith(".sh") or rel.endswith(".cgi") else 0o644
            ti.uid = ti.gid = 0
            with open(fp, "rb") as f:
                tar.addfile(ti, f)
'`, STAGE);

fs.copyFileSync(FPK, FPK_CGI);
rm(STAGE);
rm(APP_STAGE);

console.log(`>> 打包完成:`);
console.log(`   主包: ${FPK} (${fs.statSync(FPK).size} bytes)`);
console.log(`   备份: ${FPK_CGI} (${fs.statSync(FPK_CGI).size} bytes)`);
