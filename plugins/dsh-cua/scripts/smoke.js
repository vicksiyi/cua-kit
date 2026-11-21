import assert from 'node:assert/strict';
import { Context } from '@deepseek-ai/cordis';
import SystemPrompt from '@deepseek-ai/dsh-system-prompt';
import ToolRuntime from '@deepseek-ai/dsh-tools';
import { apply, Config } from '../index.js';

// The real plugin, official DSH result adapter and real Rust/Swift MCP runtime.
// No model calls, website visits, window opening, clicks or system permission prompts.
const ctx = new Context();
try {
  await ctx.plugin(SystemPrompt);
  await ctx.plugin(ToolRuntime);
  await apply(ctx, Config({ surfaces: 'computer' }));
  assert.ok(ctx.tools.get('cua_js'));
  assert.ok(!ctx.tools.get('cua_turn_ended'));
  const session = { id: 'cua-plugin-smoke' };
  const exec = { agent: { id: session.id }, signal: new AbortController().signal, callId: 'smoke', name: 'cua_js' };
  ctx.emit('session/event', session, { type: 'turn/start', data: { turn: 1 } });
  const tool = ctx.tools.get('cua_js');
  const value = await tool.execute({ code: 'await import("@core/cua/tinyskyAlt"); nodeRepl.write(JSON.stringify({answer:6*7,apps:(await cua.listApps({emit:false})).length}))' }, exec);
  const text = tool.output.render({}, value).map(item => item.text ?? '').join('\n');
  assert.match(text, /"answer"\s*:\s*42/);
  assert.match(text, /"apps"\s*:\s*\d+/);
  await tool.execute({ completion_summary: 'Checked CUA plugin connection' }, exec);
  ctx.emit('session/event', session, { type: 'turn/end', data: { turn: 1 } });
  // A second turn waits behind cleanup and retains the same runtime.
  ctx.emit('session/event', session, { type: 'turn/start', data: { turn: 2 } });
  const second = await tool.execute({ code: 'nodeRepl.write(21*2)' }, exec);
  assert.match(tool.output.render({}, second).map(item => item.text ?? '').join('\n'), /42/);
  ctx.emit('session/event', session, { type: 'turn/end', data: { turn: 2 } });
  console.log('PASS: DSH plugin -> official tool adapter -> restored MCP -> Rust/Swift; JS=42, native inventory, summary and two-turn cleanup. No model API was called.');
} finally {
  await ctx.fiber.dispose();
}
