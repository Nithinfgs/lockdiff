# Security policy

## Reporting a vulnerability

Please report security issues privately through GitHub's
[private vulnerability reporting](https://github.com/Nithinfgs/lockdiff/security/advisories/new)
rather than a public issue. You should get a first response within a week.

## Scope

lockdiff reads lockfiles and runs `git` read-only commands (`rev-parse`, `ls-tree`,
`ls-files`, `show`, `merge-base`). It makes no network requests and executes no code
from the files it analyses. Bugs that would break those properties (for example a
crafted lockfile that makes the parser run commands, hang, or consume unbounded
memory) are in scope.

lockdiff's findings are heuristics. A missing finding is not evidence that a
dependency change is safe, and the tool is not a substitute for a vulnerability
scanner or for reviewing what you install.
