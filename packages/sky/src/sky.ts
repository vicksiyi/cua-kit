import { create_client } from "./create_client";
import { load_options } from "./load_options";
import { createSkyProxy } from "./create_sky_proxy";
import type { Options, SkyClient } from "./types/index";
const initialized = await createSkyProxy(() =>
  create_client(load_options() as Options),
);
export const sky = initialized.sky as SkyClient;
