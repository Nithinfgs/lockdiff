import type { Lockfile, Pkg } from "../model.js";

/** go.sum: one `module version hash` line per module (and per go.mod file). */
export function parseGoSum(text: string, path: string): Lockfile {
  const packages: Pkg[] = [];
  for (const line of text.split(/\r?\n/)) {
    const [mod, ver, hash] = line.trim().split(/\s+/);
    if (!mod || !ver || !hash || ver.endsWith("/go.mod")) continue;
    packages.push({
      name: mod,
      version: ver,
      integrity: [hash],
      source: { kind: "registry", host: "proxy.golang.org" },
    });
  }
  return { path, kind: "gosum", ecosystem: "go", packages, hasIntegrity: true };
}
