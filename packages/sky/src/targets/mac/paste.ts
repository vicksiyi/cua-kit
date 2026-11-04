import type * as T from "../../types/window/Paste";
import { withComputerUsePolicy } from "./computer-use-policy";
import { getClient } from "./lazy-client";
export async function paste(input: T.Input): T.Return {
  return withComputerUsePolicy("paste", input, async (approved) => {
    const client = await getClient();
    await client.paste({
      app: approved.app,
      text: approved.text,
      format: approved.format,
    });
  });
}
