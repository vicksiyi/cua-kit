import { access, readFile } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import Schema from '@deepseek-ai/schemastery';

export const Config = Schema.object({
  repositoryPath: Schema.string().default(process.env.CUA_KIT_ROOT ?? fileURLToPath(new URL('../../../', import.meta.url))),
  nodeCommand: Schema.string().default(process.execPath),
  surfaces: Schema.union(['browser', 'computer', 'browser,computer']).default('browser,computer'),
  hostDirectory: Schema.string().default(join(homedir(), '.core-cua/endpoints')),
  nativeAppPolicyMode: Schema.union(['ask', 'allowlist']).default('ask'),
  runtimeEnvironment: Schema.dict(Schema.string()).default({}),
  requestTimeoutMs: Schema.number().min(1000).max(600000).step(1).default(90000),
  approvalTimeoutMs: Schema.number().min(1000).max(1800000).step(1).default(300000),
  defaultJsTimeoutMs: Schema.number().min(1).max(60000).step(1).default(60000),
});

// Deliberately construct an environment instead of copying the DSH process.
// In particular, model credentials, NODE_OPTIONS and project .env stay in DSH.
export async function serverParameters(config, parent = process.env) {
  if (!isAbsolute(config.repositoryPath)) throw new Error('cua-kit repositoryPath must be absolute');
  const root = config.repositoryPath;
  const entry = join(root, 'packages/agent-loop/src/restored-mcp.ts');
  await access(entry).catch(() => { throw new Error(`CUA MCP entry missing: ${entry}. Set CUA_KIT_ROOT to the cua-kit checkout.`); });
  const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  if (manifest.name !== '@vicksiyi/cua-kit') throw new Error('repositoryPath must point to the cua-kit repository');
  if (process.platform !== 'darwin') throw new Error('This restored Rust/Swift runtime currently requires macOS');
  const runtime = { ...config.runtimeEnvironment };
  if (Object.keys(runtime).some(key => /(?:KEY|TOKEN|SECRET|PASSWORD|DEEPSEEK|CUA_MODEL)/i.test(key))) {
    throw new Error('Do not place model credentials in runtimeEnvironment; configure the model in DSH');
  }
  runtime.CUA_REPL_ENABLED_SURFACES = config.surfaces;
  runtime.NODE_REPL_DISABLE_ANALYTICS ??= '1';
  if (config.surfaces.includes('computer') && config.nativeAppPolicyMode === 'ask'
      && (runtime.CORE_CUA_POLICY_SOURCE ?? 'standalone') === 'standalone'
      && runtime.CORE_CUA_APP_POLICY === undefined) {
    // Policy eligibility and user consent are separate. This enables the
    // original per-app elicitation gate; it never approves that gate itself.
    runtime.CORE_CUA_APP_POLICY = JSON.stringify({
      '*': { decision: 'allowed', risk: 'high', allowPersistentApproval: false },
    });
  }
  if (config.surfaces.includes('browser') && runtime.CORE_CUA_ENDPOINT_FILES === undefined) {
    runtime.CORE_CUA_HOST_DIRECTORY ??= config.hostDirectory;
  }
  const env = {};
  for (const key of ['HOME', 'PATH', 'TMPDIR', 'LANG', 'LC_ALL', 'HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'NO_PROXY', 'http_proxy', 'https_proxy', 'all_proxy', 'no_proxy']) {
    if (parent[key] !== undefined) env[key] = parent[key];
  }
  env.CUA_RUNTIME_SUPERVISOR = 'rust';
  env.CUA_MCP_ENV = JSON.stringify(runtime);
  return {
    command: config.nodeCommand,
    args: ['--import', 'tsx', entry],
    cwd: root,
    env,
    stderr: 'inherit',
    maxBufferSize: 64 * 1024 * 1024,
  };
}
