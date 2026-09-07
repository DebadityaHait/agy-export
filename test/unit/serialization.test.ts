import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { formatJsonl } from "../../src/export/jsonl.js";
import { formatJson } from "../../src/export/json.js";
import { formatMarkdown } from "../../src/export/markdown.js";
import { SessionEvent, ExportEvent, SCHEMA_V1_ID } from "../../src/schema/v1.js";

describe("serialization formats", () => {
  const session: SessionEvent = {
    schema: SCHEMA_V1_ID,
    type: "session",
    id: "055a398f-db14-4c5f-abbb-1bf03f8120a7",
    title: "Fix authentication regression",
    workspace: "D:\\projects\\ticktick",
    source: "antigravity-cli",
    created_at: "2026-09-04T12:15:00.000Z",
    updated_at: "2026-09-04T13:48:00.000Z",
    surface: "cli"
  };

  const events: ExportEvent[] = [
    {
      type: "message",
      role: "user",
      timestamp: "2026-09-04T12:15:04.000Z",
      content: "The OAuth callback stopped working. Find and fix it."
    },
    {
      type: "message",
      role: "assistant",
      timestamp: "2026-09-04T12:15:11.000Z",
      content: "I will inspect the authentication flow first."
    },
    {
      type: "tool_call",
      tool: "view_file",
      timestamp: "2026-09-04T12:15:13.000Z",
      input: { path: "src/auth.ts" }
    },
    {
      type: "tool_result",
      tool: "view_file",
      timestamp: "2026-09-04T12:15:14.000Z",
      content: "export function auth() {}"
    },
    {
      type: "file_change",
      path: "src/auth.ts",
      operation: "modify",
      diff: "@@ -1,1 +1,1 @@\n-export function auth() {}\n+export function auth() { return true; }\n"
    },
    {
      type: "command",
      command: "npm test",
      cwd: "D:\\projects\\ticktick",
      exit_code: 0,
      output: "All tests passed"
    }
  ];

  it("formatJsonl emits valid JSON on each line and begins with session event", () => {
    const jsonl = formatJsonl(session, events);
    assert.ok(jsonl.endsWith("\n"));

    const lines = jsonl.trim().split("\n");
    assert.equal(lines.length, 7);

    // Line 1 is session
    const firstLine = JSON.parse(lines[0]);
    assert.equal(firstLine.schema, "agy-export/v1");
    assert.equal(firstLine.type, "session");
    assert.equal(firstLine.id, session.id);

    // Remaining lines are valid JSON
    for (let i = 1; i < lines.length; i++) {
      const parsed = JSON.parse(lines[i]);
      assert.ok(parsed.type);
    }
  });

  it("formatJson emits valid schema v1 wrapper with session and events array", () => {
    const jsonStr = formatJson(session, events);
    const parsed = JSON.parse(jsonStr);

    assert.equal(parsed.schema, "agy-export/v1");
    assert.equal(parsed.session.id, session.id);
    assert.equal(parsed.events.length, 6);
  });

  it("formatMarkdown emits readable GitHub-flavored markdown sections", () => {
    const md = formatMarkdown(session, events);

    assert.ok(md.includes("# Fix authentication regression"));
    assert.ok(md.includes("**Conversation:** `055a398f-db14-4c5f-abbb-1bf03f8120a7`"));
    assert.ok(md.includes("## User"));
    assert.ok(md.includes("The OAuth callback stopped working"));
    assert.ok(md.includes("## Assistant"));
    assert.ok(md.includes("### Tool — view_file"));
    assert.ok(md.includes("### File change (modify) — src/auth.ts"));
    assert.ok(md.includes("```diff"));
    assert.ok(md.includes("### Command"));
    assert.ok(md.includes("npm test"));
  });
});
