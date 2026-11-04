import type * as T from "../../types/window/TypeText";
import { withComputerUsePolicy } from "./computer-use-policy";
import { getClient } from "./lazy-client";
export async function type_text(input: T.Input): T.Return {
  return withComputerUsePolicy("type_text", input, async (approved) => {
    const client = await getClient();
    await client.typeText({ app: approved.app, text: approved.text });
  });
}
