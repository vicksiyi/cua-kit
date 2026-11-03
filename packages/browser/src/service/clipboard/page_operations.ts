import type { ClipboardItem } from "../context/clipboard";
import type { credentialFieldPolicy } from "./page_execution";
interface PageClipboardArguments {
  action: string;
  clipboardItems: ClipboardItem[];
  protectedCredentialFieldPolicy?: typeof credentialFieldPolicy;
  cutToken?: string;
  iabInputTargetToken?: string;
  requireDocumentFocus?: boolean;
  documentOnly?: boolean;
  richTextFallback?: boolean;
  replaceInputValue?: boolean;
}
/** Original Cp. Self-contained because it is serialized into the page's execution world. */
export async function pageClipboardOperation(
  args: PageClipboardArguments,
): Promise<{ items?: ClipboardItem[]; cutToken?: string }> {
  const localName = Object.getOwnPropertyDescriptor(
    window.Element.prototype,
    "localName",
  )?.get;
  const namespace = Object.getOwnPropertyDescriptor(
    window.Element.prototype,
    "namespaceURI",
  )?.get;
  if (localName == null || namespace == null)
    throw new Error(
      "Browser Use virtual clipboard requires native DOM getters",
    );
  const asElement = (value: any): any => {
    if (value == null) return null;
    try {
      localName.call(value);
    } catch {
      return null;
    }
    return value.ownerDocument.defaultView == null ? null : value;
  };
  const isHtml = (element: any) =>
    namespace.call(element) === "http://www.w3.org/1999/xhtml";
  const isTag = (element: any, tag: string) =>
    isHtml(element) && localName.call(element) === tag;
  const ownerWindow = (element: any): any =>
    element.ownerDocument.defaultView ?? window;
  const credential = (element: any, policy: typeof credentialFieldPolicy) =>
    element.tagName?.toLowerCase() === "input" &&
    (element.getAttribute("type")?.toLowerCase() === "hidden" ||
      new RegExp(policy.pattern, "i").test(
        policy.attributes
          .map((name) => element.getAttribute(name) ?? "")
          .join(" "),
      ));
  const stripValues = (
    root: ParentNode,
    policy: typeof credentialFieldPolicy,
  ) => {
    let changed = false;
    for (const input of root.querySelectorAll("input[value]"))
      if (credential(input, policy)) {
        input.removeAttribute("value");
        changed = true;
      }
    return changed;
  };
  const focused = (root: any): any => {
    const active = asElement(root.activeElement);
    if (active == null) return null;
    if (isHtml(active) && active.shadowRoot != null)
      return focused(active.shadowRoot) ?? active;
    if (isTag(active, "iframe") || isTag(active, "frame"))
      try {
        const doc =
          active.contentDocument ?? active.contentWindow?.document ?? null;
        if (doc != null) return focused(doc) ?? active;
      } catch {
        return active;
      }
    return active;
  };
  const assertToken = (element: any, token: string | undefined) => {
    if (token == null) return;
    const target = asElement(element) ?? null,
      documentFocused =
        args.requireDocumentFocus === true ? document.hasFocus() : null,
      matches = target?.__codexIabInputTargetToken === token;
    if (documentFocused === false || !matches) {
      const reason =
        documentFocused === false
          ? "document is not focused"
          : "target token mismatch";
      throw new Error(
        `Active element is no longer the expected input target: ${reason}`,
      );
    }
  };
  const textFor = (items: ClipboardItem[], mime: string) => {
    const entry = items
      .flatMap((item) => item.entries)
      .find((entry) => entry.mime_type === mime);
    return entry && "text" in entry ? (entry.text ?? "") : "";
  };
  const decode = (base64: string) => {
    const text = atob(base64),
      bytes = new Uint8Array(text.length);
    for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i);
    return bytes.buffer;
  };
  const encode = (buffer: ArrayBuffer) => {
    const bytes = new Uint8Array(buffer);
    let text = "";
    for (let i = 0; i < bytes.length; i += 32768)
      text += String.fromCharCode(...bytes.subarray(i, i + 32768));
    return btoa(text);
  };
  const fillTransfer = (
    transfer: DataTransfer,
    items: ClipboardItem[],
    realm: any,
  ) => {
    transfer.clearData();
    for (const item of items)
      for (const entry of item.entries) {
        if ("text" in entry && typeof entry.text === "string") {
          transfer.setData(entry.mime_type, entry.text);
          continue;
        }
        const extension = entry.mime_type.split("/")[1] ?? "bin";
        transfer.items.add(
          new realm.File(
            [decode("base64" in entry ? (entry.base64 ?? "") : "")],
            `clipboard.${extension}`,
            { type: entry.mime_type },
          ),
        );
      }
  };
  const readTransfer = async (
    transfer: DataTransfer,
  ): Promise<ClipboardItem[]> => {
    const entries: any[] = [];
    for (const type of Array.from(transfer.types))
      if (type !== "Files")
        entries.push({ mime_type: type, text: transfer.getData(type) });
    for (const file of Array.from(transfer.files))
      if (file.type.length !== 0)
        entries.push({
          mime_type: file.type,
          base64: encode(await file.arrayBuffer()),
        });
    return entries.length === 0
      ? []
      : [{ entries, presentation_style: "unspecified" }];
  };
  const textItems = (plain: string, html: string): ClipboardItem[] => {
    const entries: any[] = [];
    if (plain.length > 0)
      entries.push({ mime_type: "text/plain", text: plain });
    if (html.length > 0) entries.push({ mime_type: "text/html", text: html });
    return entries.length === 0
      ? []
      : [{ entries, presentation_style: "unspecified" }];
  };
  const cutEvent = (realm: any, type: string) =>
    new realm.InputEvent(type, {
      bubbles: true,
      cancelable: type === "beforeinput",
      composed: true,
      inputType: "deleteByCut",
    });
  const selection = (
    value: any,
    policy: typeof credentialFieldPolicy,
  ): { items: ClipboardItem[]; delete: () => void } | null => {
    const element = asElement(value);
    if (element == null) return null;
    const realm = ownerWindow(element);
    if (isTag(element, "textarea") || isTag(element, "input")) {
      const start = element.selectionStart,
        end = element.selectionEnd;
      if (start == null || end == null || start === end) return null;
      const selected = element.value.slice(start, end);
      return {
        items: textItems(selected, ""),
        delete: () => {
          if (
            element.disabled ||
            element.readOnly ||
            element.value.slice(start, end) !== selected ||
            !element.dispatchEvent(cutEvent(realm, "beforeinput"))
          )
            return;
          element.setRangeText("", start, end, "end");
          element.dispatchEvent(cutEvent(realm, "input"));
        },
      };
    }
    const selected = realm.getSelection?.();
    if (selected == null || selected.rangeCount === 0 || selected.isCollapsed)
      return null;
    const ranges: Range[] = Array.from(
      { length: selected.rangeCount },
      (_, index) => selected.getRangeAt(index).cloneRange(),
    );
    const fragment = element.ownerDocument.createElement("div");
    for (const range of ranges) fragment.append(range.cloneContents());
    stripValues(fragment, policy);
    const text = selected.toString();
    let editable: any = null;
    if (isHtml(element) && element.isContentEditable) {
      editable = element;
      while (editable.parentElement?.isContentEditable)
        editable = editable.parentElement;
    }
    return {
      items: textItems(text, fragment.innerHTML),
      delete: () => {
        if (
          editable == null ||
          !editable.isConnected ||
          !editable.isContentEditable ||
          !ranges.every((range) =>
            editable?.contains(range.commonAncestorContainer),
          ) ||
          ranges.map((range) => range.toString()).join("") !== text ||
          !element.dispatchEvent(cutEvent(realm, "beforeinput"))
        )
          return;
        for (const range of ranges.reverse()) range.deleteContents();
        element.dispatchEvent(cutEvent(realm, "input"));
      },
    };
  };
  const assertDocument = (element: any) => {
    if (
      args.documentOnly &&
      (element == null ||
        !element.isConnected ||
        element.ownerDocument !== document ||
        element.getRootNode({ composed: true }) !== document)
    )
      throw new Error("Input target left the selected document.");
  };
  const fallbackPaste = (
    value: any,
    html: string,
    text: string,
    replace: boolean,
  ) => {
    const element = asElement(value);
    if (element == null) return;
    assertDocument(element);
    const realm = ownerWindow(element);
    if (isTag(element, "textarea") || isTag(element, "input")) {
      if (
        element.disabled ||
        element.readOnly ||
        (text.length === 0 && !replace)
      )
        return;
      const setValue = (value: string) => {
        const prototype = Object.getPrototypeOf(element),
          nativeSetter = Object.getOwnPropertyDescriptor(
            prototype,
            "value",
          )?.set,
          ownSetter = Object.getOwnPropertyDescriptor(element, "value")?.set;
        if (nativeSetter != null && ownSetter !== nativeSetter) {
          nativeSetter.call(element, value);
          return;
        }
        element.value = value;
      };
      if (element.selectionStart == null || element.selectionEnd == null)
        setValue(replace ? text : element.value + text);
      else {
        const start = element.selectionStart ?? element.value.length,
          end = element.selectionEnd ?? element.value.length;
        try {
          element.setRangeText(text, start, end, "end");
        } catch {
          setValue(replace ? text : element.value + text);
        }
      }
      element.dispatchEvent(new realm.InputEvent("input", { bubbles: true }));
      return;
    }
    if (
      isHtml(element) &&
      (element.isContentEditable || element.closest("[contenteditable=true]"))
    ) {
      element.focus();
      assertDocument(element);
      if (html.length > 0) {
        element.ownerDocument.execCommand("insertHTML", false, html);
        return;
      }
      if (text.length > 0 || replace)
        element.ownerDocument.execCommand("insertText", false, text);
    }
  };
  const global = globalThis as any;
  delete global.__browserUsePendingCut;
  const active = focused(document) ?? document.body;
  assertToken(active, args.iabInputTargetToken);
  const element = asElement(active),
    realm = element == null ? window : ownerWindow(element),
    items = args.clipboardItems;
  if (args.action === "paste") {
    assertDocument(element);
    if (items.length === 0)
      throw new Error("Browser Use virtual clipboard has no data to paste");
    const plain = textFor(items, "text/plain"),
      html = args.richTextFallback === true ? textFor(items, "text/html") : "";
    if (
      typeof realm.DataTransfer !== "function" ||
      typeof realm.ClipboardEvent !== "function"
    ) {
      fallbackPaste(active, html, plain, args.replaceInputValue === true);
      return {};
    }
    const transfer = new realm.DataTransfer();
    fillTransfer(transfer, items, realm);
    const event = new realm.ClipboardEvent("paste", {
      bubbles: true,
      cancelable: true,
      clipboardData: transfer,
      composed: true,
    });
    if (active.dispatchEvent(event))
      fallbackPaste(active, html, plain, args.replaceInputValue === true);
    return {};
  }
  const policy = args.protectedCredentialFieldPolicy;
  if (policy == null)
    throw new Error("Virtual clipboard is missing credential protection");
  if (element != null && credential(element, policy)) return {};
  const selected = selection(active, policy),
    transfer = new realm.DataTransfer(),
    event = new realm.ClipboardEvent(args.action, {
      bubbles: true,
      cancelable: true,
      clipboardData: transfer,
      composed: true,
    });
  if (!active.dispatchEvent(event)) {
    const captured = await readTransfer(transfer);
    if (captured.length === 0) return {};
    for (const entry of captured.flatMap((item) => item.entries)) {
      if (
        entry.mime_type !== "text/html" ||
        !("text" in entry) ||
        typeof entry.text !== "string" ||
        !/<input[\s/>]/i.test(entry.text)
      )
        continue;
      const template = realm.document.createElement("template");
      template.innerHTML = entry.text;
      if (stripValues(template.content, policy))
        entry.text = template.innerHTML;
    }
    return { items: captured };
  }
  if (selected == null || selected.items.length === 0) return {};
  if (args.action === "cut") {
    if (args.cutToken == null)
      throw new Error("Browser Use virtual cut is missing a commit token");
    global.__browserUsePendingCut = {
      commit: selected.delete,
      token: args.cutToken,
    };
  }
  return {
    items: selected.items,
    ...(args.action === "cut" ? { cutToken: args.cutToken } : {}),
  };
}
/** Original KA: consume token before invoking the stored deletion closure. */
export function commitClipboardCut({ cutToken }: { cutToken: string }): void {
  const global = globalThis as any,
    pending = global.__browserUsePendingCut;
  if (pending?.token !== cutToken)
    throw new Error("Browser Use virtual cut is no longer pending");
  delete global.__browserUsePendingCut;
  pending.commit();
}
