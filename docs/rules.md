# Rules

Every finding has a rule id, a severity and a one-line message. Run `lockdiff --list-rules`
for this table in your terminal; disable rules with `--disable` or `disableRules` in
`lockdiff.config.json`.

| Rule | Severity | Raised when | Why it matters |
|---|---|---|---|
| `integrity-changed` | high | The same `name@version` is locked with a different content hash than before. | Registries are meant to be immutable per version. A changed hash means the artifact changed, through republishing, a mirror swap, a corrupted merge, or tampering. |
| `source-changed` | high | A package now comes from a different registry host, or from git/url/path instead of a registry. Moves *onto* a default public registry are ignored. | Redirecting a package to another host is the shape of a dependency-confusion attack. |
| `insecure-transport` | high | The locked artifact URL uses plain `http://`. | Anyone on the path can swap the tarball (the hash helps only if it is present and checked). |
| `install-script-gained` | high | An existing package's new version runs code at install time and the old one did not. | Install scripts execute on developer machines and CI with access to tokens. Gaining one in a patch release is a classic supply-chain signal. |
| `install-script-new` | medium | A newly added package runs code at install time. | Same reason, but many legitimate native packages (esbuild, sharp, ...) do this. |
| `integrity-dropped` | medium | A hash that was recorded before is missing now. | Without a hash the package manager cannot detect swaps. |
| `non-registry-source` | medium | A new dependency comes from git or a URL. | Git refs and URLs skip the registry's immutability and malware scanning. |
| `downgrade` | medium | A version went backwards. | Rollbacks to a known-vulnerable release, or an accidental stale-lockfile merge. |
| `look-alike-name` | medium | A new package name is one edit (or separator change) away from a very popular package. | Typosquatting. This is a heuristic list of ~320 popular names in `src/popular.ts`; it will sometimes be wrong. |
| `prerelease` | low | A pre-release version (alpha, beta, rc, canary, ...) is locked from a registry. | Usually intentional, occasionally an accident. |
| `major-bump` | info | A major version increased. | Breaking changes; shown with `--all`, never a risk on its own. |

## What "install-time code" means per ecosystem

| Lockfile | Signal used |
|---|---|
| `package-lock.json` | `hasInstallScript: true` |
| `pnpm-lock.yaml` | `requiresBuild: true` |
| `uv.lock` / `poetry.lock` | The release has a source distribution and no wheel. Building it runs the project's build backend or `setup.py`. |
| `yarn.lock`, `Cargo.lock`, `go.sum` | Not recorded in the lockfile, so this rule never fires. Cargo `build.rs` scripts are invisible here. |

## What hashes are compared

For npm, yarn and pnpm there is one hash per package. For `uv.lock` and `poetry.lock` a
release has one hash per file; adding a new wheel to an existing release is normal and is
**not** flagged, but a previously locked hash that disappeared is. Yarn berry checksums
depend on the cache key, so a berry upgrade can make `integrity-changed` fire across the
board; if you see that, check `__metadata.cacheKey`.

## Limits

lockdiff reads lockfiles only. It does not know about malware, CVEs, maintainer changes,
or what a package's code does. It tells you where to look; it does not tell you something is safe.
