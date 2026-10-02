import type { Change, FileReport, Finding, Pkg } from "../model.js";

export interface Counts {
  added: number;
  removed: number;
  upgraded: number;
  downgraded: number;
  modified: number;
}

export function countChanges(changes: Change[]): Counts {
  const c: Counts = { added: 0, removed: 0, upgraded: 0, downgraded: 0, modified: 0 };
  for (const ch of changes) {
    if (ch.kind === "added") c.added += ch.to.length;
    else if (ch.kind === "removed") c.removed += ch.from.length;
    else if (ch.kind === "bumped") ch.bump === "downgrade" ? c.downgraded++ : c.upgraded++;
    else if (ch.kind === "modified") c.modified++;
    else if (ch.kind === "multi") {
      c.added += ch.to.length;
      c.removed += ch.from.length;
    }
  }
  return c;
}

export function versions(pkgs: Pkg[]): string {
  return pkgs.map((p) => p.version).join(", ");
}

export function tags(p: Pkg): string[] {
  const t: string[] = [];
  if (p.direct) t.push("direct");
  if (p.dev) t.push("dev");
  if (p.installScript) t.push("install script");
  if (p.source && p.source.kind !== "registry") t.push(p.source.kind);
  return t;
}

export function highestSeverity(findings: Finding[]): Finding["severity"] | undefined {
  return findings[0]?.severity; // findings are pre-sorted most severe first
}

export function describeChange(c: Change): string {
  switch (c.kind) {
    case "added":
      return `${c.name} ${versions(c.to)}`;
    case "removed":
      return `${c.name} ${versions(c.from)}`;
    case "modified":
      return `${c.name} ${versions(c.to)}`;
    default:
      return `${c.name} ${versions(c.from) || "∅"} → ${versions(c.to) || "∅"}`;
  }
}

export function fileTitle(f: FileReport): string {
  if (f.fileStatus === "added") return `${f.path} (new lockfile)`;
  if (f.fileStatus === "removed") return `${f.path} (deleted)`;
  return f.path;
}
