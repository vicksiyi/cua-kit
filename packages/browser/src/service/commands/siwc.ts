import { SiwcDetect } from "../../commands/siwc";
import { defineCommand } from "./define_command";
import { positiveTabId } from "../tab_id";
import { observeSiwc } from "../siwc/observation";

async function assertObservationAuthority(
  payload: { tab_id: string },
  context: any,
) {
  await context
    .acquireAuthority()
    .observeContent(
      await context.security.currentTabUrl(positiveTabId(payload.tab_id)),
    )
    .assert();
}
/** Current yN/Ja: authorize both before and after observing the page. */
export const SiwcDetectCommand = defineCommand(
  SiwcDetect,
  async (payload: { tab_id: string }, context: any) => {
    if (!(await context.supportsTabCapability("siwc")))
      return { status: "unavailable", reason: "observation_unavailable" };
    await assertObservationAuthority(payload, context);
    const { siwc } = await observeSiwc(payload, context);
    await assertObservationAuthority(payload, context);
    return siwc;
  },
);
