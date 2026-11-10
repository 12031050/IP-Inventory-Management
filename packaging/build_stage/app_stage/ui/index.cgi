#!/bin/bash
# 飞牛 fnOS - SPA 静态资源 CGI 分发网关 (IPAM 控制台)
# 适用: 纯前端单页应用（无需 Docker、免常驻进程、零端口占用）

# 优先读取飞牛环境变量，若未注入则回退到默认安装路径
if [ -n "$TRIM_APPDEST" ]; then
  BASE_PATH="${TRIM_APPDEST}/www"
elif [ -d "/var/apps/ipam/target/www" ]; then
  BASE_PATH="/var/apps/ipam/target/www"
else
  # 获取当前脚本所在目录的上级 www
  BASE_PATH="$(cd "$(dirname "$0")/../www" 2>/dev/null && pwd)"
fi

# 提取请求 URI（去除查询参数）
URI_NO_QUERY="${REQUEST_URI%%\?*}"
REL_PATH="/"

# 解析 index.cgi 后的相对资源路径
case "$URI_NO_QUERY" in
  *index.cgi*)
    REL_PATH="${URI_NO_QUERY#*index.cgi}"
    ;;
  *)
    REL_PATH="$PATH_INFO"
    ;;
esac

# 默认首页
if [ -z "$REL_PATH" ] || [ "$REL_PATH" = "/" ] || [ "$REL_PATH" = "/index.cgi" ]; then
  REL_PATH="/index.html"
fi

# 确保以 / 开头
case "$REL_PATH" in
  /*) ;;
  *) REL_PATH="/$REL_PATH" ;;
esac

TARGET_FILE="${BASE_PATH}${REL_PATH}"

# 安全检查：禁止路径遍历攻击
if echo "$REL_PATH" | grep -q '\.\.'; then
  echo "Status: 400 Bad Request"
  echo "Content-Type: text/plain; charset=utf-8"
  echo ""
  echo "400 Bad Request: Invalid Path"
  exit 0
fi

# SPA 路由回退支持：如果请求的不是静态文件且文件不存在，回退到 index.html
if [ ! -f "$TARGET_FILE" ]; then
  # 如果请求的是 assets 或特定静态扩展名但文件不存在，返回 404
  case "$REL_PATH" in
    *.js|*.css|*.png|*.jpg|*.jpeg|*.svg|*.ico|*.woff*|*.ttf|*.json)
      echo "Status: 404 Not Found"
      echo "Content-Type: text/plain; charset=utf-8"
      echo ""
      echo "404 Not Found: $REL_PATH"
      exit 0
      ;;
    *)
      TARGET_FILE="${BASE_PATH}/index.html"
      ;;
  esac
fi

# 如果仍然不存在
if [ ! -f "$TARGET_FILE" ]; then
  echo "Status: 404 Not Found"
  echo "Content-Type: text/plain; charset=utf-8"
  echo ""
  echo "404 Not Found"
  exit 0
fi

# MIME 类型判断
ext="${TARGET_FILE##*.}"
case "$ext" in
  html|htm)
    mime="text/html; charset=utf-8"
    ;;
  js|mjs)
    mime="application/javascript; charset=utf-8"
    ;;
  css)
    mime="text/css; charset=utf-8"
    ;;
  json)
    mime="application/json; charset=utf-8"
    ;;
  png)
    mime="image/png"
    ;;
  jpg|jpeg)
    mime="image/jpeg"
    ;;
  gif)
    mime="image/gif"
    ;;
  svg)
    mime="image/svg+xml"
    ;;
  ico)
    mime="image/x-icon"
    ;;
  woff)
    mime="font/woff"
    ;;
  woff2)
    mime="font/woff2"
    ;;
  ttf)
    mime="font/ttf"
    ;;
  otf)
    mime="font/otf"
    ;;
  txt|log)
    mime="text/plain; charset=utf-8"
    ;;
  *)
    mime="application/octet-stream"
    ;;
esac

# 静态资源缓存策略
if [ "$ext" = "html" ] || [ "$ext" = "htm" ]; then
  CACHE_HEADER="Cache-Control: no-cache, no-store, must-revalidate"
else
  CACHE_HEADER="Cache-Control: public, max-age=31536000, immutable"
fi

echo "Status: 200 OK"
echo "Content-Type: $mime"
echo "$CACHE_HEADER"
echo ""

cat "$TARGET_FILE"
