import readline from "node:readline";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildPickerLines,
  formatOptionsBar,
  cycleFormat,
  cycleMode,
  handlePickerKeypress,
  PickerState,
  DEFAULT_PICKER_EXPORT_OPTIONS
} from "../../src/cli/picker.js";
import { ConversationSummary } from "../../src/schema/v1.js";
import { EventNormalizer } from "../../src/normalization/normalize.js";

function makeKey(partial: Partial<readline.Key>): readline.Key {
  return {
    name: partial.name,
    ctrl: Boolean(partial.ctrl),
    meta: Boolean(partial.meta),
    shift: Boolean(partial.shift),
    sequence: partial.sequence || ""
  };
}

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

describe("terminal picker export options and hotkeys", () => {
  const sampleConversations: ConversationSummary[] = [
    {
      id: "85cc031a-c237-4768-b1a2-b9e2546d4dae",
      title: "Test Conversation 1",
      workspace: "d:/k0de2/agy-export",
      updated_at: new Date(Date.now() - 60000).toISOString(),
      surface: "cli"
    },
    {
      id: "055a398f-db14-4c5f-abbb-1bf03f8120a7",
      title: "Test Conversation 2",
      workspace: "d:/projects/ticktick",
      updated_at: new Date(Date.now() - 3600000).toISOString(),
      surface: "ide"
    }
  ];

  it("displays default export options in picker status pills", () => {
    const lines = buildPickerLines(sampleConversations, { workspace: "d:/k0de2/agy-export", isAll: false }, "", 0, 80);
    const optionsLine = lines.find((l) => l.includes("format:") || l.includes("fmt:"));
    assert.ok(optionsLine, "Options line should be rendered in picker output");
    assert.ok(optionsLine.includes("jsonl"), "Should show default format jsonl");
    assert.ok(optionsLine.includes("full"), "Should show default mode full");
    assert.ok(optionsLine.includes("redact: off") || optionsLine.includes("red:off"), "Should show redact off");
    assert.ok(optionsLine.includes("tools: on") || optionsLine.includes("tls:on"), "Should show tools on");
    assert.ok(optionsLine.includes("diffs: on") || optionsLine.includes("dif:on"), "Should show diffs on");
  });

  it("displays custom pre-configured export options", () => {
    const lines = buildPickerLines(
      sampleConversations,
      {
        workspace: "d:/k0de2/agy-export",
        isAll: false,
        exportOptions: {
          format: "md",
          mode: "compact",
          redact: true,
          includeTools: false,
          includeDiffs: false
        }
      },
      "",
      0,
      80
    );

    const optionsLine = lines.find((l) => l.includes("format:") || l.includes("fmt:"));
    assert.ok(optionsLine, "Options line should be rendered");
    assert.ok(optionsLine.includes("md"), "Should show configured format md");
    assert.ok(optionsLine.includes("compact"), "Should show configured mode compact");
    assert.ok(optionsLine.includes("ON"), "Should show redact ON");
    assert.ok(optionsLine.includes("OFF"), "Should show tools/diffs OFF");
  });

  it("renders options focus mode with active pill indicators and specialized footer", () => {
    const lines = buildPickerLines(
      sampleConversations,
      {
        workspace: "d:/k0de2/agy-export",
        isAll: false,
        optionsFocus: true,
        focusedOptionIndex: 1
      },
      "",
      0,
      80
    );

    const optionsLine = lines.find((l) => l.includes("mode:"));
    assert.ok(optionsLine, "Options line should be rendered");
    assert.ok(optionsLine.includes(">[mode: full]<") || optionsLine.includes(">[mode:"), "Focused option index 1 should have active brackets");

    const footerLine = lines.find((l) => l.includes("space") && (l.includes("toggle") || l.includes("esc")));
    assert.ok(footerLine, "Options focus footer should be rendered");
  });

  it("cycleFormat rotates through jsonl -> json -> md -> jsonl", () => {
    assert.equal(cycleFormat("jsonl"), "json");
    assert.equal(cycleFormat("json"), "md");
    assert.equal(cycleFormat("md"), "jsonl");
  });

  it("cycleMode rotates through full -> compact -> messages -> full", () => {
    assert.equal(cycleMode("full"), "compact");
    assert.equal(cycleMode("compact"), "messages");
    assert.equal(cycleMode("messages"), "full");
  });

  it("handlePickerKeypress cycles format with Ctrl+F and Alt+F", () => {
    const state: PickerState = {
      searchQuery: "",
      selectedIndex: 0,
      filteredList: [...sampleConversations],
      exportOptions: { ...DEFAULT_PICKER_EXPORT_OPTIONS },
      optionsFocus: false,
      focusedOptionIndex: 0
    };

    // 1. Ctrl+F
    let action = handlePickerKeypress(state, makeKey({ ctrl: true, meta: false, name: "f" }), sampleConversations, { workspace: "d:/test", isAll: false });
    assert.equal(action.shouldRender, true);
    assert.equal(action.done, false);
    assert.equal(state.exportOptions.format, "json");

    // 2. Alt+F
    action = handlePickerKeypress(state, makeKey({ ctrl: false, meta: true, name: "f" }), sampleConversations, { workspace: "d:/test", isAll: false });
    assert.equal(state.exportOptions.format, "md");

    // 3. F3 alias
    action = handlePickerKeypress(state, makeKey({ ctrl: false, meta: false, name: "f3" }), sampleConversations, { workspace: "d:/test", isAll: false });
    assert.equal(state.exportOptions.format, "jsonl");
  });

  it("handlePickerKeypress cycles mode with Ctrl+E, Ctrl+P, and Alt+M", () => {
    const state: PickerState = {
      searchQuery: "",
      selectedIndex: 0,
      filteredList: [...sampleConversations],
      exportOptions: { ...DEFAULT_PICKER_EXPORT_OPTIONS },
      optionsFocus: false,
      focusedOptionIndex: 0
    };

    // 1. Ctrl+E
    handlePickerKeypress(state, makeKey({ ctrl: true, meta: false, name: "e" }), sampleConversations, { workspace: "d:/test", isAll: false });
    assert.equal(state.exportOptions.mode, "compact");

    // 2. Alt+M
    handlePickerKeypress(state, makeKey({ ctrl: false, meta: true, name: "m" }), sampleConversations, { workspace: "d:/test", isAll: false });
    assert.equal(state.exportOptions.mode, "messages");

    // 3. Ctrl+P
    handlePickerKeypress(state, makeKey({ ctrl: true, meta: false, name: "p" }), sampleConversations, { workspace: "d:/test", isAll: false });
    assert.equal(state.exportOptions.mode, "full");
  });

  it("handlePickerKeypress toggles redact with Ctrl+R and Alt+R", () => {
    const state: PickerState = {
      searchQuery: "",
      selectedIndex: 0,
      filteredList: [...sampleConversations],
      exportOptions: { ...DEFAULT_PICKER_EXPORT_OPTIONS },
      optionsFocus: false,
      focusedOptionIndex: 0
    };

    assert.equal(state.exportOptions.redact, false);

    // Toggle on with Ctrl+R
    handlePickerKeypress(state, makeKey({ ctrl: true, meta: false, name: "r" }), sampleConversations, { workspace: "d:/test", isAll: false });
    assert.equal(state.exportOptions.redact, true);

    // Toggle off with Alt+R
    handlePickerKeypress(state, makeKey({ ctrl: false, meta: true, name: "r" }), sampleConversations, { workspace: "d:/test", isAll: false });
    assert.equal(state.exportOptions.redact, false);
  });

  it("handlePickerKeypress toggles tools with Ctrl+T and Alt+T", () => {
    const state: PickerState = {
      searchQuery: "",
      selectedIndex: 0,
      filteredList: [...sampleConversations],
      exportOptions: { ...DEFAULT_PICKER_EXPORT_OPTIONS },
      optionsFocus: false,
      focusedOptionIndex: 0
    };

    assert.equal(state.exportOptions.includeTools, true);

    // Toggle off with Ctrl+T
    handlePickerKeypress(state, makeKey({ ctrl: true, meta: false, name: "t" }), sampleConversations, { workspace: "d:/test", isAll: false });
    assert.equal(state.exportOptions.includeTools, false);

    // Toggle on with Alt+T
    handlePickerKeypress(state, makeKey({ ctrl: false, meta: true, name: "t" }), sampleConversations, { workspace: "d:/test", isAll: false });
    assert.equal(state.exportOptions.includeTools, true);
  });

  it("handlePickerKeypress toggles diffs with Ctrl+D and Alt+D", () => {
    const state: PickerState = {
      searchQuery: "",
      selectedIndex: 0,
      filteredList: [...sampleConversations],
      exportOptions: { ...DEFAULT_PICKER_EXPORT_OPTIONS },
      optionsFocus: false,
      focusedOptionIndex: 0
    };

    assert.equal(state.exportOptions.includeDiffs, true);

    // Toggle off with Ctrl+D
    handlePickerKeypress(state, makeKey({ ctrl: true, meta: false, name: "d" }), sampleConversations, { workspace: "d:/test", isAll: false });
    assert.equal(state.exportOptions.includeDiffs, false);

    // Toggle on with Alt+D
    handlePickerKeypress(state, makeKey({ ctrl: false, meta: true, name: "d" }), sampleConversations, { workspace: "d:/test", isAll: false });
    assert.equal(state.exportOptions.includeDiffs, true);
  });

  it("handlePickerKeypress toggles options focus mode with Ctrl+O and F2", () => {
    const state: PickerState = {
      searchQuery: "",
      selectedIndex: 0,
      filteredList: [...sampleConversations],
      exportOptions: { ...DEFAULT_PICKER_EXPORT_OPTIONS },
      optionsFocus: false,
      focusedOptionIndex: 0
    };

    handlePickerKeypress(state, makeKey({ ctrl: true, meta: false, name: "o" }), sampleConversations, { workspace: "d:/test", isAll: false });
    assert.equal(state.optionsFocus, true);

    handlePickerKeypress(state, makeKey({ ctrl: false, meta: false, name: "f2" }), sampleConversations, { workspace: "d:/test", isAll: false });
    assert.equal(state.optionsFocus, false);
  });

  it("handlePickerKeypress navigates and toggles within options focus mode", () => {
    const state: PickerState = {
      searchQuery: "",
      selectedIndex: 0,
      filteredList: [...sampleConversations],
      exportOptions: { ...DEFAULT_PICKER_EXPORT_OPTIONS },
      optionsFocus: true,
      focusedOptionIndex: 0
    };

    // Right arrow to Option 1 (mode)
    handlePickerKeypress(state, makeKey({ name: "right" }), sampleConversations, { workspace: "d:/test", isAll: false });
    assert.equal(state.focusedOptionIndex, 1);

    // Space toggles mode to compact
    handlePickerKeypress(state, makeKey({ name: "space" }), sampleConversations, { workspace: "d:/test", isAll: false });
    assert.equal(state.exportOptions.mode, "compact");

    // Right arrow to Option 2 (redact)
    handlePickerKeypress(state, makeKey({ name: "right" }), sampleConversations, { workspace: "d:/test", isAll: false });
    assert.equal(state.focusedOptionIndex, 2);

    // Up toggles redact to true
    handlePickerKeypress(state, makeKey({ name: "up" }), sampleConversations, { workspace: "d:/test", isAll: false });
    assert.equal(state.exportOptions.redact, true);

    // Direct letter keys in options mode
    handlePickerKeypress(state, makeKey({ sequence: "t", name: "t" }), sampleConversations, { workspace: "d:/test", isAll: false });
    assert.equal(state.exportOptions.includeTools, false);

    handlePickerKeypress(state, makeKey({ sequence: "d", name: "d" }), sampleConversations, { workspace: "d:/test", isAll: false });
    assert.equal(state.exportOptions.includeDiffs, false);

    handlePickerKeypress(state, makeKey({ sequence: "f", name: "f" }), sampleConversations, { workspace: "d:/test", isAll: false });
    assert.equal(state.exportOptions.format, "json");

    // Esc exits options focus back to list search without exiting picker
    const action = handlePickerKeypress(state, makeKey({ name: "escape" }), sampleConversations, { workspace: "d:/test", isAll: false });
    assert.equal(action.done, false);
    assert.equal(state.optionsFocus, false);
  });

  it("handlePickerKeypress returns full PickerResult payload on Enter", () => {
    const state: PickerState = {
      searchQuery: "",
      selectedIndex: 1,
      filteredList: [...sampleConversations],
      exportOptions: {
        format: "md",
        mode: "compact",
        redact: true,
        includeTools: false,
        includeDiffs: false,
        redactPaths: false
      },
      optionsFocus: false,
      focusedOptionIndex: 0
    };

    const action = handlePickerKeypress(state, makeKey({ name: "return" }), sampleConversations, { workspace: "d:/test", isAll: false });
    assert.equal(action.done, true);
    assert.ok(action.result, "Should return result");
    assert.equal(action.result.id, sampleConversations[1].id);
    assert.equal(action.result.conversation.id, sampleConversations[1].id);
    assert.equal(action.result.title, sampleConversations[1].title);
    assert.equal(action.result.options.format, "md");
    assert.equal(action.result.options.mode, "compact");
    assert.equal(action.result.options.redact, true);
    assert.equal(action.result.options.includeTools, false);
    assert.equal(action.result.options.includeDiffs, false);
  });

  it("handlePickerKeypress preserves search typing without triggering option toggles", () => {
    const state: PickerState = {
      searchQuery: "",
      selectedIndex: 0,
      filteredList: [...sampleConversations],
      exportOptions: { ...DEFAULT_PICKER_EXPORT_OPTIONS },
      optionsFocus: false,
      focusedOptionIndex: 0
    };

    // Type "f"
    handlePickerKeypress(state, makeKey({ sequence: "f", name: "f", ctrl: false, meta: false }), sampleConversations, { workspace: "d:/test", isAll: false });
    assert.equal(state.searchQuery, "f");
    assert.equal(state.exportOptions.format, "jsonl", "Format must NOT toggle when typing search characters");

    // Type "m"
    handlePickerKeypress(state, makeKey({ sequence: "m", name: "m", ctrl: false, meta: false }), sampleConversations, { workspace: "d:/test", isAll: false });
    assert.equal(state.searchQuery, "fm");
    assert.equal(state.exportOptions.mode, "full", "Mode must NOT toggle when typing search characters");

    // Type "r"
    handlePickerKeypress(state, makeKey({ sequence: "r", name: "r", ctrl: false, meta: false }), sampleConversations, { workspace: "d:/test", isAll: false });
    assert.equal(state.searchQuery, "fmr");
    assert.equal(state.exportOptions.redact, false, "Redact must NOT toggle when typing search characters");
  });

  it("integrates picker result options with EventNormalizer", () => {
    const pickerResultOptions = {
      format: "json" as const,
      mode: "messages" as const,
      redact: true,
      includeTools: false,
      includeDiffs: false
    };

    const normalizer = new EventNormalizer("d:/test/workspace", {
      format: pickerResultOptions.format,
      mode: pickerResultOptions.mode,
      redact: pickerResultOptions.redact,
      excludeTools: !pickerResultOptions.includeTools,
      excludeDiffs: !pickerResultOptions.includeDiffs
    });

    // 1. Message with potential secret
    const msgEvents = normalizer.normalizeStep({
      type: "message",
      role: "assistant",
      content: "Here is your key: ghp_1234567890abcdefghijklmnopqrstuvwxyzAB"
    });
    assert.equal(msgEvents.length, 1);
    const msgEvt = msgEvents[0] as { content?: string };
    assert.ok(!msgEvt.content?.includes("ghp_1234567890"), "Secrets should be redacted based on picker option");

    // 2. Tool call should be excluded by messages mode & excludeTools
    const toolEvents = normalizer.normalizeStep({
      type: "tool_call",
      tool: "view_file",
      input: { TargetFile: "test.ts" }
    });
    assert.equal(toolEvents.length, 0, "Tool events should be excluded based on picker options");
  });

  it("handlePickerKeypress toggles focused option with return and enter in optionsFocus mode without terminating", () => {
    const state: PickerState = {
      searchQuery: "",
      selectedIndex: 0,
      filteredList: [...sampleConversations],
      exportOptions: { ...DEFAULT_PICKER_EXPORT_OPTIONS },
      optionsFocus: true,
      focusedOptionIndex: 0 // format
    };

    // 1. Return key toggles format
    const actionReturn = handlePickerKeypress(state, makeKey({ name: "return" }), sampleConversations, { workspace: "d:/test", isAll: false });
    assert.equal(actionReturn.done, false, "Return in optionsFocus mode must NOT exit picker");
    assert.equal(actionReturn.shouldRender, true);
    assert.equal(state.exportOptions.format, "json");

    // 2. Enter key toggles format again
    const actionEnter = handlePickerKeypress(state, makeKey({ name: "enter" }), sampleConversations, { workspace: "d:/test", isAll: false });
    assert.equal(actionEnter.done, false, "Enter in optionsFocus mode must NOT exit picker");
    assert.equal(actionEnter.shouldRender, true);
    assert.equal(state.exportOptions.format, "md");

    // 3. Move to mode (index 1) and toggle with return
    state.focusedOptionIndex = 1;
    handlePickerKeypress(state, makeKey({ name: "return" }), sampleConversations, { workspace: "d:/test", isAll: false });
    assert.equal(state.exportOptions.mode, "compact");

    // 4. Move to redact (index 2) and toggle with enter
    state.focusedOptionIndex = 2;
    handlePickerKeypress(state, makeKey({ name: "enter" }), sampleConversations, { workspace: "d:/test", isAll: false });
    assert.equal(state.exportOptions.redact, true);
  });

  it("handlePickerKeypress accepts key with name 'enter' to select in normal mode", () => {
    const state: PickerState = {
      searchQuery: "",
      selectedIndex: 0,
      filteredList: [...sampleConversations],
      exportOptions: { ...DEFAULT_PICKER_EXPORT_OPTIONS },
      optionsFocus: false,
      focusedOptionIndex: 0
    };

    const action = handlePickerKeypress(state, makeKey({ name: "enter" }), sampleConversations, { workspace: "d:/test", isAll: false });
    assert.equal(action.done, true);
    assert.ok(action.result, "Should return result on enter key");
    assert.equal(action.result.id, sampleConversations[0].id);
  });

  it("formatOptionsBar never truncates pills on 80-column terminal with messages or compact mode", () => {
    for (const mode of ["full", "compact", "messages"] as const) {
      for (const format of ["jsonl", "json", "md"] as const) {
        for (const focus of [false, true]) {
          const out = formatOptionsBar(
            { format, mode, redact: false, includeTools: true, includeDiffs: true },
            focus,
            1,
            79
          );
          assert.ok(out.length <= 79, `Length ${out.length} must be <= 79`);
          assert.ok(!out.includes("…"), `Should not contain ellipsis on 80-col terminal: "${out}"`);
          assert.ok(out.includes("format:") || out.includes("fmt:"), "Should contain format pill");
          assert.ok(out.includes("diffs: on") || out.includes("dif:on"), "Should contain diffs pill intact");
        }
      }
    }
  });

  it("formatOptionsBar strictly never exceeds maxWidth across narrow widths", () => {
    const widths = [15, 20, 25, 30, 40, 50, 60, 70, 75, 79, 80];
    for (const w of widths) {
      for (const mode of ["full", "compact", "messages"] as const) {
        for (const focus of [false, true]) {
          const out = formatOptionsBar(
            { format: "jsonl", mode, redact: true, includeTools: false, includeDiffs: true },
            focus,
            focus ? 1 : 0,
            w
          );
          assert.ok(
            out.length <= w,
            `Output "${out}" (length ${out.length}) exceeds maxWidth ${w}`
          );
        }
      }
    }
  });

  it("buildPickerLines renders options bar when optionsFocus is true even in minimal rows mode", () => {
    const lines = buildPickerLines(
      sampleConversations,
      { workspace: "d:/test", isAll: false, optionsFocus: true, focusedOptionIndex: 0 },
      "",
      0,
      80,
      8
    );
    assert.ok(lines.length <= 8, `Lines length ${lines.length} must be <= 8 rows`);
    const hasOptions = lines.some((l) => l.includes("format:") || l.includes("fmt:") || l.includes("[jsonl]"));
    assert.ok(hasOptions, "Options bar must be rendered when optionsFocus is true in minimal row mode");
  });
});
