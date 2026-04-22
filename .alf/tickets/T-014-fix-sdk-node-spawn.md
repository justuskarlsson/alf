# T-014 Fix SDK spawn failure under systemd

## Status: done

## Root causes (two separate bugs)

### Bug 1: `spawn node ENOENT`
`~/.bashrc` has an interactive-shell guard (`case $- in *i*)`).
Under systemd, sourcing it doesn't load nvm → `node` not in PATH.
Fix: `executable: process.execPath` — bypasses PATH lookup entirely.

### Bug 2: `spawn /path/to/node ENOENT` (after bug 1 fix)
`ctx.repo` stored in DB as a short name e.g. `"alf"`, not an absolute path.
Passed directly as `cwd` to spawn → relative path fails to resolve.
Every other module joins `REPOS_ROOT + repo`, but the agent core did not.
Fix: `cwd: resolve(join(REPOS_ROOT, ctx.repo))` in claude-code.ts.

## SDK version
Using 0.2.117. 0.2.113+ bundles a native binary with musl-first detection on WSL2/glibc
— fixed by setting `pathToClaudeCodeExecutable: ~/.local/bin/claude` (native installer path).
`executable: process.execPath` was only needed for the 0.2.50 cli.js approach, now removed.

## How to test (no systemd needed)
```bash
# Quick spawn smoke test:
cd /home/juska/repos/alf/backend
REPOS_ROOT=/home/juska/repos tsx src/modules/agents/implementations/claude-code.test-spawn.mjs

# Full suite with live claudeCodeImpl test:
cd backend
env -u CLAUDECODE REPOS_ROOT=/home/juska/repos RUN_LIVE_TESTS=1 pnpm test
```
CLAUDECODE must be unset — cli.js refuses to run nested inside a Claude Code session.

## Files changed
- `backend/src/modules/agents/implementations/claude-code.ts`
  - `executable: process.execPath`
  - `cwd: resolve(join(REPOS_ROOT, ctx.repo))`
- `infra/scripts/run-with-profile.sh` — explicitly loads nvm before bashrc
- `backend/src/core/agents/agents.test.ts` — added live smoke test (skipped by default)
