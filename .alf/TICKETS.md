# Ticket Workflow

Tickets are Markdown files with YAML frontmatter stored in `.alf/tickets/`.
Active tickets live flat in that directory. Done tickets move to `.alf/tickets/done/`.

## File format

Filename: `T-001-short-slug.md`

```markdown
---
id: T-001
title: Fix login redirect loop
type: bug          # bug | feature | task | research | chore
status: open       # open | in-progress | done
priority: high     # critical | high | medium | low
epic: auth         # optional grouping
effort: M          # S | M | L | XL
created: 2026-04-06
updated: 2026-04-06
---

One-paragraph summary visible in list view.

## Context

Longer background, links, logs. Read this for full picture.

## Acceptance

- [ ] Criterion one
- [ ] Criterion two

## Notes

<!-- Agents and humans append timestamped notes here -->
```

## Rules for agents

- **Create**: write a new file, auto-increment id by scanning existing filenames for max `T-NNN`
- **Update status**: edit the `status` frontmatter field and `updated` date; move file to `done/` when status → `done`
- **Append a note**: add a line under `## Notes` with author + ISO timestamp prefix: `<!-- 2026-04-06T12:00Z agent:xyz --> note body`
- **List**: read filenames + first ~600 bytes (frontmatter only) of each file in `.alf/tickets/`
- **Never delete** a ticket — move to `done/` instead

## Directory layout

```
.alf/tickets/
  T-001-fix-login-redirect.md   ← active
  T-002-add-dark-mode.md        ← active
  done/
    T-000-old-closed-bug.md     ← archived
```

## Frontmatter-only read (efficiency)

For list views, read only until the closing `---` of the frontmatter block.
The frontmatter is always complete within the first 600 bytes of a well-formed ticket.
