<h1 align="center">lockdiff</h1>
<p align="center"><b>Read your lockfile diff like a human.</b><br>
Turns a 4,000-line <code>package-lock.json</code> change into "what changed" and "what deserves a second look".</p>

<p align="center">
  <a href="https://github.com/Nithinfgs/lockdiff/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/Nithinfgs/lockdiff/actions/workflows/ci.yml/badge.svg"></a>
  <a href="LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-blue.svg"></a>
  <img alt="Node 18+" src="https://img.shields.io/badge/node-%E2%89%A518-green.svg">
  <img alt="Zero runtime dependencies" src="https://img.shields.io/badge/runtime%20deps-0-brightgreen.svg">
</p>

<p align="center"><img src="docs/assets/demo.svg" alt="lockdiff flagging a changed hash, an http source, a new install script, a look-alike package name and a downgrade" width="900"></p>

<p align="center"><sub>Output above is real, from the synthetic lockfiles in <a href="examples/demo"><code>examples/demo</code></a>. Package names are made up except <code>crossenv</code>, a known 2017 typosquat of <code>cross-env</code>.</sub></p>

## Try it

```bash
git clone https://github.com/Nithinfgs/lockdiff && cd lockdiff && npm install
node dist/cli.js examples/demo/before/package-lock.json examples/demo/after/package-lock.json
```

In your own repo, after `npm install -g github:Nithinfgs/lockdiff` (or `npx github:Nithinfgs/lockdiff`):

```bash
lockdiff              # working tree vs HEAD
lockdiff main         # working tree vs main
lockdiff main...HEAD  # what this branch changed, vs the merge base
```

It finds every lockfile in the repo (monorepos included), reads old versions straight from git, and prints a summary. No network. No API keys. No config.

## What it does in 20 seconds

1. Parses both sides of a lockfile change and diffs the *resolved package set*, not the text.
2. Lists what was added, removed, upgraded, downgraded or modified in place.
3. Runs a small set of explainable checks and puts the suspicious ones first:

| Signal | Example |
|---|---|
| `integrity-changed` | `foo@3.1.0` is locked with a different hash than before. Same version, different bytes. |
| `source-changed` / `insecure-transport` | A package moved to another registry host, or is fetched over `http://`. |
| `install-script-gained` / `-new` | A patch release started running code at install time. |
| `non-registry-source` | A new dependency pinned to a git URL. |
| `look-alike-name` | A new package named `crossenv` next to the very popular `cross-env`. |
| `downgrade`, `prerelease` | Version went backwards, or a pre-release was locked. |

Details, per-ecosystem caveats and the reasoning behind each rule are in [docs/rules.md](docs/rules.md).

## Why it exists

Dependency PRs are where supply-chain attacks land, and lockfile diffs are the least reviewable part of a pull request. GitHub collapses them, `git diff` shows integrity hashes and URLs, and reviewers approve by pattern-matching on "it's just Dependabot". Meanwhile the interesting facts are structural: *this package already existed at this version and its hash moved*, or *a transitive dependency now has an install script*.

Other tools tackle parts of this: Python-only reviewers, npm-only diffs, GitHub's dependency-review action (which needs GitHub and the dependency graph). lockdiff's niche is the boring middle: one offline CLI that understands seven lockfile formats, reads them from git refs, and checks that a locked version's hash didn't change underneath you.

## Supported lockfiles

| Ecosystem | Files | Hashes | Install-time code detected |
|---|---|---|---|
| npm | `package-lock.json` (v1-v3), `npm-shrinkwrap.json` | yes | yes |
| pnpm | `pnpm-lock.yaml` (v5-v9) | yes | yes |
| Yarn | `yarn.lock` (classic and berry) | yes | no |
| Rust | `Cargo.lock` | yes | no |
| Python | `uv.lock`, `poetry.lock` | yes | sdist-only releases |
| Go | `go.sum` | yes | no |

Missing yours? A parser is ~50 lines. See [CONTRIBUTING.md](CONTRIBUTING.md).

I ran it against real lockfile history from `microsoft/vscode`, `vitejs/vite`, `facebook/react`, `babel/babel`, `BurntSushi/ripgrep`, `astral-sh/uv`, `python-poetry/poetry` and `cli/cli` while building it. That caught three false-positive bugs, now covered by regression tests. A 780 KB `package-lock.json` diffs in about 50 ms.

## Use in CI

Add to a pull request workflow (the checkout needs history so the base commit exists):

```yaml
name: lockdiff
on: pull_request
permissions:
  contents: read
  pull-requests: write   # only for comment: true
jobs:
  lockdiff:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - uses: Nithinfgs/lockdiff@v0.1.0
        with:
          fail-on: high     # high | medium | low | none
          comment: true     # post the report on the PR
```

The report always lands in the job summary. Without the action: `lockdiff origin/main...HEAD --format markdown --fail-on high`.

## Command reference

```text
lockdiff [ref | a..b | a...b]        compare git revisions (default: HEAD vs working tree)
lockdiff <old-file> <new-file>       compare two lockfiles
  --format terminal|markdown|json    output (default: terminal)
  --fail-on high|medium|low|none     exit 1 at or above this severity (default: none)
  --only-risks                       hide the added/removed/changed lists
  --all                              no truncation, include informational findings
  --ignore a,b   --disable rule,rule skip packages / rules
  --type npm|pnpm|yarn|cargo|poetry|uv|gosum   for unusual file names
  --list-rules   --no-color   -C <dir>
```

Exit codes: `0` ok, `1` findings at or above `--fail-on`, `2` usage or input error.

Optional `lockdiff.config.json` in the repo root (see [the example](lockdiff.config.example.json)):

```json
{ "ignore": ["some-internal-package"], "disableRules": ["prerelease"], "failOn": "high" }
```

JSON output is stable enough to script against: `{ base, head, files: [{ path, kind, changes, findings, totals }] }`. It is also a library: `import { compareGit } from "lockdiff"`.

## How it works

```
 git show <ref>:path ─┐                       ┌─ rules: integrity, source, scripts, names...
                      ├─► parsers ─► Pkg[] ─► diff ─► Change[] ─► Finding[] ─► terminal / markdown / json
 working tree file  ──┘   (npm, pnpm, yarn,   by name, then by version;
                           cargo, uv, poetry,   same-version pairs checked
                           go.sum)              for in-place modification
```

Every parser normalises into the same `Pkg` shape (name, version, hashes, source, install-script flag), so the diff and the rules are ecosystem-agnostic. `src/parsers/toml.ts` is a ~260-line TOML subset reader, and pnpm/yarn are read line-by-line, which is how the package keeps zero runtime dependencies.

## Limits, stated plainly

- lockdiff reads lockfiles. It doesn't know about CVEs, malware, maintainer takeovers, or what a package's code does. Pair it with an audit tool; it answers "what changed and what's odd", not "is this safe".
- Findings are heuristics. `look-alike-name` uses a short built-in list and will miss most squats and occasionally flag a legitimate name. Tell me which rules are noisy for you.
- No Windows-specific path tricks, no `bun.lock`, `composer.lock`, `Gemfile.lock` or `Pipfile.lock` yet.

## Roadmap

- [ ] `bun.lock`, `composer.lock`, `Pipfile.lock`, `Gemfile.lock`, `pdm.lock`
- [ ] SARIF output for GitHub code scanning
- [ ] Group repeated findings (e.g. the nine platform packages of one release)
- [ ] Optional online mode: registry publish dates and maintainer changes
- [ ] `lockdiff --since <tag>` summaries for release notes

## Contributing

Issues and PRs welcome; start with [CONTRIBUTING.md](CONTRIBUTING.md). Real-world false positives are the most useful reports.

## License

[MIT](LICENSE)
