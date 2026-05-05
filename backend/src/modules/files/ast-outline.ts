/**
 * AST-based outline extraction using web-tree-sitter.
 *
 * Replaces the regex-based approach with proper parsing for accurate symbol
 * extraction across TypeScript, Python, Rust, and Go. Detects interfaces,
 * types, enums, and other constructs that regex cannot reliably handle.
 */

import { join, dirname } from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { OutlineSymbol } from "@alf/types";

// Lazy-loaded tree-sitter module and languages
let ParserClass: typeof import("web-tree-sitter").Parser | null = null;
let LanguageClass: typeof import("web-tree-sitter").Language | null = null;
let initPromise: Promise<void> | null = null;
const languageCache = new Map<string, import("web-tree-sitter").Language>();

const __dirname = dirname(fileURLToPath(import.meta.url));

// Grammar WASM paths (from npm packages)
const GRAMMAR_PATHS: Record<string, string> = {
  typescript: join(__dirname, "../../../node_modules/prebuilt-tree-sitter-wasm/out/tree-sitter-typescript.wasm"),
  tsx: join(__dirname, "../../../node_modules/prebuilt-tree-sitter-wasm/out/tree-sitter-tsx.wasm"),
  javascript: join(__dirname, "../../../node_modules/prebuilt-tree-sitter-wasm/out/tree-sitter-javascript.wasm"),
  python: join(__dirname, "../../../node_modules/prebuilt-tree-sitter-wasm/out/tree-sitter-python.wasm"),
  go: join(__dirname, "../../../node_modules/prebuilt-tree-sitter-wasm/out/tree-sitter-go.wasm"),
  rust: join(__dirname, "../../../node_modules/tree-sitter-wasm-prebuilt/lib/tree-sitter-rust.wasm"),
};

// Map file extensions to language keys
const EXT_TO_LANG: Record<string, string> = {
  ts: "typescript",
  tsx: "tsx",
  js: "javascript",
  jsx: "tsx", // JSX uses TSX grammar (superset)
  py: "python",
  rs: "rust",
  go: "go",
};

/**
 * Initialize tree-sitter WASM runtime. Called once lazily.
 */
async function ensureInit(): Promise<void> {
  if (!initPromise) {
    initPromise = (async () => {
      const { Parser, Language } = await import("web-tree-sitter");
      const wasmPath = join(__dirname, "../../../node_modules/web-tree-sitter/web-tree-sitter.wasm");
      await Parser.init({ locateFile: () => wasmPath });
      ParserClass = Parser;
      LanguageClass = Language;
    })();
  }
  return initPromise;
}

/**
 * Load a language grammar (cached).
 */
async function getLanguage(langKey: string): Promise<import("web-tree-sitter").Language | null> {
  if (languageCache.has(langKey)) return languageCache.get(langKey)!;
  const wasmPath = GRAMMAR_PATHS[langKey];
  if (!wasmPath || !LanguageClass) return null;
  try {
    const wasm = readFileSync(wasmPath);
    const lang = await LanguageClass.load(wasm);
    languageCache.set(langKey, lang);
    return lang;
  } catch {
    return null;
  }
}

/**
 * Extract outline symbols from file content using tree-sitter AST parsing.
 * Returns null if the language is unsupported (caller should fall back to regex).
 */
export async function extractOutlineAST(content: string, filePath: string): Promise<OutlineSymbol[] | null> {
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  const langKey = EXT_TO_LANG[ext];
  if (!langKey) return null;

  await ensureInit();
  const language = await getLanguage(langKey);
  if (!language || !ParserClass) return null;

  const parser = new ParserClass();
  parser.setLanguage(language);
  const tree = parser.parse(content);
  if (!tree) return null;

  try {
    const symbols: OutlineSymbol[] = [];
    const root = tree.rootNode;

    switch (langKey) {
      case "typescript":
      case "tsx":
      case "javascript":
        extractTSSymbols(root, symbols);
        break;
      case "python":
        extractPythonSymbols(root, symbols);
        break;
      case "rust":
        extractRustSymbols(root, symbols);
        break;
      case "go":
        extractGoSymbols(root, symbols);
        break;
    }

    return symbols;
  } finally {
    tree.delete();
    parser.delete();
  }
}

// ---------------------------------------------------------------------------
// TypeScript / JavaScript / TSX
// ---------------------------------------------------------------------------

type TSNode = import("web-tree-sitter").Node;

function extractTSSymbols(root: TSNode, symbols: OutlineSymbol[], parent?: string): void {
  for (const node of root.namedChildren) {
    switch (node.type) {
      case "function_declaration":
      case "generator_function_declaration": {
        const name = node.childForFieldName("name")?.text ?? "";
        const exported = isExported(node);
        symbols.push({
          name,
          kind: "function",
          line: node.startPosition.row + 1,
          endLine: node.endPosition.row + 1,
          exported,
          ...(parent ? { parent } : {}),
        });
        break;
      }

      case "class_declaration": {
        const name = node.childForFieldName("name")?.text ?? "";
        const exported = isExported(node);
        symbols.push({
          name,
          kind: "class",
          line: node.startPosition.row + 1,
          endLine: node.endPosition.row + 1,
          exported,
        });
        // Extract methods inside the class body
        const body = node.childForFieldName("body");
        if (body) extractClassMembers(body, symbols, name);
        break;
      }

      case "interface_declaration": {
        const name = node.childForFieldName("name")?.text ?? "";
        const exported = isExported(node);
        symbols.push({
          name,
          kind: "interface",
          line: node.startPosition.row + 1,
          endLine: node.endPosition.row + 1,
          exported,
        });
        break;
      }

      case "type_alias_declaration": {
        const name = node.childForFieldName("name")?.text ?? "";
        const exported = isExported(node);
        symbols.push({
          name,
          kind: "type",
          line: node.startPosition.row + 1,
          endLine: node.endPosition.row + 1,
          exported,
        });
        break;
      }

      case "enum_declaration": {
        const name = node.childForFieldName("name")?.text ?? "";
        const exported = isExported(node);
        symbols.push({
          name,
          kind: "enum",
          line: node.startPosition.row + 1,
          endLine: node.endPosition.row + 1,
          exported,
        });
        break;
      }

      case "lexical_declaration":
      case "variable_declaration": {
        // const/let/var — may contain arrow functions or values
        const exported = isExported(node);
        for (const declarator of node.namedChildren) {
          if (declarator.type === "variable_declarator") {
            const nameNode = declarator.childForFieldName("name");
            const value = declarator.childForFieldName("value");
            const name = nameNode?.text ?? "";
            if (!name) continue;
            const isFunc = value && (
              value.type === "arrow_function" ||
              value.type === "function_expression" ||
              value.type === "generator_function"
            );
            symbols.push({
              name,
              kind: isFunc ? "function" : "variable",
              line: node.startPosition.row + 1,
              endLine: node.endPosition.row + 1,
              exported,
              ...(parent ? { parent } : {}),
            });
          }
        }
        break;
      }

      case "export_statement": {
        // Unwrap: export default class/function/const...
        const declaration = node.childForFieldName("declaration") ?? node.namedChildren.find(
          c => c.type !== "export" && c.type !== "default"
        );
        if (declaration && declaration.type !== "identifier" && declaration.type !== "string") {
          // Recurse into the declaration
          extractTSSymbols(fakeParent(declaration), symbols, parent);
        }
        break;
      }

      case "abstract_class_declaration": {
        const name = node.childForFieldName("name")?.text ?? "";
        const exported = isExported(node);
        symbols.push({
          name,
          kind: "class",
          line: node.startPosition.row + 1,
          endLine: node.endPosition.row + 1,
          exported,
        });
        const body = node.childForFieldName("body");
        if (body) extractClassMembers(body, symbols, name);
        break;
      }

      default:
        break;
    }
  }
}

function extractClassMembers(body: TSNode, symbols: OutlineSymbol[], className: string): void {
  for (const member of body.namedChildren) {
    switch (member.type) {
      case "method_definition": {
        const name = member.childForFieldName("name")?.text ?? "";
        if (!name) break;
        symbols.push({
          name,
          kind: "method",
          line: member.startPosition.row + 1,
          endLine: member.endPosition.row + 1,
          exported: false,
          parent: className,
        });
        break;
      }
      case "public_field_definition":
      case "property_definition": {
        const name = member.childForFieldName("name")?.text ?? "";
        const value = member.childForFieldName("value");
        if (!name) break;
        const isFunc = value && (
          value.type === "arrow_function" ||
          value.type === "function_expression"
        );
        if (isFunc) {
          symbols.push({
            name,
            kind: "method",
            line: member.startPosition.row + 1,
            endLine: member.endPosition.row + 1,
            exported: false,
            parent: className,
          });
        }
        break;
      }
    }
  }
}

function isExported(node: TSNode): boolean {
  const parent = node.parent;
  if (!parent) return false;
  if (parent.type === "export_statement") return true;
  // Check if the node itself has `export` keyword as a child
  for (const child of node.children) {
    if (child.type === "export") return true;
  }
  return false;
}

/** Wrap a single node to look like a parent with namedChildren. */
function fakeParent(node: TSNode): TSNode {
  return { namedChildren: [node] } as any;
}

// ---------------------------------------------------------------------------
// Python
// ---------------------------------------------------------------------------

function extractPythonSymbols(root: TSNode, symbols: OutlineSymbol[], parent?: string): void {
  for (const node of root.namedChildren) {
    switch (node.type) {
      case "function_definition": {
        const name = node.childForFieldName("name")?.text ?? "";
        if (!name) break;
        if (parent) {
          symbols.push({
            name,
            kind: "method",
            line: node.startPosition.row + 1,
            endLine: node.endPosition.row + 1,
            exported: !name.startsWith("_"),
            parent,
          });
        } else {
          symbols.push({
            name,
            kind: "function",
            line: node.startPosition.row + 1,
            endLine: node.endPosition.row + 1,
            exported: !name.startsWith("_"),
          });
        }
        break;
      }

      case "class_definition": {
        const name = node.childForFieldName("name")?.text ?? "";
        if (!name) break;
        symbols.push({
          name,
          kind: "class",
          line: node.startPosition.row + 1,
          endLine: node.endPosition.row + 1,
          exported: !name.startsWith("_"),
        });
        // Extract methods inside the class body
        const body = node.childForFieldName("body");
        if (body) extractPythonSymbols(body, symbols, name);
        break;
      }

      case "decorated_definition": {
        // Unwrap decorator to get the actual definition
        const defn = node.namedChildren.find(c =>
          c.type === "function_definition" || c.type === "class_definition"
        );
        if (defn) {
          extractPythonSymbols(fakeParent(defn), symbols, parent);
        }
        break;
      }

      case "expression_statement": {
        // Top-level assignments: NAME = ...
        const expr = node.namedChildren[0];
        if (expr?.type === "assignment" && !parent) {
          const left = expr.childForFieldName("left");
          if (left?.type === "identifier") {
            const name = left.text;
            // Only include UPPER_CASE constants at module level
            if (/^[A-Z_][A-Z0-9_]*$/.test(name)) {
              symbols.push({
                name,
                kind: "variable",
                line: node.startPosition.row + 1,
                endLine: node.endPosition.row + 1,
                exported: true,
              });
            }
          }
        }
        break;
      }

      default:
        break;
    }
  }
}

// ---------------------------------------------------------------------------
// Rust
// ---------------------------------------------------------------------------

function extractRustSymbols(root: TSNode, symbols: OutlineSymbol[]): void {
  for (const node of root.namedChildren) {
    switch (node.type) {
      case "function_item": {
        const name = node.childForFieldName("name")?.text ?? "";
        const exported = hasVisibility(node);
        symbols.push({
          name,
          kind: "function",
          line: node.startPosition.row + 1,
          endLine: node.endPosition.row + 1,
          exported,
        });
        break;
      }

      case "struct_item": {
        const name = node.childForFieldName("name")?.text ?? "";
        const exported = hasVisibility(node);
        symbols.push({
          name,
          kind: "class",
          line: node.startPosition.row + 1,
          endLine: node.endPosition.row + 1,
          exported,
        });
        break;
      }

      case "enum_item": {
        const name = node.childForFieldName("name")?.text ?? "";
        const exported = hasVisibility(node);
        symbols.push({
          name,
          kind: "enum",
          line: node.startPosition.row + 1,
          endLine: node.endPosition.row + 1,
          exported,
        });
        break;
      }

      case "trait_item": {
        const name = node.childForFieldName("name")?.text ?? "";
        const exported = hasVisibility(node);
        symbols.push({
          name,
          kind: "interface",
          line: node.startPosition.row + 1,
          endLine: node.endPosition.row + 1,
          exported,
        });
        break;
      }

      case "type_item": {
        const name = node.childForFieldName("name")?.text ?? "";
        const exported = hasVisibility(node);
        symbols.push({
          name,
          kind: "type",
          line: node.startPosition.row + 1,
          endLine: node.endPosition.row + 1,
          exported,
        });
        break;
      }

      case "impl_item": {
        // Extract methods from impl blocks
        const typeName = node.childForFieldName("type")?.text ?? node.childForFieldName("name")?.text ?? "";
        const body = node.childForFieldName("body");
        if (body) {
          for (const member of body.namedChildren) {
            if (member.type === "function_item") {
              const methodName = member.childForFieldName("name")?.text ?? "";
              const exported = hasVisibility(member);
              symbols.push({
                name: methodName,
                kind: "method",
                line: member.startPosition.row + 1,
                endLine: member.endPosition.row + 1,
                exported,
                parent: typeName,
              });
            }
          }
        }
        break;
      }

      case "macro_definition": {
        const name = node.childForFieldName("name")?.text ?? "";
        symbols.push({
          name,
          kind: "function",
          line: node.startPosition.row + 1,
          endLine: node.endPosition.row + 1,
          exported: true, // macros are typically pub
        });
        break;
      }

      default:
        break;
    }
  }
}

function hasVisibility(node: TSNode): boolean {
  for (const child of node.children) {
    if (child.type === "visibility_modifier") return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Go
// ---------------------------------------------------------------------------

function extractGoSymbols(root: TSNode, symbols: OutlineSymbol[]): void {
  for (const node of root.namedChildren) {
    switch (node.type) {
      case "function_declaration": {
        const name = node.childForFieldName("name")?.text ?? "";
        const exported = isGoExported(name);
        symbols.push({
          name,
          kind: "function",
          line: node.startPosition.row + 1,
          endLine: node.endPosition.row + 1,
          exported,
        });
        break;
      }

      case "method_declaration": {
        const name = node.childForFieldName("name")?.text ?? "";
        const receiver = node.childForFieldName("receiver");
        const typeName = receiver?.namedChildren?.[0]?.childForFieldName("type")?.text
          ?? receiver?.text?.replace(/[*()\s]/g, "") ?? "";
        const exported = isGoExported(name);
        symbols.push({
          name,
          kind: "method",
          line: node.startPosition.row + 1,
          endLine: node.endPosition.row + 1,
          exported,
          parent: typeName,
        });
        break;
      }

      case "type_declaration": {
        // type_declaration contains type_spec children
        for (const spec of node.namedChildren) {
          if (spec.type === "type_spec") {
            const name = spec.childForFieldName("name")?.text ?? "";
            const typeNode = spec.childForFieldName("type");
            const exported = isGoExported(name);
            let kind: OutlineSymbol["kind"] = "type";
            if (typeNode?.type === "struct_type") kind = "class";
            else if (typeNode?.type === "interface_type") kind = "interface";
            symbols.push({
              name,
              kind,
              line: spec.startPosition.row + 1,
              endLine: spec.endPosition.row + 1,
              exported,
            });
          }
        }
        break;
      }

      case "const_declaration":
      case "var_declaration": {
        for (const spec of node.namedChildren) {
          if (spec.type === "const_spec" || spec.type === "var_spec") {
            const name = spec.childForFieldName("name")?.text ?? spec.namedChildren[0]?.text ?? "";
            if (name) {
              symbols.push({
                name,
                kind: "variable",
                line: spec.startPosition.row + 1,
                endLine: spec.endPosition.row + 1,
                exported: isGoExported(name),
              });
            }
          }
        }
        break;
      }

      default:
        break;
    }
  }
}

function isGoExported(name: string): boolean {
  return name.length > 0 && name[0] === name[0].toUpperCase() && name[0] !== name[0].toLowerCase();
}
