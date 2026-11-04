import { credentialLeases } from "../credentials/index";
import { createNavigateTabUrlCommand } from "./url_navigation";
/** Original YN with the reconstructed GD/Tf/Z_ dependency chain. */
export const NavigateTabUrlCommand = createNavigateTabUrlCommand(
  credentialLeases.resetBeforeNavigation,
);
