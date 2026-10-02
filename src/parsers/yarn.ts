import type { Lockfile, Pkg } from "../model.js";
import { sourceFromUrl } from "./source.js";

/** Reads both yarn classic (v1) and yarn berry (v2+) lockfiles. */
export function parseYarn(text: string, path: string): Lockfile {
  const berry = /^__metadata:/m.test(text);
  const packages: Pkg[] = [];
  for (const block of text.split(/\r?\n\r?\n/)) {
    const lines = block.split(/\r?\n/).filter((l) => l.trim() !== "" && !l.startsWith("#"));
    const header = lines[0];
    if (!header || /^\s/.test(header) || header.startsWith("__metadata")) continue;
    const specs = header
      .replace(/:$/, "")
      .split(/,\s*/)
      .map((s) => s.trim().replace(/^"|"$/g, ""));
    const first = specs[0];
    if (!first) continue;
    const at = first.indexOf("@", 1);
    if (at < 0) continue;
    const name = first.slice(0, at);
    const field = (key: string): string | undefined => {
      for (const l of lines.slice(1)) {
        const m = new RegExp(`^ {2}${key}:? (.+)$`).exec(l);
        if (m?.[1]) return m[1].replace(/^"|"$/g, "");
      }
      return undefined;
    };
    const version = field("version");
    if (!version) continue;
    if (berry && /@workspace:/.test(field("resolution") ?? "")) continue;
    const pkg: Pkg = { name, version, integrity: [] };
    const hash = berry ? field("checksum") : field("integrity");
    if (hash) pkg.integrity.push(hash);
    if (berry) {
      const res = field("resolution") ?? "";
      if (/@(git|github|https?)[:+]/.test(res) || /#commit=/.test(res))
        pkg.source = { kind: "git" };
      else if (/@(file|link|portal):/.test(res)) pkg.source = { kind: "path" };
      else pkg.source = { kind: "registry" };
    } else {
      const src = sourceFromUrl(field("resolved"));
      if (src) pkg.source = src;
    }
    packages.push(pkg);
  }
  return { path, kind: "yarn", ecosystem: "npm", packages, hasIntegrity: true };
}
