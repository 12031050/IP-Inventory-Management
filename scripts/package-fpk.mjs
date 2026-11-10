/**
 * 打包飞牛 fnOS 应用中心安装包（.fpk）—— 对齐官方 fnpack 规范
 *
 * 用法：node scripts/package-fpk.mjs [version]
 * 产物：packaging/ipam-<version>.fpk
 *
 * .fpk 结构（官方 fnpack 项目布局）：
 *   manifest / ICON.PNG / ICON_256.PNG / health.json
 *   cmd/  config/  wizard/  app.tgz（www 静态站点 + docker 编排 + ui 入口资源）
 */
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import os from 'os';

const ROOT = path.resolve(import.meta.dirname, '..');
const DIST = path.join(ROOT, 'dist');
const PKG_DIR = path.join(ROOT, 'packaging', 'fnos-app', 'ipam');
const VERSION = process.argv[2] || '1.0.1';
const STAGE = path.join(os.tmpdir(), `ipam-fpk-${Date.now()}`);
const OUT_DIR = path.join(ROOT, 'packaging');
const FPK = path.join(OUT_DIR, `ipam-${VERSION}.fpk`);

function sh(cmd, cwd) {
  execSync(cmd, { cwd, stdio: 'inherit', shell: true });
}
function rm(p) {
  fs.rmSync(p, { recursive: true, force: true });
}

// 1. 构建生产版本 dist
if (!fs.existsSync(path.join(DIST, 'index.html'))) {
  console.log('>> 构建 dist ...');
  sh('npx vite build --minify false', ROOT);
} else {
  console.log('>> 使用已有 dist 构建产物');
}

rm(STAGE);
fs.mkdirSync(path.join(STAGE, 'app'), { recursive: true });

// 2. 组装 app/（www 静态站点 + docker 编排 + ui 入口资源）→ app.tgz
console.log('>> 组装 app.tgz ...');
fs.cpSync(DIST, path.join(STAGE, 'app', 'www'), { recursive: true });
fs.cpSync(path.join(PKG_DIR, 'app', 'docker'), path.join(STAGE, 'app', 'docker'), { recursive: true });
fs.cpSync(path.join(PKG_DIR, 'app', 'ui'), path.join(STAGE, 'app', 'ui'), { recursive: true });
sh('tar -czf app.tgz -C app .', STAGE);
rm(path.join(STAGE, 'app'));

// 3. manifest 写入 app.tgz 的 md5 校验和
const md5 = crypto.createHash('md5').update(fs.readFileSync(path.join(STAGE, 'app.tgz'))).digest('hex');
let manifest = fs.readFileSync(path.join(PKG_DIR, 'manifest'), 'utf8');
manifest = manifest.replace(/^checksum\s*=.*$/m, `checksum=${md5}`);
fs.writeFileSync(path.join(STAGE, 'manifest'), manifest);

// 4. 复制其余打包文件（cmd / config / wizard / 图标 / 健康检查）
fs.cpSync(path.join(PKG_DIR, 'cmd'), path.join(STAGE, 'cmd'), { recursive: true });
fs.cpSync(path.join(PKG_DIR, 'config'), path.join(STAGE, 'config'), { recursive: true });
fs.cpSync(path.join(PKG_DIR, 'wizard'), path.join(STAGE, 'wizard'), { recursive: true });
fs.copyFileSync(path.join(PKG_DIR, 'ICON.PNG'), path.join(STAGE, 'ICON.PNG'));
fs.copyFileSync(path.join(PKG_DIR, 'ICON_256.PNG'), path.join(STAGE, 'ICON_256.PNG'));
fs.copyFileSync(path.join(PKG_DIR, 'health.json'), path.join(STAGE, 'health.json'));

// 5. 打包 .fpk（使用 Python 确保纯净归档路径与 +x 脚本权限）
console.log('>> 打包 .fpk ...');
fs.mkdirSync(OUT_DIR, { recursive: true });
rm(FPK);
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
            ti.mode = 0o755 if "cmd/" in rel or rel.endswith(".sh") else 0o644
            ti.uid = ti.gid = 0
            with open(fp, "rb") as f:
                tar.addfile(ti, f)
'`, STAGE);
rm(STAGE);
console.log(`>> 完成: ${FPK} (${fs.statSync(FPK).size} bytes)`);
