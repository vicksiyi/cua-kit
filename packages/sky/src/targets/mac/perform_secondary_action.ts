import type * as T from "../../types/window/PerformSecondaryAction";
import { withComputerUsePolicy } from "./computer-use-policy";
import { getClient } from "./lazy-client";
export async function perform_secondary_action(input: T.Input): T.Return {
  return withComputerUsePolicy(
    "perform_secondary_action",
    input,
    async (approved) => {
      const client = await getClient();
      await client.performSecondaryAction({
        action: approved.action,
        app: approved.app,
        elementIndex: approved.element_index,
      });
    },
  );
}
