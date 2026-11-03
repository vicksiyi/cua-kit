import { codeAliases } from "./keyboard_data";
export interface KeyDescription {
  key: string;
  keyCode: number;
  keyCodeWithoutLocation: number;
  code: string;
  text: string;
  location: number;
  shifted?: KeyDescription;
}
interface KeyDefinition {
  key: string;
  keyCode: number;
  keyCodeWithoutLocation?: number;
  text?: string;
  location?: number;
  shiftKey?: string;
  shiftKeyCode?: number;
}
/** Original L5. Called after codeAliases initialization; shared objects preserve alias identity. */
export function buildKeyboardMap(definitions: Record<string, KeyDefinition>) {
  const map = new Map<string, KeyDescription>();
  for (const [code, definition] of Object.entries(definitions)) {
    const key: KeyDescription = {
      key: definition.key,
      keyCode: definition.keyCode,
      keyCodeWithoutLocation:
        definition.keyCodeWithoutLocation ?? definition.keyCode,
      code,
      text: definition.text ?? "",
      location: definition.location ?? 0,
    };
    if (definition.key.length === 1) key.text = definition.key;
    let shifted: KeyDescription | undefined;
    if (definition.shiftKey) {
      shifted = {
        ...key,
        key: definition.shiftKey,
        keyCode: definition.shiftKeyCode ?? key.keyCode,
        text: definition.shiftKey,
      };
      key.shifted = shifted;
    }
    map.set(code, key);
    for (const alias of codeAliases.get(code) ?? []) map.set(alias, key);
    if (!definition.location) {
      if (key.key.length === 1) map.set(key.key, key);
      if (shifted) map.set(shifted.key, { ...shifted, shifted: undefined });
    }
  }
  return map;
}
