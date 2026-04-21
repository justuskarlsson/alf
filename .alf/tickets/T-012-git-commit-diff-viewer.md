---
id: T-012
title: Git commit diff viewer — commits list + range diff panel
type: feature
status: done
priority: medium
epic: git
effort: M
created: 2026-04-21
updated: 2026-04-21
---

Add a way to browse recent commits and inspect the cumulative diff from any commit up to HEAD, surfaced as collapsible sections in the sidebar and a diff panel.

## Context

Current git panel shows changed files (working tree). Users also need to inspect history: pick a commit and see "what changed from this point to now?" — i.e. `git diff <sha>..HEAD`.

### Proposed UI flow

1. **COMMITS section** (collapsible, in sidebar / git panel) — at the top, an "Unstaged" row (always present, selectable, restores the default working-tree diff view). Below that, a list of recent commits showing: truncated subject line + date. Clicking a commit sets it as the "diff base".
2. **DIFFS section** — reuse the existing DIFFS section. When "Unstaged" is selected it shows the current working-tree changed files (existing behaviour). When a commit is selected it shows the file list for `git diff <sha>..HEAD`. Each file is clickable and opens the unified diff.

The "diff from here" framing means clicking a commit always means "show what changed from this commit up to HEAD". No two-point range picker needed for now.

### Backend endpoints

- `git/commits` — `{ repo, limit? }` → `{ commits: GitCommit[] }` where `GitCommit = { sha, subject, date }` (no author; subject is the full first line, truncated in UI)
- `git/commit/diff/files` — `{ repo, sha }` → `{ files: string[] }` (files changed between `sha` and `HEAD`)
- `git/commit/diff` — `{ repo, sha, file }` → `{ diff: string }` (unified diff for one file, sha..HEAD)

All use `git log` / `git diff` shell commands, following existing patterns in `GitModule`.

### Frontend

- New collapsible `CommitsSection` component inside the git panel
- New `DiffsSection` component (shown when a commit is selected)
- Extend `gitStore` with `commits`, `selectedCommitSha`, `commitDiffFiles`, actions `loadCommits`, `selectCommit`, `loadCommitDiff`

## Acceptance

- [ ] `git/commits` returns last N commits (default 20) for a repo
- [ ] `git/commit/diff/files` returns file list for sha..HEAD
- [ ] `git/commit/diff` returns unified diff for a single file sha..HEAD
- [ ] Frontend: COMMITS section has "Unstaged" row at top + list of commits (truncated subject + date)
- [ ] Selecting "Unstaged" restores working-tree diff view
- [ ] Clicking a commit populates DIFFS section with changed file list
- [ ] Clicking a file in DIFFS shows the unified diff (reuses diff view)
- [ ] Both sections are independently collapsible
- [ ] Shared types: `GitCommit`, `GitCommitDiffFilesMsg`, `GitCommitDiffMsg`

## Notes

<!-- 2026-04-21T00:00Z user --> Requested collapsible sidebar sections for COMMITS and DIFFS. Default behaviour is diff from selected commit to HEAD (not arbitrary range).
