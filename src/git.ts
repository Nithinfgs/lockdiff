import { execFileSync } from "node:child_process";
import { UserError } from "./model.js";

function git(cwd: string, args: string[]): string {
  try {
    return execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      maxBuffer: 256 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (e) {
    const err = e as { stderr?: Buffer | string; code?: string };
    if (err.code === "ENOENT") throw new UserError("git was not found on PATH.");
    throw new UserError(
      String(err.stderr ?? e)
        .trim()
        .replace(/^fatal: /, ""),
    );
  }
}

export function repoRoot(cwd: string): string {
  try {
    return git(cwd, ["rev-parse", "--show-toplevel"]).trim();
  } catch {
    throw new UserError(
      "Not inside a git repository. Pass two lockfile paths to compare files directly.",
    );
  }
}

export function resolveRef(root: string, ref: string): string {
  return git(root, ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`]).trim();
}

export function mergeBase(root: string, a: string, b: string): string {
  return git(root, ["merge-base", a, b]).trim();
}

export function listFilesAtRef(root: string, ref: string): string[] {
  return git(root, ["ls-tree", "-r", "--name-only", "-z", ref]).split("\0").filter(Boolean);
}

/** Tracked plus untracked-but-not-ignored files in the working tree. */
export function listWorkingFiles(root: string): string[] {
  return git(root, ["ls-files", "-z", "--cached", "--others", "--exclude-standard"])
    .split("\0")
    .filter(Boolean);
}

export function showFile(root: string, ref: string, path: string): string | undefined {
  try {
    return git(root, ["show", `${ref}:${path}`]);
  } catch {
    return undefined;
  }
}

export function shortRef(root: string, ref: string): string {
  try {
    return git(root, ["rev-parse", "--short", ref]).trim();
  } catch {
    return ref;
  }
}
