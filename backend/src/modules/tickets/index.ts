import fs from "fs";
import path from "path";
import type { TicketMeta, TicketFull } from "@alf/types";
import { handle, type Reply } from "../../core/dispatch.js";

const REPOS_ROOT = process.env.REPOS_ROOT ?? `${process.env.HOME}/repos`;
const TICKETS_DIR = ".alf/tickets";

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
      content: body,
    };
  } catch { return null; }
}

function ticketsDir(repo: string): string {
  return path.join(REPOS_ROOT, repo, TICKETS_DIR);
}

function listTickets(repo: string): TicketMeta[] {
  const dir = ticketsDir(repo);
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
}
