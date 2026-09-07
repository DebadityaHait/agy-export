import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

describe("packed tarball smoke test", () => {
  it("packs package and executes binary from a clean temporary installation", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "agy-pack-smoke-"));
    const clientDir = path.join(tempDir, "client-app");
    fs.mkdirSync(clientDir, { recursive: true });

    try {
      // 1. Pack the package
      const projectRoot = path.resolve(".");
      const packCmd = `npm pack --pack-destination "${tempDir}"`;
      const { stdout: packStdout } = await execAsync(packCmd, { cwd: projectRoot });
      const tarballName = packStdout.trim().split(/\r?\n/).pop()?.trim();
      assert.ok(tarballName && tarballName.endsWith(".tgz"), `Expected tarball name, got: ${tarballName}`);

      const tarballPath = path.join(tempDir, tarballName);
      assert.ok(fs.existsSync(tarballPath), `Tarball does not exist at ${tarballPath}`);

      // 2. Initialize minimal client app
      fs.writeFileSync(
        path.join(clientDir, "package.json"),
        JSON.stringify({ name: "smoke-client", version: "1.0.0", type: "module" }),
        "utf8"
      );

      // 3. Install tarball into client app
      await execAsync(`npm install "${tarballPath}"`, { cwd: clientDir });

      // 4. Test binary execution: --version via npm-generated shim
      const binShim = os.platform() === "win32"
        ? `"${path.join(clientDir, "node_modules", ".bin", "agy-export.cmd")}"`
        : `"${path.join(clientDir, "node_modules", ".bin", "agy-export")}"`;

      const { stdout: versionOut } = await execAsync(`${binShim} --version`, { cwd: clientDir });
      assert.equal(versionOut.trim(), "0.1.0");

      // 5. Test binary execution: --help
      const { stdout: helpOut } = await execAsync(`${binShim} --help`, { cwd: clientDir });
      assert.ok(helpOut.includes("Export a single Google Antigravity conversation cleanly"));
      assert.ok(helpOut.includes("--latest"));
      assert.ok(helpOut.includes("--format"));

      // 6. Test binary execution: export fixture sidecar to validate exported output
      const sidecarFile = path.join(clientDir, "smoke-session-1234.trajectory.json");
      fs.writeFileSync(
        sidecarFile,
        JSON.stringify({
          title: "Smoke Test Session",
          steps: [
            { type: "message", role: "user", content: "Hello from packed binary smoke test" },
            { type: "message", role: "assistant", content: "Smoke test response" }
          ]
        }),
        "utf8"
      );

      const { stdout: exportOut } = await execAsync(`${binShim} smoke-session-1234 --stdout`, { cwd: clientDir });
      const exportLines = exportOut.trim().split(/\r?\n/);
      assert.ok(exportLines.length >= 3);
      const sessionHeader = JSON.parse(exportLines[0]);
      assert.equal(sessionHeader.schema, "agy-export/v1");
      assert.equal(sessionHeader.id, "smoke-session-1234");
      assert.equal(sessionHeader.title, "Smoke Test Session");
      const userMsg = JSON.parse(exportLines[1]);
      assert.equal(userMsg.role, "user");
      assert.equal(userMsg.content, "Hello from packed binary smoke test");
    } finally {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {
        // ignore cleanup error
      }
    }
  });
});
