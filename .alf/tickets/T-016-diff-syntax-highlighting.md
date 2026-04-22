# T-016 Syntax highlighting for git diffs

## Status: open

## Epic: git

## Summary
Add syntax highlighting to the git diff viewer by reusing the same shiki-based highlighter used in the files panel. Integrate with react-diff-view so diff hunks are syntax-highlighted by language.

## Approach
- Identify the highlighter used in `FileContentPanel` (shiki / rehype-highlight / similar)
- Create a shared highlighting utility or hook
- Apply token-level highlighting inside `react-diff-view` render slots
- Language detection from file extension
