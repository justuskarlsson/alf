import { describe, it, expect } from "vitest";
import { extractOutline } from "./outline.js";

// ---------------------------------------------------------------------------
// TypeScript / JavaScript
// ---------------------------------------------------------------------------

describe("extractOutline — TypeScript", () => {
  it("detects top-level function", () => {
    const code = `function hello() {\n  return 1;\n}\n`;
    const symbols = extractOutline(code, "test.ts");
    expect(symbols).toHaveLength(1);
    expect(symbols[0]).toMatchObject({ name: "hello", kind: "function", line: 1, exported: false });
  });

  it("detects exported function", () => {
    const code = `export function greet(name: string) {}\n`;
    const symbols = extractOutline(code, "test.ts");
    expect(symbols[0]).toMatchObject({ name: "greet", kind: "function", line: 1, exported: true });
  });

  it("detects async function", () => {
    const code = `export async function fetchData() {}\n`;
    const symbols = extractOutline(code, "test.ts");
    expect(symbols[0]).toMatchObject({ name: "fetchData", kind: "function", line: 1, exported: true });
  });

  it("detects class", () => {
    const code = `export class MyService {\n}\n`;
    const symbols = extractOutline(code, "test.ts");
    expect(symbols[0]).toMatchObject({ name: "MyService", kind: "class", line: 1, exported: true });
  });

  it("detects class methods", () => {
    const code = [
      "class Foo {",
      "  constructor() {}",
      "  bar() {}",
      "  async baz() {}",
      "}",
    ].join("\n");
    const symbols = extractOutline(code, "test.ts");
    const methods = symbols.filter(s => s.kind === "method");
    expect(methods).toHaveLength(3); // constructor + bar + baz
    expect(methods[0]).toMatchObject({ name: "constructor", kind: "method", line: 2, parent: "Foo" });
    expect(methods[1]).toMatchObject({ name: "bar", kind: "method", line: 3, parent: "Foo" });
    expect(methods[2]).toMatchObject({ name: "baz", kind: "method", line: 4, parent: "Foo" });
  });

  it("detects constructor as method", () => {
    const code = "class Foo {\n  constructor() {}\n}\n";
    const symbols = extractOutline(code, "test.ts");
    const ctor = symbols.find(s => s.name === "constructor");
    expect(ctor).toBeDefined();
    expect(ctor!.kind).toBe("method");
    expect(ctor!.parent).toBe("Foo");
  });

  it("detects arrow function (const)", () => {
    const code = `export const add = (a: number, b: number) => a + b;\n`;
    const symbols = extractOutline(code, "test.ts");
    expect(symbols[0]).toMatchObject({ name: "add", kind: "function", line: 1, exported: true });
  });

  it("detects const variable (non-function)", () => {
    const code = `const MAX_SIZE = 100;\n`;
    const symbols = extractOutline(code, "test.ts");
    expect(symbols[0]).toMatchObject({ name: "MAX_SIZE", kind: "variable", line: 1, exported: false });
  });

  it("correct line numbers with multiple symbols", () => {
    const code = [
      "const A = 1;",
      "",
      "function foo() {",
      "  return A;",
      "}",
      "",
      "export class Bar {",
      "  run() {}",
      "}",
    ].join("\n");
    const symbols = extractOutline(code, "test.ts");
    expect(symbols.find(s => s.name === "A")?.line).toBe(1);
    expect(symbols.find(s => s.name === "foo")?.line).toBe(3);
    expect(symbols.find(s => s.name === "Bar")?.line).toBe(7);
    expect(symbols.find(s => s.name === "run")?.line).toBe(8);
  });
});

// ---------------------------------------------------------------------------
// Python
// ---------------------------------------------------------------------------

describe("extractOutline — Python", () => {
  it("detects top-level function with correct endLine", () => {
    const code = [
      "def greet(name):",
      "    print(name)",
      "    return name",
      "",
      "def other():",
      "    pass",
    ].join("\n");
    const symbols = extractOutline(code, "test.py");
    const greet = symbols.find(s => s.name === "greet");
    expect(greet).toBeDefined();
    expect(greet!.kind).toBe("function");
    expect(greet!.line).toBe(1);
    expect(greet!.endLine).toBe(3);
  });

  it("detects class and methods", () => {
    const code = [
      "class Dog:",
      "    def __init__(self):",
      "        self.name = 'Rex'",
      "",
      "    def bark(self):",
      "        print('woof')",
    ].join("\n");
    const symbols = extractOutline(code, "test.py");
    const cls = symbols.find(s => s.name === "Dog");
    expect(cls).toMatchObject({ kind: "class", line: 1, exported: true });

    const init = symbols.find(s => s.name === "__init__");
    expect(init).toMatchObject({ kind: "method", parent: "Dog", exported: false });

    const bark = symbols.find(s => s.name === "bark");
    expect(bark).toMatchObject({ kind: "method", parent: "Dog", line: 5, exported: true });
  });

  it("function endLine is accurate", () => {
    const code = [
      "def foo():",
      "    x = 1",
      "    y = 2",
      "    return x + y",
      "",
      "def bar():",
      "    pass",
    ].join("\n");
    const symbols = extractOutline(code, "test.py");
    const foo = symbols.find(s => s.name === "foo")!;
    expect(foo.endLine).toBe(4);
    const bar = symbols.find(s => s.name === "bar")!;
    expect(bar.endLine).toBe(7);
  });

  it("detects top-level constant variables", () => {
    const code = "MAX_RETRIES = 3\nDEFAULT_TIMEOUT = 30\n";
    const symbols = extractOutline(code, "test.py");
    expect(symbols).toHaveLength(2);
    expect(symbols[0]).toMatchObject({ name: "MAX_RETRIES", kind: "variable", line: 1 });
    expect(symbols[1]).toMatchObject({ name: "DEFAULT_TIMEOUT", kind: "variable", line: 2 });
  });
});

// ---------------------------------------------------------------------------
// Rust
// ---------------------------------------------------------------------------

describe("extractOutline — Rust", () => {
  it("detects fn and pub fn", () => {
    const code = [
      "fn helper() {}",
      "pub fn main() {}",
    ].join("\n");
    const symbols = extractOutline(code, "test.rs");
    expect(symbols[0]).toMatchObject({ name: "helper", kind: "function", exported: false });
    expect(symbols[1]).toMatchObject({ name: "main", kind: "function", exported: true });
  });

  it("detects struct and methods in impl", () => {
    const code = [
      "pub struct Foo {",
      "    x: i32,",
      "}",
      "",
      "impl Foo {",
      "    pub fn new() -> Self { Foo { x: 0 } }",
      "    fn private_method(&self) {}",
      "}",
    ].join("\n");
    const symbols = extractOutline(code, "test.rs");
    expect(symbols.find(s => s.name === "Foo" && s.kind === "class")).toBeDefined();
    expect(symbols.find(s => s.name === "new")).toMatchObject({ kind: "method", parent: "Foo", exported: true });
    expect(symbols.find(s => s.name === "private_method")).toMatchObject({ kind: "method", parent: "Foo", exported: false });
  });
});

// ---------------------------------------------------------------------------
// Go
// ---------------------------------------------------------------------------

describe("extractOutline — Go", () => {
  it("detects func and type struct", () => {
    const code = [
      "type Server struct {",
      "    port int",
      "}",
      "",
      "func NewServer() *Server {",
      "    return &Server{}",
      "}",
      "",
      "func helper() {}",
    ].join("\n");
    const symbols = extractOutline(code, "main.go");
    expect(symbols.find(s => s.name === "Server")).toMatchObject({ kind: "class", exported: true });
    expect(symbols.find(s => s.name === "NewServer")).toMatchObject({ kind: "function", exported: true });
    expect(symbols.find(s => s.name === "helper")).toMatchObject({ kind: "function", exported: false });
  });
});

// ---------------------------------------------------------------------------
// Unsupported extension
// ---------------------------------------------------------------------------

describe("extractOutline — unsupported", () => {
  it("returns empty array for unknown extension", () => {
    expect(extractOutline("some content", "data.csv")).toEqual([]);
  });
});
