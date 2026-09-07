import { describe, it } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import { normalizeWorkspacePath, arePathsEqual, isPathInWorkspace } from "../../src/sessions/paths.js";

describe("paths normalization", () => {
  it("normalizes backslashes to forward slashes", () => {
    const input = "D:\\projects\\ticktick\\src\\auth.ts";
    const result = normalizeWorkspacePath(input);
    assert.match(result, /^d:\/projects\/ticktick\/src\/auth\.ts$/i);
  });

  it("normalizes Windows drive letters to lowercase", () => {
    const input = "C:\\Users\\Deba\\Project";
    const result = normalizeWorkspacePath(input);
    assert.equal(result.slice(0, 3), "c:/");
  });

  it("removes trailing slashes except for root", () => {
    assert.equal(normalizeWorkspacePath("C:\\Users\\Deba\\Project\\"), "c:/Users/Deba/Project");
    assert.equal(normalizeWorkspacePath("/home/user/project/"), "/home/user/project");
    assert.equal(normalizeWorkspacePath("C:/"), "c:/");
    assert.equal(normalizeWorkspacePath("/"), "/");
  });

  it("handles file:/// URIs with encoded characters", () => {
    const uri = "file:///d%3A/k0de2/contribute3";
    const result = normalizeWorkspacePath(uri);
    assert.equal(result, "d:/k0de2/contribute3");
  });

  it("resolves dot and double-dot segments", () => {
    const input = "D:/projects/foo/../ticktick/./src";
    const result = normalizeWorkspacePath(input);
    assert.equal(result, "d:/projects/ticktick/src");
  });

  it("handles UNC paths cleanly", () => {
    const unc = "\\\\server\\share\\project\\subdir";
    const result = normalizeWorkspacePath(unc);
    assert.equal(result, "//server/share/project/subdir");
  });

  it("preserves spaces and Unicode characters in paths", () => {
    const input = "D:\\projects\\folder with spaces\\测试项目\\file.txt";
    const result = normalizeWorkspacePath(input);
    assert.equal(result, "d:/projects/folder with spaces/测试项目/file.txt");
  });

  it("arePathsEqual correctly handles Windows case-insensitivity and formatting differences", () => {
    const a = "C:\\Users\\Deba\\Project";
    const b = "c:/users/deba/project/";
    const c = "C:/Users/Deba/Project";

    if (os.platform() === "win32") {
      assert.equal(arePathsEqual(a, b), true);
      assert.equal(arePathsEqual(b, c), true);
    } else {
      assert.equal(arePathsEqual("/home/user/app", "/home/user/app/"), true);
      assert.equal(arePathsEqual("/home/User/app", "/home/user/app"), false);
    }
  });

  it("isPathInWorkspace correctly identifies nested paths", () => {
    const workspace = "D:/projects/ticktick";
    const child = "D:\\projects\\ticktick\\src\\components\\Button.tsx";
    const outside = "D:\\projects\\other\\src\\file.ts";

    assert.equal(isPathInWorkspace(child, workspace), true);
    assert.equal(isPathInWorkspace(outside, workspace), false);
  });

  it("handles nonexistent path without throwing", () => {
    const nonExistent = "Z:\\completely\\fake\\and\\nonexistent\\path";
    assert.doesNotThrow(() => {
      const res = normalizeWorkspacePath(nonExistent);
      assert.ok(res.length > 0);
    });
  });
});
