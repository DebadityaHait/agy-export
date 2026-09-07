# agy-export v1 Schema Specification

`agy-export/v1` is the canonical, versioned public event format for Google Antigravity single-session exports.

## Design Principles

1. **One JSON object per line**: JSONL is streamable and newline-delimited.
2. **Versioned header**: The very first line of every JSONL export is a `SessionEvent` identifying `{"schema": "agy-export/v1", ...}`.
3. **Chronological order**: Events are ordered in the progression of the conversation.
4. **Privacy-first allowlist**: Only explicitly allowlisted user-visible events are exported. Internal model reasoning, hidden scratchpads, and privileged system prompts are excluded.
5. **No fake metadata**: Missing fields are omitted rather than fabricated with `"unknown"`.

---

## Event Types

### 1. `session` (Header)
Emitted once as the first event.

```json
{
  "schema": "agy-export/v1",
  "type": "session",
  "id": "055a398f-db14-4c5f-abbb-1bf03f8120a7",
  "title": "Fix authentication regression",
  "workspace": "D:\\projects\\ticktick",
  "source": "antigravity-cli",
  "created_at": "2026-09-04T12:15:00.000Z",
  "updated_at": "2026-09-04T13:48:00.000Z",
  "surface": "cli"
}
```

### 2. `message`
User, assistant, or visible system notice.

```json
{
  "type": "message",
  "role": "user",
  "timestamp": "2026-09-04T12:15:04.000Z",
  "content": "The OAuth callback stopped working. Find and fix it."
}
```

### 3. `tool_call`
Visible tool invocation initiated by the assistant.

```json
{
  "type": "tool_call",
  "tool": "view_file",
  "timestamp": "2026-09-04T12:15:13.000Z",
  "input": {
    "path": "src/auth.ts"
  }
}
```

### 4. `tool_result`
Result returned from a tool execution.

```json
{
  "type": "tool_result",
  "tool": "view_file",
  "timestamp": "2026-09-04T12:15:14.000Z",
  "content": "export function authenticate() { ... }",
  "exit_code": 0
}
```

In compact mode, large outputs may include truncation metadata:

```json
{
  "type": "tool_result",
  "tool": "run_command",
  "summary": "Directory listing: 5321 entries",
  "truncated": true,
  "original_bytes": 98421,
  "exported_bytes": 16384
}
```

### 5. `command`
Terminal command execution.

```json
{
  "type": "command",
  "command": "npm test",
  "cwd": "D:\\projects\\ticktick",
  "exit_code": 0,
  "output": "184 tests passed",
  "timestamp": "2026-09-04T12:16:00.000Z"
}
```

### 6. `file_change`
File modification, creation, or deletion.

```json
{
  "type": "file_change",
  "path": "src/auth.ts",
  "operation": "modify",
  "diff": "@@ -10,3 +10,4 @@\n-const token = null;\n+const token = getToken();\n",
  "timestamp": "2026-09-04T12:17:00.000Z"
}
```

### 7. `artifact`
Exported user-visible artifact.

```json
{
  "type": "artifact",
  "identifier": "plan_spec",
  "title": "Implementation Plan",
  "content": "# Plan...",
  "timestamp": "2026-09-04T12:18:00.000Z"
}
```

### 8. `warning`
Exporter non-blocking notification or redaction alert.

```json
{
  "type": "warning",
  "message": "Potential API credential detected and redacted",
  "timestamp": "2026-09-04T12:19:00.000Z"
}
```
