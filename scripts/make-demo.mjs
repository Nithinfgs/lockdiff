// Renders the README hero image from lockdiff's real output (no hand-drawn text).
// Usage: npm run build && node scripts/make-demo.mjs
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const demoDir = join(root, "examples", "demo");
const args = ["before/package-lock.json", "after/package-lock.json", "--only-risks"];

const raw = execFileSync(process.execPath, [join(root, "dist", "cli.js"), ...args], {
  cwd: demoDir,
  encoding: "utf8",
  env: { ...process.env, FORCE_COLOR: "1", NO_COLOR: "" },
});

const COLORS = {
  31: "#ff7b72",
  32: "#7ee787",
  33: "#e3b341",
  34: "#79c0ff",
  35: "#d2a8ff",
  36: "#56d4dd",
  90: "#8b949e",
};
const FG = "#c9d1d9";
const ESC = String.fromCharCode(27);
const ANSI = new RegExp(`${ESC}\\[[0-9;]*m`, "g");
const ANSI_ONE = new RegExp(`^${ESC}\\[([0-9;]*)m$`);
const esc = (s) => s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

function spans(line) {
  const out = [];
  let color = FG;
  let bold = false;
  let text = "";
  const flush = () => {
    if (text) {
      out.push(`<tspan fill="${color}"${bold ? ' font-weight="700"' : ""}>${esc(text)}</tspan>`);
      text = "";
    }
  };
  for (const part of line.split(new RegExp(`(${ESC}\\[[0-9;]*m)`))) {
    const m = ANSI_ONE.exec(part);
    if (!m) {
      text += part;
      continue;
    }
    flush();
    for (const code of m[1].split(";").map(Number)) {
      if (code === 0) {
        color = FG;
        bold = false;
      } else if (code === 1) bold = true;
      else if (COLORS[code]) color = COLORS[code];
    }
  }
  flush();
  return out.join("");
}

const strip = (s) => s.replace(ANSI, "");
const lines = [
  `${ESC}[90m$${ESC}[0m lockdiff before/package-lock.json after/package-lock.json --only-risks`,
  ...raw.trimEnd().split("\n").slice(1),
];
const FONT = 13.5;
const CW = FONT * 0.602;
const LH = 21;
const PAD = 22;
const cols = Math.max(...lines.map((l) => [...strip(l)].length));
const W = Math.ceil(cols * CW + PAD * 2);
const H = lines.length * LH + PAD * 2 + 28;

const rows = lines
  .map((l, i) => {
    const y = 28 + PAD + i * LH;
    const delay = (0.15 + i * 0.07).toFixed(2);
    return `<text x="${PAD}" y="${y}" class="l" style="animation-delay:${delay}s" xml:space="preserve">${spans(l)}</text>`;
  })
  .join("\n  ");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="lockdiff terminal output flagging a changed hash, an insecure source, a new install script, a look-alike package name and a downgrade">
  <style>
    .l { font: ${FONT}px ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace; fill: ${FG}; opacity: 0; animation: show .01s linear forwards; }
    @keyframes show { to { opacity: 1; } }
    @media (prefers-reduced-motion: reduce) { .l { animation: none; opacity: 1; } }
  </style>
  <rect width="${W}" height="${H}" rx="10" fill="#0d1117"/>
  <rect width="${W}" height="28" rx="10" fill="#161b22"/>
  <rect y="18" width="${W}" height="10" fill="#161b22"/>
  <circle cx="18" cy="14" r="5" fill="#ff5f56"/><circle cx="36" cy="14" r="5" fill="#ffbd2e"/><circle cx="54" cy="14" r="5" fill="#27c93f"/>
  ${rows}
</svg>
`;
mkdirSync(join(root, "docs", "assets"), { recursive: true });
writeFileSync(join(root, "docs", "assets", "demo.svg"), svg);
console.log(`wrote docs/assets/demo.svg (${W}x${H}, ${(svg.length / 1024).toFixed(1)} KB)`);
