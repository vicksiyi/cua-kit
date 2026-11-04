/** Original al. Self-contained because Chrome serializes this function into the isolated page world. */
export function captureTabPage(
  expectedUrl: string | null,
  traversalLength: number | null,
  outputLength: number | null = 80000,
  limits?: { maxNodes: number; maxDepth: number; maxTitleLength?: number },
) {
  const url = document.location.href;
  if (expectedUrl !== null && url !== expectedUrl) return null;
  if (expectedUrl === null) {
    const parsed = new URL(url);
    if (
      (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
      parsed.username ||
      parsed.password
    )
      throw new Error(
        "Tab context requires an HTTP or HTTPS page without credentials",
      );
  }
  let truncated = false,
    depthTruncated = false,
    visitedNodes = 0;
  function escapeContent(value: string) {
    if (limits && outputLength != null && value.length > outputLength) {
      value = value.slice(0, outputLength);
      truncated = true;
    }
    return value
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");
  }
  function escapeAttribute(value: string) {
    return escapeContent(value).replaceAll('"', "&quot;");
  }
  function attribute(element: Element, name: string) {
    const value = element.getAttribute(name);
    return value == null ? "" : ` ${name}="${escapeAttribute(value)}"`;
  }
  function redactNumericValue(value: string) {
    return value.length >= 32 ||
      !new RegExp("\\p{Decimal_Number}", "u").test(value)
      ? value
      : /^[\p{Decimal_Number}\p{Punctuation}\p{White_Space}]+$/u.test(value)
        ? ""
        : value;
  }
  type Trim = "before" | "after" | "both";
  function createOutput() {
    let text = "",
      separator = "",
      trimFollowing = false;
    function append(value: string, preserve = false) {
      if (value.length === 0) return;
      const normalized = preserve
        ? value
        : value.replace(/^[ \t\n\r]+|[ \t\n\r]+$/gu, "");
      if (!preserve && normalized.length === 0) {
        if (text.length > 0 && !trimFollowing && separator !== "\n\n")
          separator = " ";
        return;
      }
      const prefix =
        separator ||
        (!preserve &&
        !trimFollowing &&
        /^[ \t\n\r]/u.test(value) &&
        text.length > 0
          ? " "
          : "");
      text += `${prefix}${normalized}`;
      trimFollowing = false;
      separator = !preserve && /[ \t\n\r]$/u.test(value) ? " " : "";
    }
    return {
      appendBlockBoundary() {
        if (text.length > 0 && !trimFollowing && !text.endsWith("\n\n"))
          separator = "\n\n";
      },
      appendHTMLAttributeValue(value: string) {
        append(escapeAttribute(value), true);
      },
      appendHTMLContent(value: string, preserve = false) {
        append(escapeContent(value), preserve);
      },
      appendRawText(value: string, trim?: Trim) {
        if (trim === "before" || trim === "both") separator = "";
        append(value, true);
        trimFollowing = trim === "after" || trim === "both";
      },
      get length() {
        return text.length;
      },
      toString() {
        return text;
      },
    };
  }
  const output = createOutput();
  function canVisit(depth: number) {
    if (truncated) return false;
    if (limits && visitedNodes++ >= limits.maxNodes) {
      truncated = true;
      return false;
    }
    if (limits && depth >= limits.maxDepth) {
      depthTruncated = true;
      return false;
    }
    return true;
  }
  function appendValue(element: HTMLInputElement | HTMLTextAreaElement) {
    const value = redactNumericValue(element.value);
    const { selectionEnd, selectionStart } = element;
    if (
      (element.getRootNode() as Document | ShadowRoot).activeElement !==
        element ||
      selectionStart == null ||
      selectionEnd == null
    ) {
      output.appendHTMLAttributeValue(value);
      return;
    }
    output.appendHTMLAttributeValue(value.slice(0, selectionStart));
    if (selectionStart === selectionEnd) {
      output.appendRawText("<user__cursor>");
      output.appendHTMLAttributeValue(value.slice(selectionStart));
      return;
    }
    output.appendRawText("<user__selection>");
    output.appendHTMLAttributeValue(value.slice(selectionStart, selectionEnd));
    output.appendRawText("</user__selection>");
    output.appendHTMLAttributeValue(value.slice(selectionEnd));
  }
  function linkUrl(element: Element) {
    const href = element.getAttribute("href");
    if (href == null) return null;
    try {
      const resolved = new URL(href, document.baseURI);
      return resolved.href.split("#", 1)[0] === url.split("#", 1)[0]
        ? null
        : resolved.href;
    } catch {
      return null;
    }
  }
  function appendInput(element: HTMLInputElement) {
    const type = element.type.toLowerCase(),
      checkable = type === "checkbox" || type === "radio";
    let tag = `<input${attribute(element, "aria-label")}${attribute(element, "type")}`;
    if (checkable && element.checked) tag += ' checked="true"';
    if (checkable || type === "password") {
      output.appendRawText(`${tag}/>`);
      return;
    }
    output.appendRawText(`${tag} value="`);
    appendValue(element);
    output.appendRawText('"/>');
  }
  function appendTextarea(element: HTMLTextAreaElement) {
    output.appendRawText(`<textarea${attribute(element, "aria-label")}>`);
    if (
      (element.getRootNode() as Document | ShadowRoot).activeElement === element
    )
      appendValue(element);
    else output.appendHTMLContent(redactNumericValue(element.value), true);
    output.appendRawText("</textarea>");
  }
  function appendSelect(element: HTMLSelectElement) {
    output.appendRawText(`<select${attribute(element, "aria-label")}>`, "both");
    for (const option of element.options) {
      if (
        limits &&
        (!canVisit(0) ||
          (traversalLength != null && output.length >= traversalLength))
      ) {
        truncated = true;
        break;
      }
      const selected = option.selected ? ' selected="true"' : "";
      output.appendRawText(
        `<option${attribute(option, "aria-label")} value="${escapeAttribute(option.value)}"${selected}>`,
        "both",
      );
      output.appendHTMLContent(option.label, true);
      output.appendRawText("</option>", "both");
    }
    output.appendRawText("</select>", "both");
  }
  function appendImage(element: HTMLImageElement) {
    let filename = "";
    const source = element.currentSrc || element.getAttribute("src");
    if (source != null)
      try {
        const resolved = new URL(source, document.baseURI);
        if (resolved.protocol !== "data:")
          filename = resolved.pathname.split("/").at(-1) ?? "";
      } catch {}
    output.appendRawText(`<img src="${escapeAttribute(filename)}" alt="`);
    output.appendHTMLAttributeValue(element.getAttribute("alt") ?? "");
    output.appendRawText(`"${attribute(element, "aria-label")}/>`);
  }
  type Closing = { text: string; trim?: Trim };
  function beginLink(element: Element): Closing | undefined {
    const href = linkUrl(element);
    if (href != null) {
      output.appendRawText(
        `<a href="${escapeAttribute(href)}"${attribute(element, "aria-label")}>`,
      );
      return { text: "</a>" };
    }
  }
  function beginButton(element: Element): Closing {
    output.appendRawText(
      `<button${attribute(element, "name")}${attribute(element, "aria-label")}${attribute(element, "title")}>`,
    );
    return { text: "</button>", trim: "before" };
  }
  function beginEditable(element: Element): Closing {
    output.appendRawText(
      `<contenteditable${attribute(element, "aria-label")}>`,
      "both",
    );
    return { text: "</contenteditable>", trim: "both" };
  }
  function beginTableTag(tag: string): Closing {
    const table = tag === "table";
    output.appendRawText(`<${tag}>`, table ? "after" : "both");
    return { text: `</${tag}>`, trim: table ? "before" : "both" };
  }
  function visit(node: Node, preserve = false, depth = 0) {
    if (!canVisit(depth)) return;
    if (node.nodeType === Node.TEXT_NODE) {
      output.appendHTMLContent(node.textContent ?? "", preserve);
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const element = node as Element,
      tag = element.tagName.toLowerCase();
    if (
      /^(?:base|head|link|meta|noscript|script|style)$/u.test(tag) ||
      (tag === "title" && element.namespaceURI !== "http://www.w3.org/2000/svg")
    )
      return;
    const html = element.namespaceURI === "http://www.w3.org/1999/xhtml";
    const editableAttribute = element.getAttribute("contenteditable");
    const editable =
      editableAttribute != null &&
      /^(?:|true|plaintext-only)$/iu.test(editableAttribute);
    const style = window.getComputedStyle(element);
    const block =
      /^(?:block|flex|grid|list-item|flow-root|table|table-row)$/u.test(
        style.display,
      );
    if (block) output.appendBlockBoundary();
    let closing: Closing | undefined,
      children = true;
    if (html)
      switch (tag) {
        case "a":
          closing = beginLink(element);
          break;
        case "button":
          closing = beginButton(element);
          break;
        case "input":
          appendInput(element as HTMLInputElement);
          children = false;
          break;
        case "textarea":
          appendTextarea(element as HTMLTextAreaElement);
          children = false;
          break;
        case "select":
          appendSelect(element as HTMLSelectElement);
          children = false;
          break;
        case "img":
          appendImage(element as HTMLImageElement);
          children = false;
          break;
        case "br":
          output.appendBlockBoundary();
          return;
        case "table":
        case "tr":
        case "td":
        case "th":
          closing = editable ? beginEditable(element) : beginTableTag(tag);
          break;
        default:
          if (editable) closing = beginEditable(element);
      }
    if (children && !truncated) {
      const preserveChildren =
        preserve ||
        tag === "pre" ||
        tag === "code" ||
        /^(?:pre|pre-wrap|break-spaces)$/u.test(style.whiteSpace);
      let visitedChild = false;
      for (const root of [element, element.shadowRoot]) {
        if (root == null || truncated) continue;
        for (const child of root.childNodes) {
          if (truncated) break;
          if (
            traversalLength != null &&
            visitedChild &&
            output.length >= traversalLength
          ) {
            truncated = true;
            break;
          }
          visit(child, preserveChildren, depth + 1);
          visitedChild = true;
        }
      }
    }
    if (closing != null) output.appendRawText(closing.text, closing.trim);
    if (block) output.appendBlockBoundary();
  }
  if (document.body != null) visit(document.body);
  let text = output.toString();
  if (outputLength != null) text = text.slice(0, outputLength);
  if (/[\uD800-\uDBFF]$/u.test(text)) text = text.slice(0, -1);
  const title = document.title,
    maxTitle = limits?.maxTitleLength;
  return {
    text,
    title: maxTitle == null ? title : title.slice(0, maxTitle),
    truncated:
      truncated ||
      depthTruncated ||
      (maxTitle != null && title.length > maxTitle) ||
      (outputLength != null && output.length > outputLength),
    url,
  };
}

export type TabPageExecutor = (
  func: typeof captureTabPage,
  args: Parameters<typeof captureTabPage>,
  world: "ISOLATED",
) => Promise<unknown>;
/** Original dg: bounded capture with explicit result validation. */
export async function captureTabContext(execute: TabPageExecutor) {
  const result = await execute(
    captureTabPage,
    [
      null,
      80000,
      80000,
      { maxNodes: 10000, maxDepth: 128, maxTitleLength: 4096 },
    ],
    "ISOLATED",
  );
  if (
    result == null ||
    typeof result !== "object" ||
    !("url" in result) ||
    typeof result.url !== "string" ||
    !("title" in result) ||
    typeof result.title !== "string" ||
    result.title.length > 4096 ||
    !("text" in result) ||
    typeof result.text !== "string" ||
    result.text.length > 80000 ||
    !("truncated" in result) ||
    typeof result.truncated !== "boolean"
  )
    throw new Error("Unable to capture tab context");
  return {
    url: result.url,
    title: result.title,
    text: result.text,
    truncated: result.truncated,
  };
}
