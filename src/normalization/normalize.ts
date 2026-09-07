import {
  ExportEvent,
  ExportOptions,
  MessageEvent,
  ToolCallEvent,
  ToolResultEvent,
  CommandEvent,
  FileChangeEvent,
  ArtifactEvent
} from "../schema/v1.js";
import { CompactReducer } from "../compact/reduce.js";
import { redactObject } from "../privacy/redact.js";
import { redactPathsInObject } from "../privacy/paths.js";

export interface NormalizationDiagnostics {
  totalProcessed: number;
  totalExported: number;
  skippedInternalEvents: number;
  skippedEventTypes: string[];
  redactedSecretsCount: number;
  compactStats?: {
    originalToolBytes: number;
    exportedToolBytes: number;
    truncatedCount: number;
    deduplicatedCount: number;
  };
}

/**
 * Normalizes raw conversation events or daemon steps into canonical agy-export events.
 */
export class EventNormalizer {
  private options: ExportOptions;
  private workspacePath: string;
  private compactReducer?: CompactReducer;
  private pendingCommands: Array<{ command: string; cwd?: string; timestamp?: string }> = [];
  private diagnostics: NormalizationDiagnostics = {
    totalProcessed: 0,
    totalExported: 0,
    skippedInternalEvents: 0,
    skippedEventTypes: [],
    redactedSecretsCount: 0
  };

  constructor(workspacePath: string, options: ExportOptions = {}) {
    this.workspacePath = workspacePath;
    this.options = options;
    if (options.mode === "compact") {
      this.compactReducer = new CompactReducer(options.maxToolOutput);
    }
  }

  public getDiagnostics(): NormalizationDiagnostics {
    const diag = { ...this.diagnostics };
    if (this.compactReducer) {
      diag.compactStats = this.compactReducer.getStats();
    }
    return diag;
  }

  /**
   * Normalizes a single raw step or event into zero, one, or more ExportEvents.
   */
  public normalizeStep(raw: unknown): ExportEvent[] {
    this.diagnostics.totalProcessed++;

    if (!raw || typeof raw !== "object") {
      this.diagnostics.skippedInternalEvents++;
      return [];
    }

    const item = raw as Record<string, unknown>;

    // Identify raw event type or step type
    const rawType = (item.type || item.stepType || item.kind || item.role || "unknown") as string;

    // Reject internal hidden reasoning or scratchpad events explicitly (PRD Section 41 & 71)
    if (
      rawType === "thought" ||
      rawType === "reasoning" ||
      rawType === "internal" ||
      rawType === "scratchpad" ||
      rawType === "hidden_system" ||
      rawType === "antigravity_thought" ||
      rawType === "gemini_internal" ||
      item.isInternal === true ||
      item.hidden === true ||
      item.is_hidden === true ||
      item.internal === true
    ) {
      this.recordSkipped(rawType);
      return [];
    }

    const events: ExportEvent[] = [];

    // 1. Antigravity daemon/brain user input
    if (rawType === "CORTEX_STEP_TYPE_USER_INPUT" || rawType === "USER_INPUT") {
      const msg = this.parseUserInputStep(item);
      if (msg) events.push(msg);
    }
    // 2. Antigravity daemon/brain planner response (assistant message + tool calls)
    else if (rawType === "CORTEX_STEP_TYPE_PLANNER_RESPONSE" || rawType === "PLANNER_RESPONSE" || item.plannerResponse) {
      this.parsePlannerResponseStep(item, events);
    }
    // 3. Antigravity daemon run command step
    else if (rawType === "CORTEX_STEP_TYPE_RUN_COMMAND" || item.runCommand) {
      this.parseRunCommandStep(item, events);
    }
    // 4. Antigravity daemon view file step
    else if (rawType === "CORTEX_STEP_TYPE_VIEW_FILE" || item.viewFile) {
      this.parseViewFileStep(item, events);
    }
    // 5. Antigravity daemon invoke subagent step
    else if (rawType === "CORTEX_STEP_TYPE_INVOKE_SUBAGENT" || item.invokeSubagent) {
      this.parseInvokeSubagentStep(item, events);
    }
    // 6. Antigravity brain generic step (tool result)
    else if (rawType === "GENERIC") {
      this.parseGenericStep(item, events);
    }
    // 7. System message
    else if (rawType === "CORTEX_STEP_TYPE_SYSTEM_MESSAGE" || rawType === "SYSTEM_MESSAGE") {
      if (item.system_visible === true || item.visible === true) {
        const msg = this.parseMessage(item);
        if (msg) events.push(msg);
      }
    }
    // 8. Standard/synthetic tool call step
    else if (this.isToolCallStep(item)) {
      const toolCall = this.parseToolCall(item);
      if (toolCall) {
        events.push(toolCall);
        const fileChange = this.inferFileChangeFromTool(toolCall);
        if (fileChange && !this.options.excludeDiffs) {
          events.push(fileChange);
        }
      }
    } else if (this.isToolResultStep(item)) {
      const toolResult = this.parseToolResult(item);
      if (toolResult) {
        events.push(toolResult);
        const commandEvent = this.inferCommandFromToolResult(toolResult, item);
        if (commandEvent) {
          events.push(commandEvent);
        }
      }
    } else if (this.isMessageStep(item)) {
      const msg = this.parseMessage(item);
      if (msg) events.push(msg);
    } else if (this.isCommandStep(item)) {
      const cmd = this.parseCommand(item);
      if (cmd) events.push(cmd);
    } else if (this.isFileChangeStep(item)) {
      const fc = this.parseFileChange(item);
      if (fc) events.push(fc);
    } else if (this.isArtifactStep(item)) {
      const art = this.parseArtifact(item);
      if (art) events.push(art);
    } else if (this.isAlreadyNormalized(item)) {
      events.push(item as unknown as ExportEvent);
    } else {
      // Unknown internal event - skip safely without breaking export (PRD Section 42)
      this.recordSkipped(rawType);
      return [];
    }

    // Apply mode filtering and privacy redactions
    const processedEvents: ExportEvent[] = [];
    for (const evt of events) {
      const filtered = this.filterAndTransform(evt);
      if (filtered) {
        this.diagnostics.totalExported++;
        processedEvents.push(filtered);
      }
    }

    return processedEvents;
  }

  private recordSkipped(type: string): void {
    this.diagnostics.skippedInternalEvents++;
    if (!this.diagnostics.skippedEventTypes.includes(type)) {
      this.diagnostics.skippedEventTypes.push(type);
    }
  }

  private isAlreadyNormalized(item: Record<string, unknown>): boolean {
    const validTypes = ["message", "tool_call", "tool_result", "command", "file_change", "artifact", "warning"];
    return typeof item.type === "string" && validTypes.includes(item.type);
  }

  private parseUserInputStep(item: Record<string, unknown>): MessageEvent | null {
    let content = "";
    if (item.userInput && typeof item.userInput === "object") {
      const ui = item.userInput as Record<string, unknown>;
      if (typeof ui.userResponse === "string") {
        content = ui.userResponse;
      } else if (Array.isArray(ui.items)) {
        content = ui.items
          .map((it: unknown) => {
            if (!it || typeof it !== "object") return "";
            const obj = it as Record<string, unknown>;
            return typeof obj.text === "string" ? obj.text : "";
          })
          .join(" ")
          .trim();
      }
    } else if (typeof item.userInput === "string") {
      content = item.userInput;
    } else if (typeof item.content === "string") {
      content = extractUserRequestText(item.content);
    }

    const sanitized = stripHiddenReasoning(content);
    if (!sanitized) return null;

    const ts = parseTimestamp(
      (item.metadata && typeof item.metadata === "object"
        ? (item.metadata as Record<string, unknown>).createdAt
        : undefined) ||
        item.created_at ||
        item.timestamp
    );

    return {
      type: "message",
      role: "user",
      content: sanitized,
      timestamp: ts
    };
  }

  private parsePlannerResponseStep(item: Record<string, unknown>, events: ExportEvent[]): void {
    const ts = parseTimestamp(
      (item.metadata && typeof item.metadata === "object"
        ? (item.metadata as Record<string, unknown>).createdAt
        : undefined) ||
        item.created_at ||
        item.timestamp
    );

    // 1. Text response
    let text = "";
    if (item.plannerResponse && typeof item.plannerResponse === "object") {
      const pr = item.plannerResponse as Record<string, unknown>;
      text = (pr.response || pr.modifiedResponse || "") as string;
    } else if (typeof item.content === "string") {
      text = item.content;
    }

    const sanitized = stripHiddenReasoning(text);
    if (sanitized) {
      events.push({
        type: "message",
        role: "assistant",
        content: sanitized,
        timestamp: ts
      });
    }

    // 2. Tool calls
    const toolCallsList: Array<{ name: string; input: Record<string, unknown> }> = [];
    if (item.plannerResponse && typeof item.plannerResponse === "object") {
      const pr = item.plannerResponse as Record<string, unknown>;
      if (Array.isArray(pr.toolCalls)) {
        for (const tc of pr.toolCalls) {
          if (!tc || typeof tc !== "object") continue;
          const obj = tc as Record<string, unknown>;
          const name = (obj.name || "") as string;
          let input: Record<string, unknown> = {};
          if (obj.args && typeof obj.args === "object") {
            input = cleanToolInput(obj.args as Record<string, unknown>);
          } else if (obj.arguments && typeof obj.arguments === "object") {
            input = cleanToolInput(obj.arguments as Record<string, unknown>);
          } else if (typeof obj.argumentsJson === "string") {
            try {
              input = cleanToolInput(JSON.parse(obj.argumentsJson));
            } catch {
              input = { raw: obj.argumentsJson };
            }
          }
          if (name) toolCallsList.push({ name, input });
        }
      }
    } else if (Array.isArray(item.tool_calls)) {
      for (const tc of item.tool_calls) {
        if (!tc || typeof tc !== "object") continue;
        const obj = tc as Record<string, unknown>;
        const name = (obj.name || "") as string;
        const rawInput = (obj.args && typeof obj.args === "object" ? obj.args : {}) as Record<string, unknown>;
        const input = cleanToolInput(rawInput);
        if (name) toolCallsList.push({ name, input });
      }
    }

    for (const tc of toolCallsList) {
      const tcEvent: ToolCallEvent = {
        type: "tool_call",
        tool: tc.name,
        input: tc.input,
        timestamp: ts
      };
      events.push(tcEvent);

      const fileChange = this.inferFileChangeFromTool(tcEvent);
      if (fileChange && !this.options.excludeDiffs) {
        events.push(fileChange);
      }

      const toolLower = tc.name.toLowerCase();
      if (
        toolLower === "run_command" ||
        toolLower === "execute_command" ||
        toolLower === "terminal_command" ||
        toolLower === "bash"
      ) {
        const cmd = (tc.input.CommandLine || tc.input.command || tc.input.cmd || "") as string;
        const cwd = (tc.input.Cwd || tc.input.cwd || tc.input.workingDirectory || "") as string;
        if (cmd) {
          this.pendingCommands.push({
            command: cmd,
            cwd: cwd || undefined,
            timestamp: tcEvent.timestamp
          });
        }
      }
    }
  }

  private parseRunCommandStep(item: Record<string, unknown>, events: ExportEvent[]): void {
    const rc = (item.runCommand && typeof item.runCommand === "object" ? item.runCommand : item) as Record<string, unknown>;
    const exitCode = typeof rc.exitCode === "number" ? rc.exitCode : (typeof rc.exit_code === "number" ? rc.exit_code : 0);
    let output = "";
    if (rc.combinedOutput && typeof rc.combinedOutput === "object") {
      output = String((rc.combinedOutput as Record<string, unknown>).full || "");
    } else if (typeof rc.output === "string") {
      output = rc.output;
    }
    const cmd = (rc.commandLine || rc.command || rc.proposedCommandLine || "") as string;
    const cwd = (rc.cwd || rc.Cwd || "") as string;
    const ts = parseTimestamp(
      (item.metadata && typeof item.metadata === "object"
        ? (item.metadata as Record<string, unknown>).createdAt
        : undefined) || item.timestamp
    );

    events.push({
      type: "tool_result",
      tool: "run_command",
      content: output,
      exit_code: exitCode,
      timestamp: ts
    });

    if (cmd) {
      events.push({
        type: "command",
        command: cmd,
        cwd: cwd || undefined,
        exit_code: exitCode,
        output: output || undefined,
        timestamp: ts
      });
    }
  }

  private parseViewFileStep(item: Record<string, unknown>, events: ExportEvent[]): void {
    const vf = (item.viewFile && typeof item.viewFile === "object" ? item.viewFile : item) as Record<string, unknown>;
    const ts = parseTimestamp(
      (item.metadata && typeof item.metadata === "object"
        ? (item.metadata as Record<string, unknown>).createdAt
        : undefined) || item.timestamp
    );

    events.push({
      type: "tool_result",
      tool: "view_file",
      content: vf.content,
      timestamp: ts
    });
  }

  private parseInvokeSubagentStep(item: Record<string, unknown>, events: ExportEvent[]): void {
    const isa = (item.invokeSubagent && typeof item.invokeSubagent === "object" ? item.invokeSubagent : item) as Record<string, unknown>;
    const ts = parseTimestamp(
      (item.metadata && typeof item.metadata === "object"
        ? (item.metadata as Record<string, unknown>).createdAt
        : undefined) || item.timestamp
    );

    events.push({
      type: "tool_result",
      tool: "invoke_subagent",
      content: isa.results || isa,
      timestamp: ts
    });
  }

  private parseGenericStep(item: Record<string, unknown>, events: ExportEvent[]): void {
    const content = typeof item.content === "string" ? item.content : JSON.stringify(item.content);
    const ts = parseTimestamp(item.created_at || item.timestamp);

    if (this.pendingCommands.length > 0) {
      const pending = this.pendingCommands.shift()!;
      const exitCode = typeof item.exit_code === "number" ? item.exit_code : 0;
      events.push({
        type: "tool_result",
        tool: "run_command",
        content,
        exit_code: exitCode,
        timestamp: ts || pending.timestamp
      });
      events.push({
        type: "command",
        command: pending.command,
        cwd: pending.cwd,
        exit_code: exitCode,
        output: content,
        timestamp: ts || pending.timestamp
      });
    } else {
      events.push({
        type: "tool_result",
        tool: "generic",
        content,
        timestamp: ts
      });
    }
  }

  private isMessageStep(item: Record<string, unknown>): boolean {
    return (
      item.role === "user" ||
      item.role === "assistant" ||
      item.role === "model" ||
      item.role === "system" ||
      item.type === "message" ||
      typeof item.userInput === "string" ||
      typeof item.assistantResponse === "string"
    );
  }

  private parseMessage(item: Record<string, unknown>): MessageEvent | null {
    let role: MessageEvent["role"] = "assistant";
    if (item.role === "user" || typeof item.userInput === "string") {
      role = "user";
    } else if (item.role === "system") {
      if (item.system_visible === true || item.visible === true) {
        role = "system_visible";
      } else {
        // Discard hidden system prompts (PRD Section 13)
        return null;
      }
    }

    let rawContent = "";
    if (typeof item.content === "string") {
      rawContent = item.content;
    } else if (typeof item.userInput === "string") {
      rawContent = item.userInput;
    } else if (typeof item.assistantResponse === "string") {
      rawContent = item.assistantResponse;
    } else if (typeof item.text === "string") {
      rawContent = item.text;
    } else if (item.content && typeof item.content === "object") {
      // e.g. parts array in Gemini API format
      const parts = (item.content as { parts?: Array<{ text?: string; thought?: unknown }> }).parts;
      if (Array.isArray(parts)) {
        rawContent = parts
          .filter((p) => typeof p.text === "string" && !p.thought)
          .map((p) => p.text)
          .join("\n");
      }
    } else if (Array.isArray(item.parts)) {
      rawContent = (item.parts as Array<{ text?: string; thought?: unknown }>)
        .filter((p) => typeof p.text === "string" && !p.thought)
        .map((p) => p.text)
        .join("\n");
    }

    // Strip hidden reasoning blocks if present (PRD Section 41)
    const sanitizedContent = stripHiddenReasoning(rawContent);
    if (!sanitizedContent.trim()) {
      return null;
    }

    return {
      type: "message",
      role,
      content: sanitizedContent,
      timestamp: parseTimestamp(item.timestamp || item.createdAt || item.time)
    };
  }

  private isToolCallStep(item: Record<string, unknown>): boolean {
    return (
      item.type === "tool_call" ||
      typeof item.toolCall === "object" ||
      typeof item.functionCall === "object" ||
      (typeof item.tool === "string" && item.input !== undefined)
    );
  }

  private parseToolCall(item: Record<string, unknown>): ToolCallEvent | null {
    let tool = "";
    let input: Record<string, unknown> = {};

    if (item.toolCall && typeof item.toolCall === "object") {
      const tc = item.toolCall as Record<string, unknown>;
      tool = (tc.name || tc.tool || tc.functionName || "") as string;
      input = (tc.arguments || tc.input || tc.args || {}) as Record<string, unknown>;
    } else if (item.functionCall && typeof item.functionCall === "object") {
      const fc = item.functionCall as Record<string, unknown>;
      tool = (fc.name || "") as string;
      input = (fc.args || fc.input || {}) as Record<string, unknown>;
    } else {
      tool = (item.tool || item.name || "") as string;
      input = (item.input || item.args || {}) as Record<string, unknown>;
    }

    if (!tool) return null;

    if (typeof input === "string") {
      try {
        input = JSON.parse(input);
      } catch {
        input = { raw: input };
      }
    }

    const toolCallEvent: ToolCallEvent = {
      type: "tool_call",
      tool,
      input: cleanToolInput(input || {}),
      timestamp: parseTimestamp(item.timestamp || item.createdAt || item.time)
    };

    const toolLower = tool.toLowerCase();
    if (
      toolLower === "run_command" ||
      toolLower === "execute_command" ||
      toolLower === "terminal_command" ||
      toolLower === "bash"
    ) {
      const cmd = (input.CommandLine || input.command || input.cmd || "") as string;
      const cwd = (input.Cwd || input.cwd || input.workingDirectory || "") as string;
      if (cmd) {
        this.pendingCommands.push({
          command: cmd,
          cwd: cwd || undefined,
          timestamp: toolCallEvent.timestamp
        });
      }
    }

    return toolCallEvent;
  }

  private isToolResultStep(item: Record<string, unknown>): boolean {
    return (
      item.type === "tool_result" ||
      typeof item.toolResult === "object" ||
      typeof item.functionResponse === "object" ||
      (typeof item.tool === "string" && (item.content !== undefined || item.result !== undefined))
    );
  }

  private parseToolResult(item: Record<string, unknown>): ToolResultEvent | null {
    let tool = "";
    let content: unknown = "";
    let exitCode: number | undefined = undefined;

    if (item.toolResult && typeof item.toolResult === "object") {
      const tr = item.toolResult as Record<string, unknown>;
      tool = (tr.tool || tr.name || "") as string;
      content = tr.content !== undefined ? tr.content : tr.output;
      if (typeof tr.exit_code === "number") exitCode = tr.exit_code;
    } else if (item.functionResponse && typeof item.functionResponse === "object") {
      const fr = item.functionResponse as Record<string, unknown>;
      tool = (fr.name || "") as string;
      content = fr.response !== undefined ? fr.response : fr.content;
    } else {
      tool = (item.tool || item.name || "") as string;
      content = item.content !== undefined ? item.content : item.output ?? item.result;
      if (typeof item.exit_code === "number") exitCode = item.exit_code;
    }

    if (!tool) return null;

    return {
      type: "tool_result",
      tool,
      content,
      exit_code: exitCode,
      timestamp: parseTimestamp(item.timestamp || item.createdAt || item.time)
    };
  }

  private isCommandStep(item: Record<string, unknown>): boolean {
    return item.type === "command" || typeof item.command === "string";
  }

  private parseCommand(item: Record<string, unknown>): CommandEvent | null {
    const command = (item.command || "") as string;
    if (!command) return null;

    return {
      type: "command",
      command,
      cwd: typeof item.cwd === "string" ? item.cwd : undefined,
      exit_code: typeof item.exit_code === "number" ? item.exit_code : undefined,
      output: typeof item.output === "string" ? item.output : undefined,
      timestamp: parseTimestamp(item.timestamp || item.createdAt)
    };
  }

  private isFileChangeStep(item: Record<string, unknown>): boolean {
    return item.type === "file_change" || (typeof item.path === "string" && typeof item.operation === "string");
  }

  private parseFileChange(item: Record<string, unknown>): FileChangeEvent | null {
    const pathStr = (item.path || "") as string;
    if (!pathStr) return null;

    const op = (item.operation || "modify") as FileChangeEvent["operation"];
    return {
      type: "file_change",
      path: pathStr,
      operation: ["modify", "create", "delete", "rename"].includes(op) ? op : "unknown",
      diff: typeof item.diff === "string" ? item.diff : undefined,
      timestamp: parseTimestamp(item.timestamp || item.createdAt)
    };
  }

  private isArtifactStep(item: Record<string, unknown>): boolean {
    return item.type === "artifact" || typeof item.artifact === "object";
  }

  private parseArtifact(item: Record<string, unknown>): ArtifactEvent | null {
    const art = (item.artifact && typeof item.artifact === "object" ? item.artifact : item) as Record<string, unknown>;
    const content = typeof art.content === "string" ? art.content : "";
    if (!content) return null;

    return {
      type: "artifact",
      identifier: typeof art.identifier === "string" ? art.identifier : undefined,
      title: typeof art.title === "string" ? art.title : undefined,
      content,
      timestamp: parseTimestamp(art.timestamp || art.createdAt)
    };
  }

  private inferFileChangeFromTool(toolCall: ToolCallEvent): FileChangeEvent | null {
    const tool = toolCall.tool.toLowerCase();
    const input = toolCall.input;

    if (tool === "replace_file_content" || tool === "edit_file" || tool === "apply_diff") {
      const filePath = (input.TargetFile || input.path || input.file || "") as string;
      const target = (input.TargetContent || "") as string;
      const replacement = (input.ReplacementContent || "") as string;
      let diff = (input.diff || input.patch || "") as string;
      if (!diff && (target || replacement)) {
        diff = `--- ${filePath}\n+++ ${filePath}\n@@ ... @@\n-${target}\n+${replacement}`;
      }
      if (filePath) {
        return {
          type: "file_change",
          path: filePath,
          operation: "modify",
          diff: diff || undefined,
          timestamp: toolCall.timestamp
        };
      }
    } else if (tool === "write_to_file" || tool === "create_file") {
      const filePath = (input.TargetFile || input.path || input.file || "") as string;
      const isOverwrite = Boolean(input.Overwrite);
      if (filePath) {
        return {
          type: "file_change",
          path: filePath,
          operation: isOverwrite ? "modify" : "create",
          timestamp: toolCall.timestamp
        };
      }
    }
    return null;
  }

  private inferCommandFromToolResult(
    toolResult: ToolResultEvent,
    rawItem: Record<string, unknown>
  ): CommandEvent | null {
    const toolLower = toolResult.tool.toLowerCase();
    if (
      toolLower === "run_command" ||
      toolLower === "execute_command" ||
      toolLower === "terminal_command" ||
      toolLower === "bash"
    ) {
      let cmd = (rawItem.command || rawItem.CommandLine || "") as string;
      let cwd = typeof rawItem.cwd === "string" ? rawItem.cwd : (typeof rawItem.Cwd === "string" ? rawItem.Cwd : undefined);
      let timestamp = toolResult.timestamp;

      if (!cmd && this.pendingCommands.length > 0) {
        const pending = this.pendingCommands.shift()!;
        cmd = pending.command;
        if (!cwd) cwd = pending.cwd;
        if (!timestamp) timestamp = pending.timestamp;
      }

      if (cmd) {
        return {
          type: "command",
          command: cmd,
          cwd,
          exit_code: toolResult.exit_code,
          output: typeof toolResult.content === "string" ? toolResult.content : undefined,
          timestamp
        };
      }
    }
    return null;
  }

  private filterAndTransform(event: ExportEvent): ExportEvent | null {
    // 1. Mode filtering: messages mode only keeps messages
    if (this.options.mode === "messages") {
      if (event.type !== "message" && event.type !== "session") {
        return null;
      }
    }

    // 2. Tool exclusion filter (--exclude-tools)
    if (this.options.excludeTools && (event.type === "tool_call" || event.type === "tool_result")) {
      return null;
    }

    // 3. Diff exclusion filter (--exclude-diffs)
    if (this.options.excludeDiffs && event.type === "file_change") {
      event = { ...event, diff: undefined };
    }

    // 4. Compact mode reduction
    if (this.options.mode === "compact" && this.compactReducer) {
      const reduced = this.compactReducer.reduce(event);
      if (!reduced) return null;
      event = reduced;
    }

    // 5. Secret redaction (--redact)
    if (this.options.redact) {
      const redacted = redactObject(event);
      this.diagnostics.redactedSecretsCount += redacted.redactedCount;
      event = redacted.value;
    }

    // 6. Path redaction (--redact-paths)
    if (this.options.redactPaths) {
      event = redactPathsInObject(event, this.workspacePath);
    }

    return event;
  }
}

/**
 * Strips hidden chain-of-thought, reasoning tags, and internal scratchpads.
 */
function stripHiddenReasoning(text: string): string {
  if (!text || typeof text !== "string") return "";

  // Remove XML-style thought / thinking / reasoning / scratchpad / internal tags
  let cleaned = text.replace(/<thought[\s\S]*?<\/thought>/gi, "");
  cleaned = cleaned.replace(/<thinking[\s\S]*?<\/thinking>/gi, "");
  cleaned = cleaned.replace(/<scratchpad[\s\S]*?<\/scratchpad>/gi, "");
  cleaned = cleaned.replace(/<reasoning[\s\S]*?<\/reasoning>/gi, "");
  cleaned = cleaned.replace(/<internal[\s\S]*?<\/internal>/gi, "");
  cleaned = cleaned.replace(/<antigravity_thought[\s\S]*?<\/antigravity_thought>/gi, "");
  cleaned = cleaned.replace(/<gemini_internal[\s\S]*?<\/gemini_internal>/gi, "");

  // Remove any unclosed trailing thought/thinking/scratchpad/reasoning tag
  cleaned = cleaned.replace(/<(?:thought|thinking|scratchpad|reasoning|internal|antigravity_thought|gemini_internal)[\s\S]*$/gi, "");

  return cleaned.trim();
}

function parseTimestamp(val: unknown): string | undefined {
  if (!val) return undefined;
  if (val instanceof Date) return val.toISOString();
  if (typeof val === "number") {
    try {
      return new Date(val).toISOString();
    } catch {
      return undefined;
    }
  }
  if (typeof val === "string") {
    try {
      const d = new Date(val);
      if (!isNaN(d.getTime())) return d.toISOString();
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function cleanToolInput(input: Record<string, unknown>): Record<string, unknown> {
  const cleaned: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(input)) {
    if (typeof val === "string") {
      const trimmed = val.trim();
      if (
        (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
        (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
        (trimmed.startsWith('[') && trimmed.endsWith(']'))
      ) {
        try {
          cleaned[key] = JSON.parse(trimmed);
          continue;
        } catch {
          // keep original
        }
      } else if (trimmed.startsWith('"') && trimmed.includes('<truncated')) {
        // String was JSON-encoded and truncated at the end
        const match = trimmed.match(/^"([\s\S]*?)(\s*<truncated[^>]*>)?$/);
        if (match) {
          try {
            cleaned[key] = JSON.parse(`"${match[1]}"`) + (match[2] || "");
            continue;
          } catch {
            cleaned[key] = match[1].replace(/\\"/g, '"').replace(/\\\\/g, "\\").replace(/\\n/g, "\n") + (match[2] || "");
            continue;
          }
        }
      }
      cleaned[key] = val;
    } else if (val && typeof val === "object" && !Array.isArray(val)) {
      cleaned[key] = cleanToolInput(val as Record<string, unknown>);
    } else {
      cleaned[key] = val;
    }
  }
  return cleaned;
}

function extractUserRequestText(raw: string): string {
  if (!raw) return "";
  const match = raw.match(/<USER_REQUEST>([\s\S]*?)(?:<\/USER_REQUEST>|<ADDITIONAL_METADATA>|$)/i);
  if (match) {
    return match[1].trim();
  }
  // Strip ADDITIONAL_METADATA block if present
  let cleaned = raw.replace(/<ADDITIONAL_METADATA>[\s\S]*?<\/ADDITIONAL_METADATA>/gi, "");
  cleaned = cleaned.replace(/<ADDITIONAL_METADATA>[\s\S]*$/gi, "");
  return cleaned.trim();
}

