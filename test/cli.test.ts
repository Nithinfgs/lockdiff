import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { run } from "../src/cli.js";
import { npmLock, pkg, tempRepo } from "./helpers.js";

const strip = (s: string) =>
  s.replace(new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g"), "");

test("git: working tree vs HEAD, with nested lockfiles", () => {
  const repo = tempRepo();
  try {
    repo.commit(
      {
        "package-lock.json": npmLock({ a: pkg("1.0.0") }),
        "apps/web/package-lock.json": npmLock({ z: pkg("1.0.0") }),
      },
      "init",
    );
    writeFileSync(
      join(repo.dir, "package-lock.json"),
      npmLock({ a: pkg("1.0.0", "sha512-tampered") }),
    );
    const { out, code } = run(["-C", repo.dir, "--no-color", "--fail-on", "high"]);
    assert.equal(code, 1);
    assert.match(out, /integrity-changed/);
    assert.doesNotMatch(out, /apps\/web/);
  } finally {
    repo.cleanup();
  }
});

test("git: ref ranges and new lockfiles", () => {
  const repo = tempRepo();
  try {
    repo.commit({ "package-lock.json": npmLock({ a: pkg("1.0.0") }) }, "one");
    repo.commit(
      {
        "package-lock.json": npmLock({ a: pkg("1.1.0"), b: pkg("1.0.0") }),
        "sub/uv.lock":
          'version = 1\n[[package]]\nname = "q"\nversion = "1.0"\nsource = { registry = "https://pypi.org/simple" }\n',
      },
      "two",
    );
    const { out } = run(["-C", repo.dir, "--no-color", "HEAD~1..HEAD"]);
    const text = strip(out);
    assert.match(text, /\+1 added/);
    assert.match(text, /sub\/uv\.lock \(new lockfile\)/);
  } finally {
    repo.cleanup();
  }
});

test("no changes prints a friendly message and exits 0", () => {
  const repo = tempRepo();
  try {
    repo.commit({ "package-lock.json": npmLock({ a: pkg("1.0.0") }) }, "one");
    const { out, code } = run(["-C", repo.dir, "--no-color"]);
    assert.match(out, /No lockfile changes/);
    assert.equal(code, 0);
  } finally {
    repo.cleanup();
  }
});

test("file mode, json and markdown output", () => {
  const repo = tempRepo();
  try {
    mkdirSync(join(repo.dir, "x"));
    writeFileSync(join(repo.dir, "x", "package-lock.json"), npmLock({ a: pkg("1.0.0") }));
    writeFileSync(join(repo.dir, "y.json"), npmLock({ a: pkg("1.0.1") }));
    const a = join(repo.dir, "x", "package-lock.json");
    const b = join(repo.dir, "y.json");
    const json = JSON.parse(run([a, b, "--type", "npm", "--format", "json"]).out);
    assert.equal(json.files[0].changes[0].bump, "patch");
    const md = run([a, b, "--type", "npm", "--format", "markdown"]).out;
    assert.match(md, /## 🔒 lockdiff/);
  } finally {
    repo.cleanup();
  }
});

test("bad input is a UserError, not a stack trace", () => {
  assert.throws(() => run(["--format", "pdf"]), /Unknown format/);
  assert.throws(() => run(["/nonexistent/a.lock", "/nonexistent/b.lock"]), /not found|Cannot tell/);
});

test("built binary runs end to end", () => {
  const bin = fileURLToPath(new URL("../src/cli.js", import.meta.url));
  const out = execFileSync(process.execPath, [bin, "--version"], { encoding: "utf8" });
  assert.match(out, /^\d+\.\d+\.\d+/);
});
