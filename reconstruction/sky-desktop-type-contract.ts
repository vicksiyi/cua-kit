/** Compile-only consumer contract; never run and never creates a session. */
import { create_client } from "../packages/sky/src/client";
import type * as T from "../packages/sky/src/types/index";
import { WindowsDesktopClient } from "../packages/sky/src/targets/windows/desktop_client";

async function checkContract(native: WindowsDesktopClient) {
  const client: T.Desktop.Client = await create_client({ api: "desktop", target: "windows" });
  const compatible: T.Desktop.Client = native;
  await client.click({ x: 1, y: 2, mouse_button: "left", click_count: 2 });
  await compatible.scroll({ x: 1, y: 2, delta_y: 120 });
  await client.move({ x: 1, y: 2 });
  await client.drag({ path: [{ x: 1, y: 2 }, { x: 3, y: 4 }] });
  await client.type_text({ text: "fixture" });
  await client.paste({ text: "fixture" });
  await client.press_key({ key: "Control+A" });
  const handle = client.drag_handle();
  const done: Promise<void> = handle.start({ x: 1, y: 2 });
  await done; await handle.move_to({ x: 3, y: 4 }); await handle.end();
  await client.close();
  // @ts-expect-error Desktop API requires api: desktop.
  create_client({ target: "windows" });
  // @ts-expect-error Desktop API is Windows-only.
  create_client({ api: "desktop", target: "mac" });
  // @ts-expect-error Screenshot coordinates require both axes.
  client.click({ x: 1 });
  // @ts-expect-error Native and RPC clients share the same text parameter contract.
  native.type_text({ value: "fixture" });
  // @ts-expect-error Scroll coordinates are numeric.
  client.scroll({ x: "1", y: 2 });
  // @ts-expect-error PressKey uses key, not a browser key list.
  client.press_key({ keys: ["Enter"] });
}
void checkContract;
