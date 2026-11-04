import type * as T from "../../types/window/SetValue";
import { withComputerUsePolicy } from "./computer-use-policy";
import { getClient } from "./lazy-client";
export async function set_value(input: T.Input): T.Return {
  return withComputerUsePolicy("set_value", input, async (approved) => {
    const client = await getClient();
    await client.setValue({
      app: approved.app,
      elementIndex: approved.element_index,
      value: approved.value,
    });
  });
}
