# PRD — `agy-export`

## Export a Single Google Antigravity Conversation Cleanly

**Status:** Ready for implementation  
**Working npm package:** `agy-export`  
**Primary binary:** `agy-export`  
**Language:** TypeScript  
**Runtime:** Node.js 22+  
**Platforms:** Windows, macOS, Linux, WSL  
**License:** MIT  
**Initial version:** `0.1.0`

---

# 1. Execution Directive for Codex

Implement this PRD as a complete, production-quality npm CLI package.

Do not stop after writing a plan, architecture proposal, or prototype.

Create:

- complete source code
- automated tests
- realistic fixtures
- CLI UX
- build tooling
- linting/typechecking
- GitHub Actions
- README
- LICENSE
- SECURITY.md
- CONTRIBUTING.md
- CHANGELOG.md
- npm package metadata
- packed-package smoke tests

Do not automatically publish the package to npm.

Before considering the task complete, all of these must succeed:

```bash
npm install
npm run typecheck
npm run lint
npm test
npm run build
npm pack
```

The packed tarball must also be installed into a temporary project and the binary must execute successfully.

No required functionality may remain as a TODO.

---

# 2. Product Summary

`agy-export` exports exactly one Google Antigravity conversation into a clean, deterministic, portable file.

Primary use cases:

1. Export one useful Antigravity coding session.
2. Read a conversation outside Antigravity.
3. Give conversation context to Codex, Claude Code, Gemini CLI, or another coding agent.
4. Pipe conversation data into scripts or other developer tools.
5. Archive one specific session without bulk-export clutter.

The product intentionally does **not** try to become:

- a conversation dashboard
- a backup manager
- a cloud synchronization service
- an Antigravity replacement
- a recovery suite
- an account manager
- a generic agent orchestrator

The core promise is:

> **One conversation in. One clean file out.**

---

# 3. User Problem

Antigravity conversations are not exposed through a simple developer-friendly single-session export workflow.

Existing tools tend toward one of two extremes:

### Bulk history/recovery

They export large numbers of conversations into directories containing poorly named or incomplete files.

### Full management suites

They combine export with dashboards, backup, synchronization, quota management, profiles, and unrelated functionality.

Neither optimizes for:

> I have one useful Antigravity conversation.  
> Give me one clean file.

`agy-export` solves exactly that.

---

# 4. Product Principle

The ideal workflow is:

```bash
cd my-project
npx agy-export
```

Select:

```text
> Fix authentication regression
```

Receive:

```text
fix-authentication-regression--055a398f.jsonl
```

Done.

---

# 5. Primary UX

Running:

```bash
agy-export
```

from:

```text
D:\projects\ticktick
```

should produce:

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

Nothing else should be created.

---

# 6. Default Behavior

The default command:

```bash
agy-export
```

must:

1. Determine `process.cwd()`.
2. Discover Antigravity conversations associated with that exact workspace.
3. Sort matching conversations newest-first.
4. Show an interactive searchable picker.
5. Retrieve the selected conversation.
6. Normalize it into the package's public event schema.
7. Exclude hidden/internal reasoning.
8. Export one JSONL file into the current directory.
9. Print the output path and concise statistics.

Default format:

```text
JSONL
```

Default mode:

```text
full
```

The default export must preserve the user-visible conversation faithfully rather than silently compacting it.

---

# 7. CLI Surface

Implement:

```text
agy-export [conversation-id]

Options:
  --latest
  --all
  --cwd <path>
  --surface <cli|ide|all>

  --format <jsonl|json|md>
  --mode <full|compact|messages>

  --output <path>
  --stdout
  --force

  --redact
  --redact-paths

  --include-tools
  --exclude-tools
  --include-diffs
  --exclude-diffs

  --list
  --json

  --source <auto|daemon|sidecar>
  --data-dir <path>

  --doctor
  --debug
  --version
  --help
```

Exact option naming may be adjusted slightly if the chosen argument library makes another shape materially cleaner.

Do not unnecessarily expand the CLI surface.

---

# 8. Conversation Selection

Support four primary selection mechanisms.

## Interactive

```bash
agy-export
```

## Latest conversation in current workspace

```bash
agy-export --latest
```

## Explicit ID

```bash
agy-export 055a398f-db14-4c5f-abbb-1bf03f8120a7
```

## Search interactively across all workspaces

```bash
agy-export --all
```

Conversation IDs should accept a unique prefix where safe:

```bash
agy-export 055a398f
```

If multiple conversations match the prefix, fail with a helpful ambiguity message.

Never guess.

---

# 9. Workspace Scoping

Default scope:

```text
exact current working directory
```

If launched from:

```text
D:\projects\ticktick
```

only conversations associated with:

```text
D:\projects\ticktick
```

should appear by default.

Use:

```bash
agy-export --all
```

to search across all available workspaces.

Support:

```bash
agy-export --cwd ../another-project
```

for explicit workspace selection.

Path comparison must be cross-platform and correctly normalized.

---

# 10. Primary Output Format — JSONL

JSONL is the canonical public interchange format.

Example:

```json
{"schema":"agy-export/v1","type":"session","id":"055a398f-db14-4c5f-abbb-1bf03f8120a7","title":"Fix authentication regression","workspace":"D:\\projects\\ticktick","created_at":"2026-09-04T12:15:00.000Z","updated_at":"2026-09-04T13:48:00.000Z","source":"antigravity-cli"}
{"type":"message","role":"user","timestamp":"2026-09-04T12:15:04.000Z","content":"The OAuth callback stopped working. Find and fix it."}
{"type":"message","role":"assistant","timestamp":"2026-09-04T12:15:11.000Z","content":"I'll inspect the authentication flow first."}
{"type":"tool_call","tool":"view_file","timestamp":"2026-09-04T12:15:13.000Z","input":{"path":"src/auth.ts"}}
{"type":"tool_result","tool":"view_file","timestamp":"2026-09-04T12:15:14.000Z","content":"..."}
{"type":"file_change","path":"src/auth.ts","operation":"modify","diff":"@@ ..."}
{"type":"command","command":"npm test","cwd":"D:\\projects\\ticktick","exit_code":0}
{"type":"message","role":"assistant","timestamp":"2026-09-04T13:48:00.000Z","content":"The callback issue is fixed and the test suite passes."}
```

One JSON object per line.

JSONL output must be streamable.

---

# 11. Public JSONL Schema

Create a versioned public schema.

Current schema identifier:

```text
agy-export/v1
```

Supported normalized event types should include:

```ts
SessionEvent
MessageEvent
ToolCallEvent
ToolResultEvent
CommandEvent
FileChangeEvent
ArtifactEvent
WarningEvent
```

Do not expose Antigravity's undocumented raw internal structures as the public API.

The package owns the normalization layer.

This is essential for forward compatibility.

---

# 12. Session Event

Example:

```json
{
  "schema": "agy-export/v1",
  "type": "session",
  "id": "055a398f-db14-4c5f-abbb-1bf03f8120a7",
  "title": "Fix authentication regression",
  "workspace": "D:\\projects\\ticktick",
  "source": "antigravity-cli",
  "created_at": "2026-09-04T12:15:00.000Z",
  "updated_at": "2026-09-04T13:48:00.000Z"
}
```

Optional metadata may include:

```text
project_id
parent_session_id
step_count
model
surface
```

Unknown or unavailable metadata should be omitted rather than fabricated.

Never emit fake values such as:

```json
{"created_at":"unknown"}
```

Prefer absence.

---

# 13. Message Events

Supported roles:

```text
user
assistant
system_visible
```

Do not export hidden system prompts unless they were explicitly visible to the user.

Do not export hidden internal reasoning.

Do not export chain-of-thought fields simply because they happen to exist inside an underlying trajectory object.

---

# 14. Tool Events

Normalized example:

```json
{
  "type": "tool_call",
  "tool": "run_command",
  "timestamp": "...",
  "input": {
    "command": "npm test"
  }
}
```

and:

```json
{
  "type": "tool_result",
  "tool": "run_command",
  "timestamp": "...",
  "exit_code": 0,
  "content": "184 tests passed"
}
```

Do not expose unrelated daemon protocol metadata.

---

# 15. File Changes

Where Antigravity exposes structured code actions or diffs, normalize them into:

```json
{
  "type": "file_change",
  "path": "src/auth.ts",
  "operation": "modify",
  "diff": "@@ ..."
}
```

Supported operations:

```text
create
modify
delete
rename
unknown
```

Do not reconstruct diffs by reading the user's current filesystem unless explicitly necessary and guaranteed correct.

Prefer session-recorded information.

---

# 16. Command Events

Where detectable:

```json
{
  "type": "command",
  "command": "npm test",
  "cwd": "D:\\projects\\ticktick",
  "exit_code": 0,
  "output": "..."
}
```

Do not execute anything during export.

This is historical information only.

---

# 17. Export Modes

Implement three modes.

## `full`

Default.

Purpose:

> Preserve as much user-visible session information as reasonably possible.

Include:

- user messages
- visible assistant responses
- visible tool calls
- visible tool results
- commands
- command outcomes
- file changes
- diffs
- artifacts

Do not intentionally truncate normal user-visible event payloads except where an explicit safety or implementation limit is documented.

Still exclude hidden reasoning and internal protocol data.

---

## `compact`

Purpose:

> Produce a smaller, high-signal export suitable for providing as context to another coding agent.

Include:

- user messages
- visible assistant responses
- important commands
- command outcomes
- file changes
- diffs
- concise tool activity
- errors
- relevant visible tool results

Reduce noise from:

- huge directory listings
- repetitive file reads
- giant successful build output
- duplicate status updates
- low-value metadata

Do not use an LLM to summarize.

All reductions must be deterministic.

If content is reduced or truncated, emit explicit metadata.

---

## `messages`

Purpose:

> Produce a conversational transcript only.

Include:

```text
user messages
assistant messages
visible system notices where appropriate
```

Useful for:

```bash
agy-export --latest --mode messages
```

---

# 18. Markdown Output

Support:

```bash
agy-export --latest --format md
```

Example:

```markdown
# Fix authentication regression

**Conversation:** `055a398f...`
**Workspace:** `D:\projects\ticktick`
**Last active:** September 4, 2026

---

## User

The OAuth callback stopped working. Find and fix it.

## Assistant

I'll inspect the authentication flow first.

### Tool — view_file

`src/auth.ts`

### File change — src/auth.ts

```diff
...
```

### Command

```bash
npm test
```

Exit code: `0`

## Assistant

The callback issue is fixed and the test suite passes.
```

Markdown must be deterministic and readable on GitHub.

---

# 19. JSON Output

Support:

```bash
agy-export --latest --format json
```

Return:

```json
{
  "schema": "agy-export/v1",
  "session": {},
  "events": []
}
```

Use the same normalized event objects as JSONL.

JSON is convenience output.

JSONL remains canonical.

---

# 20. Stdout Mode

Support Unix-style composition:

```bash
agy-export --latest --stdout
```

and:

```bash
agy-export <id> --stdout > conversation.jsonl
```

Requirements:

- stdout contains artifact content only
- diagnostics go to stderr
- no spinner on stdout
- no ANSI codes
- no success banner on stdout

This must work correctly from PowerShell as well.

---

# 21. Deterministic File Naming

Default filename:

```text
<title-slug>--<first-8-id>.<extension>
```

Example:

```text
fix-authentication-regression--055a398f.jsonl
```

Rules:

- lowercase
- filesystem-safe
- remove invalid Windows filename characters
- collapse whitespace
- trim trailing periods/spaces
- max reasonable filename length
- preserve full ID inside file metadata
- avoid collisions

If title is unavailable:

```text
conversation--055a398f.jsonl
```

Never produce names such as:

```text
_unindexed_ 055a398f___.md
```

---

# 22. Existing Output Files

Do not silently overwrite files.

If:

```text
fix-authentication-regression--055a398f.jsonl
```

already exists, default behavior should produce:

```text
fix-authentication-regression--055a398f-2.jsonl
```

Explicit:

```bash
--output foo.jsonl
```

should fail if the target exists unless:

```bash
--force
```

is supplied.

---

# 23. Cross-Agent Context Is a Use Case, Not the Product Identity

The canonical export should be straightforward for:

- OpenAI Codex
- Claude Code
- Gemini CLI
- other coding agents
- custom automation

Do not encode target-agent-specific syntax into the canonical JSONL format.

The package is an exporter first.

Cross-agent reuse is simply one valuable use case.

Do not implement target-specific `--for codex` or `--for claude` behavior in v1.

---

# 24. Conversation Discovery Architecture

Conversation listing must be abstracted separately from transcript extraction.

Conceptual interfaces:

```ts
interface ConversationIndex {
  list(options: ListOptions): Promise<ConversationSummary[]>;
}

interface TranscriptSource {
  canRead(session: ConversationSummary): Promise<boolean>;

  read(
    session: ConversationSummary
  ): AsyncIterable<RawConversationEvent>;
}
```

Then:

```ts
interface Normalizer {
  normalize(
    source: AsyncIterable<RawConversationEvent>
  ): AsyncIterable<ExportEvent>;
}
```

The rest of the application must not know Antigravity's internal schema.

---

# 25. Source Adapter Strategy

Implement a source abstraction.

Preferred source order:

```text
1. live Antigravity local daemon
2. compatible existing trajectory sidecar
3. unsupported / actionable error
```

Do not directly modify Antigravity's databases.

Do not pretend encrypted conversation storage is readable when it is not.

---

# 26. Live Daemon Source

Preferred extraction method:

```text
Antigravity local daemon
        ↓
decrypted trajectory
        ↓
normalization
        ↓
JSONL
```

The implementation may discover the daemon using Antigravity's local logs/runtime metadata.

Requirements:

- localhost only
- no remote server use
- validate discovered endpoints
- safely handle stale log entries
- verify expected response shape
- time out quickly
- never send conversation content outside localhost

Separate CLI and IDE daemon-discovery logic.

---

# 27. Sidecar Source

Support compatible local trajectory sidecars where available.

Potential pattern:

```text
<conversation-id>.trajectory.json
```

The package must:

- treat sidecars as untrusted data
- validate structure
- never modify them
- clearly report source in `--debug`
- normalize them through the same event pipeline

Do not depend on another tool being installed.

Sidecars are merely an optional source.

---

# 28. Encrypted Offline Storage

Important:

If:

- metadata exists
- the conversation is selected
- transcript bodies are encrypted
- no readable sidecar exists
- no local Antigravity daemon is reachable

do **not** attempt speculative decryption.

Display:

```text
Conversation found, but its transcript is not currently readable.

Antigravity stores this conversation encrypted at rest and no local
Antigravity daemon is available to provide the decrypted trajectory.

Start Antigravity CLI or Antigravity IDE, then retry:

  agy-export 055a398f...

No Antigravity files were modified.
```

Exit with a documented non-zero code.

---

# 29. Never Mutate Sessions to Export Them

Do not use hacks such as:

```text
resume conversation
send a prompt asking it to summarize itself
```

That changes conversation state.

Export must be read-only.

Do not:

- add turns
- rename conversations
- modify indexes
- modify last-conversation pointers
- modify protobuf/database files
- create Antigravity sidecars
- update session timestamps

Package-owned output/cache files are allowed.

---

# 30. CLI and IDE Surfaces

Support:

```bash
--surface cli
--surface ide
--surface all
```

Default:

```text
all available surfaces
```

where practical.

Conversation summaries must identify their source:

```json
{"surface":"cli"}
```

or:

```json
{"surface":"ide"}
```

If duplicate IDs somehow appear across surfaces, disambiguate internally.

---

# 31. Conversation Listing

Support:

```bash
agy-export --list
```

Human output:

```text
ID         TITLE                            WORKSPACE                 UPDATED
055a398f   Fix authentication regression    D:\projects\ticktick      18m
7b413bc1   Implement account sync            D:\projects\ticktick       1d
```

Also:

```bash
agy-export --list --json
```

Output:

```json
[
  {
    "id": "055a398f-db14-4c5f-abbb-1bf03f8120a7",
    "title": "Fix authentication regression",
    "workspace": "D:\\projects\\ticktick",
    "updated_at": "2026-09-04T13:48:00.000Z",
    "surface": "cli"
  }
]
```

This is a scripting feature, not a session-management product.

---

# 32. Interactive Search

The picker must search:

- title
- first user-visible prompt if available
- conversation ID
- workspace when `--all` is active

Search should be:

- case-insensitive
- immediate
- fuzzy or sensible substring matching
- keyboard-driven

Do not require a mouse.

---

# 33. Picker UX

Required keys:

```text
↑ / ↓      navigate
typing     search
Enter      select
Esc        exit
Ctrl+C     exit
```

Optional:

```text
Tab        toggle current workspace/all
```

Keep the interface visually minimal.

No full-screen dashboard.

---

# 34. Path Normalization

Implement a central:

```ts
normalizeWorkspacePath()
```

Windows must correctly handle equivalent forms:

```text
C:\Users\Deba\Project
c:\users\deba\project
C:/Users/Deba/Project
C:\Users\Deba\Project\
```

Test:

- drive letter casing
- slash differences
- trailing separators
- spaces
- Unicode
- UNC paths
- `.` / `..`
- junctions where practical

POSIX paths must not be blindly lowercased.

Use realpath on a best-effort basis.

Realpath failure must not make path matching unusable.

---

# 35. WSL

Treat WSL as Linux.

Do not automatically map:

```text
C:\projects\foo
```

to:

```text
/mnt/c/projects/foo
```

in v1.

Document native Windows and WSL stores as separate environments unless explicitly configured otherwise.

---

# 36. Compact-Mode Reduction Rules

`compact` mode must be deterministic.

No LLM calls.

Examples of allowed reduction:

## Directory listing

Instead of 5,000 entries:

```json
{
  "type": "tool_result",
  "tool": "list_directory",
  "summary": "Directory listing: 5321 entries",
  "truncated": true
}
```

## Build logs

Preserve:

- command
- exit status
- error blocks
- final summary

Drop thousands of repetitive successful lines.

## File reads

Preserve file path and relevant session-recorded content.

Repeated identical reads may be deduplicated if deterministic.

## Search results

Allow truncation with explicit metadata:

```json
{
  "truncated": true,
  "original_bytes": 98421,
  "exported_bytes": 16384
}
```

Never silently truncate.

---

# 37. Size Controls

Support:

```bash
--max-tool-output <bytes>
```

Compact-mode default:

```text
16384
```

per large tool result, or another well-justified value.

`full` mode should not apply this default truncation unless required for safety.

Provide export summary:

```text
Original visible tool output: 6.4 MB
Exported content:             842 KB
Reduction:                    86.8%
```

Only report values that can actually be measured.

---

# 38. Privacy

No network calls are required for normal operation except loopback communication with the local Antigravity daemon.

Requirements:

- zero telemetry
- zero analytics
- zero cloud upload
- no Google authentication interception
- no credential collection
- no transcript upload
- no automatic update check requiring network
- no remote daemon connection by default

README should explicitly state:

> Conversation extraction and export happen locally.

---

# 39. Secrets

Tool results may contain secrets.

Implement:

```bash
--redact
```

When enabled, detect common credential patterns such as:

- GitHub tokens
- common API-key forms
- bearer tokens
- private keys
- AWS access keys
- obvious `.env` secrets
- JWT-like values where appropriate

Replace with:

```text
[REDACTED]
```

Do not claim perfect secret detection.

Default behavior should preserve conversation content unless the user requests redaction.

If obvious credential patterns are detected during a file export, a non-blocking warning may be printed without revealing the secret.

Never print the detected secret itself.

---

# 40. Path Redaction

Support:

```bash
--redact-paths
```

Example:

```text
C:\Users\deba\Projects\foo\src\auth.ts
```

becomes:

```text
<workspace>\src\auth.ts
```

Home-directory paths outside the workspace may become:

```text
<home>\...
```

Useful when sharing exports publicly.

---

# 41. Hidden Reasoning Safety

This is non-negotiable.

Never intentionally export:

- hidden chain-of-thought
- hidden internal reasoning
- privileged system prompts
- internal model scratchpads
- hidden safety instructions

Even if the underlying daemon trajectory contains fields that appear to hold such information.

Create an explicit allowlist of exportable event categories.

Do not implement:

```ts
JSON.stringify(rawTrajectory)
```

as a user-facing export mode.

There should be no `--raw-everything` escape hatch in v1.

---

# 42. Forward Compatibility

Antigravity's internal schemas are undocumented and may change.

Implement source parsing with:

```text
unknown → validate → normalize
```

Never cast arbitrary daemon JSON directly to trusted TypeScript types.

Unknown fields should not break export.

Unknown event types should:

1. be skipped safely where necessary
2. increment a diagnostic counter
3. appear in `--debug`
4. never be blindly serialized

Example:

```text
Exported 143 events.
Skipped 3 unsupported internal event types.

Run with --debug for details.
```

---

# 43. Schema Versioning

The public interchange format belongs to this project, not Antigravity.

Use:

```text
agy-export/v1
```

Breaking changes require:

```text
agy-export/v2
```

Do not change semantics of existing fields in a patch/minor release.

Publish schema documentation in:

```text
docs/schema-v1.md
```

Optionally publish a JSON Schema:

```text
schema/agy-export-v1.schema.json
```

---

# 44. Public TypeScript Library

The npm package should expose a programmatic API in addition to the CLI.

Example:

```ts
import {
  listConversations,
  exportConversation
} from "agy-export";

const sessions = await listConversations({
  cwd: process.cwd()
});

await exportConversation({
  id: sessions[0].id,
  format: "jsonl",
  mode: "full"
});
```

Also expose normalized TypeScript types.

Do not force downstream users to spawn the CLI.

---

# 45. Streaming API

Prefer:

```ts
for await (const event of readConversation(id)) {
  // ...
}
```

over loading giant trajectories into memory.

Architecture should support:

```ts
AsyncIterable<ExportEvent>
```

where practical.

Large sessions may contain thousands of events.

---

# 46. Performance

Targets on normal developer hardware:

Conversation list:

```text
< 300 ms cached
```

Picker interaction:

```text
< 50 ms search response
```

Streaming export should begin writing shortly after transcript retrieval starts.

Do not unnecessarily construct a complete multi-megabyte normalized session in RAM.

JSONL should stream directly to output.

---

# 47. Cache

The package may maintain a metadata-only cache for:

- titles
- workspace mapping
- timestamps
- known source
- source fingerprints

Do not cache complete decrypted transcripts by default.

Cache must:

- live in an OS-appropriate application cache directory
- be disposable
- never be required for correctness
- tolerate corruption
- be rebuildable

Optional:

```bash
--no-cache
--refresh
```

if useful.

---

# 48. Doctor Command

Implement:

```bash
agy-export --doctor
```

Example:

```text
agy-export doctor

Node.js
  ✓ 24.6.0

Platform
  ✓ win32 x64

Antigravity CLI store
  ✓ C:\Users\deba\.gemini\antigravity-cli

Conversation metadata
  ✓ 126 conversations

Current workspace
  ✓ D:\projects\ticktick
  ✓ 7 matching conversations

Antigravity daemon
  ✓ localhost:51342
  ✓ reachable
  ✓ transcript RPC available

IDE store
  not detected

Export capability
  ✓ ready

No problems detected.
```

If the daemon is unavailable:

```text
Antigravity daemon
  ✗ not detected

Conversation metadata can be listed,
but encrypted transcript content cannot currently be retrieved.

Start Antigravity CLI or Antigravity IDE and retry.
```

No stack traces for normal failures.

---

# 49. Debug Mode

```bash
agy-export --debug
```

may display:

- resolved data directories
- conversation metadata source
- daemon endpoints
- selected adapter
- schema fingerprints
- skipped event categories
- timings

Never print:

- auth tokens
- secrets
- CSRF tokens
- entire transcript content
- hidden reasoning

Sanitize debug output.

---

# 50. Source Directory Overrides

Support:

```text
AGY_EXPORT_DATA_DIR
```

and:

```bash
--data-dir <path>
```

This is mandatory for tests.

Precedence:

```text
--data-dir
AGY_EXPORT_DATA_DIR
default discovered location
```

Tests must never touch the real user's:

```text
~/.gemini
```

directory.

---

# 51. Test Architecture

All storage and daemon behavior must be testable using fixtures/fakes.

Create fixtures for:

```text
normal conversation
large conversation
unindexed conversation
conversation missing title
conversation missing timestamps
tool-heavy conversation
file-diff conversation
malformed event
unknown future event
Unicode conversation
Windows paths
POSIX paths
duplicate titles
```

Never require a real Google account for CI.

---

# 52. Fake Daemon

Create a local fake HTTP daemon used by integration tests.

It should simulate:

- healthy trajectory response
- stale endpoint
- invalid response
- unknown schema
- large streaming response
- timeout
- 404
- relevant auth/runtime metadata behavior if needed

Tests must not contact the real Antigravity daemon.

---

# 53. Required Unit Tests

At minimum test:

## Path handling

- Windows case folding
- drive letters
- forward/backslashes
- UNC paths
- trailing separators
- POSIX case sensitivity
- Unicode paths

## Slug generation

- spaces
- punctuation
- emojis
- Windows reserved characters
- long titles
- missing title
- collision handling

## JSONL serialization

- one object per line
- valid UTF-8
- deterministic field structure
- newline termination

## Event normalization

- user messages
- assistant messages
- tool calls
- results
- commands
- diffs
- unknown event handling

## Compact reductions

- long output truncation
- duplicate reads
- failure preservation
- explicit truncation metadata

## Redaction

- tokens
- private keys
- common API keys
- false-positive sanity tests

---

# 54. Required Integration Tests

Verify:

```bash
agy-export --list --json
agy-export <id> --stdout
agy-export <id> --format json
agy-export <id> --format md
agy-export <id> --mode full
agy-export <id> --mode compact
agy-export <id> --mode messages
agy-export --latest
agy-export --doctor
```

using only fixtures and the fake daemon.

---

# 55. Windows Testing

Windows is first-class.

CI must explicitly test:

```text
PowerShell
Windows path normalization
Windows filenames
npm-generated .cmd shim
stdout redirection
Unicode
spaces in paths
```

Example smoke test:

```powershell
agy-export session-123 --stdout > export.jsonl
```

must produce valid JSONL.

---

# 56. CI Matrix

GitHub Actions:

```text
ubuntu-latest
  Node 22
  Node 24

windows-latest
  Node 22
  Node 24

macos-latest
  Node 22
  Node 24
```

Steps:

1. checkout
2. npm install / npm ci
3. typecheck
4. lint
5. tests
6. build
7. npm pack
8. install tarball into temporary directory
9. run binary
10. validate exported fixture output

Windows jobs are not optional.

---

# 57. Suggested Package Structure

```text
agy-export/
├── src/
│   ├── cli/
│   │   ├── index.ts
│   │   ├── picker.ts
│   │   └── doctor.ts
│   │
│   ├── sources/
│   │   ├── index.ts
│   │   ├── daemon/
│   │   │   ├── cli.ts
│   │   │   ├── ide.ts
│   │   │   ├── discovery.ts
│   │   │   └── client.ts
│   │   └── sidecar/
│   │       └── index.ts
│   │
│   ├── sessions/
│   │   ├── discovery.ts
│   │   ├── model.ts
│   │   └── paths.ts
│   │
│   ├── normalization/
│   │   ├── normalize.ts
│   │   ├── messages.ts
│   │   ├── tools.ts
│   │   ├── commands.ts
│   │   └── diffs.ts
│   │
│   ├── export/
│   │   ├── jsonl.ts
│   │   ├── json.ts
│   │   └── markdown.ts
│   │
│   ├── compact/
│   │   ├── reduce.ts
│   │   └── limits.ts
│   │
│   ├── privacy/
│   │   ├── redact.ts
│   │   └── paths.ts
│   │
│   ├── schema/
│   │   └── v1.ts
│   │
│   └── index.ts
│
├── schema/
│   └── agy-export-v1.schema.json
│
├── docs/
│   └── schema-v1.md
│
├── test/
│   ├── fixtures/
│   ├── unit/
│   ├── integration/
│   └── fake-daemon/
│
├── .github/workflows/
│   ├── ci.yml
│   └── release.yml
│
├── package.json
├── tsconfig.json
├── README.md
├── CONTRIBUTING.md
├── SECURITY.md
├── CHANGELOG.md
└── LICENSE
```

Adjust if a cleaner architecture emerges.

---

# 58. Runtime Dependencies

Keep dependencies minimal.

Reasonable categories:

- CLI argument parser
- interactive select/search
- terminal formatting
- safe filesystem helpers if necessary

Prefer Node built-ins for:

- HTTP
- streaming
- filesystem access
- paths
- process handling

Avoid:

- Electron
- databases
- ORMs
- web servers
- native addons
- postinstall compilation
- telemetry SDKs
- giant TUI frameworks unless clearly justified

---

# 59. TypeScript Quality

Enable strict TypeScript.

Antigravity responses are:

```ts
unknown
```

until validated.

Do not scatter:

```ts
any
```

through source adapters.

Use runtime type guards or a lightweight schema validator where appropriate.

Normalized public types must be explicit and documented.

---

# 60. Package Binary

Package:

```json
{
  "bin": {
    "agy-export": "./dist/cli.js"
  }
}
```

Ensure Unix shebang behavior is correct.

Ensure npm-generated Windows command shims work.

Prefer ESM unless a concrete compatibility issue makes CommonJS materially better.

---

# 61. README Positioning

Top of README:

```text
# agy-export

Export one Google Antigravity conversation cleanly.

One conversation in. One clean file out.
```

Then immediately show:

```bash
npx agy-export
```

followed by a terminal GIF or screenshot.

Do not begin with architecture.

---

# 62. README Before/After

Show the pain visually.

## Before

```text
conversations_export.json
export_report.txt
_unindexed_ 0a7d0c30___.md
_unindexed_ 118efef8___.md
_unindexed_ 17587f6d___.md
...
```

## After

```bash
npx agy-export --latest
```

```text
✓ fix-authentication-regression--055a398f.jsonl
```

This should be the product story.

---

# 63. README Cross-Agent Example

Include:

```bash
agy-export --latest --mode compact --stdout > context.jsonl
```

Then explain:

```text
context.jsonl can be attached or provided to another coding agent.
```

Do not claim automatic import support where no supported import mechanism exists.

---

# 64. README Safety Section

Clearly state:

```text
agy-export is read-only.

It does not modify Antigravity conversations,
indexes, project state, or session pointers.
```

Also explain that readable transcript extraction may require a running local Antigravity daemon because conversation contents may be encrypted at rest.

---

# 65. Branding

This is unofficial software.

Include:

> `agy-export` is an independent open-source project and is not affiliated with, endorsed by, or sponsored by Google.

Do not use Google logos.

Do not imply that the package is an official Antigravity component.

---

# 66. Exit Codes

Suggested:

```text
0  success / normal user exit
1  unexpected application error
2  invalid arguments
3  conversation not found
4  transcript source unavailable
5  unsupported source/schema
6  output filesystem error
```

Document them.

Ctrl+C and Esc should exit cleanly.

---

# 67. Non-Interactive Behavior

When stdout is not a TTY:

Do not launch the picker.

Require deterministic selection such as:

```bash
agy-export <id> --stdout
```

or:

```bash
agy-export --latest --stdout
```

If selection is ambiguous, fail clearly.

---

# 68. No-Conversation State

Example:

```text
No Antigravity conversations were found for:

  D:\projects\new-project

Try:

  agy-export --all
```

Do not automatically start Antigravity.

---

# 69. Missing Daemon State

Listing should still work where metadata is available.

Export should fail gracefully if readable content cannot be obtained.

Example:

```text
Found:
  Fix authentication regression
  055a398f...

But its transcript is currently encrypted and no readable
local source is available.

Start Antigravity and retry.

No files were modified.
```

---

# 70. Compatibility Tracking

Add:

```text
COMPATIBILITY.md
```

Track tested Antigravity versions.

Example:

```text
Antigravity CLI | Status | Source adapter
1.1.26          | ✓      | daemon
...
```

Implement a fixture/schema fingerprint mechanism where useful.

If source shape changes unexpectedly:

```text
Antigravity's transcript format appears to have changed.

agy-export refused to guess.

Run:
  agy-export --doctor --debug
```

---

# 71. No Silent Schema Guessing

If an event could plausibly be either:

```text
visible assistant output
```

or:

```text
hidden model reasoning
```

skip it until positively classified.

Privacy beats completeness.

---

# 72. Explicit Non-Goals for v1

Do not implement:

- conversation deletion
- conversation renaming
- conversation recovery
- bulk history export as the default workflow
- global backup
- cloud sync
- Google Drive
- session editing
- account switching
- quota monitoring
- Antigravity authentication
- transcript decryption reverse engineering
- remote transcript upload
- hosted sharing links
- web dashboard
- semantic search
- session analytics dashboard
- agent orchestration
- automatic Claude/Codex import
- hidden reasoning extraction
- target-agent-specific prompt generation
- handoff bundles unless explicitly added later

Keep the product narrow.

---

# 73. Future Possibilities

Architect for, but do not necessarily implement:

```text
agy-export diff ...
agy-export audit ...
```

Potential future packages may reuse the core:

```text
@agy-tools/sessions
agy-audit
agy-export
```

Do not prematurely turn v1 into a monorepo unless code reuse already justifies it.

---

# 74. Acceptance Criteria — Selection

## AC-1

Given three conversations belonging to the current workspace and seven belonging elsewhere:

```bash
agy-export
```

shows only the three current-workspace conversations.

## AC-2

```bash
agy-export --all
```

shows all ten.

## AC-3

```bash
agy-export --latest
```

selects the newest matching current-workspace conversation without opening the picker.

## AC-4

A full or unique-prefix ID selects the correct conversation deterministically.

---

# 75. Acceptance Criteria — Export

## AC-5

Selecting one conversation creates exactly one file by default.

## AC-6

The default file is valid JSONL.

Every non-empty line parses independently using:

```ts
JSON.parse(line)
```

## AC-7

The first event identifies:

```text
agy-export/v1
```

and the conversation ID.

## AC-8

No hidden reasoning is present.

## AC-9

The output filename is deterministic, readable, and valid on Windows/macOS/Linux.

---

# 76. Acceptance Criteria — Full Mode

## AC-10

Default `full` mode preserves all recognized user-visible messages and recognized visible tool activity.

## AC-11

It does not silently apply compact-mode reductions.

## AC-12

Unknown internal/private events are skipped rather than guessed.

---

# 77. Acceptance Criteria — Compact Mode

## AC-13

Large repetitive tool output is reduced deterministically.

## AC-14

All truncation is explicitly indicated.

## AC-15

Failures and important error messages are preserved.

## AC-16

File changes and command outcomes remain visible where present.

## AC-17

No model/API call is used to summarize content.

---

# 78. Acceptance Criteria — Stdout

## AC-18

This:

```bash
agy-export <id> --stdout > conversation.jsonl
```

produces valid JSONL with zero banners, ANSI codes, or diagnostics in stdout.

## AC-19

All diagnostics go to stderr.

---

# 79. Acceptance Criteria — Read-Only Safety

## AC-20

Before/after hashes of fixture Antigravity storage are identical after:

```text
list
pick
export
doctor
```

operations.

## AC-21

The package never writes into Antigravity's own data directories.

---

# 80. Acceptance Criteria — Cross-Platform

## AC-22

Package passes CI on:

```text
Windows
macOS
Linux
```

## AC-23

PowerShell redirection produces valid UTF-8 output.

## AC-24

Paths containing spaces and Unicode work correctly.

---

# 81. Acceptance Criteria — Failure Modes

## AC-25

Unreadable encrypted conversation + no daemon results in an actionable error, not a crash.

## AC-26

Malformed individual events do not corrupt the entire export.

## AC-27

Unknown future schema produces diagnostics rather than fabricated output.

## AC-28

A stale discovered daemon port is skipped safely.

---

# 82. Acceptance Criteria — Distribution

The project is not complete until:

```bash
npm ci
npm run typecheck
npm run lint
npm test
npm run build
npm pack
```

all succeed.

Then install the generated tarball into a clean temporary directory and verify:

```bash
agy-export --help
agy-export --version
```

work.

---

# 83. Implementation Order

## Phase 1 — Core model

Implement:

- CLI
- normalized schema
- path normalization
- conversation summary model
- serialization

## Phase 2 — Discovery

Implement:

- CLI metadata discovery
- workspace mapping
- conversation listing
- picker
- `--latest`

## Phase 3 — Transcript retrieval

Implement:

- daemon discovery
- daemon client
- response validation
- streaming/raw-event adapter
- sidecar fallback

## Phase 4 — Normalization

Implement:

- messages
- tools
- commands
- diffs
- allowlisted visible event handling

## Phase 5 — Export

Implement:

- JSONL
- JSON
- Markdown
- deterministic filenames
- stdout

## Phase 6 — Compact mode

Implement:

- deterministic noise reduction
- truncation metadata
- output statistics

## Phase 7 — Privacy

Implement:

- `--redact`
- `--redact-paths`
- secret-pattern tests
- debug sanitization

## Phase 8 — Polish

Implement:

- doctor
- error UX
- cache
- compatibility tracking
- README

## Phase 9 — Distribution

Implement:

- GitHub Actions matrix
- npm pack smoke test
- release workflow
- package metadata

---

# 84. Definition of Done

This exact Windows workflow must work:

```powershell
PS D:\k0de2\rpb> npx agy-export
```

User sees:

```text
Antigravity conversations
D:\k0de2\rpb

> Fix parser regression                18m
  Implement new serializer              1d
  Investigate Windows paths             4d
```

User selects:

```text
Fix parser regression
```

and receives:

```text
fix-parser-regression--055a398f.jsonl
```

with:

- exactly one conversation
- clean metadata
- chronological messages
- relevant visible tools
- command results
- recorded diffs
- no hidden reasoning
- no random additional export files
- no modification to Antigravity
- no cloud upload

The equivalent workflow must work on macOS and Linux.

---

# 85. Product Tagline

Primary:

> **Export a single Antigravity conversation. Cleanly.**

Secondary:

> **One conversation in. One clean file out.**

Technical:

> **Export Google Antigravity sessions to clean JSONL, JSON, or Markdown.**

---

# 86. Final Engineering Principle

When forced to choose between:

```text
more raw Antigravity internals
```

and:

```text
a smaller stable public format
```

choose the stable public format.

When forced to choose between:

```text
guessing at encrypted/internal data
```

and:

```text
failing safely with an actionable message
```

fail safely.

When forced to choose between:

```text
adding another feature
```

and:

```text
making "one conversation → one file" flawless
```

make the core workflow flawless.
