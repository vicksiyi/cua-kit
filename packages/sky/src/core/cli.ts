import { spawn, type SpawnOptions } from "node:child_process";
type Options = SpawnOptions & {
  check?: boolean;
  input?: string | Uint8Array;
  quiet?: boolean;
  win32_cmd?: boolean;
};
type Result = {
  command: string;
  code: number;
  stdout: string;
  stderr: string;
  output: string;
};
export function cli(
  unsafe_command: string,
  unsafe_args: string[],
  unsafe_options: Options = {},
): Promise<Result> {
  return new Promise((resolve, reject) => {
    const {
      check = true,
      input,
      quiet = false,
      win32_cmd = false,
      ...options
    } = unsafe_options;
    let command = unsafe_command,
      args = unsafe_args;
    if (process.platform === "win32" && win32_cmd) {
      command = process.env.ComSpec ?? process.env.COMSPEC ?? "cmd.exe";
      args = ["/d", "/s", "/c", `${unsafe_command}.cmd`, ...unsafe_args];
    }
    const display = [command, ...args].join(" "),
      cwd = options.cwd ?? process.cwd();
    if (!quiet) console.debug(`[cwd=${cwd}] ❯ ${display}`);
    let stdout = "",
      stderr = "",
      output = "";
    const child = spawn(command, args, {
      stdio: "inherit",
      ...options,
      env: { ...process.env, ...options.env },
    });
    if (input !== undefined && child.stdin == null) {
      reject(new Error(`${display} missing stdin pipe`));
      return;
    }
    if (child.stdin != null) child.stdin.end(input);
    child.stdout?.on("data", (chunk) => {
      const text = String(chunk);
      stdout += text;
      output += text;
    });
    child.stderr?.on("data", (chunk) => {
      const text = String(chunk);
      stderr += text;
      output += text;
    });
    child.on("error", reject);
    child.on("close", (code, signal) => {
      const result = {
        command,
        code: code ?? 1,
        stdout: stdout.trimEnd(),
        stderr: stderr.trimEnd(),
        output: output.trimEnd(),
      };
      if (check && result.code !== 0) {
        reject(
          new Error(
            `${display} (${code == null ? `signal=${signal}` : `exit=${result.code}`})`,
          ),
        );
        return;
      }
      resolve(result);
    });
  });
}
