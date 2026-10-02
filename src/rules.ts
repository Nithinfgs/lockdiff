import type { Change, Ecosystem, Finding, Pkg, Severity } from "./model.js";
import { lookAlikeOf } from "./popular.js";
import { isPrerelease } from "./version.js";

export interface RuleInfo {
  id: string;
  severity: Severity;
  summary: string;
}

/** Every rule lockdiff can raise. Documented in docs/rules.md. */
export const RULES: RuleInfo[] = [
  { id: "integrity-changed", severity: "high", summary: "Same version, different content hash" },
  {
    id: "source-changed",
    severity: "high",
    summary: "Package now comes from a different registry or source type",
  },
  { id: "insecure-transport", severity: "high", summary: "Package is fetched over plain http" },
  {
    id: "install-script-gained",
    severity: "high",
    summary: "An existing package started running install-time code",
  },
  {
    id: "install-script-new",
    severity: "medium",
    summary: "A new package runs code at install time",
  },
  { id: "integrity-dropped", severity: "medium", summary: "A previously recorded hash is gone" },
  {
    id: "non-registry-source",
    severity: "medium",
    summary: "New dependency from git/url, bypassing registry checks",
  },
  { id: "downgrade", severity: "medium", summary: "Version went backwards" },
  {
    id: "look-alike-name",
    severity: "medium",
    summary: "New package name resembles a very popular one",
  },
  { id: "major-bump", severity: "info", summary: "Major version bump" },
  { id: "prerelease", severity: "low", summary: "Pre-release version locked" },
];

const SEVERITY = new Map(RULES.map((r) => [r.id, r.severity]));

function finding(rule: string, name: string, message: string, detail?: string): Finding {
  const f: Finding = { rule, severity: SEVERITY.get(rule) ?? "info", name, message };
  if (detail) f.detail = detail;
  return f;
}

const DEFAULT_HOSTS = new Set([
  "registry.npmjs.org",
  "registry.yarnpkg.com",
  "pypi.org",
  "files.pythonhosted.org",
  "index.crates.io",
  "static.crates.io",
  "proxy.golang.org",
]);

/**
 * True when the package moved somewhere less trusted. Moving from a git/url/mirror
 * source back onto a default public registry is an improvement, so it is not flagged.
 */
const sourceDowngraded = (from: Pkg, to: Pkg): boolean => {
  const f = from.source;
  const t = to.source;
  if (!f || !t) return false;
  if (f.kind === t.kind && (f.host ?? "") === (t.host ?? "")) return false;
  if (t.kind === "registry" && t.host && DEFAULT_HOSTS.has(t.host)) return false;
  if (t.kind === "registry" && !t.host && f.kind !== "registry") return false;
  return true;
};

const describe = (p: Pkg) =>
  p.source ? `${p.source.kind}${p.source.host ? `:${p.source.host}` : ""}` : "unknown";

function short(h: string | undefined): string {
  return h ? (h.length > 20 ? `${h.slice(0, 18)}…` : h) : "none";
}

/** Checks that apply to any package version that is new to the lockfile. */
function checkNewInstance(p: Pkg, out: Finding[], script: "new" | "gained" | "existing"): void {
  if (p.installScript && script !== "existing") {
    out.push(
      script === "gained"
        ? finding(
            "install-script-gained",
            p.name,
            `${p.name}@${p.version} now runs code at install time`,
            "The previous version did not. Review what changed in its package.json scripts or build setup.",
          )
        : finding("install-script-new", p.name, `${p.name}@${p.version} runs code at install time`),
    );
  }
  if (p.source?.insecure) {
    out.push(
      finding(
        "insecure-transport",
        p.name,
        `${p.name}@${p.version} is fetched over http`,
        `Source: ${describe(p)}`,
      ),
    );
  }
  if (isPrerelease(p.version) && p.source?.kind === "registry") {
    out.push(finding("prerelease", p.name, `${p.name}@${p.version} is a pre-release`));
  }
}

export function analyze(
  changes: Change[],
  ctx: { ecosystem: Ecosystem; hasIntegrity: boolean },
): Finding[] {
  const out: Finding[] = [];
  for (const c of changes) {
    switch (c.kind) {
      case "added": {
        for (const p of c.to) {
          checkNewInstance(p, out, "new");
          if (p.source && (p.source.kind === "git" || p.source.kind === "url")) {
            out.push(
              finding(
                "non-registry-source",
                p.name,
                `${p.name}@${p.version} comes from ${describe(p)}`,
                "Git and URL dependencies skip the registry's immutability guarantees.",
              ),
            );
          }
        }
        const mimic = lookAlikeOf(c.name, ctx.ecosystem);
        if (mimic) {
          out.push(
            finding(
              "look-alike-name",
              c.name,
              `${c.name} looks like "${mimic}"`,
              "Could be legitimate. Confirm the maintainer and repository before merging.",
            ),
          );
        }
        break;
      }
      case "bumped": {
        const from = c.from[0] as Pkg;
        const to = c.to[0] as Pkg;
        if (c.bump === "downgrade") {
          out.push(
            finding(
              "downgrade",
              c.name,
              `${c.name} went backwards: ${from.version} → ${to.version}`,
            ),
          );
        }
        if (c.bump === "major") {
          out.push(finding("major-bump", c.name, `${c.name} ${from.version} → ${to.version}`));
        }
        checkNewInstance(to, out, from.installScript ? "existing" : "gained");
        if (sourceDowngraded(from, to)) {
          out.push(
            finding(
              "source-changed",
              c.name,
              `${c.name} source changed: ${describe(from)} → ${describe(to)}`,
            ),
          );
        }
        if (from.integrity.length > 0 && to.integrity.length === 0 && ctx.hasIntegrity) {
          out.push(
            finding("integrity-dropped", c.name, `${c.name}@${to.version} has no recorded hash`),
          );
        }
        break;
      }
      case "modified": {
        const from = c.from[0] as Pkg;
        const to = c.to[0] as Pkg;
        if (from.integrity.length > 0 && to.integrity.length === 0) {
          out.push(
            finding("integrity-dropped", c.name, `${c.name}@${to.version} lost its recorded hash`),
          );
        } else if (from.integrity.some((h) => !to.integrity.includes(h))) {
          const lost = from.integrity.find((h) => !to.integrity.includes(h));
          const now = to.integrity.find((h) => !from.integrity.includes(h));
          out.push(
            finding(
              "integrity-changed",
              c.name,
              `${c.name}@${to.version} has a different hash than before`,
              `${short(lost)} became ${short(now)}. Same version, different bytes.`,
            ),
          );
        }
        if (sourceDowngraded(from, to)) {
          out.push(
            finding(
              "source-changed",
              c.name,
              `${c.name}@${to.version} source changed: ${describe(from)} → ${describe(to)}`,
            ),
          );
        }
        if (to.installScript && !from.installScript) {
          out.push(
            finding(
              "install-script-gained",
              c.name,
              `${c.name}@${to.version} now runs code at install time`,
            ),
          );
        }
        break;
      }
      case "multi": {
        const base = c.from[0];
        for (const p of c.to) {
          if (p.installScript && !(base?.installScript ?? false)) {
            out.push(
              finding(
                "install-script-new",
                p.name,
                `${p.name}@${p.version} runs code at install time`,
              ),
            );
          }
          if (p.source?.insecure) {
            out.push(
              finding("insecure-transport", p.name, `${p.name}@${p.version} is fetched over http`),
            );
          }
          if (base && sourceDowngraded(base, p)) {
            out.push(
              finding(
                "source-changed",
                c.name,
                `${c.name}@${p.version} source differs: ${describe(base)} → ${describe(p)}`,
              ),
            );
          }
        }
        break;
      }
      case "removed":
        break;
    }
  }
  return out;
}
