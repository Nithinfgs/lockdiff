import assert from "node:assert/strict";
import { test } from "node:test";
import { diffLockfiles } from "../src/diff.js";
import { parseLockfile } from "../src/parsers/index.js";
import { classifyBump } from "../src/version.js";
import { npmLock, pkg } from "./helpers.js";

const lock = (pkgs: Record<string, Record<string, unknown>>, direct: string[] = []) =>
  parseLockfile(npmLock(pkgs, direct), "package-lock.json");

const rules = (r: ReturnType<typeof diffLockfiles>) =>
  r.findings.map((f) => `${f.rule}:${f.name}`).sort();

test("classifies bumps", () => {
  assert.equal(classifyBump("1.2.3", "2.0.0"), "major");
  assert.equal(classifyBump("1.2.3", "1.3.0"), "minor");
  assert.equal(classifyBump("1.2.3", "1.2.4"), "patch");
  assert.equal(classifyBump("1.2.3", "1.2.2"), "downgrade");
  assert.equal(classifyBump("1.2.3-rc.1", "1.2.3"), "prerelease");
  assert.equal(classifyBump("v0.0.0-20200101-abc", "v0.1.0"), "minor");
});

test("added, removed and bumped packages", () => {
  const r = diffLockfiles(
    lock({ a: pkg("1.0.0"), b: pkg("1.0.0") }),
    lock({ a: pkg("1.1.0"), c: pkg("1.0.0") }),
  );
  assert.deepEqual(
    r.changes.map((c) => `${c.kind}:${c.name}`),
    ["bumped:a", "removed:b", "added:c"],
  );
  assert.equal(r.findings.length, 0);
});

test("same version with different hash is high severity", () => {
  const r = diffLockfiles(
    lock({ a: pkg("1.0.0", "sha512-old") }),
    lock({ a: pkg("1.0.0", "sha512-new") }),
  );
  assert.deepEqual(rules(r), ["integrity-changed:a"]);
  assert.equal(r.findings[0]?.severity, "high");
});

test("identical lockfiles produce no changes", () => {
  const l = lock({ a: pkg("1.0.0") });
  assert.equal(diffLockfiles(l, l).changes.length, 0);
});

test("install scripts: new vs gained vs already present", () => {
  const before = lock({ a: pkg("1.0.0"), s: pkg("1.0.0", "x", { hasInstallScript: true }) });
  const after = lock({
    a: pkg("1.1.0", "x", { hasInstallScript: true }),
    s: pkg("1.1.0", "y", { hasInstallScript: true }),
    n: pkg("1.0.0", "z", { hasInstallScript: true }),
  });
  assert.deepEqual(rules(diffLockfiles(before, after)), [
    "install-script-gained:a",
    "install-script-new:n",
  ]);
});

test("source change, http and git dependencies", () => {
  const r = diffLockfiles(
    lock({ a: pkg("1.0.0") }),
    lock({
      a: { ...pkg("1.0.1"), resolved: "http://mirror.example/a.tgz" },
      g: { version: "0.0.1", resolved: "git+ssh://git@github.com/x/g.git#abc" },
    }),
  );
  assert.deepEqual(rules(r), ["insecure-transport:a", "non-registry-source:g", "source-changed:a"]);
});

test("downgrade and major bump", () => {
  const r = diffLockfiles(
    lock({ a: pkg("2.0.0"), b: pkg("1.0.0") }),
    lock({ a: pkg("1.9.0"), b: pkg("2.0.0") }),
  );
  assert.deepEqual(rules(r), ["downgrade:a", "major-bump:b"]);
});

test("look-alike names are flagged, real popular names are not", () => {
  const r = diffLockfiles(
    lock({}),
    lock({ crossenv: pkg("1.0.0"), "cross-env": pkg("7.0.0"), lodahs: pkg("1.0.0") }),
  );
  assert.deepEqual(rules(r), ["look-alike-name:crossenv", "look-alike-name:lodahs"]);
});

test("ignore and disableRules options", () => {
  const before = lock({ a: pkg("1.0.0", "old") });
  const after = lock({ a: pkg("1.0.0", "new"), crossenv: pkg("1.0.0") });
  assert.equal(
    diffLockfiles(before, after, { ignore: ["crossenv"], disableRules: ["integrity-changed"] })
      .findings.length,
    0,
  );
});

test("a lockfile that appears is reported as added", () => {
  const r = diffLockfiles(undefined, lock({ a: pkg("1.0.0") }));
  assert.equal(r.fileStatus, "added");
  assert.equal(r.changes[0]?.kind, "added");
});

test("multiple installed versions of one package", () => {
  const before = parseLockfile(
    JSON.stringify({
      lockfileVersion: 3,
      packages: {
        "": {},
        "node_modules/a": pkg("1.0.0"),
        "node_modules/x/node_modules/a": pkg("2.0.0"),
      },
    }),
    "package-lock.json",
  );
  const after = parseLockfile(
    JSON.stringify({ lockfileVersion: 3, packages: { "": {}, "node_modules/a": pkg("2.0.0") } }),
    "package-lock.json",
  );
  const r = diffLockfiles(before, after);
  assert.equal(r.changes.length, 1);
  assert.equal(r.changes[0]?.kind, "multi");
});

test("python: wheels added later are fine, lost hashes are not", () => {
  const mk = (hashes: string[]) =>
    parseLockfile(
      `version = 1\n[[package]]\nname = "x"\nversion = "1.0"\nsource = { registry = "https://pypi.org/simple" }\nwheels = [\n${hashes.map((h) => `  { url = "https://f/${h}.whl", hash = "${h}" },`).join("\n")}\n]\n`,
      "uv.lock",
    );
  const widened = diffLockfiles(mk(["sha256:a"]), mk(["sha256:a", "sha256:b"]));
  assert.equal(widened.findings.length, 0);
  const swapped = diffLockfiles(mk(["sha256:a"]), mk(["sha256:z"]));
  assert.deepEqual(rules(swapped), ["integrity-changed:x"]);
});

test("platform suffixes are not pre-releases; real pre-releases are", () => {
  const r = diffLockfiles(
    lock({}),
    lock({ a: pkg("0.157.0-darwin-arm64"), b: pkg("1.0.0-rc.1"), c: pkg("2.0.0-beta") }),
  );
  assert.deepEqual(rules(r), ["prerelease:b", "prerelease:c"]);
});

test("moving from git to a public registry is not a source downgrade", () => {
  const git = parseLockfile(
    `[[package]]\nname = "core"\nversion = "1.0"\n[package.source]\ntype = "git"\nurl = "https://github.com/x/core"\n`,
    "poetry.lock",
  );
  const reg = parseLockfile(
    `[[package]]\nname = "core"\nversion = "1.1"\nfiles = []\n`,
    "poetry.lock",
  );
  assert.equal(diffLockfiles(git, reg).findings.length, 0);
  assert.deepEqual(rules(diffLockfiles(reg, git)), ["downgrade:core", "source-changed:core"]);
});
