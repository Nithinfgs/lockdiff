import type { Change, FileReport, Report, Severity } from "../model.js";
import { countChanges, describeChange, fileTitle, tags, versions } from "./util.js";

export interface TerminalOptions {
  color: boolean;
  /** Max rows per section; Infinity for everything. */
  limit: number;
  onlyRisks: boolean;
  width: number;
}

const CODES = {
  reset: 0,
  bold: 1,
  dim: 2,
  red: 31,
  green: 32,
  yellow: 33,
  blue: 34,
  magenta: 35,
  cyan: 36,
  gray: 90,
};

export function render(report: Report, o: TerminalOptions): string {
  const paint = (c: keyof typeof CODES, s: string) =>
    o.color ? `\u001b[${CODES[c]}m${s}\u001b[${CODES.reset}m` : s;
  const lines: string[] = [];

  lines.push(`${paint("bold", "lockdiff")} ${paint("gray", `${report.base} → ${report.head}`)}`);
  if (report.files.length === 0) {
    lines.push("", `${paint("green", "✔")} No lockfile changes.`);
    return `${lines.join("\n")}\n`;
  }

  for (const f of report.files) {
    lines.push("", ...renderFile(f, paint, o));
  }
  return `${lines.join("\n")}\n`;
}

type Paint = (c: keyof typeof CODES, s: string) => string;

const SEV_STYLE: Record<Severity, { label: string; color: keyof typeof CODES; icon: string }> = {
  high: { label: "HIGH", color: "red", icon: "✖" },
  medium: { label: "MED ", color: "yellow", icon: "▲" },
  low: { label: "LOW ", color: "cyan", icon: "●" },
  info: { label: "INFO", color: "gray", icon: "·" },
};

function renderFile(f: FileReport, paint: Paint, o: TerminalOptions): string[] {
  const out: string[] = [];
  const n = countChanges(f.changes);
  out.push(paint("bold", fileTitle(f)));

  const summary = [
    n.added ? paint("green", `+${n.added} added`) : "",
    n.removed ? paint("red", `−${n.removed} removed`) : "",
    n.upgraded ? paint("blue", `↑${n.upgraded} upgraded`) : "",
    n.downgraded ? paint("yellow", `↓${n.downgraded} downgraded`) : "",
    n.modified ? paint("magenta", `≠${n.modified} modified in place`) : "",
  ].filter(Boolean);
  out.push(`  ${summary.join("   ") || paint("gray", "no package changes")}`);

  const counts = { high: 0, medium: 0, low: 0, info: 0 };
  for (const x of f.findings) counts[x.severity]++;
  const real = f.findings.filter((x) => x.severity !== "info");
  if (real.length > 0) {
    const parts = (["high", "medium", "low"] as const)
      .filter((s) => counts[s] > 0)
      .map((s) => paint(SEV_STYLE[s].color, `${counts[s]} ${s}`));
    out.push(`  ${paint("bold", "risk signals:")} ${parts.join(", ")}`);
  } else {
    out.push(`  ${paint("green", "✔")} no risk signals`);
  }

  const relevant = Number.isFinite(o.limit) ? real : f.findings;
  if (relevant.length > 0) {
    out.push("", `  ${paint("bold", "REVIEW THESE")}`);
    const shown = relevant.slice(0, Number.isFinite(o.limit) ? Math.max(o.limit, 10) : undefined);
    for (const x of shown) {
      const st = SEV_STYLE[x.severity];
      out.push(
        `  ${paint(st.color, `${st.icon} ${st.label}`)} ${x.message}  ${paint("gray", x.rule)}`,
      );
      if (x.detail) out.push(`           ${paint("gray", x.detail)}`);
    }
    if (shown.length < f.findings.length) {
      out.push(
        `  ${paint("gray", `… ${f.findings.length - shown.length} more, including informational (use --all)`)}`,
      );
    }
  }

  if (o.onlyRisks) return out;

  const section = (title: string, rows: Change[], fmt: (c: Change) => string) => {
    if (rows.length === 0) return;
    out.push("", `  ${paint("bold", `${title} (${rows.length})`)}`);
    for (const r of rows.slice(0, o.limit)) out.push(`    ${fmt(r)}`);
    if (rows.length > o.limit)
      out.push(`    ${paint("gray", `… and ${rows.length - o.limit} more (use --all)`)}`);
  };
  const by = (k: Change["kind"]) => f.changes.filter((c) => c.kind === k);
  const label = (c: Change) => {
    const t = (c.to[0] ?? c.from[0]) ? tags((c.to[0] ?? c.from[0]) as never) : [];
    return t.length ? ` ${paint("gray", `[${t.join(", ")}]`)}` : "";
  };

  section(
    "ADDED",
    by("added"),
    (c) => `${paint("green", "+")} ${c.name} ${paint("gray", versions(c.to))}${label(c)}`,
  );
  section(
    "REMOVED",
    by("removed"),
    (c) => `${paint("red", "−")} ${c.name} ${paint("gray", versions(c.from))}`,
  );
  section(
    "CHANGED",
    f.changes.filter((c) => c.kind === "bumped" || c.kind === "multi"),
    (c) => {
      if (c.kind === "bumped") {
        const arrow = c.bump === "downgrade" ? paint("yellow", "↓") : paint("blue", "↑");
        const bump = c.bump && c.bump !== "other" ? paint("gray", ` (${c.bump})`) : "";
        return `${arrow} ${c.name} ${versions(c.from)} → ${versions(c.to)}${bump}${label(c)}`;
      }
      return `${paint("blue", "~")} ${describeChange(c)}`;
    },
  );
  section(
    "MODIFIED IN PLACE",
    by("modified"),
    (c) => `${paint("magenta", "≠")} ${c.name} ${versions(c.to)}`,
  );
  return out;
}
