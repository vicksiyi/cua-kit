/** Original Bre: invoke the native prototype method, including for text-node targets. */
export function scrollElementIntoView(this: Node): void {
  const element = this instanceof Element ? this : this.parentElement;
  if (element == null)
    throw new Error("Cannot scroll a detached accessibility element");
  Element.prototype.scrollIntoView.call(element, {
    behavior: "instant",
    block: "center",
    inline: "center",
  });
}
/** Original Dre: programmatic activation chooses the enclosing control or editable element. */
export function activateElement(this: Node): void {
  const element = this instanceof Element ? this : this.parentElement;
  const enclosing = element?.closest(
    'a[href],button,input,select,textarea,label,[role="button"],[role="link"],[role="checkbox"],[role="radio"],[role="switch"]',
  );
  const control =
    enclosing instanceof HTMLLabelElement ? enclosing.control : enclosing;
  const target =
    control ??
    element?.closest(
      '[contenteditable="true"],[contenteditable=""],[contenteditable="plaintext-only"]',
    ) ??
    element;
  if (!target?.isConnected)
    throw new Error("Cannot interact with a detached element");
  if (!(target instanceof HTMLElement))
    throw new Error(
      "Accessibility element does not support programmatic activation",
    );
  if (target.matches(":disabled"))
    throw new Error("Cannot interact with a disabled element");
  if (
    (!control && target.isContentEditable) ||
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLInputElement &&
      ![
        "button",
        "submit",
        "reset",
        "checkbox",
        "radio",
        "image",
        "file",
        "hidden",
        "color",
        "range",
      ].includes(target.type))
  ) {
    if (
      (target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement) &&
      target.readOnly
    )
      throw new Error("Cannot focus a read-only element");
    target.focus({ preventScroll: true });
    const root = target.getRootNode();
    const active =
      root instanceof ShadowRoot
        ? root.activeElement
        : target.ownerDocument.activeElement;
    if (active !== target && !active?.contains(target))
      throw new Error("Could not focus the target element");
  } else target.click();
}
