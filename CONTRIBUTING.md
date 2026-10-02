# Contributing

Thanks for helping. The codebase is small and dependency-free at runtime, which is a
feature worth protecting.

## Setup

```bash
git clone https://github.com/Nithinfgs/lockdiff && cd lockdiff
npm install
npm test          # builds, typechecks and runs the suite (node:test)
npm run lint
```

Node 18 or newer. There are no runtime dependencies; please do not add one without
discussing it first.

## Good first contributions

- **A new lockfile format** (`bun.lock`, `composer.lock`, `Pipfile.lock`, `Gemfile.lock`,
  `pdm.lock`, `packages.lock.json`). Add `src/parsers/<name>.ts` returning a `Lockfile`,
  register it in `src/parsers/index.ts`, and add a fixture-based test in
  `test/parsers.test.ts`.
- **Real-world false positives.** If a rule fires on something legitimate, open an issue
  with the lockfile snippet. Tightening a rule is more valuable than adding a new one.
- **More names for the look-alike list** in `src/popular.ts`.

## Adding a rule

1. Add it to `RULES` in `src/rules.ts` with a severity and one-line summary.
2. Emit it from `analyze()`.
3. Add a test in `test/diff.test.ts` for both the positive and the "should not fire" case.
4. Document it in `docs/rules.md`.

Rules should be explainable in one sentence and should have a plausible attack or
mistake behind them. If a rule would fire on most routine updates, it belongs at
`info` severity or not at all.

## Style

`npm run format` applies Biome. Keep functions small and comments for the *why*.
Commit messages follow `type: summary` (`feat:`, `fix:`, `docs:`, `test:`, `chore:`).
