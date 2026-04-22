/**
 * Bridge between shiki and react-diff-view's token system.
 *
 * react-diff-view's built-in `tokenize()` expects refractor (sync).
 * We use shiki (async, already used elsewhere) and build HunkTokens directly.
 */

import { codeToTokens, type ThemedToken, type BundledLanguage } from "shiki";
import {
  computeOldLineNumber,
  computeNewLineNumber,
  isDelete,
  isInsert,
  isNormal,
  type HunkData,
  type ChangeData,
} from "react-diff-view";
import type { HunkTokens, TokenNode } from "react-diff-view";
import type { ReactNode } from "react";
import type { RenderToken } from "react-diff-view";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Tokenize hunks for a given language. Returns null for unsupported/text. */
export async function tokenizeDiffHunks(
  hunks: HunkData[],
  language: string,
): Promise<HunkTokens | null> {
  if (!language || language === "text") return null;

  const [oldText, newText] = toTextPair(hunks);

  try {
    const [oldResult, newResult] = await Promise.all([
      codeToTokens(oldText, { lang: language as BundledLanguage, theme: "github-dark" }),
      codeToTokens(newText, { lang: language as BundledLanguage, theme: "github-dark" }),
    ]);

    return {
      old: oldResult.tokens.map(toTokenNodes),
      new: newResult.tokens.map(toTokenNodes),
    };
  } catch {
    // Language not supported by shiki — degrade gracefully
    return null;
  }
}

/** Custom renderToken for <Diff> that applies shiki inline color styles. */
export const shikiRenderToken: RenderToken = (token, defaultRender, index) => {
  if (token.properties?.style) {
    const style = parseInlineStyle(token.properties.style as string);
    return (
      <span key={index} style={style}>
        {token.value ??
          (token.children?.map((c: TokenNode, i: number) =>
            shikiRenderToken(c, defaultRender, i),
          ) as ReactNode)}
      </span>
    ) as ReactNode;
  }
  return defaultRender(token, index);
};

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

/** Convert a line of shiki ThemedTokens to react-diff-view TokenNodes. */
function toTokenNodes(line: ThemedToken[]): TokenNode[] {
  return line.map((t) => ({
    type: "element",
    value: t.content,
    properties: t.color ? { style: `color:${t.color}` } : undefined,
  }));
}

/** Parse "color:#FF7B72" into { color: "#FF7B72" }. */
function parseInlineStyle(css: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const part of css.split(";")) {
    const colon = part.indexOf(":");
    if (colon < 0) continue;
    const prop = part.slice(0, colon).trim();
    const val = part.slice(colon + 1).trim();
    if (prop && val) {
      result[prop.replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = val;
    }
  }
  return result;
}

/**
 * Reconstruct old/new source text from hunks.
 * Replicates react-diff-view's internal toTextPair + mapChanges logic.
 */
function toTextPair(hunks: HunkData[]): [string, string] {
  const oldChanges: ChangeData[] = [];
  const newChanges: ChangeData[] = [];

  for (const hunk of hunks) {
    for (const change of hunk.changes) {
      if (isNormal(change)) {
        oldChanges.push(change);
        newChanges.push(change);
      } else if (isDelete(change)) {
        oldChanges.push(change);
      } else if (isInsert(change)) {
        newChanges.push(change);
      }
    }
  }

  const oldText = mapChangesToText(oldChanges, "old");
  const newText = mapChangesToText(newChanges, "new");
  return [oldText, newText];
}

function mapChangesToText(
  changes: ChangeData[],
  side: "old" | "new",
): string {
  if (changes.length === 0) return "";

  const computeLineNumber =
    side === "old" ? computeOldLineNumber : computeNewLineNumber;
  const byLine = new Map<number, ChangeData>();
  for (const c of changes) byLine.set(computeLineNumber(c), c);

  const maxLine = computeLineNumber(changes[changes.length - 1]);
  const lines: string[] = [];
  for (let i = 1; i <= maxLine; i++) {
    const c = byLine.get(i);
    lines.push(c ? c.content : "");
  }
  return lines.join("\n");
}
