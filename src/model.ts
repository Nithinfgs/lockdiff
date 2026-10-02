export type Ecosystem = "npm" | "cargo" | "python" | "go";

export type LockKind = "npm" | "pnpm" | "yarn" | "cargo" | "poetry" | "uv" | "gosum";

export type SourceKind = "registry" | "git" | "url" | "path";

export interface Source {
  kind: SourceKind;
  /** Host for registry/url sources, e.g. registry.npmjs.org */
  host?: string;
  /** True when the artifact is fetched over plain http. */
  insecure?: boolean;
}

/** One resolved package instance in a lockfile. */
export interface Pkg {
  name: string;
  version: string;
  /** Content hashes recorded by the lockfile. Empty when the lockfile has none. */
  integrity: string[];
  source?: Source;
  /** Runs code at install time (npm install scripts, sdist-only python builds). */
  installScript?: boolean;
  dev?: boolean;
  /** Declared by the project itself rather than pulled in transitively. */
  direct?: boolean;
}

export interface Lockfile {
  path: string;
  kind: LockKind;
  ecosystem: Ecosystem;
  packages: Pkg[];
  /** Whether this lockfile format records per-package hashes. */
  hasIntegrity: boolean;
}

export type Severity = "high" | "medium" | "low" | "info";

export const SEVERITY_ORDER: Record<Severity, number> = {
  high: 3,
  medium: 2,
  low: 1,
  info: 0,
};

export type ChangeKind = "added" | "removed" | "bumped" | "modified" | "multi";
export type BumpKind = "major" | "minor" | "patch" | "prerelease" | "downgrade" | "other";

export interface Change {
  name: string;
  kind: ChangeKind;
  from: Pkg[];
  to: Pkg[];
  bump?: BumpKind;
}

export interface Finding {
  rule: string;
  severity: Severity;
  name: string;
  message: string;
  detail?: string;
}

export interface FileReport {
  path: string;
  kind: LockKind;
  ecosystem: Ecosystem;
  /** "added" / "removed" when the lockfile itself appeared or disappeared. */
  fileStatus?: "added" | "removed";
  changes: Change[];
  findings: Finding[];
  totals: { before: number; after: number };
}

export interface Report {
  base: string;
  head: string;
  files: FileReport[];
}

export class UserError extends Error {}
