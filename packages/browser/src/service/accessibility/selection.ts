/** Original Nre: page-side selection uses UTF-16 offsets, matching DOM range APIs. */
export function selectElementText(
  this: Node,
  options: {
    text: string;
    prefix?: string;
    suffix?: string;
    selectionType: "text" | "cursor_before" | "cursor_after";
  },
): void {
  if (!this.isConnected)
    throw new Error("Cannot select text in a detached element");
  const element = this instanceof Element ? this : this.parentElement;
  if (element?.matches(":disabled"))
    throw new Error("Cannot select text in a disabled element");
  if (options.text.length === 0)
    throw new Error("Text to select must not be empty");
  const input =
    this instanceof HTMLInputElement || this instanceof HTMLTextAreaElement
      ? this
      : undefined;
  const content = input?.value ?? this.textContent ?? "";
  const prefix = options.prefix ?? "";
  const match = `${prefix}${options.text}${options.suffix ?? ""}`;
  const index = content.indexOf(match);
  if (index === -1) throw new Error("Text to select was not found");
  if (content.indexOf(match, index + 1) !== -1)
    throw new Error("Text to select matches multiple locations");
  const textStart = index + prefix.length;
  const start =
    options.selectionType === "cursor_after"
      ? textStart + options.text.length
      : textStart;
  const end =
    options.selectionType === "text" ? start + options.text.length : start;
  if (element instanceof HTMLElement) element.focus();
  if (input != null) {
    input.setSelectionRange(start, end);
    return;
  }
  const walker = document.createTreeWalker(this, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  let offset = 0,
    started = false;
  let node: Node | null = this instanceof Text ? this : walker.nextNode();
  while (node != null) {
    const next = offset + (node.textContent?.length ?? 0);
    if (!started && start <= next) {
      range.setStart(node, Math.max(start - offset, 0));
      started = true;
    }
    if (started && end <= next) {
      range.setEnd(node, Math.max(end - offset, 0));
      const selection = window.getSelection();
      if (selection == null) throw new Error("Could not select element text");
      selection.removeAllRanges();
      selection.addRange(range);
      return;
    }
    offset = next;
    node = walker.nextNode();
  }
  throw new Error("Selection range is outside the target element");
}
/** Original Fre: listbox and open customizable selects need physical clicks. */
export function optionActivationMode(
  this: Element,
): "physical-click" | "select-option" {
  if (!(this instanceof HTMLOptionElement) || !this.isConnected)
    throw new Error("Select option is no longer connected");
  const select = this.closest("select");
  if (!(select instanceof HTMLSelectElement))
    throw new Error("Select option has no HTML select owner");
  return select.multiple ||
    select.size > 1 ||
    (select.matches(":open") &&
      getComputedStyle(select).appearance === "base-select")
    ? "physical-click"
    : "select-option";
}
interface SelectInjectedScript {
  elementState(
    element: Element,
    state: "enabled",
  ): { received?: string; matches: boolean };
  selectOptions(
    element: HTMLSelectElement,
    options: HTMLOptionElement[],
  ): unknown;
}
/** Original Lre. Uses the actual injected Playwright helper supplied by its caller. */
export function activateSelectOption(
  option: Element,
  injected: SelectInjectedScript,
): void {
  if (!(option instanceof HTMLOptionElement) || !option.isConnected)
    throw new Error("Select option is no longer connected");
  const select = option.closest("select");
  if (!(select instanceof HTMLSelectElement))
    throw new Error("Select option has no HTML select owner");
  const validate = () => {
    if (
      select.multiple ||
      select.size > 1 ||
      (select.matches(":open") &&
        getComputedStyle(select).appearance === "base-select")
    )
      throw new Error("Select changed before option activation");
    const state = injected.elementState(select, "enabled");
    if (state.received === "error:notconnected")
      throw new Error("Element is not connected");
    if (!state.matches) throw new Error("Element is not enabled");
  };
  validate();
  if (select.matches(":open")) {
    select.blur();
    if (select.matches(":open")) throw new Error("Select picker did not close");
    validate();
  }
  const result = injected.selectOptions(select, [option]);
  if (typeof result === "string" && result.startsWith("error:"))
    throw new Error(result);
}
