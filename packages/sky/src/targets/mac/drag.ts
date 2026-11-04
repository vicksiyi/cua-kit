import type * as T from "../../types/window/Drag";
import { withComputerUsePolicy } from "./computer-use-policy";
import { getClient } from "./lazy-client";
export async function drag(input: T.Input): T.Return {
  return withComputerUsePolicy("drag", input, async (approved) => {
    const client = await getClient();
    await client.drag({
      app: approved.app,
      fromX: approved.from_x,
      fromY: approved.from_y,
      toX: approved.to_x,
      toY: approved.to_y,
    });
  });
}
