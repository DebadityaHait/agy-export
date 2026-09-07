import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildPickerLines } from "../../src/cli/picker.js";
import { ConversationSummary } from "../../src/schema/v1.js";

describe("terminal picker line rendering", () => {
  const sampleConversations: ConversationSummary[] = [
    {
      id: "85cc031a-c237-4768-b1a2-b9e2546d4dae",
      title: "have you installed it on my device, what is the command to use it?",
      workspace: "d:/k0de2/agy-export",
      updated_at: new Date(Date.now() - 60000).toISOString(),
      surface: "cli"
    },
    {
      id: "055a398f-db14-4c5f-abbb-1bf03f8120a7",
      title: "Fix authentication regression",
      workspace: "d:/projects/ticktick",
      updated_at: new Date(Date.now() - 3600000).toISOString(),
      surface: "ide"
    }
  ];

  it("never produces embedded newlines in any line item", () => {
    const lines = buildPickerLines(sampleConversations, { workspace: "d:/k0de2/agy-export", isAll: false }, "", 0, 80);

    // Every item in lines must be a single row (no \n or \r)
    for (const [idx, line] of lines.entries()) {
      assert.ok(!line.includes("\n"), `Line ${idx} contains embedded newline: ${JSON.stringify(line)}`);
      assert.ok(!line.includes("\r"), `Line ${idx} contains embedded carriage return: ${JSON.stringify(line)}`);
    }
  });

  it("counts exact lines without phantom rows", () => {
    const lines = buildPickerLines(sampleConversations, { workspace: "d:/k0de2/agy-export", isAll: false }, "", 0, 80);
    // 1 header + 1 ws + 1 empty + 1 search + 1 empty + 2 items + 1 empty + 1 count + 1 empty + 1 instructions = 11 lines
    const joined = lines.join("\n");
    const physicalLines = joined.split("\n");
    assert.equal(lines.length, physicalLines.length);
  });

  it("handles empty search results cleanly without embedded newlines", () => {
    const lines = buildPickerLines([], { workspace: "d:/k0de2/agy-export", isAll: false }, "nonexistent", 0, 80);

    for (const [idx, line] of lines.entries()) {
      assert.ok(!line.includes("\n"), `Line ${idx} contains embedded newline`);
    }
    assert.ok(lines.some((l) => l.includes("No conversations match your search.")));
  });

  it("truncates workspace path and titles to fit terminal columns without wrapping", () => {
    const longWorkspace = "D:/extremely/long/nested/path/that/would/normally/overflow/the/entire/terminal/width/and/cause/wrapping/on/windows/consoles";
    const lines = buildPickerLines(sampleConversations, { workspace: longWorkspace, isAll: false }, "", 0, 60);

    for (const line of lines) {
      assert.ok(line.length <= 59, `Line exceeds safe margin (59): length=${line.length}, line="${line}"`);
    }
  });

  it("strictly clamps all lines on narrow terminals (e.g. 40, 30, 20 columns)", () => {
    for (const cols of [40, 30, 20]) {
      const longQuery = "a very long search query that exceeds the terminal column width by a wide margin";
      const lines = buildPickerLines(sampleConversations, { workspace: "d:/test/workspace", isAll: true }, longQuery, 0, cols);

      for (const [idx, line] of lines.entries()) {
        assert.ok(!line.includes("\n"), `Line ${idx} contains newline`);
        assert.ok(!line.includes("\r"), `Line ${idx} contains carriage return`);
        assert.ok(
          line.length <= cols - 1,
          `Line ${idx} length ${line.length} exceeds max allowed ${cols - 1} for cols=${cols}: "${line}"`
        );
      }
    }
  });

  it("adapts page size so total lines never exceed terminal rows on compact terminals", () => {
    for (const rows of [5, 6, 8, 10, 12, 14, 16, 20]) {
      const lines = buildPickerLines(
        sampleConversations,
        { workspace: "d:/test/workspace", isAll: false },
        "",
        0,
        80,
        rows
      );
      assert.ok(
        lines.length <= rows,
        `Rendered lines count ${lines.length} exceeds available terminal rows ${rows}`
      );
    }
  });

  it("handles isAll workspace toggle display correctly", () => {
    const linesScoped = buildPickerLines(
      sampleConversations,
      { workspace: "d:/test/workspace", isAll: false },
      "",
      0,
      80,
      24
    );
    assert.ok(linesScoped.some((l) => l.includes("tab all")));

    const linesAll = buildPickerLines(
      sampleConversations,
      { workspace: "d:/test/workspace", isAll: true },
      "",
      0,
      80,
      24
    );
    assert.ok(linesAll.some((l) => l.includes("all workspaces") || l.includes("all")));
    assert.ok(linesAll.some((l) => l.includes("tab workspace") || l.includes("tab ws")));
  });
});
