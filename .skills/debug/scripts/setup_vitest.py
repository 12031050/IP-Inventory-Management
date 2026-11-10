#!/usr/bin/env python3
"""setup_vitest.py — 检查测试依赖，补齐 / 升级 vitest 配置（幂等，可重复执行）。

Usage（在 app 根目录执行）:
    python3 .skills/debug/scripts/setup_vitest.py   # 检查依赖 + 写入缺失或过期的配置

管理的文件：vitest.config.ts / src/__tests__/setup.ts / src/__tests__/setup.browser.ts。
内容与本脚本内置版本不一致的视为过期，直接覆盖（不留备份，避免模型读到旧配置）。
旧版 vitest.browser.config.ts 直接删除（已并入 vitest.config.ts 的 projects）。
Exit: 0 就绪；1 依赖缺失。
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

VITEST_CONFIG = '''import { defineConfig, mergeConfig } from "vitest/config";
import { playwright } from "@vitest/browser-playwright";
import { createRequire } from "node:module";
import path from "node:path";
import type { Reporter } from "vitest/node";
// Reuse vite.config.ts plugins and config (svgr, platform plugins, etc.) so tests and preview share one transform pipeline
import viteConfig from "./vite.config.ts";

// vite.config.ts uses __dirname, which triggers a configLoader: 'native' incompatibility warning on Vite 8;
// it does not affect test results, so silence it to keep test output clean
process.env.VITE_CONFIG_NATIVE_IGNORE_WARNING ??= "true";

// The sandbox defaults to NODE_ENV=production, which makes Vite treat React as a production build; always run tests in test mode
if (process.env.NODE_ENV === "production" || !process.env.NODE_ENV) {
  process.env.NODE_ENV = "test";
}

const require = createRequire(import.meta.url);

// Test deps live in the prewarm layer: resolve react from @testing-library/react so tests and components share one React copy
const reactDir = path.dirname(
  require.resolve("react/package.json", {
    paths: [require.resolve("@testing-library/react")],
  })
);
const reactDomDir = path.dirname(
  require.resolve("react-dom/package.json", {
    paths: [require.resolve("@testing-library/react")],
  })
);

// Append a failure list at the very end of the output: however long the DOM dumps above are, `| tail` still shows each failed test and its first error line
const failureSummary: Reporter = {
  onTestRunEnd(testModules, unhandledErrors) {
    const firstLine = (msg = "") =>
      msg.replace(/\\x1b\\[[0-9;]*m/g, "").split("\\n").find((l) => l.trim()) ?? "";
    const lines: string[] = [];
    for (const mod of testModules) {
      const file = path.relative(process.cwd(), mod.moduleId);
      for (const err of mod.errors()) lines.push(`${file}\\n    ${firstLine(err.message)}`);
      for (const t of mod.children.allTests("failed")) {
        const err = t.result().errors?.[0];
        const loc = t.location ? `:${t.location.line}` : "";
        lines.push(`${file}${loc} > ${t.fullName}\\n    ${firstLine(err?.message)}`);
      }
    }
    for (const err of unhandledErrors) lines.push(`(unhandled)\\n    ${firstLine(err.message)}`);
    if (lines.length) console.log(`\\n[Failures] ${lines.length}\\n${lines.map((l) => `- ${l}`).join("\\n")}`);
  },
};

const browser = {
  enabled: true,
  headless: true,
  screenshotFailures: false,
  provider: playwright({
    launchOptions: {
      executablePath: "/usr/bin/chromium",
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
    },
    actionTimeout: 3000,
  }),
};

export default mergeConfig(viteConfig, defineConfig({
  resolve: {
    dedupe: ["react", "react-dom"],
    alias: [
      { find: /^react$/, replacement: path.join(reactDir, "index.js") },
      { find: /^react\\/(.*)$/, replacement: path.join(reactDir, "$1") },
      { find: /^react-dom$/, replacement: path.join(reactDomDir, "index.js") },
      { find: /^react-dom\\/(.*)$/, replacement: path.join(reactDomDir, "$1") },
      { find: "@", replacement: path.resolve(import.meta.dirname, "./src") },
    ],
  },
  // On Browser Mode cold start, Vite reloads the page when it discovers un-prebundled deps, causing duplicate React / Invalid hook call.
  // Pre-scan app source and prebundle test-runtime deps so the first run is stable.
  optimizeDeps: {
    entries: ["src/**/*.{ts,tsx}"],
    include: [
      "react",
      "react-dom",
      "react-dom/client",
      "react/jsx-runtime",
      "react/jsx-dev-runtime",
      "vitest-browser-react",
    ],
  },
  test: {
    globals: true,
    // DEBUG_PRINT_LIMIT: max DOM chars printed on a failed Testing Library query (default 7000, hundreds of lines per failure)
    env: { NODE_ENV: "test", DEBUG_PRINT_LIMIT: "1500" },
    reporters: ["default", failureSummary],
    includeTaskLocation: true,
    // Reset mocks / stubs before each test to avoid cross-test pollution
    clearMocks: true,
    restoreMocks: true,
    unstubGlobals: true,
    unstubEnvs: true,
    // Suppress console output for passing tests, keep only the failure context
    silent: "passed-only",
    // Dispatch the run environment by file suffix so `npx vitest run <file>` works without --config
    projects: [
      {
        extends: true,
        test: {
          name: "node",
          environment: "node",
          include: ["src/**/*.node.test.{ts,tsx}"],
        },
      },
      {
        // Backend tests: hit real Supabase (PostgREST / RLS / RPC / Edge Function), no DOM.
        // Files go in supabase/tests/repro-<slug>.be.test.ts; import.meta.env reads VITE_* anon credentials,
        // process.env reads the service key from .env (run `set -a; . ./.env; set +a` first).
        extends: true,
        test: {
          name: "backend",
          environment: "node",
          include: ["supabase/tests/**/*.be.test.{ts,tsx}", "src/**/*.be.test.{ts,tsx}"],
          testTimeout: 15000,
        },
      },
      {
        extends: true,
        test: {
          name: "jsdom",
          environment: "jsdom",
          include: ["src/**/*.test.{ts,tsx}"],
          exclude: ["src/**/*.node.test.*", "src/**/*.browser.test.*"],
          setupFiles: ["./src/__tests__/setup.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "browser",
          include: ["src/**/*.browser.test.{ts,tsx}"],
          exclude: ["src/**/*.mobile.browser.test.*"],
          setupFiles: ["./src/__tests__/setup.browser.ts"],
          testTimeout: 5000,
          browser: { ...browser, viewport: { width: 1280, height: 800 }, instances: [{ browser: "chromium" }] },
        },
      },
      {
        extends: true,
        test: {
          name: "browser-mobile",
          include: ["src/**/*.mobile.browser.test.{ts,tsx}"],
          setupFiles: ["./src/__tests__/setup.browser.ts"],
          testTimeout: 5000,
          browser: { ...browser, viewport: { width: 390, height: 844 }, instances: [{ browser: "chromium" }] },
        },
      },
    ],
  },
}));
'''

SETUP_TS = '''import "@testing-library/jest-dom/vitest";
import { configure, prettyDOM } from "@testing-library/react";

// Browser APIs jsdom lacks but Radix UI / sonner / app hooks call
class NoopObserver {
  root = null;
  rootMargin = "";
  thresholds = [];
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}
globalThis.ResizeObserver ??= NoopObserver as unknown as typeof ResizeObserver;
globalThis.IntersectionObserver ??= NoopObserver as unknown as typeof IntersectionObserver;

window.matchMedia ??= ((query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addListener() {},
  removeListener() {},
  addEventListener() {},
  removeEventListener() {},
  dispatchEvent() {
    return false;
  },
})) as unknown as typeof window.matchMedia;

Element.prototype.scrollIntoView ??= () => {};
Element.prototype.hasPointerCapture ??= () => false;
Element.prototype.setPointerCapture ??= () => {};
Element.prototype.releasePointerCapture ??= () => {};
window.scrollTo = (() => {}) as typeof window.scrollTo;

// On a failed query (getBy* / findBy* / waitFor), list the role and accessible name of interactive elements in scope,
// then append the truncated DOM, to fix selectors in one pass.
// Not using onTestFailed: Testing Library's auto cleanup runs before it, by which point the DOM is cleared.
function a11ySummary(container: Element | Document) {
  const nodes = container.querySelectorAll("button,a[href],input,textarea,select,[role]");
  const lines = Array.from(nodes)
    .slice(0, 80)
    .map((el) => {
      const role = el.getAttribute("role") ?? el.tagName.toLowerCase();
      const name = (
        el.getAttribute("aria-label") ??
        el.getAttribute("placeholder") ??
        el.getAttribute("title") ??
        el.textContent ??
        ""
      )
        .trim()
        .replace(/\\s+/g, " ")
        .slice(0, 40);
      return `  ${role}: "${name}"`;
    });
  return lines.length
    ? `[a11y]\\n${lines.join("\\n")}`
    : "[a11y] no interactive elements in query scope (component may not have rendered, or the scope is wrong)";
}

configure({
  getElementError: function getElementError(message, container) {
    // findBy* / waitFor timeouts re-pass an already-annotated error; return it as-is to avoid double printing
    const reentry = message?.includes("\\n[dom]\\n");
    const extra = [];
    if (container && !reentry) {
      // On getByRole failure Testing Library already lists accessible roles; don't repeat
      if (!message?.includes("Here are the accessible roles")) extra.push(a11ySummary(container));
      extra.push(`[dom]\\n${prettyDOM(container)}`);
    }
    const error = new Error([message, ...extra].filter(Boolean).join("\\n\\n"));
    error.name = "TestingLibraryElementError";
    // Drop this setup file's stack frames so the error code frame points at the query in the test file (V8-only API, absent from lib types)
    (Error as { captureStackTrace?: (err: Error, fn: unknown) => void }).captureStackTrace?.(error, getElementError);
    return error;
  },
});
'''

SETUP_BROWSER_TS = '''import { beforeEach, onTestFailed } from "vitest";
import { utils } from "vitest/browser";

// Load Tailwind and other global styles so layout and computed-style assertions match the real page
try {
  await import("@/index.css");
} catch {}

// Max DOM chars printed on a failed query (default 7000); hide icon svg inner paths to cut noise
utils.configurePrettyDOM({ maxLength: 1500, filterNode: "script, style, svg *" });

// Disable CSS transitions and animations so getComputedStyle right after a click reads the final value, not a mid-transition one
const noMotion = document.createElement("style");
noMotion.textContent =
  "*,*::before,*::after{transition-duration:0s!important;transition-delay:0s!important;animation-duration:0s!important;animation-delay:0s!important}";
document.head.appendChild(noMotion);

// On failure, print the role and accessible name of interactive elements on the page to fix selectors in one pass
beforeEach(() => {
  onTestFailed(() => {
    const nodes = document.querySelectorAll("button,a[href],input,textarea,select,[role]");
    const lines = Array.from(nodes)
      .slice(0, 80)
      .map((el) => {
        const role = el.getAttribute("role") ?? el.tagName.toLowerCase();
        const name = (
          el.getAttribute("aria-label") ??
          el.getAttribute("placeholder") ??
          el.getAttribute("title") ??
          el.textContent ??
          ""
        )
          .trim()
          .replace(/\\s+/g, " ")
          .slice(0, 40);
        return `  ${role}: "${name}"`;
      });
    console.log(`[a11y] ${location.pathname} ${innerWidth}x${innerHeight}\\n${lines.join("\\n")}`);
  });
});
'''

VITE_CONFIG_IMPORT = 'import viteConfig from "./vite.config.ts";'
VITE_CONFIG_CANDIDATES = ["vite.config.ts", "vite.config.mts", "vite.config.js", "vite.config.mjs"]
# 无 vite 配置时的兜底：只带 React 插件
VITE_CONFIG_FALLBACK = 'import react from "@vitejs/plugin-react";\nconst viteConfig = { plugins: [react()] };'

LEGACY_FILES = ["vitest.browser.config.ts"]

DEPS = [
    "vitest", "jsdom",
    "@testing-library/react", "@testing-library/jest-dom", "@testing-library/user-event",
    "@vitest/browser", "@vitest/browser-playwright", "vitest-browser-react", "playwright",
]
DEP_VERSIONS = {
    "vitest": "4.1.10",
    "jsdom": "29.1.1",
    "@testing-library/react": "16.3.2",
    "@testing-library/jest-dom": "6.10.0",
    "@testing-library/user-event": "14.6.4",
    "@vitest/browser": "4.1.10",
    "@vitest/browser-playwright": "4.1.10",
    "vitest-browser-react": "2.2.0",
    "playwright": "1.62.1",
}


def render_vitest_config(root: Path) -> str:
    """按项目实际存在的 vite 配置生成 vitest.config.ts（mergeConfig 复用其插件）。"""
    vite_cfg = next((n for n in VITE_CONFIG_CANDIDATES if (root / n).exists()), None)
    replacement = f'import viteConfig from "./{vite_cfg}";' if vite_cfg else VITE_CONFIG_FALLBACK
    return VITEST_CONFIG.replace(VITE_CONFIG_IMPORT, replacement)


def managed_files(root: Path) -> list[tuple[str, str]]:
    return [
        ("vitest.config.ts", render_vitest_config(root)),
        ("src/__tests__/setup.ts", SETUP_TS),
        ("src/__tests__/setup.browser.ts", SETUP_BROWSER_TS),
    ]


def check_deps(root: Path) -> list[str]:
    """用 node 的真实模块解析探测依赖，返回缺失列表（而非 ls node_modules）。

    依赖预制在预热层（pnpm 布局，不在 app 目录父链上），node 运行时能解析到，
    所以用 require.resolve 而非文件系统检查。
    """
    script = """
const deps = JSON.parse(process.argv[1]);
const missing = deps.filter((d) => {
  try { require.resolve(d); return false; } catch { return true; }
});
console.log(JSON.stringify(missing));
"""
    r = subprocess.run(
        ["node", "-e", script, json.dumps(DEPS)],
        cwd=str(root), capture_output=True, text=True,
    )
    if r.returncode != 0:
        print(r.stderr.strip(), file=sys.stderr)
        return list(DEPS)
    return json.loads(r.stdout.strip() or "[]")


def install_cmd(missing: list[str]) -> str:
    """环境兜底：生成一键后台安装命令，只装缺失的包，精确版本，跳过 playwright 浏览器下载。"""
    spec = " ".join(f"{d}@{DEP_VERSIONS[d]}" for d in missing)
    return (
        f"PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 nohup pnpm add -D {spec} "
        f"> /tmp/vitest_dep_install.log 2>&1 & "
        f"echo \"installing, pid $!, log=/tmp/vitest_dep_install.log\"; "
        f"sleep 60; tail -5 /tmp/vitest_dep_install.log"
    )


def report_deps(root: Path) -> bool:
    missing = check_deps(root)
    if not missing:
        print("✅ 依赖齐全。")
        return True
    for d in missing:
        print(f"  ❌  {d}")
    print()
    print("该模板为非 shadcn、app_type 为非 web 类型，其预热层未预制测试依赖，需要安装。")
    print("一键后台安装（内网 registry，跳过 playwright 浏览器下载），装完再重新运行本脚本：")
    print()
    print(f"  cd {root} && {install_cmd(missing)}")
    print()
    print("装完若日志未见完成，重复上面 sleep+tail 一行再等一轮。")
    return False


def sync_configs(root: Path) -> None:
    """写入缺失或过期的配置，删除旧版配置。"""
    for rel, content in managed_files(root):
        path = root / rel
        if path.exists() and path.read_text(encoding="utf-8") == content:
            print(f"  =  {rel}")
            continue
        state = "过期" if path.exists() else "缺失"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8")
        print(f"  +  {rel}（{state}，已写入）")
    for rel in LEGACY_FILES:
        path = root / rel
        if path.exists():
            path.unlink()
            print(f"  -  {rel}（旧版配置，已删除）")


def main() -> int:
    """检查依赖并同步配置；项目根目录为当前目录。"""
    argparse.ArgumentParser(description="检查测试依赖，补齐 / 升级 vitest 配置（在 app 根目录执行）").parse_args()

    root = Path.cwd()
    if not (root / "package.json").exists():
        print(f"ERROR: {root} 下没有 package.json，请先 cd /workspace/<app_id>", file=sys.stderr)
        return 1

    deps_ok = report_deps(root)
    print("配置：")
    sync_configs(root)
    print()
    if not deps_ok:
        return 1
    print("✅ 测试环境就绪。运行：npx vitest run src/__tests__/<file>（环境由文件后缀决定，不要加 --config）")
    return 0


if __name__ == "__main__":
    sys.exit(main())
