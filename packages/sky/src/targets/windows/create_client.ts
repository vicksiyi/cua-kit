import { WindowsComputerUseClient } from "./internal/computer_use_client";
import type { WindowsOptions, Client } from "../../types/window2/index";
export function create_client(_options: WindowsOptions): Client {
  return new WindowsComputerUseClient();
}
