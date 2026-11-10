import "@testing-library/jest-dom/vitest";
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
        .replace(/\s+/g, " ")
        .slice(0, 40);
      return `  ${role}: "${name}"`;
    });
  return lines.length
    ? `[a11y]\n${lines.join("\n")}`
    : "[a11y] no interactive elements in query scope (component may not have rendered, or the scope is wrong)";
}

configure({
  getElementError: function getElementError(message, container) {
    // findBy* / waitFor timeouts re-pass an already-annotated error; return it as-is to avoid double printing
    const reentry = message?.includes("\n[dom]\n");
    const extra = [];
    if (container && !reentry) {
      // On getByRole failure Testing Library already lists accessible roles; don't repeat
      if (!message?.includes("Here are the accessible roles")) extra.push(a11ySummary(container));
      extra.push(`[dom]\n${prettyDOM(container)}`);
    }
    const error = new Error([message, ...extra].filter(Boolean).join("\n\n"));
    error.name = "TestingLibraryElementError";
    // Drop this setup file's stack frames so the error code frame points at the query in the test file (V8-only API, absent from lib types)
    (Error as { captureStackTrace?: (err: Error, fn: unknown) => void }).captureStackTrace?.(error, getElementError);
    return error;
  },
});
