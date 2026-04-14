// ---------------------------------------------------------------------------
// Files
// ---------------------------------------------------------------------------

export interface FileEntry {
  name: string;
  path: string;
  isDir: boolean;
}

export interface FilesGetResponse {
  type: "files/get";
  content: string;
  path: string;
  isBinary?: boolean;
}

// ---------------------------------------------------------------------------
// Tickets
// ---------------------------------------------------------------------------

export interface TicketMeta {
  id: string;
  title: string;
  tags?: string[];
  epic?: string;
  status?: string;
  created?: string;
}

export interface TicketFull extends TicketMeta {
  content: string;
}

// ---------------------------------------------------------------------------
// Git
// ---------------------------------------------------------------------------

export interface Worktree {
  path: string;
  head: string;
  branch: string;
  bare: boolean;
}
