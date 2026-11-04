import type * as T from "../../types/window/GetAppState";
import { withComputerUsePolicy } from "./computer-use-policy";
import { getClient } from "./lazy-client";
import { window_result } from "./window_result";
export async function get_app_state(
  input: T.Input,
  seen: Set<string>,
): T.Return {
  return withComputerUsePolicy("get_app_state", input, async (approved) => {
    const client = await getClient();
    return window_result(
      approved.app,
      await client.getAppState({
        app: approved.app,
        disableDiff: approved.disableDiff,
      }),
      seen,
    );
  });
}
