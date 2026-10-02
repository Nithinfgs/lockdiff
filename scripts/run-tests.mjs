// Portable test entry point: shells on Windows do not expand globs and Node 18
// does not accept directories for `node --test`, so list the files explicitly.
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "dist-test", "test");
const files = readdirSync(dir)
  .filter((f) => f.endsWith(".test.js"))
  .map((f) => join(dir, f));
const r = spawnSync(process.execPath, ["--test", ...files], { stdio: "inherit" });
process.exit(r.status ?? 1);
