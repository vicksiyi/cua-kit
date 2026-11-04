import type * as T from "../../types/full-desktop/GetScreenshot";
import type { LinuxRuntimeOptions } from "../../types/full-desktop/Options";
import { from_filepath, to_data_url } from "../../core/uint8";
import { sky_linux } from "./sky_linux";
export type SkyLinuxScreenshot = { filepath: string };
export function create_get_screenshot(
  options: LinuxRuntimeOptions,
): T.Function {
  return async () => {
    await options.action_settler.wait();
    const output = await sky_linux("get_screenshot", { options });
    return await load_screenshots(JSON.parse(output));
  };
}
export async function load_screenshots(screenshots: SkyLinuxScreenshot[]) {
  const pending = screenshots.map(async (screenshot) => {
    const filepath = screenshot.filepath,
      bytes = await from_filepath(filepath);
    return { filepath, bytes, data_url: to_data_url(bytes, "image/jpeg") };
  });
  return await Promise.all(pending);
}
