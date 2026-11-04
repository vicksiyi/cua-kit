import type * as T from "../../types/window/Scroll";
import { withComputerUsePolicy } from "./computer-use-policy";
import { getClient } from "./lazy-client";
export async function scroll(input: T.Input): T.Return {
  return withComputerUsePolicy("scroll", input, async (approved) => {
    const client = await getClient();
    await client.scroll({
      app: approved.app,
      direction: approved.direction,
      elementIndex: approved.element_index,
      pages: approved.pages,
      x: approved.x,
      y: approved.y,
    });
  });
}
