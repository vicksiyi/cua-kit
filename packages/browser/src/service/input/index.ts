import { createInputClass } from "./input";
import { createKeyboardDispatch } from "./keyboard_dispatch";
import { assertFocusedInput, assertInputPoint } from "./input_guard";
import { resolveDomNode } from "./dom_node";
/** Assembled original cg/Os/cS/ru/Vy path with no permissive helper defaults. */
export const keyboardDispatch = createKeyboardDispatch(assertFocusedInput);
export const BrowserInput = createInputClass({
  dispatchKeys: keyboardDispatch.dispatchKeys,
  resolveDomNode,
  assertInputPoint,
});
