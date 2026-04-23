# Ticket Workflow

Tickets are Markdown files with YAML frontmatter stored in `.alf/tickets/`.
All tickets live flat in that directory — status is tracked via the `status` field in frontmatter, not by folder.

## File format

Filename: `T-001-short-slug.md`

```markdown
---
id: T-001
title: Fix login redirect loop
type: bug          # bug | feature | task | research | chore
status: open       # open | in-progress | done | future
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

- **YAML frontmatter is REQUIRED**: every ticket MUST have a valid YAML frontmatter block between `---` delimiters at the top of the file. The backend parser reads ONLY the frontmatter — any `## Status:` headings or other markdown outside frontmatter are IGNORED. If a ticket is missing frontmatter, it will always appear as "open" in the UI regardless of what the markdown body says.
- **Create**: write a new file with full YAML frontmatter (id, title, type, status, priority, epic, effort, created, updated). Auto-increment id by scanning existing filenames for max `T-NNN`.
- **Update status**: edit the `status` field IN THE YAML FRONTMATTER and update the `updated` date.
- **Append a note**: add a line under `## Notes` with author + ISO timestamp prefix: `<!-- 2026-04-06T12:00Z agent:xyz --> note body`
- **List**: read filenames + first ~600 bytes (frontmatter only) of each file in `.alf/tickets/`
- **Never delete** a ticket — just set `status: done`.

## Directory layout

```
.alf/tickets/
  T-001-fix-login-redirect.md
  T-002-add-dark-mode.md
  T-003-old-closed-bug.md       ← status: done in frontmatter
```

## Frontmatter-only read (efficiency)

For list views, read only until the closing `---` of the frontmatter block.
The frontmatter is always complete within the first 600 bytes of a well-formed ticket.
