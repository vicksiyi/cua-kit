/** Original bie. Self-contained because its compiled body runs inside the page. */
export const installPageClipboardBridge = (bindingName: string) => {
  const root = globalThis as any;
  const previous = root.__browserUseClipboardBridge;
  if (previous?.bindingName === bindingName) return;
  previous?.cleanup();
  const binding = root[bindingName];
  if (typeof binding !== "function")
    throw new Error("Browser Use clipboard bridge is unavailable");
  const win = globalThis as any,
    nav = navigator as any;
  const original = nav.clipboard;
  const owned = Object.prototype.hasOwnProperty.call(nav, "clipboard");
  const descriptor = Object.getOwnPropertyDescriptor(nav, "clipboard");
  const pending = new Map<
    number,
    { resolve: (items: any[]) => void; reject: (error: unknown) => void }
  >();
  let sequence = 0;
  const encode = (buffer: ArrayBuffer) => {
    const bytes = new Uint8Array(buffer),
      chunkSize = 32768;
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += chunkSize)
      binary += String.fromCharCode(
        ...bytes.subarray(offset, offset + chunkSize),
      );
    return btoa(binary);
  };
  const decode = (base64: string) => {
    const binary = atob(base64),
      bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index++)
      bytes[index] = binary.charCodeAt(index);
    return bytes.buffer;
  };
  const blob = (entry: any) =>
    new Blob(
      [
        typeof entry.text === "string"
          ? entry.text
          : decode(entry.base64 ?? ""),
      ],
      { type: entry.mime_type },
    );
  const item = (data: any) =>
    typeof ClipboardItem === "function"
      ? new ClipboardItem(
          Object.fromEntries(
            data.entries.map((entry: any) => [entry.mime_type, blob(entry)]),
          ),
          { presentationStyle: data.presentation_style ?? "unspecified" },
        )
      : {
          types: data.entries.map((entry: any) => entry.mime_type),
          presentationStyle: data.presentation_style ?? "unspecified",
          getType: async (mime: string) => {
            const entry = data.entries.find(
              (entry: any) => entry.mime_type === mime,
            );
            if (entry == null)
              throw new DOMException(
                `No clipboard entry for ${mime}`,
                "NotFoundError",
              );
            return blob(entry);
          },
        };
  const serialize = async (items: any) =>
    await Promise.all(
      Array.from(items).map(async (value: any) => ({
        entries: await Promise.all(
          value.types.map(async (mime: string) => {
            const data = await value.getType(mime);
            return mime.startsWith("text/")
              ? { mime_type: mime, text: await data.text() }
              : { mime_type: mime, base64: encode(await data.arrayBuffer()) };
          }),
        ),
        presentation_style: value.presentationStyle ?? "unspecified",
      })),
    );
  const request = (operation: string, items?: any[]) =>
    new Promise<any[]>((resolve, reject) => {
      const id = ++sequence;
      pending.set(id, { reject, resolve });
      try {
        binding(JSON.stringify({ id, items, operation }));
      } catch (error) {
        pending.delete(id);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  const assertReceiver = (receiver: unknown) => {
    if (receiver !== clipboard) throw new TypeError("Illegal invocation");
  };
  const methods: Record<string, any> = {
    read: async function (this: unknown) {
      assertReceiver(this);
      return (await request("read")).map(item);
    },
    readText: async function (this: unknown) {
      assertReceiver(this);
      const entry = (await request("read"))
        .flatMap((value) => value.entries)
        .find((value) => value.mime_type === "text/plain");
      return entry == null ? "" : await blob(entry).text();
    },
    write: async function (this: unknown, items: any) {
      assertReceiver(this);
      if (arguments.length === 0)
        throw new TypeError(
          "Failed to execute 'write' on 'Clipboard': 1 argument required",
        );
      const values = await serialize(items);
      if (values.length !== 0) await request("write", values);
    },
    writeText: async function (this: unknown, text: any) {
      assertReceiver(this);
      if (arguments.length === 0)
        throw new TypeError(
          "Failed to execute 'writeText' on 'Clipboard': 1 argument required",
        );
      const value = `${text}`;
      await request("write", [
        {
          entries: [{ mime_type: "text/plain", text: value }],
          presentation_style: "unspecified",
        },
      ]);
    },
  };
  let clipboard = {
    ...methods,
    addEventListener: () => {},
    dispatchEvent: () => true,
    removeEventListener: () => {},
  };
  const replacement = { configurable: true, get: () => clipboard },
    names = Object.keys(methods);
  const originals = new Map<string, PropertyDescriptor | undefined>();
  let patched: any;
  const restore = () => {
    if (patched != null) {
      for (const [name, old] of originals)
        if (
          Object.getOwnPropertyDescriptor(patched, name)?.value ===
          methods[name]
        ) {
          if (old == null) Reflect.deleteProperty(patched, name);
          else Object.defineProperty(patched, name, old);
        }
      patched = undefined;
      originals.clear();
    }
  };
  const patch = (target: any) => {
    patched = target;
    try {
      for (const name of names) {
        originals.set(name, Object.getOwnPropertyDescriptor(target, name));
        Object.defineProperty(target, name, {
          configurable: true,
          enumerable: true,
          value: methods[name],
          writable: true,
        });
      }
      return true;
    } catch {
      restore();
      return false;
    }
  };
  if (original != null) {
    const prototype = Object.getPrototypeOf(original);
    if (
      patch(original) ||
      (prototype != null &&
        names.every((name) => name in prototype) &&
        patch(prototype))
    )
      clipboard = original;
    else Object.defineProperty(nav, "clipboard", replacement);
  } else Object.defineProperty(nav, "clipboard", replacement);
  const cleanup = () => {
    if (root.__browserUseClipboardBridge?.bindingName === bindingName) {
      for (const frame of document.querySelectorAll("iframe,frame"))
        if (
          frame instanceof HTMLIFrameElement ||
          frame instanceof HTMLFrameElement
        )
          frame.contentWindow?.postMessage(bindingName, "*");
      win.removeEventListener("message", onMessage);
      for (const waiter of pending.values())
        waiter.reject(new Error("Browser Use clipboard bridge was removed"));
      pending.clear();
      if (patched != null) restore();
      else if (
        Object.getOwnPropertyDescriptor(nav, "clipboard")?.get ===
        replacement.get
      ) {
        if (owned && descriptor != null)
          Object.defineProperty(nav, "clipboard", descriptor);
        else Reflect.deleteProperty(nav, "clipboard");
      }
      delete root.__browserUseClipboardBridge;
      if (root[bindingName] === binding)
        Reflect.deleteProperty(root, bindingName);
    }
  };
  const onMessage = (event: any) => {
    if (
      event.data === bindingName &&
      (event.source === win || event.source === win.parent)
    )
      cleanup();
  };
  const bridge = {
    bindingName,
    cleanup,
    respond: (payload: string) => {
      let response;
      try {
        response = JSON.parse(payload);
      } catch {
        return;
      }
      const waiter = pending.get(response.id);
      if (waiter != null) {
        pending.delete(response.id);
        if (response.ok)
          waiter.resolve(Array.isArray(response.items) ? response.items : []);
        else
          waiter.reject(
            new Error(response.error ?? "Clipboard request failed"),
          );
      }
    },
  };
  root.__browserUseClipboardBridge = bridge;
  win.addEventListener("message", onMessage);
};
/** Original IL wrapper; function body is compiled readable TS, not a vendor-runtime fallback. */
export function clipboardInstallationScript(bindingName: string) {
  return `(() => {\n    const __name = (target) => target;\n    const installPageClipboardBridge = ${installPageClipboardBridge.toString()};\n    installPageClipboardBridge(${JSON.stringify(bindingName)});\n  })()`;
}
