import type { Lockfile, Pkg } from "../model.js";
import { hostOf } from "./source.js";
import { asArray, asString, asTable, parseToml } from "./toml.js";

export function parseCargo(text: string, path: string): Lockfile {
  const doc = parseToml(text);
  const packages: Pkg[] = [];
  for (const raw of asArray(doc.package)) {
    const t = asTable(raw);
    const name = asString(t?.name);
    const version = asString(t?.version);
    if (!t || !name || !version) continue;
    const src = asString(t.source);
    if (!src) continue; // workspace members and path dependencies
    const checksum = asString(t.checksum);
    const pkg: Pkg = { name, version, integrity: checksum ? [`sha256:${checksum}`] : [] };
    if (src.startsWith("git+")) pkg.source = { kind: "git", host: hostOf(src.slice(4)) };
    else {
      const url = src.replace(/^(registry|sparse)\+/, "");
      pkg.source = { kind: "registry", host: hostOf(url), insecure: url.startsWith("http:") };
    }
    packages.push(pkg);
  }
  return { path, kind: "cargo", ecosystem: "cargo", packages, hasIntegrity: true };
}
