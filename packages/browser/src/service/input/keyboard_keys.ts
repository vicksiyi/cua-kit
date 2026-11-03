import {
  keyboardMap,
  keyAliases,
  chordAliases,
  modifierOrder,
  macEditingCommands,
  clipboardCodes,
} from "./keyboard_data";
export const clipboardShortcutError =
  "Native clipboard shortcuts are disabled; use Browser Use virtual clipboard commands instead.";
export function platformKey(key: string, platform: string) {
  return key === "ControlOrMeta"
    ? platform === "darwin"
      ? "Meta"
      : "Control"
    : key;
}
export function modifierMask(
  keys: Iterable<string> | undefined | null,
  platform: string,
) {
  if (!keys) return 0;
  let mask = 0;
  for (const key of keys)
    switch (platformKey(key, platform)) {
      case "Alt":
        mask |= 1;
        break;
      case "Control":
        mask |= 2;
        break;
      case "Meta":
        mask |= 4;
        break;
      case "Shift":
        mask |= 8;
        break;
    }
  return mask;
}
export function keyDescription(
  key: string,
  modifiers: Set<string>,
  platform: string,
) {
  const description = keyboardMap.get(platformKey(key, platform));
  if (!description) throw new Error(`Unknown key: "${key}"`);
  return modifiers.has("Shift") && description.shifted
    ? description.shifted
    : description;
}
export function splitKeys(value: string) {
  const keys = [];
  let part = "";
  for (const char of value)
    if (char === "+" && part) {
      keys.push(part);
      part = "";
    } else part += char;
  if (part) keys.push(part);
  return keys;
}
export function normalizeKey(key: string) {
  if (keyboardMap.has(key)) return key;
  const match = /^(alt|control|meta|super|shift)_[lr]$/i.exec(key);
  if (match?.[1] != null) key = match[1];
  return keyAliases.get(key.toLowerCase().replaceAll("_", "")) ?? key;
}
export function normalizeKeys(keys: string[]) {
  const alias = chordAliases.get(
    keys.map((key) => key.toLowerCase()).join("+"),
  );
  return alias || keys.map(normalizeKey);
}
export function modifierKey(key: string) {
  switch (key) {
    case "Alt":
    case "Control":
    case "Meta":
    case "Shift":
      return key;
    default:
      return;
  }
}
export function editingCommands(
  code: string,
  modifiers: Set<string>,
  platform: string,
) {
  if (
    code === "KeyA" &&
    modifiers.size === 1 &&
    modifiers.has(platform === "darwin" ? "Meta" : "Control")
  )
    return ["selectAll"];
  if (platform !== "darwin") return [];
  const combination = [
      ...modifierOrder.filter((key) => modifiers.has(key)),
      code,
    ].join("+"),
    command = macEditingCommands.get(combination);
  return command ? [command] : [];
}
export function blockedClipboardChord(code: string, modifiers: Set<string>) {
  return (code === "KeyC" || code === "KeyX") &&
    modifiers.size === 2 &&
    modifiers.has("Shift") &&
    (modifiers.has("Meta") || modifiers.has("Control"))
    ? false
    : ((modifiers.has("Meta") || modifiers.has("Control")) &&
        clipboardCodes.has(code)) ||
        (code === "Insert" &&
          (modifiers.has("Control") || modifiers.has("Shift"))) ||
        (code === "Delete" && modifiers.has("Shift"));
}
export function clipboardOperation(code: string, modifiers: Set<string>) {
  if (modifiers.size === 1) {
    if (code === "Insert" && modifiers.has("Control")) return "copy";
    if (code === "Insert" && modifiers.has("Shift")) return "paste";
    if (code === "Delete" && modifiers.has("Shift")) return "cut";
  }
  const primary =
      (modifiers.has("Meta") || modifiers.has("Control")) &&
      !(modifiers.has("Meta") && modifiers.has("Control")),
    validSize =
      modifiers.size === 1 || (modifiers.size === 2 && modifiers.has("Shift"));
  if (!primary || !validSize) return null;
  switch (code) {
    case "KeyC":
      return modifiers.has("Shift") ? null : "copy";
    case "KeyV":
      return modifiers.has("Shift") ? "paste-plain-text" : "paste";
    case "KeyX":
      return modifiers.has("Shift") ? null : "cut";
    default:
      return null;
  }
}
export function classifyClipboardKeys(keys: string[], platform: string) {
  const modifiers = new Set<string>(),
    codes: string[] = [];
  let blocked = false;
  for (const key of keys) {
    const description = keyDescription(key, modifiers, platform),
      modifier = modifierKey(description.key);
    if (modifier) modifiers.add(modifier);
    else {
      codes.push(description.code);
      if (blockedClipboardChord(description.code, modifiers)) blocked = true;
    }
  }
  const code = codes.length === 1 ? codes[0] : undefined;
  if (code != null) {
    const operation = clipboardOperation(code, modifiers);
    if (operation != null) return operation;
    if (blockedClipboardChord(code, modifiers)) return "blocked";
  }
  return blocked ? "blocked" : null;
}
export function clickKeys(value: string, platform: string) {
  const keys = normalizeKeys(splitKeys(value));
  if (keys.length === 0 || (value.length > 1 && /\s/.test(value)))
    throw new Error("click key requires one key combination");
  const modifiers = new Set<string>();
  let nonModifier;
  for (const key of keys) {
    const resolved = keyDescription(key, modifiers, platform).key,
      modifier = modifierKey(resolved);
    if (modifier) modifiers.add(modifier);
    else {
      if (nonModifier != null)
        throw new Error("click key supports at most one non-modifier key");
      nonModifier = key;
    }
  }
  const normalized =
    nonModifier == null ? [...modifiers] : [...modifiers, nonModifier];
  if (classifyClipboardKeys(normalized, platform) != null)
    throw new Error(clipboardShortcutError);
  return normalized;
}
