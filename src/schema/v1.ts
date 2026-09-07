export const SCHEMA_V1_ID = "agy-export/v1" as const;

export type EventType =
  | "session"
  | "message"
  | "tool_call"
  | "tool_result"
  | "command"
  | "file_change"
  | "artifact"
  | "warning";

export type MessageRole = "user" | "assistant" | "system_visible";

export type FileOperation = "modify" | "create" | "delete" | "rename" | "unknown";

export type SurfaceType = "cli" | "ide" | "all";

export interface SessionEvent {
  schema: typeof SCHEMA_V1_ID;
  type: "session";
  id: string;
  title: string;
  workspace: string;
  created_at?: string;
  updated_at?: string;
  source?: string;
  project_id?: string;
  parent_session_id?: string;
  step_count?: number;
  model?: string;
  surface?: "cli" | "ide";
}

export interface MessageEvent {
  type: "message";
  role: MessageRole;
  timestamp?: string;
  content: string;
}

export interface ToolCallEvent {
  type: "tool_call";
  tool: string;
  timestamp?: string;
  input: Record<string, unknown>;
}

export interface ToolResultEvent {
  type: "tool_result";
  tool: string;
  timestamp?: string;
  content?: unknown;
  exit_code?: number;
  summary?: string;
  truncated?: boolean;
  original_bytes?: number;
  exported_bytes?: number;
}

export interface CommandEvent {
  type: "command";
  command: string;
  cwd?: string;
  exit_code?: number;
  output?: string;
  timestamp?: string;
}

export interface FileChangeEvent {
  type: "file_change";
  path: string;
  operation: FileOperation;
  diff?: string;
  timestamp?: string;
}

export interface ArtifactEvent {
  type: "artifact";
  identifier?: string;
  title?: string;
  content: string;
  timestamp?: string;
}

export interface WarningEvent {
  type: "warning";
  message: string;
  timestamp?: string;
}

export type ExportEvent =
  | SessionEvent
  | MessageEvent
  | ToolCallEvent
  | ToolResultEvent
  | CommandEvent
  | FileChangeEvent
  | ArtifactEvent
  | WarningEvent;

export interface ConversationSummary {
  id: string;
  title: string;
  workspace: string;
  workspaceUris?: string[];
  created_at?: string;
  updated_at?: string;
  surface: "cli" | "ide";
  step_count?: number;
  preview?: string;
  project_id?: string;
  source?: string;
}

export interface JsonExportPayload {
  schema: typeof SCHEMA_V1_ID;
  session: SessionEvent;
  events: ExportEvent[];
}

export type ExportFormat = "jsonl" | "json" | "md";
export type ExportMode = "full" | "compact" | "messages";
export type SourceAdapterType = "auto" | "daemon" | "sidecar" | "brain";

export interface ExportOptions {
  id?: string;
  latest?: boolean;
  all?: boolean;
  cwd?: string;
  surface?: SurfaceType;
  format?: ExportFormat;
  mode?: ExportMode;
  output?: string;
  stdout?: boolean;
  force?: boolean;
  redact?: boolean;
  redactPaths?: boolean;
  includeTools?: boolean;
  excludeTools?: boolean;
  includeDiffs?: boolean;
  excludeDiffs?: boolean;
  maxToolOutput?: number;
  source?: SourceAdapterType;
  dataDir?: string;
  debug?: boolean;
  doctor?: boolean;
  list?: boolean;
  json?: boolean;
}
