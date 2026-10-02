# Changelog

## 0.1.0

First release.

- Lockfile parsers: `package-lock.json` (v1-v3), `pnpm-lock.yaml` (v5-v9), `yarn.lock` (classic and berry), `Cargo.lock`, `poetry.lock`, `uv.lock`, `go.sum`.
- Git-aware comparison: working tree vs `HEAD`, any ref, `a..b` and `a...b` ranges, or two files.
- Eleven risk rules (see `docs/rules.md`).
- Terminal, Markdown and JSON output; `--fail-on` for CI.
- GitHub Action that writes a job summary and optionally a PR comment.
