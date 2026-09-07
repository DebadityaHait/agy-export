# agy-export

> **Export a single Antigravity conversation. Cleanly.**  
> **One conversation in. One clean file out.**

`agy-export` exports exactly one Google Antigravity conversation into a clean, deterministic, portable file formatted in JSONL, JSON, or Markdown.

```bash
npx agy-export
```

```text
  Antigravity conversations
  D:\projects\ticktick

  Search: _

> Fix authentication regression              18m ago
  Implement account synchronization           1d ago
  Debug Windows path handling                 4d ago
  Initial patcher implementation              8d ago

  4 conversations

  ↑↓ navigate   type search   enter export   esc quit
```

After selection:

```text
✓ Exported

  fix-authentication-regression--055a398f.jsonl

  47 messages
  31 tool calls
  7 files changed
  284 KB
```

---

## Why agy-export?

### The Problem

Antigravity conversations are not exposed through a developer-friendly single-session export workflow. Existing tools either export hundreds of poorly named dumps or require heavyweight management dashboards.

#### Before
```text
conversations_export.json
export_report.txt
_unindexed_ 0a7d0c30___.md
_unindexed_ 118efef8___.md
_unindexed_ 17587f6d___.md
...
```

#### After
```bash
npx agy-export --latest
```
```text
✓ fix-authentication-regression--055a398f.jsonl
```

---

## Key Features

- **Single Session Focus**: One conversation in, one clean file out.
- **Workspace Scoped**: By default, only conversations associated with your current project (`process.cwd()`) are shown.
- **Deterministic File Naming**: Files are named `<title-slug>--<first-8-id>.<ext>`.
- **Privacy & Safety First**:
  - Excludes internal model reasoning, hidden scratchpads, and privileged prompts.
  - Zero telemetry, zero analytics, zero cloud uploads. Extraction happens entirely on loopback localhost.
  - `--redact` sanitizes API keys, private keys, AWS credentials, and bearer tokens.
  - `--redact-paths` strips workspace and home directory paths.
- **Cross-Agent Context**: Perfect for piping context into OpenAI Codex, Claude Code, Gemini CLI, or custom tooling using `--mode compact`.
- **Unix Composability**: `--stdout` writes pure data with no banners or ANSI color codes, directing diagnostics to stderr.
- **First-Class Windows Support**: Fully tested on Windows, PowerShell, macOS, Linux, and WSL.

---

## Usage

### Interactive Selection
Select interactively from conversations in the current directory:
```bash
npx agy-export
```

Search across all workspaces:
```bash
npx agy-export --all
```

### Export Latest Conversation
Export the most recent conversation in the current workspace without prompting:
```bash
npx agy-export --latest
```

### Export by ID or Prefix
Export using a full UUID or unique prefix:
```bash
npx agy-export 055a398f
```

### Provide Context to Another Agent
```bash
agy-export --latest --mode compact --stdout > context.jsonl
```
The resulting `context.jsonl` contains high-signal chronological messages, tools, and code diffs with noise (such as multi-megabyte directory listings or build outputs) deterministically reduced.

### Output Formats

- **JSONL (default)**: Streamable, canonical event log (`schema: "agy-export/v1"`).
- **JSON**: Structured single-file JSON object (`--format json`).
- **Markdown**: GitHub-flavored markdown transcript with code blocks and diffs (`--format md`).

```bash
agy-export --latest --format md
```

### List Conversations
```bash
agy-export --list
agy-export --list --json
```

### Diagnostic Check
Check Antigravity stores and daemon connectivity:
```bash
agy-export --doctor
```

---

## CLI Options

```text
agy-export [conversation-id]

Options:
  --latest                        Export the newest conversation in workspace
  --all                           Search/list across all workspaces
  --cwd <path>                    Target workspace directory (default: process.cwd())
  --surface <cli|ide|all>         Filter by surface (default: all)

  --format <jsonl|json|md>        Output format (default: jsonl)
  --mode <full|compact|messages>  Export mode (default: full)

  --output <path>                 Explicit output file path
  --stdout                        Print export content directly to stdout
  --force                         Overwrite target file if it already exists

  --redact                        Redact detected credentials and secrets
  --redact-paths                  Replace workspace and home paths with placeholders

  --include-tools                 Include tool calls and results (default)
  --exclude-tools                 Exclude tool calls and results
  --include-diffs                 Include file diffs (default)
  --exclude-diffs                 Exclude diff bodies

  --list                          List available conversations
  --json                          Output machine-readable JSON (with --list)

  --source <auto|daemon|sidecar>  Preferred transcript source (default: auto)
  --data-dir <path>               Override Antigravity data directory
  --max-tool-output <bytes>       Max bytes per large tool output in compact mode

  --doctor                        Diagnose stores and daemon availability
  --debug                         Enable verbose diagnostic output
  -V, --version                   Show version
  -h, --help                      Show help
```

---

## Programmatic API

`agy-export` exports a clean TypeScript library for scripting and integrations:

```ts
import { listConversations, exportConversation, readConversation } from "agy-export";

// 1. List conversations for the current workspace
const conversations = await listConversations({ cwd: process.cwd() });

// 2. Export a specific conversation
const result = await exportConversation({
  id: conversations[0].id,
  format: "jsonl",
  mode: "compact"
});
console.log(`Exported to ${result.outputPath}`);

// 3. Stream conversation events asynchronously
for await (const event of readConversation(conversations[0].id)) {
  if (event.type === "message") {
    console.log(`[${event.role}]: ${event.content}`);
  }
}
```

---

## Safety & Privacy

- **Read-Only**: `agy-export` is strictly read-only. It never modifies Antigravity conversations, SQLite databases, indexes, project state, or session pointers.
- **Localhost Only**: Extraction communicates exclusively with the local Antigravity daemon over loopback localhost (`127.0.0.1`). No network or cloud requests are made.
- **Encrypted at Rest**: Antigravity encrypts conversation contents at rest. Readable transcript extraction uses the running local Antigravity daemon or compatible sidecars. If offline and encrypted, `agy-export` provides clear, actionable instructions without guessing or modifying files.

---

## Exit Codes

| Code | Meaning |
|---|---|
| `0` | Success / Normal user exit |
| `1` | Unexpected application error |
| `2` | Invalid arguments / Ambiguous ID prefix |
| `3` | Conversation not found |
| `4` | Transcript source unavailable (encrypted at rest / daemon not running) |
| `5` | Unsupported source or schema |
| `6` | Output filesystem error (destination exists without `--force`) |

---

## Legal & Branding

`agy-export` is an independent open-source project and is not affiliated with, endorsed by, or sponsored by Google.

---

## License

MIT © [agy-export contributors](LICENSE)
