import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const nodeRequire = createRequire(import.meta.url);

export interface FixtureEnvironment {
  tempDir: string;
  dataDir: string;
  workspaceDir: string;
  otherWorkspaceDir: string;
  cleanup: () => void;
}

/**
 * Creates a hermetic test fixture environment with realistic Antigravity storage,
 * including history.jsonl, logs, sidecars, and multiple workspaces.
 */
export function createFixtureEnvironment(daemonPort?: number): FixtureEnvironment {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "agy-export-test-"));
  const dataDir = path.join(tempDir, "fake-gemini", "antigravity-cli");
  const workspaceDir = path.join(tempDir, "workspace-a");
  const otherWorkspaceDir = path.join(tempDir, "workspace-b");

  fs.mkdirSync(path.join(dataDir, "log"), { recursive: true });
  fs.mkdirSync(path.join(dataDir, "conversations"), { recursive: true });
  fs.mkdirSync(workspaceDir, { recursive: true });
  fs.mkdirSync(otherWorkspaceDir, { recursive: true });

  // 1. Daemon discovery log
  if (daemonPort) {
    const logPath = path.join(dataDir, "log", "cli-20260905_120000.log");
    fs.writeFileSync(
      logPath,
      `ERROR: logging before google.Init: I0905 12:00:00.000000 1 server.go:609] Language server listening on random port at ${daemonPort} for HTTP\n`
    );
  }

  // 2. Realistic history.jsonl with fixtures
  const historyEntries = [
    // Normal conversation in workspace-a
    {
      conversationId: "055a398f-db14-4c5f-abbb-1bf03f8120a7",
      display: "Fix authentication regression",
      workspace: workspaceDir,
      timestamp: 1788100000000
    },
    // Tool-heavy conversation in workspace-a
    {
      conversationId: "tool-heavy-1111-2222-3333-444444444444",
      display: "Refactor database query optimization",
      workspace: workspaceDir,
      timestamp: 1788100100000
    },
    // Conversation missing title
    {
      conversationId: "notitle-0000-1111-2222-333333333333",
      workspace: workspaceDir,
      timestamp: 1788095000000
    },
    // Unicode title conversation in workspace-a
    {
      conversationId: "unicode-6789-abcd-ef01-234567890abc",
      display: "修复认证错误 🚀 Authentication & Emojis!",
      workspace: workspaceDir,
      timestamp: 1788100200000
    },
    // Other workspace conversation
    {
      conversationId: "other-ws-9999-8888-7777-666666666666",
      display: "Implement background worker",
      workspace: otherWorkspaceDir,
      timestamp: 1788090000000
    },
    // Duplicate title conversation
    {
      conversationId: "dup-title-1111-2222-3333-444444444444",
      display: "Fix authentication regression",
      workspace: workspaceDir,
      timestamp: 1788080000000
    }
  ];

  const historyLines = historyEntries.map((e) => JSON.stringify(e)).join("\n") + "\n";
  fs.writeFileSync(path.join(dataDir, "history.jsonl"), historyLines, "utf8");

  // 3. Sidecar conversation in workspaceDir
  const sidecarSteps = [
    {
      type: "message",
      role: "user",
      content: "Sidecar conversation prompt"
    },
    {
      type: "message",
      role: "assistant",
      content: "Sidecar conversation response"
    }
  ];
  fs.writeFileSync(
    path.join(workspaceDir, "sidecar-1234-5678-9abc-def012345678.trajectory.json"),
    JSON.stringify({
      title: "Sidecar Loaded Session",
      updated_at: "2026-08-30T10:00:00.000Z",
      steps: sidecarSteps
    }),
    "utf8"
  );

  // 4. Realistic conversation_summaries.db
  try {
    const { DatabaseSync } = nodeRequire("node:sqlite") as {
      DatabaseSync: new (path: string) => {
        exec: (sql: string) => void;
        prepare: (sql: string) => { run: (...args: unknown[]) => void };
        close: () => void;
      };
    };
    if (DatabaseSync) {
      const dbPath = path.join(dataDir, "conversation_summaries.db");
      const db = new DatabaseSync(dbPath);
      db.exec(`
        CREATE TABLE conversation_summaries (
          conversation_id text PRIMARY KEY,
          title text NOT NULL DEFAULT '',
          preview text NOT NULL DEFAULT '',
          step_count integer NOT NULL DEFAULT 0,
          last_modified_time datetime NOT NULL,
          workspace_uris text NOT NULL,
          source text NOT NULL DEFAULT '',
          project_id text NOT NULL DEFAULT '',
          last_user_input_time datetime NOT NULL
        );
      `);
      const insert = db.prepare(`
        INSERT INTO conversation_summaries (
          conversation_id, title, preview, step_count, last_modified_time, workspace_uris, source, project_id, last_user_input_time
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const fileUri = pathToFileURL(workspaceDir).href;
      insert.run(
        "sqlite-conv-1111-2222-3333-444444444444",
        "Fix sqlite conversation summary parsing",
        "Fix sqlite preview text",
        12,
        "2026-08-01 12:00:00.0000000+00:00",
        JSON.stringify([fileUri]),
        "antigravity-cli",
        "proj-1",
        "2026-08-01 11:00:00.0000000+00:00"
      );
      db.close();
    }
  } catch {
    // node:sqlite fallback
  }

  // 5. Encrypted-only conversation (has .db file but no daemon/sidecar)
  fs.writeFileSync(
    path.join(dataDir, "conversations", "encrypted-only-0000-0000-000000000000.db"),
    "SQLite format 3\0encrypted"
  );

  function cleanup() {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }

  return {
    tempDir,
    dataDir,
    workspaceDir,
    otherWorkspaceDir,
    cleanup
  };
}
