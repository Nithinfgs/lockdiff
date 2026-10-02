import type { Lockfile, Pkg } from "../model.js";
import { UserError } from "../model.js";
import { sourceFromUrl } from "./source.js";

interface NpmEntry {
  version?: string;
  resolved?: string;
  integrity?: string;
  hasInstallScript?: boolean;
  dev?: boolean;
  optional?: boolean;
  link?: boolean;
  dependencies?: Record<string, NpmEntry | string>;
  devDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

interface NpmLock {
  lockfileVersion?: number;
  packages?: Record<string, NpmEntry>;
  dependencies?: Record<string, NpmEntry>;
}

export function parseNpm(text: string, path: string): Lockfile {
  let data: NpmLock;
  try {
    data = JSON.parse(text) as NpmLock;
  } catch (e) {
    throw new UserError(`${path}: invalid JSON (${(e as Error).message})`);
  }
  const packages: Pkg[] = [];
  if (data.packages) {
    const root = data.packages[""];
    const direct = new Set([
      ...Object.keys(root?.dependencies ?? {}),
      ...Object.keys(root?.devDependencies ?? {}),
      ...Object.keys(root?.optionalDependencies ?? {}),
    ]);
    for (const [key, entry] of Object.entries(data.packages)) {
      if (key === "" || entry.link || !entry.version) continue;
      const idx = key.lastIndexOf("node_modules/");
      if (idx === -1) continue; // workspace package folders
      const name = key.slice(idx + "node_modules/".length);
      packages.push(makePkg(name, entry, key === `node_modules/${name}` && direct.has(name)));
    }
  } else if (data.dependencies) {
    walkV1(data.dependencies, packages, true);
  } else if (data.lockfileVersion === undefined) {
    throw new UserError(`${path}: does not look like a package-lock.json`);
  }
  return { path, kind: "npm", ecosystem: "npm", packages, hasIntegrity: true };
}

function makePkg(name: string, e: NpmEntry, direct: boolean): Pkg {
  const pkg: Pkg = {
    name,
    version: e.version ?? "",
    integrity: e.integrity ? [e.integrity] : [],
  };
  const source = sourceFromUrl(e.resolved);
  if (source) pkg.source = source;
  if (e.hasInstallScript) pkg.installScript = true;
  if (e.dev) pkg.dev = true;
  if (direct) pkg.direct = true;
  return pkg;
}

function walkV1(deps: Record<string, NpmEntry>, out: Pkg[], top: boolean): void {
  for (const [name, e] of Object.entries(deps)) {
    if (!e.version) continue;
    // v1 stores git/file deps as the spec in `version`
    const resolved = e.resolved ?? (/^(git|file|https?):/.test(e.version) ? e.version : undefined);
    out.push(makePkg(name, { ...e, resolved }, top));
    if (e.dependencies) walkV1(e.dependencies as Record<string, NpmEntry>, out, false);
  }
}
