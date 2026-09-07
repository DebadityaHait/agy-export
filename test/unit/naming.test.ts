import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { slugifyTitle, generateFilename, resolveDestinationPath } from "../../src/export/naming.js";

describe("naming and slug generation", () => {
  it("generates deterministic slug from standard title", () => {
    const title = "Fix authentication regression";
    const slug = slugifyTitle(title);
    assert.equal(slug, "fix-authentication-regression");
  });

  it("handles punctuation, Windows reserved characters, and spaces", () => {
    const title = 'Bug: <fix> "crash" in auth/login? (v2.0) *now*';
    const slug = slugifyTitle(title);
    assert.equal(slug, "bug-fix-crash-in-auth-login-v20-now");
  });

  it("handles emojis and Unicode characters cleanly", () => {
    const title = "修复认证错误 🚀 Authentication Feature!";
    const slug = slugifyTitle(title);
    assert.equal(slug, "修复认证错误-authentication-feature");
  });

  it("truncates long titles to reasonable length without trailing dash", () => {
    const longTitle = "This is an extremely long title for a conversation that should definitely be truncated properly";
    const slug = slugifyTitle(longTitle);
    assert.ok(slug.length <= 50);
    assert.ok(!slug.endsWith("-"));
  });

  it("generates fallback filename when title is empty", () => {
    const filename = generateFilename("", "055a398f-db14-4c5f-abbb-1bf03f8120a7", "jsonl");
    assert.equal(filename, "conversation--055a398f.jsonl");
  });

  it("generates expected filename format: <slug>--<first-8-id>.<ext>", () => {
    const filename = generateFilename("Fix authentication regression", "055a398f-db14-4c5f-abbb-1bf03f8120a7", "jsonl");
    assert.equal(filename, "fix-authentication-regression--055a398f.jsonl");
  });

  it("resolveDestinationPath handles collisions by appending -2, -3", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "agy-naming-test-"));
    try {
      const base = "fix-auth--055a398f.jsonl";

      // 1st time: file does not exist
      const res1 = resolveDestinationPath(tempDir, base, false);
      assert.equal(path.basename(res1.outputPath), "fix-auth--055a398f.jsonl");
      assert.equal(res1.isExisting, false);
      fs.writeFileSync(res1.outputPath, "test 1");

      // 2nd time: file exists, should get -2
      const res2 = resolveDestinationPath(tempDir, base, false);
      assert.equal(path.basename(res2.outputPath), "fix-auth--055a398f-2.jsonl");
      fs.writeFileSync(res2.outputPath, "test 2");

      // 3rd time: both exist, should get -3
      const res3 = resolveDestinationPath(tempDir, base, false);
      assert.equal(path.basename(res3.outputPath), "fix-auth--055a398f-3.jsonl");
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("resolveDestinationPath throws on explicit output when file exists and force is false", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "agy-naming-force-"));
    try {
      const targetFile = path.join(tempDir, "custom.jsonl");
      fs.writeFileSync(targetFile, "existing");

      assert.throws(
        () => {
          resolveDestinationPath(tempDir, "ignored.jsonl", false, targetFile);
        },
        (err: unknown) => {
          return (
            err instanceof Error &&
            err.message.includes("Output file already exists") &&
            (err as unknown as { exitCode: number }).exitCode === 6
          );
        }
      );

      // With force=true, it should succeed
      const res = resolveDestinationPath(tempDir, "ignored.jsonl", true, targetFile);
      assert.equal(res.outputPath, targetFile);
      assert.equal(res.isExisting, true);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
