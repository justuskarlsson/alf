import fs from "fs";
import path from "path";
import type { TicketMeta, TicketFull } from "@alf/types";
import { handle, type Reply } from "../../core/dispatch.js";
import { ALF_DIR, REPOS_ROOT } from "../../core/config.js";

function parseFrontmatter(raw: string): { meta: Record<string, unknown>; body: string } {
  if (!raw.startsWith("---")) return { meta: {}, body: raw };
  const end = raw.indexOf("\n---", 3);
  if (end === -1) return { meta: {}, body: raw };
  const yamlBlock = raw.slice(3, end).trim();
  const body = raw.slice(end + 4).trimStart();
  const meta: Record<string, unknown> = {};
  for (const line of yamlBlock.split("\n")) {
    const colon = line.indexOf(":");
    if (colon === -1) continue;
    const key = line.slice(0, colon).trim();
    const val = line.slice(colon + 1).trim();
    if (val.startsWith("[") && val.endsWith("]")) {
      meta[key] = val.slice(1, -1).split(",").map(s => s.trim()).filter(Boolean);
    } else {
      meta[key] = val;
    }
  }
  return { meta, body };
}

function readTicket(filePath: string): TicketFull | null {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const { meta, body } = parseFrontmatter(raw);
    const filename = path.basename(filePath);
    const id = path.basename(filePath, ".md"); // filename is the canonical id
    return {
      id,
      filename,
      title: (meta.title as string) || id,
      tags: meta.tags as string[] | undefined,
      epic: meta.epic as string | undefined,
      status: (meta.status as string) || "open",
      created: meta.created as string | undefined,
      session: meta.session as string | undefined,
      content: body,
    };
  } catch { return null; }
}

function ticketsDir(repo: string): string {
  return path.join(REPOS_ROOT, repo, ALF_DIR, "tickets");
}

function ensureTicketsDir(repo: string): string {
  const dir = ticketsDir(repo);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    // Scaffold TICKETS.md instructions alongside the tickets/ directory
    const ticketsMdPath = path.join(REPOS_ROOT, repo, ALF_DIR, "TICKETS.md");
    if (!fs.existsSync(ticketsMdPath)) {
      fs.writeFileSync(ticketsMdPath, TICKETS_TEMPLATE, "utf8");
    }
  }
  return dir;
}

function listTickets(repo: string): TicketMeta[] {
  const dir = ensureTicketsDir(repo);
  let files: string[];
  try { files = fs.readdirSync(dir).filter(f => f.endsWith(".md")); } catch { return []; }
  return files.flatMap(f => {
    const t = readTicket(path.join(dir, f));
    if (!t) return [];
    const { content: _, ...meta } = t;
    return [meta];
  });
}

export class TicketsModule {
  @handle("tickets/list")
  static list(msg: Record<string, unknown>, reply: Reply) {
    const repo = msg.repo as string | undefined;
    if (!repo) { reply({ type: "error", error: "Missing repo" }); return; }
    reply({ type: "tickets/list", tickets: listTickets(repo) });
  }

  @handle("tickets/get")
  static get(msg: Record<string, unknown>, reply: Reply) {
    const repo = msg.repo as string | undefined;
    const id = msg.id as string | undefined;
    if (!repo || !id) { reply({ type: "error", error: "Missing repo or id" }); return; }
    const ticket = readTicket(path.join(ticketsDir(repo), `${id}.md`));
    if (!ticket) { reply({ type: "error", error: "Ticket not found" }); return; }
    reply({ type: "tickets/get", ticket });
  }

  @handle("tickets/many")
  static many(msg: Record<string, unknown>, reply: Reply) {
    const repo = msg.repo as string | undefined;
    const ids = msg.ids as string[] | undefined;
    if (!repo) { reply({ type: "error", error: "Missing repo" }); return; }
    const dir = ticketsDir(repo);
    const tickets = (ids ?? []).flatMap(id => {
      const t = readTicket(path.join(dir, `${id}.md`));
      return t ? [t] : [];
    });
    reply({ type: "tickets/many", tickets });
  }

  /** Write session id into a ticket's YAML frontmatter. */
  @handle("tickets/link-session")
  static linkSession(msg: Record<string, unknown>, reply: Reply) {
    const repo = msg.repo as string | undefined;
    const id = msg.id as string | undefined;
    const sessionId = msg.sessionId as string | undefined;
    if (!repo || !id || !sessionId) {
      reply({ type: "error", error: "Missing repo, id, or sessionId" }); return;
    }
    const filePath = path.join(ticketsDir(repo), `${id}.md`);
    try {
      const raw = fs.readFileSync(filePath, "utf8");
      const updated = upsertFrontmatterField(raw, "session", sessionId);
      fs.writeFileSync(filePath, updated, "utf8");
      const ticket = readTicket(filePath);
      reply({ type: "tickets/link-session", ok: true, ticket });
    } catch {
      reply({ type: "error", error: "Failed to update ticket" });
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TICKETS_TEMPLATE = `# Ticket Workflow

Tickets are Markdown files with YAML frontmatter stored in \`.alf/tickets/\`.
Status is tracked via the \`status\` field in frontmatter, not by folder.

## File format

Filename: \`T-001-short-slug.md\`

\`\`\`markdown
---
id: T-001
title: Short descriptive title
type: bug          # bug | feature | task | research | chore
status: open       # open | in-progress | done | future
priority: medium   # critical | high | medium | low
epic: general      # optional grouping
effort: M          # S | M | L | XL
created: ${new Date().toISOString().slice(0, 10)}
updated: ${new Date().toISOString().slice(0, 10)}
---

Summary paragraph.

## Context

Background and details.

## Acceptance

- [ ] Criterion one
- [ ] Criterion two
\`\`\`

## Rules

- **YAML frontmatter is required** for the UI to read the ticket correctly.
- Auto-increment id by scanning existing filenames for max T-NNN.
- Never delete a ticket — set \`status: done\`.
`;

/** Insert or update a key in YAML frontmatter. Preserves rest of file. */
function upsertFrontmatterField(raw: string, key: string, value: string): string {
  if (!raw.startsWith("---")) return raw;
  const end = raw.indexOf("\n---", 3);
  if (end === -1) return raw;
  const yamlBlock = raw.slice(3, end);
  const rest = raw.slice(end);
  const lines = yamlBlock.split("\n");
  const pattern = new RegExp(`^${key}:\\s`);
  const idx = lines.findIndex(l => pattern.test(l));
  if (idx >= 0) {
    lines[idx] = `${key}: ${value}`;
  } else {
    lines.push(`${key}: ${value}`);
  }
  return "---" + lines.join("\n") + rest;
}
