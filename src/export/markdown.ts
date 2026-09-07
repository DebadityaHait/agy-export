import { SessionEvent, ExportEvent } from "../schema/v1.js";

/**
 * Formats a session and its events into clean, readable GitHub-flavored Markdown.
 */
export function formatMarkdown(session: SessionEvent, events: ExportEvent[]): string {
  const parts: string[] = [];

  const title = session.title || "Conversation";
  parts.push(`# ${title}\n`);

  parts.push(`**Conversation:** \`${session.id}\``);
  parts.push(`**Workspace:** \`${session.workspace}\``);
  if (session.updated_at) {
    parts.push(`**Last active:** ${session.updated_at}`);
  }
  if (session.surface) {
    parts.push(`**Surface:** ${session.surface}`);
  }

  parts.push("\n---\n");

  for (const evt of events) {
    switch (evt.type) {
      case "message": {
        let roleName = "Assistant";
        if (evt.role === "user") roleName = "User";
        else if (evt.role === "system_visible") roleName = "System Notice";

        parts.push(`## ${roleName}\n`);
        parts.push(evt.content + "\n");
        break;
      }

      case "tool_call": {
        parts.push(`### Tool — ${evt.tool}\n`);
        if (evt.input && Object.keys(evt.input).length > 0) {
          parts.push("```json");
          parts.push(JSON.stringify(evt.input, null, 2));
          parts.push("```\n");
        }
        break;
      }

      case "tool_result": {
        parts.push(`### Tool result — ${evt.tool}\n`);
        if (evt.summary) {
          parts.push(`*${evt.summary}*\n`);
        }
        if (evt.content !== undefined && evt.content !== null) {
          const contentStr = typeof evt.content === "string" ? evt.content : JSON.stringify(evt.content, null, 2);
          parts.push("```text");
          parts.push(contentStr);
          parts.push("```\n");
        }
        if (evt.exit_code !== undefined) {
          parts.push(`Exit code: \`${evt.exit_code}\`\n`);
        }
        break;
      }

      case "command": {
        parts.push("### Command\n");
        parts.push("```bash");
        parts.push(evt.command);
        parts.push("```\n");
        if (evt.exit_code !== undefined) {
          parts.push(`Exit code: \`${evt.exit_code}\`\n`);
        }
        if (evt.output) {
          parts.push("```text");
          parts.push(evt.output);
          parts.push("```\n");
        }
        break;
      }

      case "file_change": {
        parts.push(`### File change (${evt.operation}) — ${evt.path}\n`);
        if (evt.diff) {
          parts.push("```diff");
          parts.push(evt.diff);
          parts.push("```\n");
        }
        break;
      }

      case "artifact": {
        const artTitle = evt.title ? ` — ${evt.title}` : "";
        parts.push(`### Artifact${artTitle}\n`);
        parts.push(evt.content + "\n");
        break;
      }

      case "warning": {
        parts.push(`> [!WARNING]\n> ${evt.message}\n`);
        break;
      }

      case "session":
        break;
    }
  }

  return parts.join("\n").replace(/\n{3,}/g, "\n\n");
}
