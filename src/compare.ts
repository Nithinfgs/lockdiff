import { existsSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { type DiffOptions, diffLockfiles } from "./diff.js";
import {
  listFilesAtRef,
  listWorkingFiles,
  mergeBase,
  repoRoot,
  resolveRef,
  shortRef,
  showFile,
} from "./git.js";
import type { Lockfile, LockKind, Report } from "./model.js";
import { UserError } from "./model.js";
import { detectKind, LOCKFILE_NAMES, parseLockfile } from "./parsers/index.js";

const WORKTREE = "working tree";

function isLockfile(path: string): boolean {
  return detectKind(path) !== undefined && !path.split("/").includes("node_modules");
}

export interface GitCompareInput {
  cwd: string;
  /** undefined => HEAD vs working tree. "a..b" and "a...b" are supported. */
  range?: string;
  /** Limit to these lockfile paths (relative to the repo root). */
  only?: string[];
}

export function compareGit(input: GitCompareInput, opts: DiffOptions): Report {
  const root = repoRoot(input.cwd);
  let baseRef = "HEAD";
  let headRef: string | undefined; // undefined => working tree
  const range = input.range;
  if (range?.includes("...")) {
    const [a = "", b = "HEAD"] = range.split("...");
    resolveRef(root, a || "HEAD");
    baseRef = mergeBase(root, a || "HEAD", b || "HEAD");
    headRef = b || "HEAD";
  } else if (range?.includes("..")) {
    const [a = "", b = ""] = range.split("..");
    baseRef = a || "HEAD";
    headRef = b || "HEAD";
  } else if (range) {
    baseRef = range;
  }
  resolveRef(root, baseRef);
  if (headRef) resolveRef(root, headRef);

  const basePaths = listFilesAtRef(root, baseRef).filter(isLockfile);
  const headPaths = (headRef ? listFilesAtRef(root, headRef) : listWorkingFiles(root)).filter(
    isLockfile,
  );
  let paths = [...new Set([...basePaths, ...headPaths])].sort();
  if (input.only?.length) paths = paths.filter((p) => input.only?.includes(p));

  const files = [];
  for (const path of paths) {
    const before = load(basePaths.includes(path) ? showFile(root, baseRef, path) : undefined, path);
    const afterText = headRef
      ? headPaths.includes(path)
        ? showFile(root, headRef, path)
        : undefined
      : headPaths.includes(path) && existsSync(join(root, path))
        ? readFileSync(join(root, path), "utf8")
        : undefined;
    const after = load(afterText, path);
    if (
      before &&
      after &&
      before.packages.length === after.packages.length &&
      sameText(before, after)
    ) {
      continue;
    }
    files.push(diffLockfiles(before, after, opts));
  }
  return {
    base: shortRef(root, baseRef) === baseRef ? baseRef : `${baseRef} (${shortRef(root, baseRef)})`,
    head: headRef ?? WORKTREE,
    files: files.filter((f) => f.changes.length > 0 || f.fileStatus),
  };
}

function sameText(a: Lockfile, b: Lockfile): boolean {
  return JSON.stringify(a.packages) === JSON.stringify(b.packages);
}

function load(text: string | undefined, path: string): Lockfile | undefined {
  return text === undefined ? undefined : parseLockfile(text, path);
}

export function compareFiles(
  oldPath: string,
  newPath: string,
  kind: LockKind | undefined,
  opts: DiffOptions,
): Report {
  const read = (p: string) => {
    const abs = resolve(p);
    if (!existsSync(abs)) throw new UserError(`File not found: ${p}`);
    return readFileSync(abs, "utf8");
  };
  const k = kind ?? detectKind(newPath) ?? detectKind(oldPath);
  if (!k) {
    throw new UserError(
      `Cannot tell which lockfile format this is. Known names: ${LOCKFILE_NAMES.join(", ")}. Use --type.`,
    );
  }
  const before = parseLockfile(read(oldPath), newPath, k);
  const after = parseLockfile(read(newPath), newPath, k);
  const rel = (p: string) => {
    const r = relative(process.cwd(), resolve(p));
    return r.length < p.length && !r.startsWith("..") ? r : p;
  };
  const file = diffLockfiles(before, after, opts);
  return {
    base: rel(oldPath),
    head: rel(newPath),
    files: file.changes.length > 0 ? [file] : [],
  };
}
