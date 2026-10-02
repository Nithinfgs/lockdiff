import assert from "node:assert/strict";
import { test } from "node:test";
import { parseLockfile } from "../src/parsers/index.js";
import { npmLock, pkg } from "./helpers.js";

test("npm: v3 packages, scoped names, nested copies, direct flag, install scripts", () => {
  const text = JSON.stringify({
    lockfileVersion: 3,
    packages: {
      "": { dependencies: { a: "1" }, devDependencies: { "@s/b": "1" } },
      "node_modules/a": pkg("1.0.0", "sha512-a", { hasInstallScript: true }),
      "node_modules/@s/b": pkg("2.0.0", "sha512-b", { dev: true }),
      "node_modules/a/node_modules/c": pkg("3.0.0"),
      "node_modules/link": { resolved: "packages/link", link: true },
      "packages/link": { version: "0.0.0" },
    },
  });
  const lock = parseLockfile(text, "package-lock.json");
  const by = Object.fromEntries(lock.packages.map((p) => [p.name, p]));
  assert.deepEqual(Object.keys(by).sort(), ["@s/b", "a", "c"]);
  assert.equal(by.a?.installScript, true);
  assert.equal(by.a?.direct, true);
  assert.equal(by["@s/b"]?.dev, true);
  assert.equal(by.c?.direct, undefined);
  assert.equal(by.a?.source?.host, "registry.npmjs.org");
});

test("npm: v1 nested dependencies", () => {
  const text = JSON.stringify({
    lockfileVersion: 1,
    dependencies: {
      a: { version: "1.0.0", integrity: "sha1-x", dependencies: { b: { version: "2.0.0" } } },
    },
  });
  const lock = parseLockfile(text, "package-lock.json");
  assert.deepEqual(
    lock.packages.map((p) => `${p.name}@${p.version}`),
    ["a@1.0.0", "b@2.0.0"],
  );
});

test("npm: rejects invalid JSON with a readable error", () => {
  assert.throws(() => parseLockfile("{nope", "package-lock.json"), /invalid JSON/);
});

test("pnpm: v9 keys, peer suffixes, requiresBuild", () => {
  const text = `lockfileVersion: '9.0'

importers:
  .:
    dependencies:
      react:
        specifier: ^18
        version: 18.2.0

packages:

  '@babel/core@7.24.0':
    resolution: {integrity: sha512-aaa}
    engines: {node: '>=6.9.0'}

  esbuild@0.21.5:
    resolution: {integrity: sha512-bbb}
    hasBin: true
    requiresBuild: true

snapshots:
  esbuild@0.21.5: {}
`;
  const lock = parseLockfile(text, "pnpm-lock.yaml");
  assert.deepEqual(
    lock.packages.map((p) => `${p.name}@${p.version}`),
    ["@babel/core@7.24.0", "esbuild@0.21.5"],
  );
  assert.equal(lock.packages[1]?.installScript, true);
  assert.deepEqual(lock.packages[0]?.integrity, ["sha512-aaa"]);
});

test("pnpm: v5 path-style keys", () => {
  const text = `lockfileVersion: 5.4
packages:
  /@scope/name/1.2.3_react@18.0.0:
    resolution: {integrity: sha512-x}
    dev: true
  /plain/0.1.0:
    resolution: {integrity: sha512-y}
`;
  const lock = parseLockfile(text, "pnpm-lock.yaml");
  assert.deepEqual(
    lock.packages.map((p) => `${p.name}@${p.version}`),
    ["@scope/name@1.2.3", "plain@0.1.0"],
  );
  assert.equal(lock.packages[0]?.dev, true);
});

test("yarn classic", () => {
  const text = `# yarn lockfile v1


"@scope/a@^1.0.0", "@scope/a@^1.1.0":
  version "1.2.0"
  resolved "https://registry.yarnpkg.com/@scope/a/-/a-1.2.0.tgz#abc"
  integrity sha512-aaa

b@^2.0.0:
  version "2.0.1"
  resolved "https://registry.yarnpkg.com/b/-/b-2.0.1.tgz#def"
  integrity sha512-bbb
`;
  const lock = parseLockfile(text, "yarn.lock");
  assert.deepEqual(
    lock.packages.map((p) => `${p.name}@${p.version}`),
    ["@scope/a@1.2.0", "b@2.0.1"],
  );
  assert.equal(lock.packages[0]?.source?.host, "registry.yarnpkg.com");
});

test("yarn berry skips workspaces and reads checksum", () => {
  const text = `__metadata:
  version: 8

"left-pad@npm:^1.3.0":
  version: 1.3.0
  resolution: "left-pad@npm:1.3.0"
  checksum: 10c0/abc
  languageName: node
  linkType: hard

"app@workspace:.":
  version: 0.0.0-use.local
  resolution: "app@workspace:."
  languageName: unknown
  linkType: soft
`;
  const lock = parseLockfile(text, "yarn.lock");
  assert.equal(lock.packages.length, 1);
  assert.deepEqual(lock.packages[0]?.integrity, ["10c0/abc"]);
});

test("cargo: skips workspace members, records git sources", () => {
  const text = `version = 3

[[package]]
name = "mine"
version = "0.1.0"

[[package]]
name = "serde"
version = "1.0.200"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "abc123"

[[package]]
name = "forked"
version = "0.2.0"
source = "git+https://github.com/x/forked#deadbeef"
`;
  const lock = parseLockfile(text, "Cargo.lock");
  assert.deepEqual(
    lock.packages.map((p) => p.name),
    ["serde", "forked"],
  );
  assert.equal(lock.packages[0]?.integrity[0], "sha256:abc123");
  assert.equal(lock.packages[1]?.source?.kind, "git");
});

test("uv: flags sdist-only packages as install-time builds, skips editable", () => {
  const text = `version = 1

[[package]]
name = "My_App"
version = "0.1.0"
source = { editable = "." }

[[package]]
name = "Requests"
version = "2.32.0"
source = { registry = "https://pypi.org/simple" }
sdist = { url = "https://files.pythonhosted.org/r.tar.gz", hash = "sha256:aa" }
wheels = [
    { url = "https://files.pythonhosted.org/r.whl", hash = "sha256:bb" },
]

[[package]]
name = "old-thing"
version = "1.0"
source = { registry = "https://pypi.org/simple" }
sdist = { url = "https://files.pythonhosted.org/o.tar.gz", hash = "sha256:cc" }
`;
  const lock = parseLockfile(text, "uv.lock");
  assert.deepEqual(
    lock.packages.map((p) => p.name),
    ["requests", "old-thing"],
  );
  assert.equal(lock.packages[0]?.installScript, undefined);
  assert.equal(lock.packages[1]?.installScript, true);
  assert.deepEqual(lock.packages[0]?.integrity, ["sha256:aa", "sha256:bb"]);
});

test("poetry: per-package files", () => {
  const text = `[[package]]
name = "click"
version = "8.1.7"
category = "dev"

[package.dependencies]
colorama = {version = "*", markers = "platform_system == \\"Windows\\""}

files = [
    {file = "click-8.1.7-py3-none-any.whl", hash = "sha256:aa"},
]

[metadata]
lock-version = "2.0"
`;
  const lock = parseLockfile(text, "poetry.lock");
  assert.equal(lock.packages.length, 1);
  assert.equal(lock.packages[0]?.dev, true);
  assert.equal(lock.packages[0]?.installScript, undefined);
});

test("go.sum ignores /go.mod lines", () => {
  const text = `github.com/a/b v1.0.0 h1:aaa=
github.com/a/b v1.0.0/go.mod h1:bbb=
github.com/c/d v0.1.0/go.mod h1:ccc=
`;
  const lock = parseLockfile(text, "go.sum");
  assert.deepEqual(
    lock.packages.map((p) => `${p.name}@${p.version}`),
    ["github.com/a/b@v1.0.0"],
  );
});

test("unknown file names ask for --type", () => {
  assert.throws(() => parseLockfile(npmLock({}), "weird.lock"), /--type/);
});
