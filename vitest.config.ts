import { defineConfig, mergeConfig } from "vitest/config";
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
      msg.replace(/\x1b\[[0-9;]*m/g, "").split("\n").find((l) => l.trim()) ?? "";
    const lines: string[] = [];
    for (const mod of testModules) {
      const file = path.relative(process.cwd(), mod.moduleId);
      for (const err of mod.errors()) lines.push(`${file}\n    ${firstLine(err.message)}`);
      for (const t of mod.children.allTests("failed")) {
        const err = t.result().errors?.[0];
        const loc = t.location ? `:${t.location.line}` : "";
        lines.push(`${file}${loc} > ${t.fullName}\n    ${firstLine(err?.message)}`);
      }
    }
    for (const err of unhandledErrors) lines.push(`(unhandled)\n    ${firstLine(err.message)}`);
    if (lines.length) console.log(`\n[Failures] ${lines.length}\n${lines.map((l) => `- ${l}`).join("\n")}`);
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
      { find: /^react\/(.*)$/, replacement: path.join(reactDir, "$1") },
      { find: /^react-dom$/, replacement: path.join(reactDomDir, "index.js") },
      { find: /^react-dom\/(.*)$/, replacement: path.join(reactDomDir, "$1") },
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
