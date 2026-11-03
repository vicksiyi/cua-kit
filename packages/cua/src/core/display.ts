// Runtime behavior reconstructed verbatim. Host shape below is inferred from the two call sites.
type ObservationOptions = { emit?: boolean };
type Host = {
  write?(value: unknown, tag: string): unknown;
  emitImage?(bytes: Uint8Array): unknown;
};
function host(): Host | undefined {
  return (globalThis as typeof globalThis & { nodeRepl?: Host }).nodeRepl;
}
export async function text(
  value: unknown,
  options?: ObservationOptions,
): Promise<void> {
  if (options?.emit !== false) {
    const repl = host();
    await repl?.write?.(value, "cua.state");
  }
}
export async function image(args: {
  bytes: Uint8Array;
  options?: ObservationOptions;
}): Promise<void> {
  if (args.options?.emit !== false) {
    const repl = host();
    await repl?.emitImage?.(args.bytes);
  }
}
