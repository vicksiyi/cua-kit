import { standaloneAppPolicyDenialHint } from "./native-permissions";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { stripVTControlCharacters } from "node:util";
import type { AgentMessage } from "./contracts";
/** Caller-side presentation only; this does not change model or MCP protocols. */
export function createTerminalTrace(env: NodeJS.ProcessEnv = process.env, write = (text: string) => console.error(text)) {
  const secrets = Object.entries(env).filter(([key, value]) => /(?:API_KEY|TOKEN|SECRET|PASSWORD)/i.test(key) && value && value.length >= 8).map(([, value]) => value!);
  const clean = (text: string) => stripVTControlCharacters(secrets.reduce((text, secret) => text.split(secret).join("[REDACTED]"), text));
  let imageDirectory: string | undefined, imageCount = 0;
  return (message: AgentMessage) => {
    const time = new Date().toISOString();
    if (message.role === "assistant" && message.toolCalls) {
      for (const call of message.toolCalls) write(clean(`[${time}] TOOL REQUEST ${call.name} (${call.id})\n${JSON.stringify(call.arguments, null, 2)}`));
    }
    if (message.role !== "tool") return;
    write(clean(`[${time}] TOOL RESULT ${message.name} (${message.callId}) ${message.result.isError ? "ERROR" : "OK"}`));
    for (const item of message.result.content) {
      if (item.type === "text") {
        const text = clean(item.text);
        if (message.result.isError && env.CUA_DEMO_NATIVE_POLICY_CONTEXT && (env.CUA_DEMO_NATIVE_POLICY_SOURCE ?? "standalone") === "standalone") {
          const hint = standaloneAppPolicyDenialHint(text);
          if (hint) write(clean(hint));
        }
        write(env.CUA_DEMO_VERBOSE === "1" || text.length <= 2000 ? text : `${text.slice(0, 2000)}\n[${text.length - 2000} more characters; CUA_DEMO_VERBOSE=1 shows full text]`);
      } else if (item.type === "audio") {
        write(`Audio returned (${item.mimeType}, ${Buffer.byteLength(item.data, "base64")} bytes)`);
      } else {
        const extension = ({ "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" } as Record<string, string>)[item.mimeType];
        if (!extension) { write(`Image returned (${item.mimeType}); unsupported preview format`); continue; }
        imageDirectory ??= mkdtempSync(join(tmpdir(), "cua-demo-images-"));
        const file = join(imageDirectory, `${++imageCount}.${extension}`);
        writeFileSync(file, Buffer.from(item.data, "base64"), { mode: 0o600 });
        write(`Screenshot: ${file}`);
      }
    }
  };
}
