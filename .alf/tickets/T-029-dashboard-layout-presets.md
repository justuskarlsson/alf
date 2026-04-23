---
id: T-029
title: "Dashboard layout presets"
type: feature
status: done
priority: medium
epic: mvp4
effort: S
created: 2026-04-23
updated: 2026-04-23
---

Save and quickly switch between named dashboard layouts.

## Context

Ref: T-018 §6. Frontend-only — no backend changes needed.

### Implementation

```typescript
// In dashboardStore
interface LayoutPreset {
  name: string;
  panels: PanelInstance[];
  layout: RGL.Layout[];
}

// Store additions
presets: LayoutPreset[];
builtinPresets: LayoutPreset[];  // e.g., "Agent Focus", "Code Review", "Overview"
savePreset(name: string): void;
loadPreset(name: string): void;
deletePreset(name: string): void;
```

- Presets saved to `localStorage`.
- Keyboard shortcuts: `Alt+1` through `Alt+9` for quick switching.
- Builtin presets ship as defaults (user can't delete, can override).
- UI: dropdown selector or small preset bar.

## Acceptance

- [x] Save current layout as named preset
- [x] Load preset → restores panels + layout
- [x] Delete user-created presets
- [x] Builtin presets: at least "Agent Focus", "Code Review", "Overview"
- [x] `Alt+1..9` keyboard shortcuts for quick switching
- [x] Presets persist across page reloads (localStorage)

## Notes

- 2026-04-23: Implemented. `LayoutPreset` interface, `BUILTIN_PRESETS` array (Overview: 4 panels, Agent Focus: agents full-width, Code Review: files+git+agents). `PresetSelector` component in RepoPage with dropdown, save (+) button, delete (-) button for user presets. `Alt+1..9` keyboard shortcuts. `userPresets` persisted via zustand `persist` middleware. E2E test verified preset switching.
