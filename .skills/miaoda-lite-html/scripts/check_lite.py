#!/usr/bin/env python3
"""check_lite.py — lightweight quality gate for miaoda-lite-html single-file HTML apps.

Pure Python standard library, no third-party deps. Checks only deterministic
contract / readability / asset / structure rules; it does NOT judge aesthetics
or playability (layout, color harmony, fun are left to the model + SKILL.md).

Two modes, auto-detected by the presence of <canvas> (games should force --mode game):
  - web  : marketing pages / tools — enforces section id, Tailwind lock, semantic tokens.
  - game : browser games — Canvas path (realtime) expects canvas + requestAnimationFrame;
           DOM/CSS path (turn-based) expects interactivity / state updates instead.

Usage:
    python3 check_lite.py app.html
    python3 check_lite.py app.html --mode game
    python3 check_lite.py app.html --json

Exit codes: 0 = pass (no blocking), 2 = blocking issues found, 1 = usage error.
"""
import argparse
import json
import os
import re
import sys
from html.parser import HTMLParser

TAILWIND_OK = "resource-static.cdn.bcebos.com/common/tailwindcss/3.4.16.js"
TAILWIND_RE = r"(?:cdn\.tailwindcss\.com|resource-static\.cdn\.bcebos\.com/common/tailwindcss)[^\"'\s]*"
PLACEHOLDER_TITLES = ("应用标题", "设计稿标题", "游戏标题", "Document")
VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link",
        "meta", "param", "source", "track", "wbr"}
WATCH = {"div", "section", "span", "a", "button", "p", "ul", "ol", "li",
         "header", "footer", "main", "nav", "canvas"}


def _balance(html):
    """Count unbalanced open/close for structural tags (lightweight, best-effort)."""
    counts = {}

    class TagBalanceParser(HTMLParser):
        """Tally start and end tags to detect structurally unbalanced markup."""

        def handle_starttag(self, tag, attrs):
            """Count one opening tag for each non-void element."""
            if tag not in VOID:
                counts[tag] = counts.get(tag, 0) + 1

        def handle_endtag(self, tag):
            """Count one closing tag for each non-void element."""
            if tag not in VOID:
                counts[tag] = counts.get(tag, 0) - 1

    try:
        TagBalanceParser().feed(html)
    except Exception:
        return {}
    return {t: c for t, c in counts.items() if t in WATCH and c != 0}


def detect_mode(html):
    """Auto-detect: a <canvas> means a game, otherwise a web page."""
    return "game" if re.search(r"<canvas\b", html, re.I) else "web"


def check(raw, mode="auto"):
    """Return (blocking, warnings, mode) given raw HTML and an optional mode override."""
    blocking, warnings = [], []
    # Strip HTML comments first so commented-out markup cannot satisfy or trip the checks below.
    html = re.sub(r"<!--.*?-->", "", raw, flags=re.S)
    if mode == "auto":
        mode = detect_mode(html)

    # ---- common checks (both modes) ----
    # 1. single-file contract: DOCTYPE present (tolerate extra whitespace)
    if not re.search(r"<!doctype\s+html\s*>", html, re.I):
        blocking.append("缺少 <!DOCTYPE html>")

    # 2. non-empty <title>, not a placeholder
    m = re.search(r"<title>(.*?)</title>", html, re.S | re.I)
    if not m or not m.group(1).strip():
        blocking.append("缺少非空 <title>")
    elif m.group(1).strip() in PLACEHOLDER_TITLES:
        warnings.append("<title> 仍是占位默认值，建议写真实产品 / 游戏名")

    # 3. Tailwind pinned to v3 on the self-hosted CDN (if used at all; applies to both modes)
    tw = re.findall(TAILWIND_RE, html)
    if tw and not any(TAILWIND_OK in t for t in tw):
        blocking.append(
            f"Tailwind 须使用自建 CDN 并锁定 3.4.16（发现 {', '.join(sorted(set(tw)))}）；"
            "禁旧域名 cdn.tailwindcss.com / v4 / 无版本"
        )

    # 4. no large base64 images
    for mm in re.finditer(r"data:image/[^;]+;base64,([A-Za-z0-9+/=]+)", html):
        if len(mm.group(1)) > 2048:
            blocking.append("发现 base64 大图（禁用）：改用 https:// 或 assets/ 引用")
            break


    # 5. image src legality
    for mm in re.finditer(r"<img\b[^>]*\bsrc\s*=\s*[\"']([^\"']+)[\"']", html, re.I):
        src = mm.group(1).strip()
        if src.startswith("data:"):
            continue
        if not (src.startswith("https://") or src.startswith("assets/") or src.startswith("/")):
            warnings.append(f"图片路径疑似不规范：{src}（应为 https:// 或 assets/）")

    # 6. readability: explicit font-size floors (HTML/CSS text)
    for mm in re.finditer(r"font-size\s*:\s*([0-9.]+)px", html):
        v = float(mm.group(1))
        if v < 12:
            blocking.append(f"字号 {v}px < 12px 可读性底线")
        elif v < 14:
            warnings.append(f"字号 {v}px < 14px，正文建议 ≥14px")
    for mm in re.finditer(r"text-\[([0-9.]+)px\]", html):
        if float(mm.group(1)) < 12:
            blocking.append(f"字号 text-[{mm.group(1)}px] < 12px 可读性底线")

    # 7. JSX-style self-closing on non-void tags (banned)
    jsx = re.findall(r"<(div|span|section|a|p|button|ul|li|canvas)\b[^>]*/>", html, re.I)
    if jsx:
        warnings.append(f"疑似 JSX 式自闭合标签（禁）：<{jsx[0]}/> 等，改为成对闭合")

    # 8. tag balance (best-effort); drop <script>/<style> bodies first so JS/CSS
    #    operators like `a < b` are not misparsed as tags and raise false warnings.
    structural = re.sub(r"<(script|style)\b[^>]*>.*?</\1>", "", html, flags=re.S | re.I)
    for tag, diff in _balance(structural).items():
        warnings.append(f"标签 <{tag}> 开合不平衡（差 {diff}），检查是否漏闭合")


    # ---- mode-specific checks ----
    if mode == "web":
        # at least one <section id="...">
        if not re.search(r"<section\b[^>]*\bid\s*=", html, re.I):
            blocking.append("网页至少需要一个带 id 的 <section>")
        # semantic tokens: no hardcoded color in class arbitrary value / inline style
        # (SKILL exempts inline SVG colors — strip <svg> blocks before scanning)
        non_svg = re.sub(r"<svg\b.*?</svg>", "", html, flags=re.S | re.I)
        hex_class = re.findall(r"(?:bg|text|border|ring|fill|stroke|from|to|via)-\[#[0-9a-fA-F]{3,8}\]", non_svg)
        if hex_class:
            blocking.append(
                f"任意值硬编码色（禁）：{', '.join(sorted(set(hex_class))[:5])}；"
                "改用语义 token 类"
            )
        if re.search(r"style=\"[^\"]*(?:color|background)\s*:\s*#[0-9a-fA-F]{3,8}", non_svg):
            blocking.append("内联 style 写死色值（禁）：改用语义 token 类或 DESIGN-TOKENS")
    else:  # game — Canvas (realtime) or DOM/CSS (turn-based) path
        has_canvas = re.search(r"<canvas\b", html, re.I)
        has_raf = re.search(r"requestAnimationFrame", html)
        if has_canvas:
            # Canvas path: id + rAF loop expected
            if not re.search(r"<canvas\b[^>]*\bid\s*=", html, re.I):
                warnings.append("<canvas> 建议带 id，便于脚本引用")
            if not has_raf:
                warnings.append(
                    "Canvas 游戏未见 requestAnimationFrame 主循环，"
                    "确认是否可运行（勿用 setInterval 作主循环）"
                )
        else:
            # DOM/CSS path: expect interactivity / state updates instead of canvas
            has_interaction = re.search(
                r"addEventListener|\bon(?:click|keydown|keyup|pointerdown|touchstart)\s*=", html, re.I)
            if not has_interaction and not has_raf:
                warnings.append(
                    "DOM 游戏未见交互 / 状态更新信号（事件监听或 requestAnimationFrame），"
                    "确认玩法是否可运行"
                )

    return blocking, warnings, mode

def main():
    """Parse command-line arguments, run the checks, and return the exit code."""
    ap = argparse.ArgumentParser(description="miaoda-lite-html lightweight checker")
    ap.add_argument("html", help="path to the single-file HTML app")
    ap.add_argument("--mode", choices=("auto", "web", "game"), default="auto",
                    help="force a mode; default auto-detects by <canvas> presence")
    ap.add_argument("--json", action="store_true", help="output a JSON report")
    args = ap.parse_args()

    if not os.path.isfile(args.html):
        print(f"ERROR: file not found: {args.html}", file=sys.stderr)
        return 1
    with open(args.html, encoding="utf-8", errors="ignore") as f:
        html = f.read()

    blocking, warnings, mode = check(html, args.mode)
    ok = not blocking

    if args.json:
        print(json.dumps({"ok": ok, "mode": mode, "blocking": blocking, "warnings": warnings},
                         ensure_ascii=False, indent=1))
    else:
        print(f"[mode: {mode}] " + ("OK: 通过（无 blocking）" if ok else "BLOCKED:"))
        for b in blocking:
            print("  ✗", b)
        if warnings:
            print("warnings:")
            for w in warnings:
                print("  !", w)
    return 0 if ok else 2


if __name__ == "__main__":
    sys.exit(main())
