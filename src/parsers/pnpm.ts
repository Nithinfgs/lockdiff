import type { Lockfile, Pkg } from "../model.js";
import { sourceFromUrl } from "./source.js";

/**
 * Line-based reader for pnpm-lock.yaml (v5, v6 and v9 layouts). Only the
 * `packages:` section is needed, and its structure is regular enough that a
 * full YAML parser would be overkill (and a dependency).
 */
export function parsePnpm(text: string, path: string): Lockfile {
  const packages: Pkg[] = [];
  const legacyKeys =
    Number.parseFloat(/^lockfileVersion:\s*['"]?([\d.]+)/m.exec(text)?.[1] ?? "9") < 6;
  let inPackages = false;
  let current: { key: string; lines: string[] } | undefined;
  const entries: { key: string; lines: string[] }[] = [];

  for (const line of text.split(/\r?\n/)) {
    if (/^\S/.test(line)) {
      inPackages = line.trimEnd() === "packages:";
      current = undefined;
      continue;
    }
    if (!inPackages || line.trim() === "" || line.trimStart().startsWith("#")) continue;
    const indent = line.length - line.trimStart().length;
    if (indent === 2) {
      current = { key: unquote(line.trim().replace(/:$/, "")), lines: [] };
      entries.push(current);
    } else if (current) {
      current.lines.push(line.trim());
    }
  }

  for (const { key, lines } of entries) {
    const id = splitKey(key, legacyKeys);
    if (!id) continue;
    const res = lines.find((l) => l.startsWith("resolution:")) ?? "";
    const integrity = /integrity:\s*([^,}\s]+)/.exec(res)?.[1];
    const tarball = /tarball:\s*([^,}\s]+)/.exec(res)?.[1];
    const type = /type:\s*([a-z]+)/.exec(res)?.[1];
    const pkg: Pkg = {
      name: id.name,
      version: id.version,
      integrity: integrity ? [integrity] : [],
    };
    if (type === "git") pkg.source = { kind: "git" };
    else if (type === "directory") pkg.source = { kind: "path" };
    else {
      const src = sourceFromUrl(tarball);
      pkg.source = src ?? { kind: "registry" };
    }
    if (lines.some((l) => l === "requiresBuild: true")) pkg.installScript = true;
    if (lines.some((l) => l === "dev: true")) pkg.dev = true;
    packages.push(pkg);
  }
  return { path, kind: "pnpm", ecosystem: "npm", packages, hasIntegrity: true };
}

function unquote(s: string): string {
  return s.replace(/^(['"])(.*)\1$/, "$2");
}

function splitKey(rawKey: string, legacy: boolean): { name: string; version: string } | undefined {
  let key = rawKey.replace(/\(.*$/, ""); // v6+/v9 peer suffix
  if (key.startsWith("/")) key = key.slice(1);
  if (!legacy) {
    const at = key.lastIndexOf("@");
    return at > 0 ? { name: key.slice(0, at), version: key.slice(at + 1) } : undefined;
  }
  // v5: name/1.2.3 or @scope/name/1.2.3_peerhash
  const slash = key.lastIndexOf("/");
  if (slash <= 0) return undefined;
  return { name: key.slice(0, slash), version: key.slice(slash + 1).replace(/_.*$/, "") };
}
