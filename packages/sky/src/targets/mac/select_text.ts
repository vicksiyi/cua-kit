import type * as T from "../../types/window/SelectText";
import { withComputerUsePolicy } from "./computer-use-policy";
import { getClient } from "./lazy-client";
export async function select_text(input: T.Input): T.Return {
  return withComputerUsePolicy("select_text", input, async (approved) => {
    const client = await getClient();
    await client.selectText({
      app: approved.app,
      elementIndex: approved.element_index,
      text: approved.text,
      prefix: approved.prefix,
      suffix: approved.suffix,
      selection: approved.selection_type,
    });
  });
}
