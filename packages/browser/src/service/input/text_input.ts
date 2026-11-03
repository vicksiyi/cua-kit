import type { CdpTarget } from "../cdp/dispatch_helpers";
import { withInputToken } from "./keyboard_dispatch";

let fallbackTokenSequence = 0;
/** Original fl/WA: only explicitly enabled input obtains a target token. */
export function createInputTargetToken(enabled?: boolean): string | undefined {
  if (enabled === true) {
    if (typeof globalThis.crypto?.randomUUID === "function")
      return globalThis.crypto.randomUUID();
    fallbackTokenSequence += 1;
    return `iab-input-${Date.now()}-${fallbackTokenSequence}-${Math.random().toString(36).slice(2)}`;
  }
}

/** Original GA: AX text uses key events and editing commands, not Input.insertText. */
export async function dispatchAxText(
  cdp: {
    callTarget(
      target: CdpTarget,
      method: string,
      payload: object,
    ): Promise<unknown>;
  },
  input: { target: CdpTarget; inputTargetToken?: string },
  text: string,
  signal: AbortSignal,
): Promise<void> {
  const dispatch = (event: object) =>
    cdp.callTarget(
      input.target,
      "Input.dispatchKeyEvent",
      withInputToken({ ...event }, input.inputTargetToken),
    );
  for (const character of text)
    if (character < " " && !["\t", "\n", "\r"].includes(character))
      throw new Error(
        "AX typeText does not support control characters other than tab and newline",
      );
  let first = true;
  for (const character of text.replaceAll(/\r\n?/g, "\n")) {
    signal.throwIfAborted();
    const editing = character === "\n" || character === "\t";
    const paired = first || editing;
    first = false;
    const key = {
      key: editing ? "Unidentified" : character,
      windowsVirtualKeyCode: 0,
    };
    if (paired) {
      await dispatch({
        type: "rawKeyDown",
        ...key,
        commands: editing
          ? [character === "\n" ? "insertParagraph" : "insertTab"]
          : undefined,
      });
      signal.throwIfAborted();
    }
    if (!editing) {
      await dispatch({
        type: "char",
        key: character,
        text: character,
        unmodifiedText: character,
      });
      signal.throwIfAborted();
    }
    if (paired) await dispatch({ type: "keyUp", ...key });
  }
  signal.throwIfAborted();
}
