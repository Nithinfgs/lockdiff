import type { Lockfile, Pkg, Source } from "../model.js";
import { sourceFromUrl } from "./source.js";
import { asArray, asString, asTable, parseToml, type TomlTable } from "./toml.js";

export function normalizePyName(name: string): string {
  return name.toLowerCase().replace(/[-_.]+/g, "-");
}

const PYPI_HOSTS = new Set(["pypi.org", "files.pythonhosted.org"]);

function pySource(url: string | undefined): Source {
  const s = sourceFromUrl(url);
  if (!s) return { kind: "registry", host: "pypi.org" };
  if (s.host && PYPI_HOSTS.has(s.host)) return { ...s, host: "pypi.org" };
  return s;
}

/** uv.lock */
export function parseUv(text: string, path: string): Lockfile {
  const doc = parseToml(text);
  const packages: Pkg[] = [];
  for (const raw of asArray(doc.package)) {
    const t = asTable(raw);
    const name = asString(t?.name);
    const version = asString(t?.version);
    if (!t || !name || !version) continue;
    const src = asTable(t.source);
    if (src && (src.editable || src.virtual || src.directory || src.path)) continue;
    const hashes: string[] = [];
    const sdist = asTable(t.sdist);
    const sdistHash = asString(sdist?.hash);
    if (sdistHash) hashes.push(sdistHash);
    const wheels = asArray(t.wheels);
    for (const w of wheels) {
      const h = asString(asTable(w)?.hash);
      if (h) hashes.push(h);
    }
    const pkg: Pkg = { name: normalizePyName(name), version, integrity: [...new Set(hashes)] };
    if (src?.git) pkg.source = { kind: "git", host: sourceFromUrl(asString(src.git))?.host };
    else if (src?.url) pkg.source = pySource(asString(src.url));
    else pkg.source = pySource(asString(src?.registry));
    if (sdist && wheels.length === 0) pkg.installScript = true;
    packages.push(pkg);
  }
  return { path, kind: "uv", ecosystem: "python", packages, hasIntegrity: true };
}

/** poetry.lock (1.x with per-package files, and the older [metadata.files] layout) */
export function parsePoetry(text: string, path: string): Lockfile {
  const doc = parseToml(text);
  const legacyFiles = asTable(asTable(doc.metadata)?.files);
  const packages: Pkg[] = [];
  for (const raw of asArray(doc.package)) {
    const t = asTable(raw);
    const name = asString(t?.name);
    const version = asString(t?.version);
    if (!t || !name || !version) continue;
    const src = asTable(t.source);
    const srcType = asString(src?.type);
    if (srcType === "directory" || srcType === "file") continue;
    const files = asArray(t.files).length ? asArray(t.files) : asArray(legacyFiles?.[name]);
    const hashes: string[] = [];
    let sawWheel = false;
    for (const f of files) {
      const ft = asTable(f) as TomlTable | undefined;
      const h = asString(ft?.hash);
      if (h) hashes.push(h);
      if (asString(ft?.file)?.endsWith(".whl")) sawWheel = true;
    }
    const pkg: Pkg = { name: normalizePyName(name), version, integrity: [...new Set(hashes)] };
    if (srcType === "git")
      pkg.source = { kind: "git", host: sourceFromUrl(asString(src?.url))?.host };
    else if (srcType === "url") pkg.source = pySource(asString(src?.url));
    else if (srcType === "legacy") pkg.source = pySource(asString(src?.url));
    else pkg.source = { kind: "registry", host: "pypi.org" };
    if (files.length > 0 && !sawWheel) pkg.installScript = true;
    if (asString(t.category) === "dev") pkg.dev = true;
    packages.push(pkg);
  }
  return { path, kind: "poetry", ecosystem: "python", packages, hasIntegrity: true };
}
