import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { EventNormalizer } from "../../src/normalization/normalize.js";

describe("event normalization", () => {
  it("normalizes user and assistant messages properly", () => {
    const normalizer = new EventNormalizer("D:/test/workspace");

    const userEvts = normalizer.normalizeStep({
      role: "user",
      content: "Hello world"
    });
    assert.equal(userEvts.length, 1);
    assert.equal(userEvts[0].type, "message");
    assert.equal((userEvts[0] as { role: string }).role, "user");
    assert.equal((userEvts[0] as { content: string }).content, "Hello world");

    const assistantEvts = normalizer.normalizeStep({
      role: "model",
      content: "I am ready to help."
    });
    assert.equal(assistantEvts.length, 1);
    assert.equal(assistantEvts[0].type, "message");
    assert.equal((assistantEvts[0] as { role: string }).role, "assistant");
  });

  it("strictly excludes hidden reasoning, thinking, and scratchpad blocks", () => {
    const normalizer = new EventNormalizer("D:/test/workspace");

    // 1. Tag in content
    const responseWithThoughts = normalizer.normalizeStep({
      role: "assistant",
      content: "<thought>Internal planning that must not leak</thought>Here is the answer."
    });
    assert.equal(responseWithThoughts.length, 1);
    assert.equal((responseWithThoughts[0] as { content: string }).content, "Here is the answer.");

    // 2. Step that is purely thought
    const thoughtStep = normalizer.normalizeStep({
      type: "thought",
      content: "private model thoughts"
    });
    assert.equal(thoughtStep.length, 0);

    // 3. Hidden flag
    const hiddenStep = normalizer.normalizeStep({
      role: "assistant",
      hidden: true,
      content: "should not be exported"
    });
    assert.equal(hiddenStep.length, 0);
  });

  it("skips hidden system prompts unless system_visible is true", () => {
    const normalizer = new EventNormalizer("D:/test/workspace");

    // Hidden system prompt
    const hiddenSys = normalizer.normalizeStep({
      role: "system",
      content: "You are a coding assistant with access to tools..."
    });
    assert.equal(hiddenSys.length, 0);

    // User visible notice
    const visibleSys = normalizer.normalizeStep({
      role: "system",
      system_visible: true,
      content: "Workspace folder updated."
    });
    assert.equal(visibleSys.length, 1);
    assert.equal((visibleSys[0] as { role: string }).role, "system_visible");
  });

  it("normalizes tool calls and results, inferring command and file change events", () => {
    const normalizer = new EventNormalizer("D:/test/workspace");

    const toolCall = normalizer.normalizeStep({
      type: "tool_call",
      tool: "replace_file_content",
      input: {
        TargetFile: "src/auth.ts",
        TargetContent: "old",
        ReplacementContent: "new"
      }
    });
    // Should emit tool_call + inferred file_change
    assert.equal(toolCall.length, 2);
    assert.equal(toolCall[0].type, "tool_call");
    assert.equal(toolCall[1].type, "file_change");

    const toolResult = normalizer.normalizeStep({
      type: "tool_result",
      tool: "run_command",
      command: "npm test",
      content: "Passed 10 tests",
      exit_code: 0
    });
    assert.equal(toolResult.length, 2);
    assert.equal(toolResult[0].type, "tool_result");
    assert.equal(toolResult[1].type, "command");
  });

  it("skips unknown internal event safely and increments diagnostic counters", () => {
    const normalizer = new EventNormalizer("D:/test/workspace");

    const events = normalizer.normalizeStep({
      type: "experimental_internal_proto_stream",
      payload: "random binary data"
    });

    assert.equal(events.length, 0);
    const diag = normalizer.getDiagnostics();
    assert.equal(diag.skippedInternalEvents, 1);
    assert.ok(diag.skippedEventTypes.includes("experimental_internal_proto_stream"));
  });

  it("respects messages mode to filter out non-message events", () => {
    const normalizer = new EventNormalizer("D:/test/workspace", { mode: "messages" });

    const toolCall = normalizer.normalizeStep({
      type: "tool_call",
      tool: "view_file",
      input: { path: "src/index.ts" }
    });
    assert.equal(toolCall.length, 0);

    const msg = normalizer.normalizeStep({
      role: "user",
      content: "Hello"
    });
    assert.equal(msg.length, 1);
  });

  it("normalizes Antigravity daemon CORTEX_STEP_TYPE_... steps", () => {
    const normalizer = new EventNormalizer("D:/k0de2/agy-export");

    // 1. User input
    const userStep = normalizer.normalizeStep({
      type: "CORTEX_STEP_TYPE_USER_INPUT",
      userInput: {
        userResponse: "Build the export feature"
      },
      metadata: { createdAt: "2026-09-05T12:00:00Z" }
    });
    assert.equal(userStep.length, 1);
    assert.equal(userStep[0].type, "message");
    assert.equal((userStep[0] as { role: string }).role, "user");
    assert.equal((userStep[0] as { content: string }).content, "Build the export feature");

    // 2. Planner response with both assistant text and tool calls
    const plannerStep = normalizer.normalizeStep({
      type: "CORTEX_STEP_TYPE_PLANNER_RESPONSE",
      plannerResponse: {
        response: "I will run the tests now.",
        toolCalls: [
          {
            id: "call_1",
            name: "run_command",
            argumentsJson: JSON.stringify({ CommandLine: "npm test", Cwd: "D:/k0de2/agy-export" })
          }
        ]
      },
      metadata: { createdAt: "2026-09-05T12:00:05Z" }
    });
    assert.equal(plannerStep.length, 2);
    assert.equal(plannerStep[0].type, "message");
    assert.equal((plannerStep[0] as { role: string }).role, "assistant");
    assert.equal((plannerStep[0] as { content: string }).content, "I will run the tests now.");
    assert.equal(plannerStep[1].type, "tool_call");
    assert.equal((plannerStep[1] as { tool: string }).tool, "run_command");

    // 3. Run command outcome
    const cmdStep = normalizer.normalizeStep({
      type: "CORTEX_STEP_TYPE_RUN_COMMAND",
      runCommand: {
        commandLine: "npm test",
        cwd: "D:/k0de2/agy-export",
        exitCode: 0,
        combinedOutput: { full: "62 passed" }
      },
      metadata: { createdAt: "2026-09-05T12:00:10Z" }
    });
    assert.equal(cmdStep.length, 2);
    assert.equal(cmdStep[0].type, "tool_result");
    assert.equal(cmdStep[1].type, "command");
    assert.equal((cmdStep[1] as { exit_code: number }).exit_code, 0);

    // 4. View file outcome
    const viewStep = normalizer.normalizeStep({
      type: "CORTEX_STEP_TYPE_VIEW_FILE",
      viewFile: {
        absolutePathUri: "file:///D:/k0de2/agy-export/package.json",
        content: "package content"
      }
    });
    assert.equal(viewStep.length, 1);
    assert.equal(viewStep[0].type, "tool_result");
    assert.equal((viewStep[0] as { tool: string }).tool, "view_file");
  });

  it("normalizes Antigravity Brain Store steps (USER_INPUT, PLANNER_RESPONSE, GENERIC)", () => {
    const normalizer = new EventNormalizer("D:/k0de2/agy-export");

    // 1. User input with wrapped XML tags
    const userStep = normalizer.normalizeStep({
      type: "USER_INPUT",
      content: "<USER_REQUEST>\nFix the terminal picker\n</USER_REQUEST>\n<ADDITIONAL_METADATA>hidden stuff</ADDITIONAL_METADATA>",
      created_at: "2026-09-05T12:00:00Z"
    });
    assert.equal(userStep.length, 1);
    assert.equal(userStep[0].type, "message");
    assert.equal((userStep[0] as { role: string }).role, "user");
    assert.equal((userStep[0] as { content: string }).content, "Fix the terminal picker");

    // 2. Planner response
    const plannerStep = normalizer.normalizeStep({
      type: "PLANNER_RESPONSE",
      content: "I will inspect the terminal picker code.",
      tool_calls: [
        {
          id: "call_view",
          name: "view_file",
          args: { AbsolutePath: "D:/k0de2/agy-export/src/cli/picker.ts" }
        }
      ]
    });
    assert.equal(plannerStep.length, 2);
    assert.equal(plannerStep[0].type, "message");
    assert.equal((plannerStep[0] as { role: string }).role, "assistant");
    assert.equal(plannerStep[1].type, "tool_call");

    // 3. Generic tool result
    const genericStep = normalizer.normalizeStep({
      type: "GENERIC",
      content: "file content lines..."
    });
    assert.equal(genericStep.length, 1);
    assert.equal(genericStep[0].type, "tool_result");
  });
});

