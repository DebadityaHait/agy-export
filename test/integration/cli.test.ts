import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { FakeDaemon } from "../fake-daemon/index.js";
import { createFixtureEnvironment, FixtureEnvironment } from "../fixtures/index.js";

const execFileAsync = promisify(execFile);
const CLI_PATH = path.resolve("dist/cli/index.js");

function computeDirHash(dirPath: string): Map<string, string> {
  const hashes = new Map<string, string>();
  if (!fs.existsSync(dirPath)) return hashes;

  function walk(current: string) {
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const ent of entries) {
      const full = path.join(current, ent.name);
      if (ent.isDirectory()) {
        walk(full);
      } else if (ent.isFile()) {
        const content = fs.readFileSync(full);
        const hash = crypto.createHash("sha256").update(content).digest("hex");
        hashes.set(path.relative(dirPath, full), hash);
      }
    }
  }

  walk(dirPath);
  return hashes;
}

describe("CLI integration tests", () => {
  let fakeDaemon: FakeDaemon;
  let daemonPort: number;
  let fixtureEnv: FixtureEnvironment;

  before(async () => {
    fakeDaemon = new FakeDaemon({ mode: "healthy" });
    daemonPort = await fakeDaemon.start();
    fixtureEnv = createFixtureEnvironment(daemonPort);
  });

  after(async () => {
    await fakeDaemon.stop();
    fixtureEnv.cleanup();
  });

  it("agy-export --list --json returns valid JSON array of summaries", async () => {
    const { stdout, stderr } = await execFileAsync("node", [
      CLI_PATH,
      "--list",
      "--json",
      "--data-dir",
      fixtureEnv.dataDir,
      "--cwd",
      fixtureEnv.workspaceDir
    ]);

    assert.equal(stderr, "");
    const parsed = JSON.parse(stdout);
    assert.ok(Array.isArray(parsed));
    // In workspace-a, there are matching conversations (e.g. 055a398f, tool-heavy, unicode, notitle, dup-title, sidecar)
    assert.ok(parsed.length >= 4);
    assert.ok(parsed.some((c: { id: string }) => c.id === "055a398f-db14-4c5f-abbb-1bf03f8120a7"));
  });

  it("agy-export --list scopes to current workspace by default (AC-1)", async () => {
    const { stdout } = await execFileAsync("node", [
      CLI_PATH,
      "--list",
      "--json",
      "--data-dir",
      fixtureEnv.dataDir,
      "--cwd",
      fixtureEnv.workspaceDir
    ]);

    const parsed = JSON.parse(stdout);
    // Other workspace conversation should not be present
    assert.equal(parsed.some((c: { id: string }) => c.id.startsWith("other-ws")), false);
  });

  it("agy-export --list --all includes all workspaces (AC-2)", async () => {
    const { stdout } = await execFileAsync("node", [
      CLI_PATH,
      "--list",
      "--all",
      "--json",
      "--data-dir",
      fixtureEnv.dataDir,
      "--cwd",
      fixtureEnv.workspaceDir
    ]);

    const parsed = JSON.parse(stdout);
    assert.ok(parsed.some((c: { id: string }) => c.id.startsWith("other-ws")));
  });

  it("agy-export <id> --stdout emits pure JSONL without banners or ANSI codes (AC-18, AC-19)", async () => {
    const id = "055a398f-db14-4c5f-abbb-1bf03f8120a7";
    const { stdout, stderr } = await execFileAsync("node", [
      CLI_PATH,
      id,
      "--stdout",
      "--data-dir",
      fixtureEnv.dataDir,
      "--cwd",
      fixtureEnv.workspaceDir
    ]);

    const cleanStderr = stderr
      .split("\n")
      .filter((l) => !l.includes("ExperimentalWarning") && !l.includes("--trace-warnings"))
      .join("\n")
      .trim();
    assert.equal(cleanStderr, "");
    // stdout must NOT have ANSI escape codes
    assert.equal(/\x1b\[[0-9;]*m/.test(stdout), false);
    // stdout must NOT have success banner
    assert.equal(stdout.includes("✓ Exported"), false);

    const lines = stdout.trim().split("\n");
    assert.ok(lines.length > 2);

    const first = JSON.parse(lines[0]);
    assert.equal(first.schema, "agy-export/v1");
    assert.equal(first.type, "session");
    assert.equal(first.id, id);
  });

  it("agy-export <id> --format json emits valid structured JSON", async () => {
    const id = "055a398f-db14-4c5f-abbb-1bf03f8120a7";
    const { stdout } = await execFileAsync("node", [
      CLI_PATH,
      id,
      "--format",
      "json",
      "--stdout",
      "--data-dir",
      fixtureEnv.dataDir,
      "--cwd",
      fixtureEnv.workspaceDir
    ]);

    const parsed = JSON.parse(stdout);
    assert.equal(parsed.schema, "agy-export/v1");
    assert.equal(parsed.session.id, id);
    assert.ok(Array.isArray(parsed.events));
    assert.ok(parsed.events.length > 0);
  });

  it("agy-export <id> --format md emits readable Markdown", async () => {
    const id = "055a398f-db14-4c5f-abbb-1bf03f8120a7";
    const { stdout } = await execFileAsync("node", [
      CLI_PATH,
      id,
      "--format",
      "md",
      "--stdout",
      "--data-dir",
      fixtureEnv.dataDir,
      "--cwd",
      fixtureEnv.workspaceDir
    ]);

    assert.ok(stdout.includes("# Fix authentication regression"));
    assert.ok(stdout.includes("## User"));
    assert.ok(stdout.includes("## Assistant"));
    assert.ok(stdout.includes("### Tool — view_file"));
  });

  it("agy-export <id> with unique prefix resolves deterministically (AC-4)", async () => {
    // Unique prefix
    const prefix = "055a398f";
    const { stdout } = await execFileAsync("node", [
      CLI_PATH,
      prefix,
      "--stdout",
      "--data-dir",
      fixtureEnv.dataDir,
      "--cwd",
      fixtureEnv.workspaceDir
    ]);

    const lines = stdout.trim().split("\n");
    const first = JSON.parse(lines[0]);
    assert.equal(first.id, "055a398f-db14-4c5f-abbb-1bf03f8120a7");
  });

  it("agy-export --latest selects the newest conversation in workspace (AC-3)", async () => {
    const { stdout } = await execFileAsync("node", [
      CLI_PATH,
      "--latest",
      "--stdout",
      "--data-dir",
      fixtureEnv.dataDir,
      "--cwd",
      fixtureEnv.workspaceDir
    ]);

    const lines = stdout.trim().split("\n");
    const first = JSON.parse(lines[0]);
    // Newest in workspace-a is unicode-6789 (timestamp 1788100200000)
    assert.equal(first.id, "unicode-6789-abcd-ef01-234567890abc");
  });

  it("agy-export <id> --mode compact performs reductions and reports stats", async () => {
    const id = "055a398f-db14-4c5f-abbb-1bf03f8120a7";
    const outPath = path.join(fixtureEnv.workspaceDir, "test-compact.jsonl");

    const { stdout } = await execFileAsync("node", [
      CLI_PATH,
      id,
      "--mode",
      "compact",
      "--output",
      outPath,
      "--data-dir",
      fixtureEnv.dataDir,
      "--cwd",
      fixtureEnv.workspaceDir
    ]);

    assert.ok(stdout.includes("✓ Exported"));
    assert.ok(fs.existsSync(outPath));
    const content = fs.readFileSync(outPath, "utf8");
    assert.ok(content.length > 0);
  });

  it("agy-export <id> --mode messages exports conversational transcript only", async () => {
    const id = "055a398f-db14-4c5f-abbb-1bf03f8120a7";
    const { stdout } = await execFileAsync("node", [
      CLI_PATH,
      id,
      "--mode",
      "messages",
      "--stdout",
      "--data-dir",
      fixtureEnv.dataDir,
      "--cwd",
      fixtureEnv.workspaceDir
    ]);

    const lines = stdout.trim().split("\n");
    for (let i = 1; i < lines.length; i++) {
      const evt = JSON.parse(lines[i]);
      assert.equal(evt.type, "message");
    }
  });

  it("agy-export loads sidecar transcript when daemon is unavailable or for sidecar session", async () => {
    const id = "sidecar-1234-5678-9abc-def012345678";
    const { stdout } = await execFileAsync("node", [
      CLI_PATH,
      id,
      "--stdout",
      "--data-dir",
      fixtureEnv.dataDir,
      "--cwd",
      fixtureEnv.workspaceDir
    ]);

    const lines = stdout.trim().split("\n");
    const first = JSON.parse(lines[0]);
    assert.equal(first.id, id);
    assert.equal(first.title, "Sidecar Loaded Session");
  });

  it("fails with actionable error when conversation is encrypted and no daemon is running (Section 28)", async () => {
    // Create an isolated environment without a running daemon
    const envNoDaemon = createFixtureEnvironment();
    try {
      await assert.rejects(
        async () => {
          await execFileAsync("node", [
            CLI_PATH,
            "encrypted-only-0000-0000-000000000000",
            "--stdout",
            "--data-dir",
            envNoDaemon.dataDir,
            "--cwd",
            envNoDaemon.workspaceDir
          ]);
        },
        (err: unknown) => {
          const e = err as { code: number; stderr: string };
          assert.equal(e.code, 4);
          assert.ok(e.stderr.includes("Conversation found, but its transcript is not currently readable"));
          assert.ok(e.stderr.includes("Antigravity stores this conversation encrypted at rest"));
          assert.ok(e.stderr.includes("No Antigravity files were modified."));
          return true;
        }
      );
    } finally {
      envNoDaemon.cleanup();
    }
  });

  it("read-only safety: dataDir is never modified by export or list (AC-20, AC-21)", async () => {
    const beforeHashes = computeDirHash(fixtureEnv.dataDir);

    // Run multiple operations: list, export stdout, export file, doctor
    await execFileAsync("node", [CLI_PATH, "--list", "--data-dir", fixtureEnv.dataDir, "--cwd", fixtureEnv.workspaceDir]);
    await execFileAsync("node", [
      CLI_PATH,
      "055a398f",
      "--stdout",
      "--data-dir",
      fixtureEnv.dataDir,
      "--cwd",
      fixtureEnv.workspaceDir
    ]);
    await execFileAsync("node", [CLI_PATH, "--doctor", "--data-dir", fixtureEnv.dataDir, "--cwd", fixtureEnv.workspaceDir]);

    const afterHashes = computeDirHash(fixtureEnv.dataDir);

    assert.equal(beforeHashes.size, afterHashes.size);
    for (const [filePath, hash] of beforeHashes.entries()) {
      assert.equal(afterHashes.get(filePath), hash, `File ${filePath} was modified!`);
    }
  });

  it("discovers and parses conversations from SQLite conversation_summaries.db", async () => {
    const { stdout } = await execFileAsync("node", [
      CLI_PATH,
      "--list",
      "--json",
      "--data-dir",
      fixtureEnv.dataDir,
      "--cwd",
      fixtureEnv.workspaceDir
    ]);

    const parsed = JSON.parse(stdout);
    const sqliteConv = parsed.find((c: { id: string }) => c.id === "sqlite-conv-1111-2222-3333-444444444444");
    assert.ok(sqliteConv, "Conversation from conversation_summaries.db should be discovered");
    assert.equal(sqliteConv.title, "Fix sqlite conversation summary parsing");
  });

  it("infers command events from standard tool_call (CommandLine) and tool_result", async () => {
    const id = "tool-heavy-1111-2222-3333-444444444444";
    fakeDaemon.customSteps[id] = [
      {
        type: "tool_call",
        tool: "run_command",
        input: { CommandLine: "npm run build", Cwd: fixtureEnv.workspaceDir }
      },
      {
        type: "tool_result",
        tool: "run_command",
        content: "Build completed successfully",
        exit_code: 0
      }
    ];

    const { stdout } = await execFileAsync("node", [
      CLI_PATH,
      id,
      "--stdout",
      "--data-dir",
      fixtureEnv.dataDir,
      "--cwd",
      fixtureEnv.workspaceDir
    ]);

    const lines = stdout.trim().split("\n");
    const commandLine = lines.find((l) => JSON.parse(l).type === "command");
    assert.ok(commandLine, "CommandEvent should be inferred from tool_call and tool_result");
    const cmdEvt = JSON.parse(commandLine!);
    assert.equal(cmdEvt.command, "npm run build");
    assert.equal(cmdEvt.exit_code, 0);
  });

  it("--force overwrites default generated output file instead of creating -2", async () => {
    const id = "055a398f-db14-4c5f-abbb-1bf03f8120a7";

    // 1. Initial export generates default file
    const { stdout: out1 } = await execFileAsync("node", [
      CLI_PATH,
      id,
      "--data-dir",
      fixtureEnv.dataDir,
      "--cwd",
      fixtureEnv.workspaceDir
    ]);
    assert.ok(out1.includes("✓ Exported"));
    const filename = "fix-authentication-regression--055a398f.jsonl";
    const filePath = path.join(fixtureEnv.workspaceDir, filename);
    assert.ok(fs.existsSync(filePath));

    // 2. Export with --force should overwrite the same file without creating -2
    const { stdout: out2 } = await execFileAsync("node", [
      CLI_PATH,
      id,
      "--force",
      "--data-dir",
      fixtureEnv.dataDir,
      "--cwd",
      fixtureEnv.workspaceDir
    ]);
    assert.ok(out2.includes("✓ Exported"));
    assert.ok(out2.includes(filename));
    const dashedTwo = path.join(fixtureEnv.workspaceDir, "fix-authentication-regression--055a398f-2.jsonl");
    assert.equal(fs.existsSync(dashedTwo), false, "-2 file should NOT be created when --force is used");
  });

  it("exports conversation with zero steps cleanly as session header", async () => {
    const id = "notitle-0000-1111-2222-333333333333";
    fakeDaemon.customSteps[id] = [];

    const { stdout } = await execFileAsync("node", [
      CLI_PATH,
      id,
      "--stdout",
      "--data-dir",
      fixtureEnv.dataDir,
      "--cwd",
      fixtureEnv.workspaceDir
    ]);

    const lines = stdout.trim().split("\n");
    assert.equal(lines.length, 1);
    const sessionEvt = JSON.parse(lines[0]);
    assert.equal(sessionEvt.schema, "agy-export/v1");
    assert.equal(sessionEvt.id, id);
  });

  it("prints non-blocking warning to stderr when potential secrets are exported without --redact", async () => {
    const id = "dup-title-1111-2222-3333-444444444444";
    fakeDaemon.customSteps[id] = [
      {
        type: "message",
        role: "user",
        content: "Here is your API token: ghp_1234567890abcdefghijklmnopqrstuvwxyzAB"
      }
    ];

    const { stderr } = await execFileAsync("node", [
      CLI_PATH,
      id,
      "--data-dir",
      fixtureEnv.dataDir,
      "--cwd",
      fixtureEnv.workspaceDir
    ]);

    assert.ok(stderr.includes("Warning: Potential credentials or secrets detected"));
  });

  it("powershell redirection generates valid JSONL on Windows (AC-23, Section 55)", async (t) => {
    if (process.platform !== "win32") {
      t.skip("PowerShell test applies to Windows environments");
      return;
    }

    const id = "055a398f-db14-4c5f-abbb-1bf03f8120a7";
    const psOutPath = path.join(fixtureEnv.workspaceDir, "powershell-redirect.jsonl");

    await execFileAsync("powershell", [
      "-NoProfile",
      "-Command",
      `node '${CLI_PATH}' ${id} --stdout --data-dir '${fixtureEnv.dataDir}' --cwd '${fixtureEnv.workspaceDir}' | Out-File -Encoding utf8 '${psOutPath}'`
    ]);

    assert.ok(fs.existsSync(psOutPath));
    const rawContent = fs.readFileSync(psOutPath, "utf8").replace(/^\uFEFF/, "");
    const lines = rawContent.trim().split(/\r?\n/).filter((l) => l.trim().length > 0);
    assert.ok(lines.length > 2);

    for (const line of lines) {
      const parsed = JSON.parse(line.trim());
      assert.ok(parsed && typeof parsed === "object");
    }
    const first = JSON.parse(lines[0]);
    assert.equal(first.schema, "agy-export/v1");
    assert.equal(first.id, id);
  });

  it("supports workspace paths containing spaces and Unicode characters (AC-24, Section 55)", async () => {
    const spaceUnicodeWs = path.join(fixtureEnv.tempDir, "workspace with spaces and 🚀 unicode");
    fs.mkdirSync(spaceUnicodeWs, { recursive: true });

    const unicodeSidecarId = "space-unicode-session-9876";
    fs.writeFileSync(
      path.join(spaceUnicodeWs, `${unicodeSidecarId}.trajectory.json`),
      JSON.stringify({
        title: "Unicode Spaces Session 🚀",
        steps: [
          { type: "message", role: "user", content: "Testing unicode path handling" },
          { type: "message", role: "assistant", content: "Unicode workspace paths work cleanly" }
        ]
      }),
      "utf8"
    );

    // 1. List within space+Unicode workspace
    const { stdout: listOut } = await execFileAsync("node", [
      CLI_PATH,
      "--list",
      "--json",
      "--cwd",
      spaceUnicodeWs
    ]);

    const listParsed = JSON.parse(listOut);
    assert.ok(listParsed.some((c: { id: string }) => c.id === unicodeSidecarId));

    // 2. Export within space+Unicode workspace
    const { stdout: exportOut } = await execFileAsync("node", [
      CLI_PATH,
      unicodeSidecarId,
      "--stdout",
      "--cwd",
      spaceUnicodeWs
    ]);

    const exportLines = exportOut.trim().split("\n");
    assert.ok(exportLines.length >= 3);
    const sessionEvt = JSON.parse(exportLines[0]);
    assert.equal(sessionEvt.id, unicodeSidecarId);
    assert.equal(sessionEvt.title, "Unicode Spaces Session 🚀");
  });
});
