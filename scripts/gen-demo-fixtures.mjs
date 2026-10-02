// Generates the synthetic lockfiles in examples/demo/. Hashes are derived from
// package names, so output is deterministic. Nothing here describes real
// package releases: "tampered" and "script" cases are made up.
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "examples", "demo");
const hash = (s) => `sha512-${createHash("sha512").update(s).digest("base64")}`;
const NPM = "https://registry.npmjs.org";

function entry(name, version, extra = {}) {
  const base = name.split("/").pop();
  return {
    version,
    resolved: `${NPM}/${name}/-/${base}-${version}.tgz`,
    integrity: hash(`${name}@${version}`),
    ...extra,
  };
}

function lock(deps, specs) {
  const packages = {
    "": {
      name: "acme-web",
      version: "1.0.0",
      dependencies: Object.fromEntries(deps.map((d) => [d, "*"])),
    },
  };
  for (const [name, version, extra] of specs)
    packages[`node_modules/${name}`] = entry(name, version, extra);
  return `${JSON.stringify(
    { name: "acme-web", version: "1.0.0", lockfileVersion: 3, requires: true, packages },
    null,
    2,
  )}\n`;
}

const before = lock(
  [
    "react",
    "react-dom",
    "lodash",
    "express",
    "semver",
    "legacy-widget",
    "fast-uuid-lite",
    "quickparse",
  ],
  [
    ["react", "18.2.0"],
    ["react-dom", "18.2.0"],
    ["scheduler", "0.23.0"],
    ["lodash", "4.17.20"],
    ["express", "4.18.2"],
    ["body-parser", "1.20.1"],
    ["semver", "7.6.0"],
    ["ms", "2.1.2"],
    ["legacy-widget", "2.0.1"],
    ["fast-uuid-lite", "3.1.0"],
    ["quickparse", "1.4.2"],
  ],
);

const after = lock(
  [
    "react",
    "react-dom",
    "lodash",
    "express",
    "semver",
    "legacy-widget",
    "fast-uuid-lite",
    "quickparse",
    "axios",
    "esbuild",
    "crossenv",
    "my-fork",
  ],
  [
    ["react", "19.0.0"],
    ["react-dom", "19.0.0"],
    ["scheduler", "0.25.0"],
    ["lodash", "4.17.21"],
    ["express", "4.19.2"],
    ["body-parser", "1.20.2"],
    ["semver", "7.5.4"],
    // ms removed
    [
      "legacy-widget",
      "2.1.0",
      { resolved: "http://packages.internal.example/legacy-widget/-/legacy-widget-2.1.0.tgz" },
    ],
    // same version, different bytes
    ["fast-uuid-lite", "3.1.0", { integrity: hash("fast-uuid-lite@3.1.0 (republished)") }],
    // gained an install script
    ["quickparse", "1.5.0", { hasInstallScript: true }],
    ["axios", "1.7.2"],
    ["follow-redirects", "1.15.6"],
    ["form-data", "4.0.0"],
    ["proxy-from-env", "1.1.0"],
    ["esbuild", "0.21.5", { hasInstallScript: true, dev: true }],
    ["crossenv", "7.0.3"],
    [
      "my-fork",
      "0.0.1",
      { resolved: "git+ssh://git@github.com/acme/my-fork.git#4f3c2b1a", integrity: undefined },
    ],
  ],
);

for (const [dir, text] of [
  ["before", before],
  ["after", after],
]) {
  mkdirSync(join(root, dir), { recursive: true });
  writeFileSync(join(root, dir, "package-lock.json"), text);
}
console.log("wrote examples/demo/{before,after}/package-lock.json");
