import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CompactReducer } from "../../src/compact/reduce.js";
import { ToolResultEvent } from "../../src/schema/v1.js";

describe("compact mode reductions", () => {
  it("truncates large tool output and adds explicit metadata", () => {
    const reducer = new CompactReducer(100); // 100 bytes limit
    const hugeOutput = "A".repeat(500);

    const event: ToolResultEvent = {
      type: "tool_result",
      tool: "custom_tool",
      content: hugeOutput
    };

    const reduced = reducer.reduce(event) as ToolResultEvent;
    assert.equal(reduced.truncated, true);
    assert.equal(reduced.original_bytes, 500);
    assert.ok(reduced.exported_bytes! < 500);
    assert.ok(String(reduced.content).includes("[TRUNCATED]"));
  });

  it("reduces verbose directory listings to a summary", () => {
    const reducer = new CompactReducer();
    const dirListing = Array.from({ length: 50 }, (_, i) => `-rw-r--r-- file_${i}.txt`).join("\n");

    const event: ToolResultEvent = {
      type: "tool_result",
      tool: "list_dir",
      content: dirListing
    };

    const reduced = reducer.reduce(event) as ToolResultEvent;
    assert.equal(reduced.truncated, true);
    assert.ok(reduced.summary?.includes("Directory listing: 50 entries"));
    assert.equal(reduced.content, undefined);
  });

  it("deduplicates repeated identical file reads", () => {
    const reducer = new CompactReducer();
    const fileContent = "export function sample() { return 42; }";

    const event1: ToolResultEvent = {
      type: "tool_result",
      tool: "view_file",
      content: fileContent
    };

    const event2: ToolResultEvent = {
      type: "tool_result",
      tool: "view_file",
      content: fileContent
    };

    const first = reducer.reduce(event1) as ToolResultEvent;
    assert.equal(first.content, fileContent);
    assert.equal(first.truncated, undefined);

    const second = reducer.reduce(event2) as ToolResultEvent;
    assert.equal(second.truncated, true);
    assert.equal(second.content, undefined);
    assert.ok(second.summary?.includes("Duplicate file read"));
  });

  it("tracks reduction statistics accurately", () => {
    const reducer = new CompactReducer(50);
    const big = "X".repeat(200);

    reducer.reduce({
      type: "tool_result",
      tool: "test_tool",
      content: big
    });

    const stats = reducer.getStats();
    assert.equal(stats.originalToolBytes, 200);
    assert.ok(stats.exportedToolBytes < 200);
    assert.equal(stats.truncatedCount, 1);
  });
});
