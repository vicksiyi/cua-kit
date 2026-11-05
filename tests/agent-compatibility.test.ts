import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { AgentLoop, AgentStepBudgetError } from '@vicksiyi/cua-kit/agent/loop';
import { McpToolClient } from '@vicksiyi/cua-kit/agent/mcp-client';
import * as shared from '@core/agent-loop';

test('root public agent exports use the shared implementation and plain Node can load it', () => {
  assert.equal(AgentLoop, shared.AgentLoop);
  assert.equal(AgentStepBudgetError, shared.AgentStepBudgetError);
  assert.equal(McpToolClient, shared.McpToolClient);
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', 'import {AgentLoop} from "@vicksiyi/cua-kit/agent/loop"; import {AgentLoop as Shared} from "@core/agent-loop"; if(AgentLoop !== Shared) process.exit(1);'], {encoding:'utf8'});
  assert.equal(result.status, 0, result.stderr);
});

test('root agent integration receives initialization guidance and cleans up success and failure', async () => {
  let ended = 0;
  const tools: shared.ToolClient = {
    listTools: async () => [],
    getInstructions: () => 'fixture initialization guidance',
    callTool: async () => {throw Error('unexpected action');},
    endTurn: async () => {ended++;},
    close: async () => {},
  };
  const loop = new AgentLoop({decide: async input => {
    assert.match(input.system, /fixture initialization guidance/);
    return {text:'observed fixture'};
  }}, tools);
  assert.equal((await loop.run('question')).answer, 'observed fixture');
  assert.equal(ended, 1);
  await assert.rejects(new AgentLoop({decide: async () => {throw Error('fixture model failure');}}, tools).run('question'), /fixture model failure/);
  assert.equal(ended, 2);
});
