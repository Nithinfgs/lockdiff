import type { Change, FileReport, Lockfile, Pkg } from "./model.js";
import { SEVERITY_ORDER } from "./model.js";
import { analyze } from "./rules.js";
import { classifyBump } from "./version.js";

function group(pkgs: Pkg[]): Map<string, Pkg[]> {
  const m = new Map<string, Pkg[]>();
  for (const p of pkgs) {
    const list = m.get(p.name);
    if (list) list.push(p);
    else m.set(p.name, [p]);
  }
  return m;
}

const sameSet = (a: string[], b: string[]) =>
  a.length === b.length && a.every((h) => b.includes(h));

function differs(a: Pkg, b: Pkg): boolean {
  return (
    !sameSet(a.integrity, b.integrity) ||
    (a.source?.kind ?? "") !== (b.source?.kind ?? "") ||
    (a.source?.host ?? "") !== (b.source?.host ?? "") ||
    !!a.installScript !== !!b.installScript
  );
}

export function diffPackages(before: Pkg[], after: Pkg[]): Change[] {
  const oldG = group(before);
  const newG = group(after);
  const names = [...new Set([...oldG.keys(), ...newG.keys()])].sort();
  const changes: Change[] = [];

  for (const name of names) {
    const o = oldG.get(name) ?? [];
    const n = newG.get(name) ?? [];
    if (o.length === 0) {
      changes.push({ name, kind: "added", from: [], to: n });
      continue;
    }
    if (n.length === 0) {
      changes.push({ name, kind: "removed", from: o, to: [] });
      continue;
    }
    const oldV = new Map(o.map((p) => [p.version, p]));
    const newV = new Map(n.map((p) => [p.version, p]));
    for (const [v, np] of newV) {
      const op = oldV.get(v);
      if (op && differs(op, np)) changes.push({ name, kind: "modified", from: [op], to: [np] });
    }
    const gone = o.filter((p) => !newV.has(p.version));
    const fresh = n.filter((p) => !oldV.has(p.version));
    if (gone.length === 1 && fresh.length === 1) {
      const [f, t] = [gone[0] as Pkg, fresh[0] as Pkg];
      changes.push({
        name,
        kind: "bumped",
        from: [f],
        to: [t],
        bump: classifyBump(f.version, t.version),
      });
    } else if (gone.length > 0 || fresh.length > 0) {
      changes.push({ name, kind: "multi", from: gone, to: fresh });
    }
  }
  return changes;
}

export interface DiffOptions {
  ignore?: string[];
  disableRules?: string[];
}

export function diffLockfiles(
  before: Lockfile | undefined,
  after: Lockfile | undefined,
  opts: DiffOptions = {},
): FileReport {
  const ref = (after ?? before) as Lockfile;
  const ignore = new Set(opts.ignore ?? []);
  const disabled = new Set(opts.disableRules ?? []);
  const changes = diffPackages(before?.packages ?? [], after?.packages ?? []).filter(
    (c) => !ignore.has(c.name),
  );
  const findings = analyze(changes, { ecosystem: ref.ecosystem, hasIntegrity: ref.hasIntegrity })
    .filter((f) => !disabled.has(f.rule))
    .sort(
      (a, b) =>
        SEVERITY_ORDER[b.severity] - SEVERITY_ORDER[a.severity] || a.name.localeCompare(b.name),
    );
  const report: FileReport = {
    path: ref.path,
    kind: ref.kind,
    ecosystem: ref.ecosystem,
    changes,
    findings,
    totals: { before: before?.packages.length ?? 0, after: after?.packages.length ?? 0 },
  };
  if (!before) report.fileStatus = "added";
  if (!after) report.fileStatus = "removed";
  return report;
}
