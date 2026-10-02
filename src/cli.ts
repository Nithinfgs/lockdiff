#!/usr/bin/env node
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { compareFiles, compareGit } from "./compare.js";
import type { DiffOptions } from "./diff.js";
import { repoRoot } from "./git.js";
import type { LockKind, Report, Severity } from "./model.js";
import { SEVERITY_ORDER, UserError } from "./model.js";
import { renderJson } from "./render/json.js";
import { renderMarkdown } from "./render/markdown.js";
import { render } from "./render/terminal.js";
import { RULES } from "./rules.js";

const VERSION = "0.1.0";

const HELP = `lockdiff ${VERSION} - review lockfile changes, flag the risky ones

Usage
  lockdiff                      compare HEAD with the working tree
  lockdiff <ref>                compare <ref> with the working tree
  lockdiff <a>..<b>             compare two refs (a...b uses the merge base)
  lockdiff <old-file> <new-file>  compare two lockfiles directly

Supports package-lock.json, pnpm-lock.yaml, yarn.lock, Cargo.lock,
poetry.lock, uv.lock and go.sum. Works fully offline.

Options
  --format <terminal|markdown|json>  output format (default: terminal)
  --fail-on <high|medium|low|none>   exit 1 if a finding at or above this level
                                     exists (default: none)
  --only-risks                       hide the added/removed/changed lists
  --all                              do not truncate long lists
  --type <kind>                      lockfile type when comparing odd file names
                                     (npm|pnpm|yarn|cargo|poetry|uv|gosum)
  --ignore <pkg,pkg>                 skip these packages
  --disable <rule,rule>              turn off rules (see --list-rules)
  --demo                             run on the bundled example (no repo needed)
  --list-rules                       describe every rule
  --no-color                         disable ANSI colors
  -C <dir>                           run as if started in <dir>
  -h, --help | -v, --version

Config: lockdiff.config.json in the repo root may set
  { "ignore": [], "disableRules": [], "failOn": "high" }

Exit codes: 0 ok, 1 findings at/above --fail-on, 2 usage or input error.
`;

interface Args {
  positional: string[];
  format: "terminal" | "markdown" | "json";
  failOn?: Severity | "none";
  onlyRisks: boolean;
  all: boolean;
  type?: LockKind;
  ignore: string[];
  disable: string[];
  color: boolean;
  cwd: string;
  help: boolean;
  version: boolean;
  listRules: boolean;
  demo: boolean;
}

const KINDS: LockKind[] = ["npm", "pnpm", "yarn", "cargo", "poetry", "uv", "gosum"];

function parseArgs(argv: string[]): Args {
  const a: Args = {
    positional: [],
    format: "terminal",
    onlyRisks: false,
    all: false,
    ignore: [],
    disable: [],
    color: !process.env.NO_COLOR && (process.stdout.isTTY || !!process.env.FORCE_COLOR),
    cwd: process.cwd(),
    help: false,
    version: false,
    listRules: false,
    demo: false,
  };
  const list = (s: string) =>
    s
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] as string;
    const next = (): string => {
      const v = argv[++i];
      if (v === undefined) throw new UserError(`${arg} needs a value`);
      return v;
    };
    const eq = arg.startsWith("--") ? arg.indexOf("=") : -1;
    const flag = eq > 0 ? arg.slice(0, eq) : arg;
    const inline = eq > 0 ? arg.slice(eq + 1) : undefined;
    const value = () => inline ?? next();
    switch (flag) {
      case "-h":
      case "--help":
        a.help = true;
        break;
      case "-v":
      case "--version":
        a.version = true;
        break;
      case "--demo":
        a.demo = true;
        break;
      case "--list-rules":
        a.listRules = true;
        break;
      case "--no-color":
        a.color = false;
        break;
      case "--all":
        a.all = true;
        break;
      case "--only-risks":
        a.onlyRisks = true;
        break;
      case "-C":
        a.cwd = value();
        break;
      case "--format": {
        const v = value();
        if (v !== "terminal" && v !== "markdown" && v !== "json")
          throw new UserError(`Unknown format "${v}"`);
        a.format = v;
        break;
      }
      case "--fail-on": {
        const v = value();
        if (!["high", "medium", "low", "none"].includes(v))
          throw new UserError(`Unknown --fail-on level "${v}"`);
        a.failOn = v as Severity | "none";
        break;
      }
      case "--type": {
        const v = value() as LockKind;
        if (!KINDS.includes(v))
          throw new UserError(`Unknown --type "${v}". Use one of: ${KINDS.join(", ")}`);
        a.type = v;
        break;
      }
      case "--ignore":
        a.ignore.push(...list(value()));
        break;
      case "--disable":
        a.disable.push(...list(value()));
        break;
      default:
        if (arg.startsWith("-") && arg !== "-")
          throw new UserError(`Unknown option ${arg}. Try --help.`);
        a.positional.push(arg);
    }
  }
  return a;
}

interface Config {
  ignore?: string[];
  disableRules?: string[];
  failOn?: Severity | "none";
}

function loadConfig(dir: string): Config {
  let root = dir;
  try {
    root = repoRoot(dir);
  } catch {
    // not a git repo: look next to the cwd
  }
  const path = join(root, "lockdiff.config.json");
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, "utf8")) as Config;
  } catch (e) {
    throw new UserError(`lockdiff.config.json: ${(e as Error).message}`);
  }
}

export function run(argv: string[]): { out: string; code: number } {
  const args = parseArgs(argv);
  if (args.help) return { out: HELP, code: 0 };
  if (args.version) return { out: `${VERSION}\n`, code: 0 };
  if (args.listRules) {
    const out = RULES.map((r) => `${r.severity.padEnd(7)}${r.id.padEnd(22)}${r.summary}`).join(
      "\n",
    );
    return { out: `${out}\n`, code: 0 };
  }

  const config = loadConfig(args.cwd);
  const opts: DiffOptions = {
    ignore: [...(config.ignore ?? []), ...args.ignore],
    disableRules: [...(config.disableRules ?? []), ...args.disable],
  };
  const failOn = args.failOn ?? config.failOn ?? "none";

  let report: Report;
  if (args.demo) {
    // dist/ in a published package, dist-test/src/ when running the test build
    const dir = ["../examples/demo/", "../../examples/demo/"]
      .map((rel) => fileURLToPath(new URL(rel, import.meta.url)))
      .find((d) => existsSync(d));
    if (!dir) throw new UserError("Bundled demo files not found.");
    args.positional = [
      join(dir, "before", "package-lock.json"),
      join(dir, "after", "package-lock.json"),
    ];
  }
  const [first, second] = args.positional;
  if (args.positional.length > 2) throw new UserError("Too many arguments. See --help.");
  if (first && second) {
    report = compareFiles(first, second, args.type, opts);
  } else {
    report = compareGit({ cwd: args.cwd, range: first }, opts);
  }

  let out: string;
  if (args.format === "json") out = renderJson(report);
  else if (args.format === "markdown")
    out = renderMarkdown(report, args.all ? Number.POSITIVE_INFINITY : 50);
  else {
    out = render(report, {
      color: args.color,
      limit: args.all ? Number.POSITIVE_INFINITY : 15,
      onlyRisks: args.onlyRisks,
      width: process.stdout.columns ?? 100,
    });
  }

  let code = 0;
  if (failOn !== "none") {
    const threshold = SEVERITY_ORDER[failOn];
    code = report.files.some((f) => f.findings.some((x) => SEVERITY_ORDER[x.severity] >= threshold))
      ? 1
      : 0;
  }
  return { out, code };
}

function main(): void {
  try {
    const { out, code } = run(process.argv.slice(2));
    process.stdout.write(out);
    process.exitCode = code;
  } catch (e) {
    if (e instanceof UserError) {
      process.stderr.write(`lockdiff: ${e.message}\n`);
      process.exitCode = 2;
    } else {
      throw e;
    }
  }
}

if (
  process.argv[1] &&
  realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))
)
  main();
