import { basename } from "node:path";
import type { Lockfile, LockKind } from "../model.js";
import { UserError } from "../model.js";
import { parseCargo } from "./cargo.js";
import { parseGoSum } from "./gosum.js";
import { parseNpm } from "./npm.js";
import { parsePnpm } from "./pnpm.js";
import { parsePoetry, parseUv } from "./python.js";
import { parseYarn } from "./yarn.js";

const BY_NAME: Record<string, LockKind> = {
  "package-lock.json": "npm",
  "npm-shrinkwrap.json": "npm",
  "pnpm-lock.yaml": "pnpm",
  "yarn.lock": "yarn",
  "Cargo.lock": "cargo",
  "poetry.lock": "poetry",
  "uv.lock": "uv",
  "go.sum": "gosum",
};

export const LOCKFILE_NAMES = Object.keys(BY_NAME);

export function detectKind(path: string): LockKind | undefined {
  return BY_NAME[basename(path)];
}

export function parseLockfile(text: string, path: string, kind?: LockKind): Lockfile {
  const k = kind ?? detectKind(path);
  if (!k) {
    throw new UserError(
      `${path}: unrecognised lockfile name. Pass --type (${Object.values(BY_NAME)
        .filter((v, i, a) => a.indexOf(v) === i)
        .join(", ")}).`,
    );
  }
  switch (k) {
    case "npm":
      return parseNpm(text, path);
    case "pnpm":
      return parsePnpm(text, path);
    case "yarn":
      return parseYarn(text, path);
    case "cargo":
      return parseCargo(text, path);
    case "poetry":
      return parsePoetry(text, path);
    case "uv":
      return parseUv(text, path);
    case "gosum":
      return parseGoSum(text, path);
  }
}
