import { create_client } from "./create_client";
import { load_options } from "./load_options";
import { createSkyService, type ServiceClient } from "./create_service";
import type { Options } from "./types/index";
export const handleRpc = createSkyService(
  () => create_client(load_options() as Options) as unknown as ServiceClient,
).handleRpc;
