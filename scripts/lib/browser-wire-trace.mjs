import { endianness } from 'node:os';
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
        errorCode:integer(value.error?.code)});
    }
  };
}
