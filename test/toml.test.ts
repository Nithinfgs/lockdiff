import assert from "node:assert/strict";
import { test } from "node:test";
import { parseToml } from "../src/parsers/toml.js";

test("parses arrays of tables, inline tables and multiline arrays", () => {
  const doc = parseToml(`
version = 3 # comment
[[package]]
name = "a"
source = { registry = "https://pypi.org/simple" }
wheels = [
  { url = "https://x/a.whl", hash = "sha256:aa" },
  { url = "https://x/b.whl", hash = "sha256:bb" },
]

[[package]]
name = 'b'
[package.metadata]
ok = true
n = 1_000
`);
  const pkgs = doc.package as Record<string, unknown>[];
  assert.equal(doc.version, 3);
  assert.equal(pkgs.length, 2);
  assert.deepEqual(pkgs[0]?.source as object, { registry: "https://pypi.org/simple" });
  assert.equal(((pkgs[0]?.wheels ?? []) as unknown[]).length, 2);
  assert.deepEqual(pkgs[1]?.metadata, { ok: true, n: 1000 });
});

test("handles escapes and multiline strings", () => {
  const doc = parseToml('a = "x\\ty\\u00e9"\nb = """\nline1\nline2"""\n');
  assert.equal(doc.a, "x\tyé");
  assert.equal(doc.b, "line1\nline2");
});

test("reports line numbers on errors", () => {
  assert.throws(() => parseToml('a = 1\nb = "oops\n'), /line 2/);
});
