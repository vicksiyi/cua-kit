import { endianness } from 'node:os';
// Fixed categories only: never persist the original error text or arbitrary
// provider strings. These are diagnostic hints, not retry/authorization policy.
export function wireErrorKind(error) {
  if (!error || typeof error !== 'object') return undefined;
  const message = typeof error.message === 'string' ? error.message : '';
  if (message.includes('Detached while handling command')) return 'detached-during-command';
  if (message.includes('Debugger unattached') || message.includes('Debugger is not attached')) return 'debugger-unattached';
  if (/^Timed out after [0-9]+(?:\.[0-9]+)?ms waiting for CDP command [A-Za-z][A-Za-z0-9_.]{0,100}\.$/.test(message)) return 'cdp-command-timeout';
  if (error.code === -32601) return 'method-not-found';
  return 'other';
}
/** Observe framed RPC metadata only. Never return raw payloads or auth frames. */
export function createWireObserver(record, littleEndian = endianness() === 'LE') {
  let buffered = Buffer.alloc(0), disabled = false;
  return chunk => {
    if (disabled) return;
    buffered = Buffer.concat([buffered, chunk]);
    while (buffered.length >= 4) {
      const length = littleEndian ? buffered.readUInt32LE(0) : buffered.readUInt32BE(0);
      if (length > 16 * 1024 * 1024) { disabled = true; buffered = Buffer.alloc(0); record({diagnostic:'frame-too-large'}); return; }
      if (buffered.length < length + 4) return;
      const raw = buffered.subarray(4, length + 4); buffered = buffered.subarray(length + 4);
      let value; try { value = JSON.parse(raw); } catch { record({diagnostic:'invalid-json'}); continue; }
      if (!value || typeof value !== 'object' || value.jsonrpc !== '2.0') continue;
      const params = value.params ?? {};
      const name = v => typeof v === 'string' && /^[A-Za-z][A-Za-z0-9_.]{0,100}$/.test(v) ? v : undefined;
      const integer = v => Number.isSafeInteger(v) ? v : undefined;
      record({id:integer(value.id),method:name(value.method),cdp:name(params.method),
        tabId:integer(params.tabId ?? params.target?.tabId),sourceTabId:integer(params.source?.tabId),
        errorCode:integer(value.error?.code),errorKind:wireErrorKind(value.error)});
    }
  };
}
