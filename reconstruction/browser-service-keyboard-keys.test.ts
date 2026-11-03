import test from "node:test";
import assert from "node:assert/strict";
import { originalServiceBindings } from "./service-source";
import { keyboardMap } from "../packages/browser/src/service/input/keyboard_data";
import * as keys from "../packages/browser/src/service/input/keyboard_keys";
const source = originalServiceBindings([
  "gt",
  "B5",
  "D5",
  "O5",
  "M5",
  "N5",
  "F5",
  "L5",
  "Jy",
  "$y",
  "vp",
  "Ds",
  "Sp",
  "bl",
  "Yy",
  "P5",
  "R5",
  "xp",
  "I5",
  "$A",
  "k5",
  "Tp",
  "VA",
  "di",
]);
function outcome(fn: () => any) {
  try {
    return { value: fn() };
  } catch (error: any) {
    return { error: error.message };
  }
}
test("keyboard table retains every source descriptor, shifted entry and shared alias identity", () => {
  assert.deepEqual([...keyboardMap], [...source.Jy]);
  for (const [key, description] of keyboardMap) {
    for (const [alias, other] of keyboardMap)
      assert.equal(
        description === other,
        source.Jy.get(key) === source.Jy.get(alias),
      );
  }
});
test("key parsing preserves plus signs, aliases, named modifiers and platform-specific descriptions", () => {
  for (const value of [
    "",
    "+",
    "++",
    "Control++",
    "Ctrl+Shift+v",
    "alt_l+KP_Enter",
    "Super_R+a",
    "a b",
    "CTRL+Y",
    "unknown",
    "Shift+A",
  ]) {
    assert.deepEqual(keys.splitKeys(value), source.bl(value));
    assert.deepEqual(
      keys.normalizeKeys(keys.splitKeys(value)),
      source.Yy(source.bl(value)),
    );
    for (const platform of ["darwin", "linux", "win32"])
      assert.deepEqual(
        outcome(() => keys.clickKeys(value, platform)),
        outcome(() => source.VA(value, platform)),
      );
  }
  for (const key of [...keyboardMap.keys(), "ControlOrMeta", "ctrl", "unknown"])
    for (const platform of ["darwin", "linux"])
      for (const modifiers of [
        new Set<string>(),
        new Set(["Shift"]),
        new Set(["Control", "Shift"]),
      ])
        assert.deepEqual(
          outcome(() => keys.keyDescription(key, modifiers, platform)),
          outcome(() => source.Sp(key, modifiers, platform)),
        );
});
test("clipboard shortcut classification and editing commands preserve all modifier subsets", () => {
  const modifierNames = ["Alt", "Control", "Meta", "Shift"];
  for (let mask = 0; mask < 16; mask++) {
    const modifiers = new Set(modifierNames.filter((_, i) => mask & (1 << i)));
    for (const code of [
      "KeyA",
      "KeyC",
      "KeyV",
      "KeyX",
      "KeyZ",
      "Insert",
      "Delete",
      "Backspace",
    ]) {
      assert.equal(
        keys.blockedClipboardChord(code, modifiers),
        source.$A(code, modifiers),
      );
      assert.equal(
        keys.clipboardOperation(code, modifiers),
        source.k5(code, modifiers),
      );
      for (const platform of ["darwin", "linux", "win32"]) {
        assert.deepEqual(
          keys.editingCommands(code, modifiers, platform),
          source.I5(code, modifiers, platform),
        );
        assert.equal(
          keys.modifierMask(modifiers, platform),
          source.Ds(modifiers, platform),
        );
        const chord = [...modifiers, code];
        assert.deepEqual(
          outcome(() => keys.classifyClipboardKeys(chord, platform)),
          outcome(() => source.Tp(chord, platform)),
        );
      }
    }
  }
});
