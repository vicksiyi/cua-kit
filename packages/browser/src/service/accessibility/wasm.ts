/** Readable reconstruction of Hre/Wre/Vv/$re/zh. The native WASM binary is a separate dependency. */
interface AccessibilityExports {
  memory: WebAssembly.Memory;
  _initialize(): void;
  computer_use_browser_wasm_allocate(size: number): number;
  computer_use_browser_wasm_deallocate(pointer: number): void;
  computer_use_browser_wasm_revision_create(
    previous: number,
    json: number,
    length: number,
    mode: number,
    output: number,
  ): number;
  computer_use_browser_wasm_revision_release(pointer: number): void;
  computer_use_browser_wasm_revision_text_length(pointer: number): number;
  computer_use_browser_wasm_revision_copy_text(
    pointer: number,
    output: number,
    length: number,
  ): number;
  computer_use_browser_wasm_revision_identity_length(
    pointer: number,
    id: number,
  ): number;
  computer_use_browser_wasm_revision_copy_identity(
    pointer: number,
    id: number,
    output: number,
    length: number,
  ): number;
  computer_use_browser_wasm_revision_is_value_settable(
    pointer: number,
    id: number,
  ): number;
}
interface Runtime {
  exports: AccessibilityExports;
}
const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });
const revisions = new FinalizationRegistry<{
  runtime: Runtime;
  pointer: number;
}>(({ runtime, pointer }) => {
  runtime.exports.computer_use_browser_wasm_revision_release(pointer);
});
export function allocateAccessibilityBuffer(
  runtime: Runtime,
  size: number,
): number {
  if (!Number.isSafeInteger(size) || size <= 0 || size > 2147483647)
    throw new RangeError(
      "Accessibility buffer exceeds WebAssembly memory limits",
    );
  const pointer =
    runtime.exports.computer_use_browser_wasm_allocate(size) >>> 0;
  if (pointer === 0)
    throw new Error("Could not allocate accessibility WebAssembly memory");
  return pointer;
}
export function revisionError(code: number): Error {
  switch (code) {
    case 1:
      return new TypeError("Invalid accessibility revision arguments");
    case 2:
      return new Error("Invalid accessibility snapshot");
    case 5:
      return new Error(
        "Previous accessibility revision belongs to another document",
      );
    default:
      return new Error(`Could not create accessibility revision: ${code}`);
  }
}
export class AccessibilityRevision {
  #runtime: Runtime;
  #pointer: number;
  constructor(runtime: Runtime, pointer: number) {
    this.#runtime = runtime;
    this.#pointer = pointer;
    revisions.register(this, { runtime, pointer });
  }
  static previousPointer(
    previous: AccessibilityRevision | null | undefined,
    runtime: Runtime,
  ): number {
    if (previous == null) return 0;
    if (!(previous instanceof AccessibilityRevision))
      throw new TypeError("Invalid previous accessibility revision");
    if (previous.#runtime !== runtime)
      throw new TypeError(
        "Previous accessibility revision belongs to another runtime",
      );
    return previous.#pointer;
  }
  get text(): string {
    const pointer = this.#pointer;
    const length =
      this.#runtime.exports.computer_use_browser_wasm_revision_text_length(
        pointer,
      );
    return this.#readText(length, (output, size) =>
      this.#runtime.exports.computer_use_browser_wasm_revision_copy_text(
        pointer,
        output,
        size,
      ),
    );
  }
  identityForElement(id: number): string | undefined {
    if (!Number.isSafeInteger(id))
      throw new TypeError("Accessibility element ID must be a safe integer");
    if (id < -2147483648 || id > 2147483647) return;
    const pointer = this.#pointer;
    const length =
      this.#runtime.exports.computer_use_browser_wasm_revision_identity_length(
        pointer,
        id,
      );
    if (!(length < 0))
      return this.#readText(length, (output, size) =>
        this.#runtime.exports.computer_use_browser_wasm_revision_copy_identity(
          pointer,
          id,
          output,
          size,
        ),
      );
  }
  isValueSettableForElement(id: number): boolean | undefined {
    if (!Number.isSafeInteger(id))
      throw new TypeError("Accessibility element ID must be a safe integer");
    if (id < -2147483648 || id > 2147483647) return;
    const result =
      this.#runtime.exports.computer_use_browser_wasm_revision_is_value_settable(
        this.#pointer,
        id,
      );
    return result < 0 ? undefined : result === 1;
  }
  #readText(
    length: number,
    copy: (pointer: number, length: number) => number,
  ): string {
    if (length < 0) throw new Error("Could not read accessibility text");
    if (length === 0) return "";
    const pointer = allocateAccessibilityBuffer(this.#runtime, length);
    try {
      if (copy(pointer, length) !== length)
        throw new Error("Could not copy accessibility text");
      return decoder.decode(
        new Uint8Array(this.#runtime.exports.memory.buffer, pointer, length),
      );
    } finally {
      this.#runtime.exports.computer_use_browser_wasm_deallocate(pointer);
    }
  }
}
export async function instantiateAccessibilityBytes(
  bytes: ArrayBuffer | Uint8Array,
  environment: Record<string, string>,
): Promise<Runtime> {
  const entries = Object.entries(environment).map(([key, value]) =>
    encoder.encode(`${key}=${value}\0`),
  );
  const size = entries.reduce((total, entry) => total + entry.byteLength, 0);
  const module = await WebAssembly.compile(bytes as BufferSource);
  let instance: Runtime;
  const view = () => new DataView(instance.exports.memory.buffer);
  const unsupported = () => 52;
  const imports: Record<string, (...args: any[]) => any> = Object.fromEntries(
    WebAssembly.Module.imports(module).map(({ module: namespace, name }) => {
      if (namespace !== "wasi_snapshot_preview1")
        throw new Error(
          `Unsupported WebAssembly import namespace: ${namespace}`,
        );
      return [name, unsupported];
    }),
  );
  Object.assign(imports, {
    args_get: () => 0,
    args_sizes_get(count: number, length: number) {
      view().setUint32(count, 0, true);
      view().setUint32(length, 0, true);
      return 0;
    },
    environ_get(pointers: number, buffer: number) {
      const memory = new Uint8Array(instance.exports.memory.buffer);
      for (const [index, entry] of entries.entries()) {
        view().setUint32(pointers + index * 4, buffer, true);
        memory.set(entry, buffer);
        buffer += entry.byteLength;
      }
      return 0;
    },
    environ_sizes_get(count: number, length: number) {
      view().setUint32(count, entries.length, true);
      view().setUint32(length, size, true);
      return 0;
    },
    clock_res_get(clock: number, output: number) {
      if (clock !== 0 && clock !== 1) return 28;
      view().setBigUint64(output, clock === 0 ? 1000000n : 1000n, true);
      return 0;
    },
    clock_time_get(clock: number, _precision: bigint, output: number) {
      let time: bigint;
      if (clock === 0) time = BigInt(Date.now()) * 1000000n;
      else if (clock === 1) time = BigInt(Math.round(performance.now() * 1e6));
      else return 28;
      view().setBigUint64(output, time, true);
      return 0;
    },
    fd_fdstat_get(fd: number, output: number) {
      if (fd < 0 || fd > 2) return 8;
      new Uint8Array(instance.exports.memory.buffer, output, 24).fill(0);
      view().setUint8(output, 2);
      return 0;
    },
    fd_fdstat_set_flags(fd: number) {
      return fd >= 0 && fd <= 2 ? 0 : 8;
    },
    fd_filestat_get(fd: number, output: number) {
      if (fd < 0 || fd > 2) return 8;
      new Uint8Array(instance.exports.memory.buffer, output, 64).fill(0);
      view().setUint8(output + 16, 2);
      view().setBigUint64(output + 24, 1n, true);
      return 0;
    },
    fd_prestat_get: () => 8,
    fd_prestat_dir_name: () => 8,
    fd_write(fd: number, vectors: number, count: number, written: number) {
      if (fd !== 1 && fd !== 2) return 8;
      let bytes = 0,
        text = "";
      const decoder = new TextDecoder();
      for (let index = 0; index < count; index += 1) {
        const pointer = view().getUint32(vectors + index * 8, true),
          length = view().getUint32(vectors + index * 8 + 4, true);
        text += decoder.decode(
          new Uint8Array(instance.exports.memory.buffer, pointer, length),
          { stream: true },
        );
        bytes += length;
      }
      text += decoder.decode();
      if (text.length > 0) console.error(text.trimEnd());
      view().setUint32(written, bytes, true);
      return 0;
    },
    proc_exit(code: number) {
      throw new Error(`Accessibility WebAssembly exited with code ${code}`);
    },
    random_get(pointer: number, length: number) {
      if (globalThis.crypto?.getRandomValues == null)
        throw new Error(
          "Secure randomness is unavailable for accessibility WebAssembly",
        );
      for (let offset = 0; offset < length; offset += 65536) {
        const size = Math.min(length - offset, 65536);
        globalThis.crypto.getRandomValues(
          new Uint8Array(
            instance.exports.memory.buffer,
            pointer + offset,
            size,
          ),
        );
      }
      return 0;
    },
  });
  instance = (await WebAssembly.instantiate(module, {
    wasi_snapshot_preview1: imports,
  })) as unknown as Runtime;
  instance.exports._initialize();
  return instance;
}
export async function loadBrowserAccessibilityWasm(
  source: URL | string | ArrayBuffer | Uint8Array = new URL(
    "./browser-accessibility.wasm.br",
    import.meta.url,
  ),
  options: { env?: Record<string, string | undefined> } = {},
) {
  const environment = Object.fromEntries(
    Object.entries(options.env ?? {}).filter(
      ([, value]) => value !== undefined,
    ),
  ) as Record<string, string>;
  for (const [key, value] of Object.entries(environment))
    if (typeof value !== "string" || key.includes("\0") || value.includes("\0"))
      throw new TypeError(
        "Invalid accessibility WebAssembly environment entry",
      );
  let instance: Runtime;
  if (source instanceof ArrayBuffer || source instanceof Uint8Array)
    instance = await instantiateAccessibilityBytes(source, environment);
  else {
    const [{ readFile }, { WASI }, { brotliDecompressSync }] =
      await Promise.all([
        import("node:fs/promises"),
        import("node:wasi"),
        import("node:zlib"),
      ]);
    const content = await readFile(source),
      bytes = String(source).endsWith(".br")
        ? brotliDecompressSync(content)
        : content;
    const wasi = new WASI({
      version: "preview1",
      env: environment,
      stdout: 2,
      stderr: 2,
    });
    const result = await WebAssembly.instantiate(
      bytes,
      wasi.getImportObject() as WebAssembly.Imports,
    );
    instance = result.instance as unknown as Runtime;
    wasi.initialize(result.instance);
  }
  const runtime = { exports: instance.exports };
  const required = [
    "memory",
    "computer_use_browser_wasm_allocate",
    "computer_use_browser_wasm_deallocate",
    "computer_use_browser_wasm_revision_create",
    "computer_use_browser_wasm_revision_release",
    "computer_use_browser_wasm_revision_text_length",
    "computer_use_browser_wasm_revision_copy_text",
    "computer_use_browser_wasm_revision_identity_length",
    "computer_use_browser_wasm_revision_copy_identity",
    "computer_use_browser_wasm_revision_is_value_settable",
  ] as const;
  for (const name of required)
    if (runtime.exports[name] == null)
      throw new Error(`Accessibility WebAssembly export is missing: ${name}`);
  return {
    buildRevision(
      previous: AccessibilityRevision | null | undefined,
      snapshot: object,
      options: { mode?: "auto" | "full" } | null = {},
    ) {
      if (snapshot == null || typeof snapshot !== "object")
        throw new TypeError("Accessibility snapshot must be an object");
      if (options != null && typeof options !== "object")
        throw new TypeError("Accessibility revision options must be an object");
      const mode =
        options == null || !("mode" in options) ? "auto" : options.mode;
      if (mode !== "auto" && mode !== "full")
        throw new TypeError(
          "Accessibility rendering mode must be auto or full",
        );
      const previousPointer = AccessibilityRevision.previousPointer(
        previous,
        runtime,
      );
      const json = encoder.encode(JSON.stringify(snapshot));
      const pointer = allocateAccessibilityBuffer(runtime, json.byteLength);
      let output = 0;
      try {
        output = allocateAccessibilityBuffer(runtime, 4);
        new Uint8Array(
          runtime.exports.memory.buffer,
          pointer,
          json.byteLength,
        ).set(json);
        new DataView(runtime.exports.memory.buffer).setUint32(output, 0, true);
        const code = runtime.exports.computer_use_browser_wasm_revision_create(
          previousPointer,
          pointer,
          json.byteLength,
          mode === "full" ? 1 : 0,
          output,
        );
        const revision = new DataView(runtime.exports.memory.buffer).getUint32(
          output,
          true,
        );
        if (code !== 0 || revision === 0) {
          if (revision !== 0)
            runtime.exports.computer_use_browser_wasm_revision_release(
              revision,
            );
          throw revisionError(code);
        }
        return new AccessibilityRevision(runtime, revision);
      } finally {
        if (output !== 0)
          runtime.exports.computer_use_browser_wasm_deallocate(output);
        runtime.exports.computer_use_browser_wasm_deallocate(pointer);
      }
    },
  };
}
