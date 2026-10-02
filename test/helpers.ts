import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

export function npmLock(
  pkgs: Record<string, Record<string, unknown>>,
  direct: string[] = [],
): string {
  const packages: Record<string, unknown> = {
    "": { name: "t", dependencies: Object.fromEntries(direct.map((d) => [d, "*"])) },
  };
  for (const [name, e] of Object.entries(pkgs)) packages[`node_modules/${name}`] = e;
  return JSON.stringify({ lockfileVersion: 3, packages });
}

export const pkg = (version: string, integrity = `sha512-${version}`, extra: object = {}) => ({
  version,
  resolved: `https://registry.npmjs.org/x/-/x-${version}.tgz`,
  integrity,
  ...extra,
});

export function tempRepo(): {
  dir: string;
  commit: (files: Record<string, string>, msg: string) => void;
  cleanup: () => void;
} {
  const dir = mkdtempSync(join(tmpdir(), "lockdiff-test-"));
  const git = (...args: string[]) =>
    execFileSync(
      "git",
      ["-C", dir, "-c", "user.name=t", "-c", "user.email=t@example.com", ...args],
      { stdio: "pipe" },
    );
  git("init", "-q", "-b", "main");
  return {
    dir,
    commit(files, msg) {
      for (const [p, c] of Object.entries(files)) {
        mkdirSync(dirname(join(dir, p)), { recursive: true });
        writeFileSync(join(dir, p), c);
      }
      git("add", "-A");
      git("commit", "-q", "-m", msg);
    },
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}
