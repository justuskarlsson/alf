import type { OutlineSymbol } from "@alf/types";
import { extractOutlineAST } from "./ast-outline.js";

/**
 * Extract symbols from file content.
 * Uses tree-sitter AST parsing (preferred), falls back to regex heuristics.
 */
export async function extractOutline(content: string, filePath: string): Promise<OutlineSymbol[]> {
  // Try AST-based extraction first
  try {
    const result = await extractOutlineAST(content, filePath);
    if (result !== null) return result;
  } catch {
    // Fall through to regex
  }
  return extractOutlineRegex(content, filePath);
}

/**
 * Regex-based fallback for unsupported languages.
 */
function extractOutlineRegex(content: string, filePath: string): OutlineSymbol[] {
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  switch (ext) {
    case "ts": case "tsx": case "js": case "jsx":
      return extractTS(content);
    case "py":
      return extractPython(content);
    case "rs":
      return extractRust(content);
    case "go":
      return extractGo(content);
    default:
      return [];
  }
}

// ---------------------------------------------------------------------------
// TypeScript / JavaScript
// ---------------------------------------------------------------------------

function extractTS(content: string): OutlineSymbol[] {
  const lines = content.split("\n");
  const symbols: OutlineSymbol[] = [];
  let currentClass: { name: string; startLine: number; braceDepth: number } | null = null;
  let braceDepth = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // Track brace depth for class scope
    for (const ch of line) {
      if (ch === "{") braceDepth++;
      if (ch === "}") braceDepth--;
    }

    // Check if we exited current class
    if (currentClass && braceDepth <= currentClass.braceDepth) {
      // Set endLine on the class symbol
      const classSym = symbols.find(s => s.kind === "class" && s.name === currentClass!.name && s.line === currentClass!.startLine);
      if (classSym) classSym.endLine = lineNum;
      currentClass = null;
    }

    // Skip comments and strings (simple heuristic: skip lines starting with // or *)
    const trimmed = line.trimStart();
    if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) continue;

    // Class declaration
    const classMatch = line.match(/^(\s*)(?:(export)\s+)?(?:default\s+)?(?:abstract\s+)?class\s+(\w+)/);
    if (classMatch) {
      const indent = classMatch[1].length;
      if (indent === 0) {
        const name = classMatch[3];
        const exported = classMatch[2] === "export";
        symbols.push({ name, kind: "class", line: lineNum, exported });
        currentClass = { name, startLine: lineNum, braceDepth: braceDepth - countChar(line, "{") + countChar(line, "}") };
      }
      continue;
    }

    // Inside a class — detect methods
    if (currentClass) {
      // Method patterns: async foo(...), foo(...), static foo(...), get foo(), set foo()
      const methodMatch = trimmed.match(/^(?:(?:public|private|protected|static|async|override|readonly)\s+)*(?:get\s+|set\s+)?(\w+)\s*(?:<[^>]*>)?\s*\(/);
      if (methodMatch && methodMatch[1] !== "if" && methodMatch[1] !== "for" && methodMatch[1] !== "while"
          && methodMatch[1] !== "switch" && methodMatch[1] !== "catch" && methodMatch[1] !== "return"
          && methodMatch[1] !== "new" && methodMatch[1] !== "constructor") {
        symbols.push({
          name: methodMatch[1],
          kind: "method",
          line: lineNum,
          exported: false,
          parent: currentClass.name,
        });
        continue;
      }
      // constructor
      if (trimmed.match(/^(?:(?:public|private|protected)\s+)?constructor\s*\(/)) {
        symbols.push({
          name: "constructor",
          kind: "method",
          line: lineNum,
          exported: false,
          parent: currentClass.name,
        });
        continue;
      }
      continue; // Inside class, skip top-level checks
    }

    // Top-level function declaration
    const fnMatch = line.match(/^(?:(export)\s+)?(?:default\s+)?(?:async\s+)?function\s+(\w+)/);
    if (fnMatch) {
      symbols.push({
        name: fnMatch[2],
        kind: "function",
        line: lineNum,
        exported: fnMatch[1] === "export",
      });
      continue;
    }

    // Top-level const/let/var (arrow functions or values)
    const varMatch = line.match(/^(?:(export)\s+)?(?:const|let|var)\s+(\w+)\s*(?::\s*[^=]+)?\s*=/);
    if (varMatch) {
      const name = varMatch[2];
      const exported = varMatch[1] === "export";
      // Determine if it's a function (arrow or function expression)
      const rest = line.slice(line.indexOf("=") + 1).trimStart();
      const isFunc = /^(?:async\s+)?\(/.test(rest) || /^(?:async\s+)?function/.test(rest)
        || /^(?:async\s+)?\w+\s*=>/.test(rest);
      symbols.push({
        name,
        kind: isFunc ? "function" : "variable",
        line: lineNum,
        exported,
      });
      continue;
    }
  }

  // Post-process: compute endLine for top-level symbols that lack it,
  // using "next symbol at same scope" heuristic.
  for (let si = 0; si < symbols.length; si++) {
    const sym = symbols[si];
    if (sym.endLine) continue; // already set (e.g. classes)
    if (sym.parent) continue;  // methods handled by class scope
    const next = symbols.find((s, j) => j > si && !s.parent);
    sym.endLine = next ? next.line - 1 : lines.length;
  }

  return symbols;
}

function countChar(str: string, ch: string): number {
  let c = 0;
  for (const s of str) if (s === ch) c++;
  return c;
}

// ---------------------------------------------------------------------------
// Python
// ---------------------------------------------------------------------------

function extractPython(content: string): OutlineSymbol[] {
  const lines = content.split("\n");
  const symbols: OutlineSymbol[] = [];
  let currentClass: { name: string; indent: number; line: number } | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;
    const trimmed = line.trimStart();
    const indent = line.length - trimmed.length;

    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith("#")) continue;

    // If we're in a class and hit same-or-lesser indent non-empty line, exit class
    if (currentClass && indent <= currentClass.indent && !trimmed.startsWith("@")) {
      currentClass = null;
    }

    // Class declaration
    const classMatch = trimmed.match(/^class\s+(\w+)/);
    if (classMatch && indent === 0) {
      currentClass = { name: classMatch[1], indent, line: lineNum };
      symbols.push({ name: classMatch[1], kind: "class", line: lineNum, exported: true });
      continue;
    }

    // Function/method declaration
    const defMatch = trimmed.match(/^(?:async\s+)?def\s+(\w+)/);
    if (defMatch) {
      const name = defMatch[1];
      if (currentClass && indent > currentClass.indent) {
        symbols.push({
          name,
          kind: "method",
          line: lineNum,
          exported: !name.startsWith("_"),
          parent: currentClass.name,
        });
      } else {
        if (indent === 0) {
          symbols.push({
            name,
            kind: "function",
            line: lineNum,
            exported: !name.startsWith("_"),
          });
        }
      }
      continue;
    }

    // Top-level variable assignment (simple: NAME = ...)
    if (indent === 0) {
      const varMatch = trimmed.match(/^([A-Z_][A-Z0-9_]*)\s*=/);
      if (varMatch) {
        symbols.push({
          name: varMatch[1],
          kind: "variable",
          line: lineNum,
          exported: true,
        });
      }
    }
  }

  // Compute endLine for all symbols using next-symbol-at-same-or-lesser scope heuristic
  for (let i = 0; i < symbols.length; i++) {
    const sym = symbols[i];
    if (sym.kind === "class") {
      // endLine = line before the next top-level symbol (or EOF)
      const next = symbols.find((s, j) => j > i && !s.parent);
      sym.endLine = next ? next.line - 1 : lines.length;
    } else if (sym.kind === "function" || (sym.kind === "method" && sym.parent)) {
      // Scan lines after the def to find the next line at same or lesser indent
      const defLine = lines[sym.line - 1];
      const defIndent = defLine.length - defLine.trimStart().length;
      let endLine = sym.line;  // last line with actual content
      for (let li = sym.line; li < lines.length; li++) {
        const l = lines[li];
        const t = l.trimStart();
        if (!t || t.startsWith("#")) continue; // skip blank/comment lines
        const ind = l.length - t.length;
        if (ind <= defIndent) break;
        endLine = li + 1;
      }
      sym.endLine = endLine;
    }
  }

  return symbols;
}

// ---------------------------------------------------------------------------
// Rust
// ---------------------------------------------------------------------------

function extractRust(content: string): OutlineSymbol[] {
  const lines = content.split("\n");
  const symbols: OutlineSymbol[] = [];
  let currentImpl: { name: string; braceDepth: number } | null = null;
  let braceDepth = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;
    const trimmed = line.trimStart();

    // Track brace depth
    for (const ch of line) {
      if (ch === "{") braceDepth++;
      if (ch === "}") braceDepth--;
    }

    if (currentImpl && braceDepth <= currentImpl.braceDepth) {
      currentImpl = null;
    }

    if (trimmed.startsWith("//")) continue;

    // impl block
    const implMatch = trimmed.match(/^(?:pub\s+)?impl(?:<[^>]*>)?\s+(\w+)/);
    if (implMatch && !currentImpl) {
      currentImpl = { name: implMatch[1], braceDepth: braceDepth - countChar(line, "{") + countChar(line, "}") };
      continue;
    }

    // fn
    const fnMatch = trimmed.match(/^(pub(?:\(crate\))?\s+)?(?:async\s+)?(?:unsafe\s+)?fn\s+(\w+)/);
    if (fnMatch) {
      const exported = !!fnMatch[1];
      if (currentImpl) {
        symbols.push({ name: fnMatch[2], kind: "method", line: lineNum, exported, parent: currentImpl.name });
      } else {
        symbols.push({ name: fnMatch[2], kind: "function", line: lineNum, exported });
      }
      continue;
    }

    // struct / enum / trait (top-level)
    if (!currentImpl) {
      const structMatch = trimmed.match(/^(pub\s+)?(?:struct|enum|trait)\s+(\w+)/);
      if (structMatch) {
        symbols.push({ name: structMatch[2], kind: "class", line: lineNum, exported: !!structMatch[1] });
      }
    }
  }

  return symbols;
}

// ---------------------------------------------------------------------------
// Go
// ---------------------------------------------------------------------------

function extractGo(content: string): OutlineSymbol[] {
  const lines = content.split("\n");
  const symbols: OutlineSymbol[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;
    const trimmed = line.trimStart();

    if (trimmed.startsWith("//")) continue;

    // func (receiver) Name or func Name
    const fnMatch = trimmed.match(/^func\s+(?:\([^)]*\)\s+)?(\w+)/);
    if (fnMatch) {
      const name = fnMatch[1];
      const exported = name[0] === name[0].toUpperCase() && name[0] !== name[0].toLowerCase();
      symbols.push({ name, kind: "function", line: lineNum, exported });
      continue;
    }

    // type Name struct/interface
    const typeMatch = trimmed.match(/^type\s+(\w+)\s+(?:struct|interface)/);
    if (typeMatch) {
      const name = typeMatch[1];
      const exported = name[0] === name[0].toUpperCase() && name[0] !== name[0].toLowerCase();
      symbols.push({ name, kind: "class", line: lineNum, exported });
      continue;
    }
  }

  return symbols;
}
