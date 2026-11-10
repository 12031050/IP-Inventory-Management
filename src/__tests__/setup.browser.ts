import { beforeEach, onTestFailed } from "vitest";
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
          .replace(/\s+/g, " ")
          .slice(0, 40);
        return `  ${role}: "${name}"`;
      });
    console.log(`[a11y] ${location.pathname} ${innerWidth}x${innerHeight}\n${lines.join("\n")}`);
  });
});
