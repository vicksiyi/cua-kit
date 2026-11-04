import type { Client, MacOptions } from "../../types/window/index";
import { start_audio_recording, stop_audio_recording } from "./audio_recording";
import { click } from "./click";
import { logComputerUseClientCreated } from "./computer-use-telemetry";
import { drag } from "./drag";
import { get_app_state } from "./get_app_state";
import { list_apps } from "./list_apps";
import { paste } from "./paste";
import { perform_secondary_action } from "./perform_secondary_action";
import { press_key } from "./press_key";
import { scroll } from "./scroll";
import { select_text } from "./select_text";
import { set_value } from "./set_value";
import { type_text } from "./type_text";
export function create_client(_options?: MacOptions): Client {
  logComputerUseClientCreated();
  const seen = new Set<string>();
  return {
    target: "mac",
    list_apps,
    async get_app_state(input) {
      return get_app_state(input, seen);
    },
    click,
    drag,
    paste,
    perform_secondary_action,
    press_key,
    scroll,
    select_text,
    set_value,
    type_text,
    ...(process.env.SKY_ENABLE_AUDIO === "1"
      ? { start_audio_recording, stop_audio_recording }
      : {}),
  };
}
