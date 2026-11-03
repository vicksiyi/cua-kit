/** Original G2. Serialized and called with the target DOM element as `this`. */
export function setElementValue(
  this: Element,
  options: { value: string },
): "done" | "needs-click" {
  const value = options.value;
  const role = this.getAttribute("role");
  const assertWritable = (label: string, checkReadOnly = false) => {
    if (!this.isConnected) throw new Error(`${label} is no longer connected`);
    if (
      this.matches(":disabled") ||
      this.getAttribute("aria-disabled") === "true"
    )
      throw new Error(`${label} is disabled`);
    if (
      checkReadOnly &&
      (this instanceof HTMLInputElement ||
        this instanceof HTMLTextAreaElement) &&
      this.readOnly
    )
      throw new Error(`${label} is read-only`);
  };
  const dispatchChanges = () => {
    this.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    this.dispatchEvent(new Event("change", { bubbles: true }));
  };
  if (
    this instanceof HTMLInputElement &&
    (this.type === "checkbox" || this.type === "radio")
  ) {
    const label =
      this.type === "radio"
        ? "Radio button"
        : role === "switch"
          ? "Switch"
          : "Checkbox";
    if (!["0", "1", "false", "true"].includes(value))
      throw new Error(`${label} value must be 0, 1, false, or true`);
    assertWritable(label);
    const checked = value === "1" || value === "true";
    const changed =
      this.checked !== checked ||
      (this.type === "checkbox" && this.indeterminate);
    const setChecked = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "checked",
    )?.set;
    if (setChecked == null)
      throw new Error(`${label} native setter is unavailable`);
    this.focus();
    setChecked.call(this, checked);
    if (this.type === "checkbox") {
      const setIndeterminate = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "indeterminate",
      )?.set;
      if (setIndeterminate == null)
        throw new Error(`${label} indeterminate setter is unavailable`);
      setIndeterminate.call(this, false);
    }
    if (changed) dispatchChanges();
    if (
      !this.isConnected ||
      this.checked !== checked ||
      (this.type === "checkbox" && this.indeterminate)
    )
      throw new Error(`${label} did not retain the requested state`);
    return "done";
  }
  if (this instanceof HTMLSelectElement) {
    assertWritable("Select");
    if (this.multiple)
      throw new Error("Multi-select controls are not supported");
    const available = Array.from(this.options);
    let option = available.find((candidate) => candidate.value === value);
    if (option == null) {
      const matches = available.filter(
        (candidate) => candidate.label === value || candidate.text === value,
      );
      const [first] = matches;
      if (matches.length !== 1 || first == null)
        throw new Error(
          matches.length === 0
            ? `Select option ${JSON.stringify(value)} was not found`
            : `Select option label ${JSON.stringify(value)} is ambiguous`,
        );
      option = first;
    }
    if (
      option.disabled ||
      (option.parentElement instanceof HTMLOptGroupElement &&
        option.parentElement.disabled)
    )
      throw new Error(`Select option ${JSON.stringify(value)} is disabled`);
    const setSelected = Object.getOwnPropertyDescriptor(
      HTMLOptionElement.prototype,
      "selected",
    )?.set;
    if (setSelected == null)
      throw new Error("Select native option setter is unavailable");
    const changed = !option.selected;
    this.focus();
    if (!this.isConnected || !Array.from(this.options).includes(option))
      throw new Error(`Select rejected option ${JSON.stringify(value)}`);
    setSelected.call(option, true);
    if (changed) dispatchChanges();
    if (!this.isConnected || this.selectedOptions[0] !== option)
      throw new Error("Select did not retain the requested option");
    return "done";
  }
  if (this instanceof HTMLInputElement || this instanceof HTMLTextAreaElement) {
    const label = this instanceof HTMLTextAreaElement ? "Text area" : "Input";
    if (this instanceof HTMLInputElement && this.type === "file")
      throw new Error("File inputs cannot be set programmatically");
    assertWritable(label, true);
    this.focus();
    let normalized = value;
    if (this instanceof HTMLInputElement && this.type === "color") {
      if (!/^#[0-9a-f]{6}$/i.test(value))
        throw new Error("Color value must use #rrggbb");
      normalized = value.toLowerCase();
    }
    const prototype =
      this instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
    const setValue = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
    if (setValue == null)
      throw new Error(`${label} native value setter is unavailable`);
    const previous = this.value;
    setValue.call(this, normalized);
    if (this.value !== normalized) {
      setValue.call(this, previous);
      throw new Error(`${label} rejected value ${JSON.stringify(value)}`);
    }
    if (previous !== normalized) dispatchChanges();
    return "done";
  } else if (role === "tab") {
    if (value !== "1" && value !== "true")
      throw new Error("Tab value must be 1 or true");
    assertWritable("Tab");
    return this.getAttribute("aria-selected") === "true"
      ? "done"
      : "needs-click";
  } else {
    if (
      [
        "checkbox",
        "radio",
        "switch",
        "combobox",
        "listbox",
        "slider",
        "spinbutton",
      ].includes(role ?? "") ||
      this.hasAttribute("aria-pressed")
    )
      throw new Error(
        "Custom ARIA controls do not expose a standard value setter",
      );
    if (this instanceof HTMLElement && this.isContentEditable) {
      assertWritable("Editable element");
      this.focus();
      const previous = this.textContent ?? "";
      this.textContent = value;
      if (previous !== value) {
        this.dispatchEvent(
          new InputEvent("input", {
            bubbles: true,
            composed: true,
            data: value,
            inputType: "insertText",
          }),
        );
        this.dispatchEvent(new Event("change", { bubbles: true }));
      }
      return "done";
    } else
      throw new Error(
        "Accessibility element does not expose a standard value setter",
      );
  }
}
