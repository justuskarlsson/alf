/** Extension → shiki language map. Shared between file viewer and diff viewer. */
export const EXT_LANG: Record<string, string> = {
  ts: "typescript", tsx: "tsx", js: "javascript", jsx: "jsx",
  py: "python", rs: "rust", go: "go", sh: "bash", bash: "bash",
  md: "markdown", json: "json", yaml: "yaml", yml: "yaml",
  css: "css", html: "html", sql: "sql", toml: "toml",
  env: "bash", tf: "hcl",
};

export function detectLang(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  return EXT_LANG[ext] ?? "text";
}
