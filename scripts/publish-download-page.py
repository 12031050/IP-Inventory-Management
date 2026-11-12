#!/usr/bin/env python3
"""把 docs/index.html 重新发布到 gh-pages 分支（GitHub Pages 在线下载页）。

不切换当前工作分支、不改动工作区文件，直接用 git plumbing 生成只含
index.html 与 .nojekyll 的提交并推送。

用法：
    python3 scripts/publish-download-page.py
前置：
    origin 已配置且有推送权限；在线下载页的 Pages 源为 gh-pages 分支 / 目录。
"""
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PAGE = ROOT / "docs" / "index.html"


def git(*args, stdin=None):
    result = subprocess.run(
        ["git", *args], cwd=ROOT, input=stdin, text=True,
        capture_output=True,
    )
    if result.returncode != 0:
        sys.exit(f"git {' '.join(args)} 失败：{result.stderr.strip()}")
    return result.stdout.strip()


def main():
    if not PAGE.exists():
        sys.exit(f"缺少源文件：{PAGE}")

    git("fetch", "origin", "gh-pages")

    blob = git("hash-object", "-w", str(PAGE))
    nojekyll = git("hash-object", "-w", "--stdin", stdin="")
    tree = git("mktree", stdin=(
        f"100644 blob {nojekyll}\t.nojekyll\n"
        f"100644 blob {blob}\tindex.html\n"
    ))

    parent = ""
    try:
        parent = subprocess.run(
            ["git", "rev-parse", "refs/remotes/origin/gh-pages"],
            cwd=ROOT, text=True, capture_output=True, check=True,
        ).stdout.strip()
    except subprocess.CalledProcessError:
        print("远端尚无 gh-pages 分支，将创建首个提交")

    args = ["commit-tree", tree]
    if parent:
        args += ["-p", parent]
    args += ["-m", "Update FPK download page"]
    commit = git(*args)

    git("push", "origin", f"{commit}:refs/heads/gh-pages")
    print("下载页已发布：https://12031050.github.io/IP-Inventory-Management/")
    print(f"提交：{commit}（GitHub Pages 会在约 1 分钟内完成部署）")


if __name__ == "__main__":
    main()
