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
  filename: string;
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
// Agents
// ---------------------------------------------------------------------------

export interface AgentSession {
  id: string;
  repo_id: string;
  title: string;
  sdk_session_id: string | null;
  impl: string;
  forked_from: string | null;
  fork_point_turn_idx: number | null;
  created_at: number;
  updated_at: number;
}

export interface AgentTurn {
  id: string;
  session_id: string;
  prompt: string;
  idx: number;
  created_at: number;
  completed_at: number | null;
}

export interface AgentActivity {
  id: string;
  turn_id: string;
  session_id: string;
  type: string; // 'thinking' | 'tool' | 'text'
  content: string;
  idx: number;  // 0-based within turn
  created_at: number;
}

export interface AgentDelta {
  sessionId: string;
  activityType: "thinking" | "tool" | "text";
  content: string;
  idx: number; // changes when a new activity starts within the turn
}

export interface AgentLastCoord {
  turnIdx: number;
  activityIdx: number;
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

export interface GitCommit {
  sha: string;
  subject: string;
  date: string;
}

// ---------------------------------------------------------------------------
// Agent message payloads (request shapes shared by backend handlers + frontend store)
// ---------------------------------------------------------------------------

export interface AgentCreateSessionMsg {
  type: "agent/session/create";
  repo: string;
  impl?: string;
}

export interface AgentMessageMsg {
  type: "agent/message";
  sessionId: string;
  prompt: string;
  impl?: string;
  model?: string;
}

export interface AgentSubscribeMsg {
  type: "agent/subscribe";
  sessionId: string;
}

export interface AgentUnsubscribeMsg {
  type: "agent/unsubscribe";
  sessionId: string;
}

export interface AgentSessionDetailMsg {
  type: "agent/session/detail";
  sessionId: string;
  afterTurnIdx?: number;
  afterActivityIdx?: number;
}

export interface AgentSessionsListMsg {
  type: "agent/sessions/list";
  repo: string;
}

export interface AgentSessionUpdateMsg {
  type: "agent/session/update";
  sessionId: string;
  title?: string;
}
