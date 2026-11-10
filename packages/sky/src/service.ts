import { WindowsComputerUseClient } from "./targets/windows/internal/computer_use_client";
import { create_client } from "./create_client";
import { load_options } from "./load_options";
import { createSkyService, type ServiceClient } from "./create_service";
import type { Options } from "./types/index";
export const handleRpc = createSkyService(
  (options) => create_client(options as Options) as unknown as ServiceClient,
  {
    loadOptions: load_options,
    createDesktopClient: () => WindowsComputerUseClient.createDesktopClient({}) as unknown as ServiceClient,
  },
).handleRpc;
