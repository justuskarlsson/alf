---
id: T-048
title: "Replace regex-based outline with AST parser (tree-sitter)"
type: feature
status: open
priority: medium
epic: files
effort: L
created: 2026-05-05
updated: 2026-05-05
---

Replace the current regex-based `extractOutline()` in `backend/src/modules/files/outline.ts` with a proper AST-based parser using `web-tree-sitter`. This enables accurate symbol extraction across more languages and symbol kinds (types, interfaces, enums, decorators, etc.) that regex cannot reliably detect.

## Context

### Current state

The existing regex-based parser (`outline.ts`, ~340 lines) handles TS/JS, Python, Rust, and Go. It works for basic functions/classes/methods/variables but has significant gaps:

- **Misses**: TypeScript `interface`, `type`, `enum`, `namespace`, decorators, abstract methods
- **Misses**: Python dataclasses, `@property`, type aliases
- **Misses**: Rust `trait impl` blocks, `type` aliases, `macro_rules!`
- **Misses**: Go `const` blocks, `var` blocks, interface method signatures
- **Fragile**: Brace/indent counting breaks on multiline strings, template literals, comments containing braces
- **No nesting depth**: Cannot represent nested functions/classes beyond one level
- **No language expansion**: Adding a new language requires writing a full custom regex parser

### Findings from Code Graph project

The user's existing project at `~/repos/hans/orc-codegraph/` implements AST-based analysis using two approaches:

1. **TypeScript/JS**: Uses `ts-morph` (wrapper around the TypeScript compiler API). Extracts functions, classes, methods, and arrow functions with accurate line ranges. Works well but:
   - Installs ~11 MB on disk (8.6 MB is the bundled TypeScript compiler)
   - Only handles TS/JS — not multi-language
   - Slower startup (loads full TS compiler)

2. **Python**: Shells out to `python3` using stdlib `ast` module via subprocess. Extracts functions, classes, and methods. Accurate but requires Python runtime on the host.

The Code Graph project focuses on **call graphs** (cross-file relationships), not single-file outlines, but the declaration-extraction logic is directly reusable.

### Library comparison

| Library | Languages | Install size | Native addon? | Notes |
|---------|-----------|-------------|---------------|-------|
| `ts-morph` | TS/JS only | ~11 MB | No | Full TS compiler API, very accurate for TS |
| `tree-sitter` (native) | 15+ via grammars | ~1 MB + grammars | Yes (node-gyp) | Fast, but native build issues (like better-sqlite3) |
| `web-tree-sitter` | 15+ via WASM grammars | ~4.5 MB + grammars | No (pure WASM) | No native build, runs anywhere, slightly slower than native |
| `tree-sitter-wasms` | Prebuilt WASM grammars | ~52 MB (all) | No | Convenient but huge; cherry-pick individual .wasm files instead |
| `@vscode/tree-sitter-wasm` | VS Code's subset | Small | No | Published by Microsoft, used in VS Code's outline |

## Recommended approach: `web-tree-sitter` + individual grammar `.wasm` files

**Why web-tree-sitter over native tree-sitter:**
- No `node-gyp` / native build step — avoids the class of issues we already hit with `better-sqlite3`
- Works identically on any platform (Linux, macOS, WSL2)
- Tree-sitter WASM is fast enough for single-file parsing (~1-5 ms per file)

**Why web-tree-sitter over ts-morph:**
- Multi-language from one library (TS, Python, Rust, Go, C#, Java, etc.)
- Smaller per-grammar overhead (~200-500 KB per .wasm grammar vs 8.6 MB for TS compiler)
- Consistent API across all languages (query-based symbol extraction)

**Why not ts-morph:**
- Only handles TS/JS; we'd still need a separate solution for Python/Rust/Go
- 8.6 MB bundled TypeScript compiler for a single-language parser
- Overkill for outline extraction (we don't need type resolution or cross-file analysis)

## Implementation plan

### Phase 1: Core parser (effort: M)

1. **Install deps**: `web-tree-sitter` + download `.wasm` grammars for TS, Python, Rust, Go
   - Store `.wasm` files in `backend/assets/grammars/` (gitignored binary; fetched via postinstall script)
   - Or commit them (small: ~200-500 KB each, ~2 MB total for 4 languages)

2. **New file**: `backend/src/modules/files/ast-outline.ts`
   - Initialize `web-tree-sitter` Parser once (singleton, lazy-loaded)
   - Load grammar WASM on first use per language
   - Parse file content into tree, then run tree-sitter **queries** to extract symbols

3. **Tree-sitter queries** per language (`.scm` query files or inline):
   - **TypeScript/JS**: `function_declaration`, `class_declaration`, `method_definition`, `arrow_function` (assigned), `interface_declaration`, `type_alias_declaration`, `enum_declaration`, `variable_declarator`
   - **Python**: `function_definition`, `class_definition`, `decorated_definition`, `type_alias_statement`
   - **Rust**: `function_item`, `struct_item`, `enum_item`, `impl_item`, `trait_item`, `type_item`, `macro_definition`
   - **Go**: `function_declaration`, `method_declaration`, `type_declaration` (struct/interface), `const_declaration`, `var_declaration`

4. **Update `OutlineSymbol` type** in `shared/types/index.ts`:
   ```ts
   export interface OutlineSymbol {
     name: string;
     kind: "function" | "class" | "method" | "variable" | "interface" | "type" | "enum";
     line: number;
     endLine?: number;
     exported: boolean;
     parent?: string;
   }
   ```

5. **Replace `extractOutline()`**: New implementation delegates to the AST parser. Keep the old regex version as a fallback for unsupported languages or if WASM fails to load.

### Phase 2: Extended languages (effort: S)

Add grammars for additional languages (each is just a `.wasm` file + query definition):
- C / C++
- Java
- C#
- Ruby
- PHP
- Bash/Shell

### Phase 3: Frontend enhancements (effort: S)

- Add icons for new symbol kinds (interface, type, enum)
- Group symbols by kind in the outline panel
- Show symbol signature preview on hover

## Symbol kinds per language

| Language | function | class | method | variable | interface | type | enum |
|----------|----------|-------|--------|----------|-----------|------|------|
| TS/JS | yes | yes | yes | yes | yes | yes | yes |
| Python | yes | yes | yes | yes (module-level) | no (protocol?) | no | no |
| Rust | yes | struct | impl fn | const/static | trait | type alias | yes |
| Go | yes | struct | receiver fn | const/var | interface | type alias | no |

## Acceptance

- [ ] `web-tree-sitter` installed, grammars loadable at runtime
- [ ] TS/JS outline extracts: functions, classes, methods, variables, interfaces, types, enums
- [ ] Python outline extracts: functions, classes, methods, module-level variables
- [ ] Rust outline extracts: functions, structs, enums, traits, impl methods, type aliases
- [ ] Go outline extracts: functions, methods, structs, interfaces, type aliases, consts
- [ ] `OutlineSymbol.kind` extended with "interface" | "type" | "enum"
- [ ] Regex fallback for unsupported file extensions
- [ ] Performance: single file parse < 10 ms for files under 5000 lines
- [ ] Existing E2E tests still pass (outline response shape unchanged for existing kinds)

## Files to change

### Backend

- **`backend/package.json`** — Add `web-tree-sitter` dependency
- **`backend/assets/grammars/`** *(new dir)* — Store `.wasm` grammar files (tree-sitter-typescript.wasm, tree-sitter-python.wasm, tree-sitter-rust.wasm, tree-sitter-go.wasm)
- **`backend/src/modules/files/ast-outline.ts`** *(new file)* — Tree-sitter based parser: init, load grammar, parse, query symbols
- **`backend/src/modules/files/outline.ts`** — Refactor to delegate to `ast-outline.ts`, keep regex as fallback
- **`shared/types/index.ts`** — Extend `OutlineSymbol.kind` union with new symbol kinds

### Frontend

- **`frontend/src/modules/files/FileContentPanel.tsx`** — Add icons/styling for new symbol kinds (interface, type, enum)

## Dependencies

- **T-040** (file outline panel) — must be done first (it is: status done)
- No other blockers

## Notes

- `web-tree-sitter` requires the `.wasm` file for the tree-sitter runtime itself (included in the package) plus per-language grammar `.wasm` files
- Grammar `.wasm` files can be built from source or downloaded from tree-sitter GitHub releases
- Consider a `scripts/fetch-grammars.sh` postinstall script to download grammar WASMs from GitHub releases
- The `tree-sitter` query language (`.scm` files) is well-documented and VS Code uses the same approach for its outline/breadcrumbs
