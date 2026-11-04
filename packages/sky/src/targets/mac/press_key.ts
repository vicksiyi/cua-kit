import type * as T from "../../types/window/PressKey";
import { withComputerUsePolicy } from "./computer-use-policy";
import { getClient } from "./lazy-client";
export async function press_key(input: T.Input): T.Return {
  return withComputerUsePolicy("press_key", input, async (approved) => {
    const client = await getClient();
    await client.pressKey({
      app: approved.app,
      key: approved.key,
      duration: approved.duration,
    });
  });
}
