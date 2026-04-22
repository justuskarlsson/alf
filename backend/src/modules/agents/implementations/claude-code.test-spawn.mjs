/**
 * Manual smoke test for claude-code SDK integration.
 * Run directly: node --experimental-vm-modules src/modules/agents/implementations/claude-code.test-spawn.mjs
 * Or: tsx src/modules/agents/implementations/claude-code.test-spawn.mjs
 *
 * Tests that the SDK can spawn the cli.js subprocess and stream a simple reply.
 * Does NOT require systemd or the relay — just run from /backend directory.
 */
import { query } from "@anthropic-ai/claude-agent-sdk";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPOS_ROOT = process.env.REPOS_ROOT ?? `${process.env.HOME}/repos`;
const TEST_REPO = process.env.TEST_REPO ?? "alf";
const cwd = resolve(join(REPOS_ROOT, TEST_REPO));

console.log("process.execPath:", process.execPath);
console.log("cwd:", cwd);
console.log("---");

const CLAUDE_BIN = process.env.CLAUDE_BINARY_PATH ?? "/home/juska/.local/bin/claude";
console.log("pathToClaudeCodeExecutable:", CLAUDE_BIN);

const options = {
  cwd,
  pathToClaudeCodeExecutable: CLAUDE_BIN,
  permissionMode: "bypassPermissions",
  allowDangerouslySkipPermissions: true,
  maxTurns: 1,
};

try {
  for await (const msg of query({ prompt: "Reply with exactly: hello from claude", options })) {
    if (msg.type === "system") { console.log("[system]", msg.subtype); continue; }
    if (msg.type === "assistant") {
      for (const block of msg.message?.content ?? []) {
        if (block.type === "text") console.log("[text]", block.text);
      }
    }
    if (msg.type === "result") console.log("[result]", msg.subtype, msg.is_error ?? false);
  }
  console.log("--- done ---");
} catch (e) {
  console.error("FAILED:", e.message);
  process.exit(1);
}
