import { package_bin } from "../../core/package_bin";
import { SkyLinuxTransport } from "./sky_linux_transport";
const transports = new Map<string, SkyLinuxTransport>();
export async function sky_linux(
  command: string,
  args: { options: { mouse_size_px?: number }; input?: unknown },
): Promise<string> {
  const binary = package_bin({
      relative_path: ["bin", "linux", `sky_linux_${process.arch}`],
      env_var_override: "OAI_SKY_LINUX_BIN",
    }),
    options: string[] = [];
  if (args.options.mouse_size_px)
    options.push("--mouse-size-px", String(args.options.mouse_size_px));
  options.push("server");
  const key = JSON.stringify([binary, options]);
  let transport = transports.get(key);
  if (transport == null) {
    transport = new SkyLinuxTransport(binary, options);
    transports.set(key, transport);
  }
  const output = await transport.request(command, args.input ?? {});
  return output == null ? "" : JSON.stringify(output);
}
