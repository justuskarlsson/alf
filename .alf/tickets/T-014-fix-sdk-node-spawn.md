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

## SDK version note
Root causes were nothing to do with SDK version. 0.2.113+ bundles a native
binary with a musl-first detection bug on WSL2/glibc, so we stay on 0.2.50
(uses bundled cli.js / Node.js — no native binary, no platform detection).
TODO: upgrade once musl detection is fixed upstream, or use pathToClaudeCodeExecutable.

## How to test (no systemd needed)
```
cd /home/juska/repos/alf/backend
REPOS_ROOT=/home/juska/repos tsx src/modules/agents/implementations/claude-code.test-spawn.mjs
```

For live SDK test in the unit suite:
```
cd backend && RUN_LIVE_TESTS=1 pnpm test
```

## Files changed
- `backend/src/modules/agents/implementations/claude-code.ts`
  - `executable: process.execPath`
  - `cwd: resolve(join(REPOS_ROOT, ctx.repo))`
- `infra/scripts/run-with-profile.sh` — explicitly loads nvm before bashrc
- `backend/src/core/agents/agents.test.ts` — added live smoke test (skipped by default)
