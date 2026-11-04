import type { Client, LinuxOptions } from "../../types/full-desktop/index";
import { ActionSettler } from "./action_settler";
import { ElementIds } from "./element_ids";
import { create_audio_recording } from "./audio_recording";
import { create_perform_secondary_action } from "./perform_secondary_action";
import { create_click } from "./click";
import { create_clipboard_read } from "./clipboard_read";
import { create_clipboard_release } from "./clipboard_release";
import { create_clipboard_write } from "./clipboard_write";
import { create_drag } from "./drag";
import { create_drag_handle } from "./drag_handle";
import { create_activate_window } from "./activate_window";
import { create_get_screenshot } from "./get_screenshot";
import { create_list_apps } from "./list_apps";
import { create_list_windows } from "./list_windows";
import { create_move } from "./move";
import { create_move_relative } from "./move_relative";
import { create_press_key } from "./press_key";
import { create_key_down } from "./key_down";
import { create_key_up } from "./key_up";
import { create_scroll } from "./scroll";
import { create_type_characters } from "./type_characters";
import { create_type_text } from "./type_text";
import { create_launch_app } from "./launch_app";
import { create_get_window_state } from "./get_window_state";
export function create_client(options: LinuxOptions): Client {
  const copied = { ...options };
  const runtime = {
    ...copied,
    action_settler: new ActionSettler(copied),
    element_ids: new ElementIds(),
  };
  const client: Client = {
    target: "linux",
    perform_secondary_action: create_perform_secondary_action(runtime),
    click: create_click(runtime),
    clipboard_read: create_clipboard_read(runtime),
    clipboard_release: create_clipboard_release(runtime),
    clipboard_write: create_clipboard_write(runtime),
    drag: create_drag(runtime),
    drag_handle: create_drag_handle(runtime),
    activate_window: create_activate_window(runtime),
    get_screenshot: create_get_screenshot(runtime),
    list_apps: create_list_apps(runtime),
    list_windows: create_list_windows(runtime),
    move: create_move(runtime),
    move_relative: create_move_relative(runtime),
    press_key: create_press_key(runtime),
    key_down: create_key_down(runtime),
    key_up: create_key_up(runtime),
    scroll: create_scroll(runtime),
    type_characters: create_type_characters(runtime),
    type_text: create_type_text(runtime),
    launch_app: create_launch_app(runtime),
    get_window_state: create_get_window_state(runtime),
  };
  if (process.env.SKY_ENABLE_AUDIO === "1")
    Object.assign(client, create_audio_recording(runtime));
  return client;
}
