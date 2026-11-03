import type { ClipboardBackend, ClipboardContent } from '../core/clipboard.js';
import type { NativeHelper } from './helper.js';
export class NativeClipboard implements ClipboardBackend {
  constructor(private helper: NativeHelper) {}
  async acquire(content: ClipboardContent) {
    const { token } = await this.helper.request<{token:string}>('clipboardBegin', content as unknown as Record<string,unknown>);
    let used = false;
    return { restore: async () => {
      if (used) return false; used = true;
      return (await this.helper.request<{restored:boolean}>('clipboardRestore',{token})).restored;
    } };
  }
}
