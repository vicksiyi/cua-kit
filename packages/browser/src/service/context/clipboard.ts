import type { CdpTarget } from "../cdp/dispatch_helpers";
export type ClipboardEntry =
  { mime_type: string; text: string } | { mime_type: string; base64: string };
export interface ClipboardItem {
  entries: ClipboardEntry[];
  presentation_style?: "unspecified" | "inline" | "attachment";
}
export interface PageClipboardBridge {
  ensure(target: CdpTarget): Promise<void>;
  cleanup(): Promise<void>;
  dispose(): Promise<void>;
}
export interface ClipboardStore {
  read(): ClipboardItem[];
  write(items: unknown, operation: string): void;
}
/** Original yie/wie/_ie. Preserve validation order, atob semantics and property projection. */
export function validateClipboardItems(
  items: unknown,
  operation: string,
): ClipboardItem[] {
  if (!Array.isArray(items) || items.length === 0)
    throw new Error(`${operation} requires items`);
  return items.map((item) => {
    if (
      item == null ||
      typeof item !== "object" ||
      !Array.isArray(item.entries) ||
      item.entries.length === 0
    )
      throw new Error(`${operation} requires clipboard item entries`);
    if (
      item.presentation_style != null &&
      item.presentation_style !== "unspecified" &&
      item.presentation_style !== "inline" &&
      item.presentation_style !== "attachment"
    )
      throw new Error(`${operation} requires a valid presentation_style`);
    return {
      entries: item.entries.map((entry: unknown) =>
        validateClipboardEntry(entry, operation),
      ),
      ...(item.presentation_style == null
        ? {}
        : { presentation_style: item.presentation_style }),
    };
  });
}
function validateClipboardEntry(entry: any, operation: string): ClipboardEntry {
  if (
    entry == null ||
    typeof entry !== "object" ||
    typeof entry.mime_type !== "string" ||
    entry.mime_type.length === 0
  )
    throw new Error(`${operation} requires entry mime_type`);
  if (typeof entry.text === "string" && typeof entry.base64 !== "string")
    return { mime_type: entry.mime_type, text: entry.text };
  if (typeof entry.base64 === "string" && typeof entry.text !== "string") {
    try {
      atob(entry.base64);
    } catch {
      throw new Error(`${operation} requires valid base64 entry data`);
    }
    return { mime_type: entry.mime_type, base64: entry.base64 };
  }
  throw new Error(`${operation} requires exactly one of entry text or base64`);
}
/** Original vie. */
export function copyClipboardItems(items: ClipboardItem[]): ClipboardItem[] {
  return items.map((item) => ({
    entries: item.entries.map((entry) => ({ ...entry })),
    ...(item.presentation_style == null
      ? {}
      : { presentation_style: item.presentation_style }),
  }));
}
/** Original Eg with lexical xg bridge dependency supplied explicitly until its reconstruction is complete. */
export function createClipboardClass<Cdp>(
  Bridge: new (cdp: Cdp, clipboard: ClipboardStore) => PageClipboardBridge,
) {
  return class BrowserClipboard {
    items: ClipboardItem[] = [];
    operationTail: Promise<void> = Promise.resolve();
    bridges = new Map<Cdp, PageClipboardBridge>();
    disposed = false;
    async ensurePageClipboard(cdp: Cdp, target: CdpTarget) {
      if (this.disposed) throw new Error("Browser Use clipboard is disposed");
      let bridge = this.bridges.get(cdp);
      if (bridge == null) {
        bridge = new Bridge(cdp, this);
        this.bridges.set(cdp, bridge);
      }
      await bridge.ensure(target);
    }
    async cleanupPageClipboards() {
      await Promise.all(
        [...this.bridges.values()].map((bridge) => bridge.cleanup()),
      );
    }
    async disposePageClipboard(cdp: Cdp) {
      await this.bridges.get(cdp)?.dispose();
      this.bridges.delete(cdp);
    }
    runExclusive<T>(run: () => T | PromiseLike<T>) {
      const result = this.operationTail.then(run);
      this.operationTail = result.then(
        () => {},
        () => {},
      );
      return result;
    }
    read() {
      return copyClipboardItems(this.items);
    }
    write(items: unknown, operation: string) {
      this.items = validateClipboardItems(items, operation);
    }
    async dispose() {
      this.disposed = true;
      await Promise.all(
        [...this.bridges.values()].map((bridge) => bridge.dispose()),
      );
      this.bridges.clear();
      this.items = [];
    }
  };
}
