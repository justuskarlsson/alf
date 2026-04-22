---
id: T-016
title: Syntax highlighting for git diffs
type: feature
status: done
priority: medium
epic: git
effort: M
created: 2026-04-21
updated: 2026-04-22
---

Add syntax highlighting to the git diff viewer by reusing the same shiki-based highlighter used in the files panel. Integrate with react-diff-view so diff hunks are syntax-highlighted by language.

## Approach
- Identify the highlighter used in `FileContentPanel` (shiki / rehype-highlight / similar)
- Create a shared highlighting utility or hook
- Apply token-level highlighting inside `react-diff-view` render slots
- Language detection from file extension
