import {
  keyDescription,
  modifierKey,
  modifierMask,
  editingCommands,
  splitKeys,
  normalizeKeys,
  classifyClipboardKeys,
  clipboardShortcutError,
} from "./keyboard_keys";
import { keyboardMap } from "./keyboard_data";
import type { KeyDescription } from "./keyboard_map";
import { inputDelay } from "./input";
import type { CdpTarget } from "../cdp/dispatch_helpers";
interface Cdp {
  platform: string;
  call(...args: any[]): Promise<any>;
  callTarget(...args: any[]): Promise<any>;
}
interface Options {
  inputTargetToken?: string;
  deadlineMs?: number;
  blockClosedShadowInput?: boolean;
  durationMs?: number;
  signal?: AbortSignal;
}
export function withInputToken<T extends object>(payload: T, token?: string) {
  return token == null
    ? payload
    : { ...payload, __codexIabExpectedInputTargetToken: token };
}
export function keyboardTarget(target: number | CdpTarget) {
  return typeof target === "object" ? target : { tabId: target };
}
export function clipboardKeys(value: string | string[], platform = "linux") {
  return classifyClipboardKeys(
    normalizeKeys(
      Array.isArray(value) ? value.flatMap(splitKeys) : splitKeys(value),
    ),
    platform,
  );
}
/** Original gl/Os/Ky/zA. Vy remains a required dependency until protected focus inspection is restored. */
export function createKeyboardDispatch(
  assertFocusedInput: (
    cdp: Cdp,
    tabId: number,
    options: { deadlineMs?: number },
  ) => Promise<void>,
) {
  class Keyboard {
    cdp: Cdp;
    target: CdpTarget;
    inputTargetToken: string | undefined;
    deadlineMs: number | undefined;
    blockClosedShadowInput: boolean;
    pressedModifiers = new Set<string>();
    constructor(
      cdp: Cdp,
      target: CdpTarget,
      token: string | undefined,
      deadlineMs: number | undefined,
      blockClosedShadowInput: boolean,
    ) {
      this.cdp = cdp;
      this.target = target;
      this.inputTargetToken = token;
      this.deadlineMs = deadlineMs;
      this.blockClosedShadowInput = blockClosedShadowInput;
    }
    get modifiers() {
      return modifierMask(this.pressedModifiers, this.cdp.platform);
    }
    async down(key: string, onDispatch?: () => void) {
      const description = keyDescription(
        key,
        this.pressedModifiers,
        this.cdp.platform,
      );
      if (this.blockClosedShadowInput)
        await assertFocusedInput(this.cdp, this.target.tabId, {
          deadlineMs: this.deadlineMs,
        });
      const modifier = modifierKey(description.key);
      if (modifier) this.pressedModifiers.add(modifier);
      const text = this.keyText(description),
        commands = editingCommands(
          description.code,
          this.pressedModifiers,
          this.cdp.platform,
        );
      onDispatch?.();
      await this.callInputDispatch(
        withInputToken(
          {
            type: text ? "keyDown" : "rawKeyDown",
            modifiers: this.modifiers,
            windowsVirtualKeyCode: description.keyCodeWithoutLocation,
            code: description.code,
            ...(commands.length > 0 ? { commands } : {}),
            key: description.key,
            text,
            unmodifiedText: text,
            location: description.location,
            isKeypad: description.location === 3,
          },
          this.inputTargetToken,
        ),
      );
    }
    async up(key: string) {
      const description = keyDescription(
          key,
          this.pressedModifiers,
          this.cdp.platform,
        ),
        modifier = modifierKey(description.key);
      if (modifier) this.pressedModifiers.delete(modifier);
      await this.callInputDispatch(
        withInputToken(
          {
            type: "keyUp",
            modifiers: this.modifiers,
            windowsVirtualKeyCode: description.keyCodeWithoutLocation,
            code: description.code,
            key: description.key,
            location: description.location,
            isKeypad: description.location === 3,
          },
          this.inputTargetToken,
        ),
      );
    }
    async insertText(text: string) {
      if (this.blockClosedShadowInput)
        await assertFocusedInput(this.cdp, this.target.tabId, {
          deadlineMs: this.deadlineMs,
        });
      const payload = withInputToken({ text }, this.inputTargetToken);
      if (this.target.sessionId == null && this.target.targetId == null) {
        await this.cdp.call(this.target.tabId, "Input.insertText", payload, {
          deadlineMs: this.deadlineMs,
        });
        return;
      }
      await this.cdp.callTarget(this.target, "Input.insertText", payload, {
        deadlineMs: this.deadlineMs,
      });
    }
    keyText(description: KeyDescription) {
      return this.pressedModifiers.size === 0 ||
        (this.pressedModifiers.size === 1 && this.pressedModifiers.has("Shift"))
        ? description.text
        : "";
    }
    async callInputDispatch(payload: any) {
      if (this.target.sessionId == null && this.target.targetId == null) {
        await this.cdp.call(
          this.target.tabId,
          "Input.dispatchKeyEvent",
          payload,
          { deadlineMs: this.deadlineMs },
        );
        return;
      }
      await this.cdp.callTarget(
        this.target,
        "Input.dispatchKeyEvent",
        payload,
        { deadlineMs: this.deadlineMs },
      );
    }
  }
  async function withHeldKeys(
    cdp: Cdp,
    target: CdpTarget,
    keys: string[],
    options: Options,
    operation: (modifiers: number) => unknown | Promise<unknown>,
  ) {
    if (classifyClipboardKeys(keys, cdp.platform) != null)
      throw new Error(clipboardShortcutError);
    const keyboard = new Keyboard(
        cdp,
        target,
        options.inputTargetToken,
        options.deadlineMs,
        options.blockClosedShadowInput === true,
      ),
      pressed: string[] = [];
    let releasing: Promise<void> | undefined;
    const release = () => {
      releasing ??= (async () => {
        let error;
        for (const key of pressed.reverse())
          try {
            await keyboard.up(key);
          } catch (caught) {
            error ??= caught;
          }
        if (error != null) throw error;
      })();
      return releasing;
    };
    const abort = () => {
      release().catch(() => {});
    };
    options.signal?.addEventListener("abort", abort, { once: true });
    try {
      for (const key of keys) {
        options.signal?.throwIfAborted();
        await keyboard.down(key, () => {
          options.signal?.throwIfAborted();
          pressed.push(key);
        });
      }
      options.signal?.throwIfAborted();
      await operation(keyboard.modifiers);
    } catch (error) {
      await release().catch(() => {});
      throw error;
    } finally {
      options.signal?.removeEventListener("abort", abort);
    }
    await release();
  }
  async function dispatchKeys(
    cdp: Cdp,
    target: number | CdpTarget,
    value: string | string[],
    options: Options = {},
  ) {
    const split = Array.isArray(value)
        ? value.flatMap(splitKeys)
        : splitKeys(value),
      keys = normalizeKeys(split),
      last = keys[keys.length - 1];
    if (!last) throw new Error("keypress requires at least one key");
    if (options.durationMs != null || options.signal != null) {
      await withHeldKeys(cdp, keyboardTarget(target), keys, options, () =>
        inputDelay(options.durationMs ?? 0, options.signal),
      );
      return;
    }
    if (classifyClipboardKeys(keys, cdp.platform) != null)
      throw new Error(clipboardShortcutError);
    const keyboard = new Keyboard(
      cdp,
      keyboardTarget(target),
      options.inputTargetToken,
      options.deadlineMs,
      options.blockClosedShadowInput === true,
    );
    if (options.blockClosedShadowInput !== true) {
      for (const key of keys.slice(0, -1)) await keyboard.down(key);
      await keyboard.down(last);
      await keyboard.up(last);
      for (const key of keys.slice(0, -1).reverse()) await keyboard.up(key);
      return;
    }
    const pressed: string[] = [];
    try {
      for (const key of keys) {
        await keyboard.down(key);
        pressed.push(key);
      }
    } finally {
      for (const key of pressed.reverse()) await keyboard.up(key);
    }
  }
  async function dispatchTextCharacter(
    cdp: Cdp,
    target: number | CdpTarget,
    text: string,
    options: Options = {},
  ) {
    if (Array.from(text).length !== 1)
      throw new Error("dispatchTextCharacter requires one Unicode character");
    const keyboard = new Keyboard(
      cdp,
      keyboardTarget(target),
      options.inputTargetToken,
      options.deadlineMs,
      options.blockClosedShadowInput === true,
    );
    if (!keyboardMap.has(text)) {
      await keyboard.insertText(text);
      return;
    }
    await keyboard.down(text);
    await keyboard.up(text);
  }
  return { Keyboard, withHeldKeys, dispatchKeys, dispatchTextCharacter };
}
