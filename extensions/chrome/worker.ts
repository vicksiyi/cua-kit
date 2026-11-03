// User consent is explicit per tab and origin, held only for this worker lifetime.
const grants = new Map<number, string>();
const attached = new Set<number>();
const childSessions = new Map<number, Set<string>>();
let nativePort: chrome.runtime.Port | undefined;
const HOST_NAME = 'com.vicksiyi.cua_kit';
function originOf(url: string): string {
  const parsed = new URL(url);
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Only HTTP(S) tabs can be granted.');
  return parsed.origin;
}
async function releaseTab(tabId: number) {
  childSessions.delete(tabId);
  if (attached.delete(tabId)) await chrome.debugger.detach({ tabId }).catch(() => {});
}
async function revokeTab(tabId: number) {
  grants.delete(tabId); await releaseTab(tabId);
  nativePort?.postMessage({ event: 'revoked', tabId });
  await chrome.action.setBadgeText({ tabId, text: '' }).catch(() => {});
}
function connectNative() {
  if (nativePort) return;
  const port = chrome.runtime.connectNative(HOST_NAME); nativePort = port;
  port.onMessage.addListener((request: unknown) => { void handleRequest(request).then(result => port.postMessage(result)).catch(() => {}); });
  port.onDisconnect.addListener(() => {
    void chrome.runtime.lastError;
    if (nativePort === port) nativePort = undefined;
    for (const id of grants.keys()) void revokeTab(id);
  });
  port.postMessage({ event: 'ready', protocolVersion: 1, extensionId: chrome.runtime.id });
}
async function grantTab(tabId: number) {
  const tab = await chrome.tabs.get(tabId);
  const origin = originOf(tab.url ?? '');
  grants.set(tabId, origin); connectNative();
  await chrome.action.setBadgeText({ tabId, text: 'ON' });
}
chrome.action.onClicked.addListener(tab => {
  if (tab.id === undefined) return;
  const action = grants.has(tab.id) ? revokeTab(tab.id) : grantTab(tab.id);
  void action.catch(error => chrome.action.setTitle({ tabId: tab.id, title: String(error) }));
});
chrome.tabs.onUpdated.addListener((tabId, change) => {
  if (!change.url || !grants.has(tabId)) return;
  try { if (originOf(change.url) !== grants.get(tabId)) void revokeTab(tabId); }
  catch { void revokeTab(tabId); }
});
chrome.tabs.onRemoved.addListener(tabId => { void revokeTab(tabId); });
chrome.debugger.onDetach.addListener(source => {
  if (source.tabId === undefined) return;
  attached.delete(source.tabId); childSessions.delete(source.tabId);
  nativePort?.postMessage({ event: 'detached', tabId: source.tabId });
});
chrome.debugger.onEvent.addListener((source, method, params: any) => {
  if (source.tabId === undefined || !attached.has(source.tabId)) return;
  if (method === 'Target.attachedToTarget') {
    let sessions = childSessions.get(source.tabId); if (!sessions) childSessions.set(source.tabId, sessions = new Set());
    sessions.add(params.sessionId);
  }
  if (method === 'Target.detachedFromTarget') childSessions.get(source.tabId)?.delete(params.sessionId);
  nativePort?.postMessage({ event: 'cdp', tabId: source.tabId, sessionId: source.sessionId, method, params });
});
async function authorizedTab(tabId: unknown) {
  if (typeof tabId !== 'number' || !grants.has(tabId)) throw new Error('PERMISSION_DENIED: Tab was not granted by the user.');
  const tab = await chrome.tabs.get(tabId);
  if (originOf(tab.url ?? '') !== grants.get(tabId)) { await revokeTab(tabId); throw new Error('PERMISSION_DENIED: Tab navigated outside its granted origin.'); }
  return tab;
}
async function handleRequest(raw: unknown): Promise<unknown> {
  const request = raw as { id: string; method: string; params?: Record<string, any> };
  if (!request || typeof request.id !== 'string') return { error: 'Malformed request.' };
  try {
    const params = request.params ?? {};
    let result: unknown;
    switch (request.method) {
      case 'listTabs': {
        const tabs: unknown[] = [];
        for (const tabId of grants.keys()) {
          try { const tab = await authorizedTab(tabId); tabs.push({ id: tab.id, title: tab.title, url: tab.url }); } catch { /* revoked */ }
        }
        result = tabs; break;
      }
      case 'attach': {
        const tab = await authorizedTab(params.tabId); const tabId = tab.id!;
        if (!attached.has(tabId)) { await chrome.debugger.attach({ tabId }, '1.3'); attached.add(tabId); await authorizedTab(tabId).catch(async error => { await releaseTab(tabId); throw error; }); }
        result = {}; break;
      }
      case 'closeTab': await authorizedTab(params.tabId); await revokeTab(params.tabId); await chrome.tabs.remove(params.tabId); result = {}; break;
      case 'detach': await authorizedTab(params.tabId); await releaseTab(params.tabId); result = {}; break;
      case 'cdp': {
        await authorizedTab(params.tabId);
        if (!attached.has(params.tabId)) throw new Error('TARGET_NOT_FOUND: Attach before sending CDP commands.');
        if (params.sessionId && !childSessions.get(params.tabId)?.has(params.sessionId)) throw new Error('PERMISSION_DENIED: Unknown child session.');
        const method = params.method as string;
        const domain = typeof method === 'string' ? method.split('.')[0] : '';
        if (!['Accessibility', 'DOM', 'DOMSnapshot', 'Input', 'Page', 'Runtime', 'Target'].includes(domain ?? '')) throw new Error('UNSUPPORTED_CAPABILITY: CDP domain is not enabled.');
        if (domain === 'Target' && method !== 'Target.setAutoAttach') throw new Error('PERMISSION_DENIED: Only child auto-attach is enabled.');
        if (method === 'Page.navigate' && originOf(params.params?.url ?? '') !== grants.get(params.tabId)) throw new Error('PERMISSION_DENIED: Navigation would leave the granted origin.');
        const target = { tabId: params.tabId, ...(params.sessionId ? { sessionId: params.sessionId } : {}) };
        result = await chrome.debugger.sendCommand(target, method, params.params ?? {}); break;
      }
      default: throw new Error('UNSUPPORTED_CAPABILITY: Unknown extension command.');
    }
    return { id: request.id, result };
  } catch (error) { return { id: request.id, error: { message: String(error) } }; }
}
// These bindings are visible only inside the extension worker's own DevTools execution context.
// They are not exposed to web pages or external message senders.
Object.assign(globalThis, { cuaTestGrant: grantTab, cuaTestRevoke: revokeTab });
