import type * as T from "../../types/window/Click";
import { withComputerUsePolicy } from "./computer-use-policy";
import { getClient } from "./lazy-client";
export async function click(input: T.Input): T.Return {
  return withComputerUsePolicy("click", input, async (approved) => {
    const client = await getClient();
    await client.click({
      app: approved.app,
      clickCount: approved.click_count,
      elementIndex: approved.element_index,
      key: approved.key,
      duration: approved.duration,
      mouseButton: approved.mouse_button,
      x: approved.x,
      y: approved.y,
    });
  });
}
