import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createRequire } from "node:module";
import { ConversationSummary, SurfaceType } from "../schema/v1.js";
import { normalizeWorkspacePath, arePathsEqual } from "./paths.js";

const nodeRequire = createRequire(import.meta.url);

export interface ListConversationsOptions {
  cwd?: string;
  all?: boolean;
  surface?: SurfaceType;
  dataDir?: string;
  debug?: boolean;
}

/**
 * Resolves the Antigravity CLI and IDE data directories based on options and OS conventions.
 */
export function resolveDataDirectories(options: { dataDir?: string } = {}): {
  cliDirs: string[];
  ideDirs: string[];
} {
  const cliDirs: string[] = [];
  const ideDirs: string[] = [];

  const explicitDir =
    options.dataDir ||
    process.env.AGY_EXPORT_DATA_DIR ||
    process.env.ANTIGRAVITY_APP_DATA_DIR ||
    process.env.ANTIGRAVITY_DATA_DIR;
  if (explicitDir) {
    const resolved = path.resolve(explicitDir);
    cliDirs.push(resolved);
    return { cliDirs, ideDirs };
  }

  const home = os.homedir();

  // CLI stores
  const cliCandidates = [
    path.join(home, ".gemini", "antigravity-cli"),
    path.join(home, ".gemini", "antigravity"),
    path.join(home, ".antigravity")
  ];

  if (os.platform() === "win32") {
    const appData = process.env.APPDATA;
    if (appData) {
      cliCandidates.push(path.join(appData, "Antigravity"));
    }
  } else {
    cliCandidates.push(
      path.join(home, ".config", "antigravity"),
      path.join(home, ".config", "antigravity-cli")
    );
  }

  for (const dir of cliCandidates) {
    if (fs.existsSync(dir) && !cliDirs.includes(dir)) {
      cliDirs.push(dir);
    }
  }

  // IDE stores
  const ideCandidates = [path.join(home, ".gemini", "antigravity-ide")];

  if (os.platform() === "win32") {
    const appData = process.env.APPDATA;
    if (appData) {
      ideCandidates.push(path.join(appData, "Antigravity IDE"));
    }
  } else if (os.platform() === "darwin") {
    ideCandidates.push(
      path.join(home, "Library", "Application Support", "Antigravity IDE"),
      path.join(home, "Library", "Application Support", "Antigravity")
    );
  } else {
    ideCandidates.push(path.join(home, ".config", "antigravity-ide"));
  }

  for (const dir of ideCandidates) {
    if (fs.existsSync(dir) && !ideDirs.includes(dir)) {
      ideDirs.push(dir);
    }
  }

  return { cliDirs, ideDirs };
}

/**
 * Lists Antigravity conversations matching the workspace and surface criteria.
 */
export async function listConversations(options: ListConversationsOptions = {}): Promise<ConversationSummary[]> {
  const { cliDirs, ideDirs } = resolveDataDirectories(options);
  const targetCwd = options.cwd || process.cwd();
  const surface = options.surface || "all";

  const allSummaries = new Map<string, ConversationSummary>();

  // 1. Read CLI stores if requested
  if (surface === "all" || surface === "cli") {
    for (const cliDir of cliDirs) {
      readConversationsFromDirectory(cliDir, "cli", allSummaries);
    }
  }

  // 2. Read IDE stores if requested
  if (surface === "all" || surface === "ide") {
    for (const ideDir of ideDirs) {
      readConversationsFromDirectory(ideDir, "ide", allSummaries);
    }
  }

  // 3. Look for sidecar files (*.trajectory.json) in target directory or CWD
  scanSidecarsInDirectory(targetCwd, allSummaries);

  let results = Array.from(allSummaries.values());

  // 4. Workspace scoping (unless --all is specified)
  if (!options.all) {
    results = results.filter((conv) => {
      if (conv.workspace && arePathsEqual(conv.workspace, targetCwd)) {
        return true;
      }
      if (conv.workspaceUris && conv.workspaceUris.length > 0) {
        return conv.workspaceUris.some((uri) => arePathsEqual(uri, targetCwd));
      }
      return false;
    });
  }

  // 5. Sort newest-first (updated_at descending)
  results.sort((a, b) => {
    const timeA = a.updated_at ? new Date(a.updated_at).getTime() : 0;
    const timeB = b.updated_at ? new Date(b.updated_at).getTime() : 0;
    return timeB - timeA;
  });

  return results;
}

function readConversationsFromDirectory(
  baseDir: string,
  surface: "cli" | "ide",
  outMap: Map<string, ConversationSummary>
): void {
  if (!fs.existsSync(baseDir)) return;

  // A. Try conversation_summaries.db
  const dbPath = path.join(baseDir, "conversation_summaries.db");
  if (fs.existsSync(dbPath)) {
    readFromSqliteDatabase(dbPath, surface, outMap);
  }

  // B. Try history.jsonl
  const historyPath = path.join(baseDir, "history.jsonl");
  if (fs.existsSync(historyPath)) {
    readFromHistoryJsonl(historyPath, surface, outMap);
  }

  // C. Scan conversations folder
  const convDir = path.join(baseDir, "conversations");
  if (fs.existsSync(convDir)) {
    try {
      const files = fs.readdirSync(convDir);
      for (const file of files) {
        const match = file.match(/^([a-zA-Z0-9_\-]+)\.(db|pb|trajectory\.json)$/i);
        if (match) {
          const id = match[1];
          if (!outMap.has(id)) {
            outMap.set(id, {
              id,
              title: `Conversation ${id.slice(0, 8)}`,
              workspace: "",
              surface,
              source: `antigravity-${surface}`
            });
          }
        }
      }
    } catch {
      // ignore
    }
  }

  // D. Scan brain folder for unencrypted transcripts
  const brainDir = path.join(baseDir, "brain");
  if (fs.existsSync(brainDir)) {
    try {
      const subdirs = fs.readdirSync(brainDir);
      for (const sub of subdirs) {
        if (/^[a-zA-Z0-9_\-]+$/.test(sub) && !outMap.has(sub)) {
          const logsDir = path.join(brainDir, sub, ".system_generated", "logs");
          const candidateFiles = [
            path.join(logsDir, "transcript_full.jsonl"),
            path.join(logsDir, "transcript.jsonl"),
            path.join(logsDir, "overview.txt")
          ];
          let foundFile: string | null = null;
          for (const f of candidateFiles) {
            if (fs.existsSync(f)) {
              foundFile = f;
              break;
            }
          }
          const chunksDir = path.join(logsDir, "chunks");
          const hasChunks = fs.existsSync(chunksDir);

          if (foundFile || hasChunks) {
            let title = `Conversation ${sub.slice(0, 8)}`;
            let workspace = "";
            let updatedAt: string | undefined;

            if (foundFile) {
              try {
                const stat = fs.statSync(foundFile);
                updatedAt = stat.mtime.toISOString();
                // Read the first few lines to extract user prompt title and workspace
                const headBuf = Buffer.alloc(4096);
                const fd = fs.openSync(foundFile, "r");
                const bytesRead = fs.readSync(fd, headBuf, 0, 4096, 0);
                fs.closeSync(fd);
                const headText = headBuf.toString("utf8", 0, bytesRead).replace(/^\uFEFF/, "");
                const lines = headText.split(/\r?\n/);
                for (const line of lines) {
                  if (!line.trim()) continue;
                  try {
                    const step = JSON.parse(line);
                    if (!workspace && typeof step.content === "string") {
                      const wsMatch = step.content.match(
                        /Active Document:\s*([a-zA-Z]:[\\/][^\r\n]+|file:\/\/\/[^\r\n]+)/i
                      );
                      if (wsMatch) {
                        workspace = normalizeWorkspacePath(path.dirname(wsMatch[1].trim()));
                      }
                    }
                    if (
                      title === `Conversation ${sub.slice(0, 8)}` &&
                      (step.type === "USER_INPUT" || step.type === "CORTEX_STEP_TYPE_USER_INPUT")
                    ) {
                      const rawContent = typeof step.content === "string" ? step.content : "";
                      const userReq = rawContent.match(
                        /<USER_REQUEST>([\s\S]*?)(?:<\/USER_REQUEST>|<ADDITIONAL_METADATA>|$)/i
                      );
                      const promptText = (userReq ? userReq[1] : rawContent).trim().split(/\r?\n/)[0];
                      if (promptText) {
                        title = promptText.length > 80 ? promptText.slice(0, 79) + "…" : promptText;
                      }
                    }
                  } catch {
                    // skip
                  }
                }
              } catch {
                // ignore
              }
            } else if (hasChunks) {
              try {
                const stat = fs.statSync(chunksDir);
                updatedAt = stat.mtime.toISOString();
              } catch {
                // ignore
              }
            }

            outMap.set(sub, {
              id: sub,
              title,
              workspace,
              workspaceUris: workspace ? [workspace] : [],
              updated_at: updatedAt,
              surface,
              source: `antigravity-${surface}`
            });
          }
        }
      }
    } catch {
      // ignore
    }
  }
}

function readFromSqliteDatabase(
  dbPath: string,
  surface: "cli" | "ide",
  outMap: Map<string, ConversationSummary>
): void {
  try {
    const { DatabaseSync } = nodeRequire("node:sqlite") as {
      DatabaseSync: new (path: string, options: { readOnly: boolean }) => {
        prepare: (sql: string) => {
          all: () => Array<Record<string, unknown>>;
        };
        close: () => void;
      };
    };

    const db = new DatabaseSync(dbPath, { readOnly: true });
    try {
      const stmt = db.prepare(
        "SELECT conversation_id, title, preview, step_count, last_modified_time, last_user_input_time, workspace_uris, source, project_id FROM conversation_summaries"
      );
      const rows = stmt.all();

      for (const row of rows) {
        const id = String(row.conversation_id || "");
        if (!id) continue;

        let title = String(row.title || "").trim();
        const preview = String(row.preview || "").trim();
        if (!title && preview) {
          title = preview;
        }
        if (!title) {
          title = `Conversation ${id.slice(0, 8)}`;
        }

        const workspaceUrisRaw = String(row.workspace_uris || "");
        let workspaceUris: string[] = [];
        let primaryWorkspace = "";

        if (workspaceUrisRaw) {
          try {
            const parsed = JSON.parse(workspaceUrisRaw);
            if (Array.isArray(parsed)) {
              workspaceUris = parsed.map((u) => normalizeWorkspacePath(String(u)));
              if (workspaceUris.length > 0) {
                primaryWorkspace = workspaceUris[0];
              }
            }
          } catch {
            primaryWorkspace = normalizeWorkspacePath(workspaceUrisRaw);
            workspaceUris = [primaryWorkspace];
          }
        }

        const updatedAt = parseIsoDate(row.last_modified_time) || parseIsoDate(row.last_user_input_time);
        const stepCount = typeof row.step_count === "number" ? row.step_count : undefined;

        outMap.set(id, {
          id,
          title,
          workspace: primaryWorkspace,
          workspaceUris,
          updated_at: updatedAt,
          surface,
          step_count: stepCount,
          preview: preview || undefined,
          project_id: row.project_id ? String(row.project_id) : undefined,
          source: row.source ? String(row.source) : `antigravity-${surface}`
        });
      }
    } finally {
      db.close();
    }
  } catch {
    // DatabaseSync unavailable or table locked; graceful fallback
  }
}

function readFromHistoryJsonl(
  historyPath: string,
  surface: "cli" | "ide",
  outMap: Map<string, ConversationSummary>
): void {
  try {
    const content = fs.readFileSync(historyPath, "utf8").replace(/^\uFEFF/, "");
    const lines = content.split(/\r?\n/);
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const item = JSON.parse(line) as Record<string, unknown>;
        const id = typeof item.conversationId === "string" ? item.conversationId : undefined;
        if (!id) continue;

        const existing = outMap.get(id);
        const itemWorkspace = typeof item.workspace === "string" ? normalizeWorkspacePath(item.workspace) : "";
        const itemTime = item.timestamp ? new Date(Number(item.timestamp)).toISOString() : undefined;
        const displayPrompt = typeof item.display === "string" ? item.display.trim() : "";

        if (!existing) {
          outMap.set(id, {
            id,
            title: displayPrompt || `Conversation ${id.slice(0, 8)}`,
            workspace: itemWorkspace,
            workspaceUris: itemWorkspace ? [itemWorkspace] : [],
            updated_at: itemTime,
            surface,
            source: `antigravity-${surface}`
          });
        } else {
          // If existing doesn't have workspace or title, enrich it
          if (!existing.workspace && itemWorkspace) {
            existing.workspace = itemWorkspace;
            existing.workspaceUris = [itemWorkspace];
          }
          if (itemTime && (!existing.updated_at || itemTime > existing.updated_at)) {
            existing.updated_at = itemTime;
          }
        }
      } catch {
        // skip malformed history line
      }
    }
  } catch {
    // ignore
  }
}

function scanSidecarsInDirectory(
  dir: string,
  outMap: Map<string, ConversationSummary>
): void {
  if (!fs.existsSync(dir)) return;
  try {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const match = file.match(/^([a-zA-Z0-9_\-]+)\.trajectory\.json$/i);
      if (match) {
        const id = match[1];
        if (!outMap.has(id)) {
          const fullPath = path.join(dir, file);
          let title = `Conversation ${id.slice(0, 8)}`;
          let updatedAt: string | undefined;
          try {
            const stat = fs.statSync(fullPath);
            updatedAt = stat.mtime.toISOString();
            const content = JSON.parse(fs.readFileSync(fullPath, "utf8").replace(/^\uFEFF/, ""));
            if (content && typeof content === "object") {
              if (content.title) title = String(content.title);
              if (content.updated_at) updatedAt = String(content.updated_at);
            }
          } catch {
            // ignore
          }
          outMap.set(id, {
            id,
            title,
            workspace: normalizeWorkspacePath(dir),
            workspaceUris: [normalizeWorkspacePath(dir)],
            updated_at: updatedAt,
            surface: "cli",
            source: "sidecar"
          });
        }
      }
    }
  } catch {
    // ignore
  }
}

function parseIsoDate(val: unknown): string | undefined {
  if (!val) return undefined;
  if (typeof val === "string") {
    const trimmed = val.trim();
    if (!trimmed || trimmed.startsWith("0001-01-01") || trimmed.startsWith("1970-01-01")) {
      return undefined;
    }
    try {
      const d = new Date(trimmed);
      if (!isNaN(d.getTime()) && d.getFullYear() > 1970) return d.toISOString();
    } catch {
      return undefined;
    }
  }
  if (typeof val === "number") {
    if (val <= 0) return undefined;
    try {
      const d = new Date(val);
      if (!isNaN(d.getTime()) && d.getFullYear() > 1970) return d.toISOString();
    } catch {
      return undefined;
    }
  }
  return undefined;
}
