/** Original bundled h/o: Blob worker first, data URL fallback on construction failure. */
export interface KernelWorkerHost {
  Blob?: typeof Blob;
  URL?: Pick<typeof URL, "createObjectURL" | "revokeObjectURL">;
  webkitURL?: Pick<typeof URL, "createObjectURL" | "revokeObjectURL">;
  Worker: typeof Worker;
}
export function createKernelWorkerFactory(source: string, host: KernelWorkerHost | undefined = typeof self === "undefined" ? undefined : self) {
  const blob = host?.Blob && new host.Blob([
    "(self.URL || self.webkitURL).revokeObjectURL(self.location.href);", source,
  ], { type: "text/javascript;charset=utf-8" });
  return (options?: { name?: string }) => {
    let url: string | undefined;
    try {
      url = blob && (host!.URL || host!.webkitURL)!.createObjectURL(blob);
      if (!url) throw "";
      const worker = new host!.Worker(url, { name: options?.name });
      worker.addEventListener("error", () => (host!.URL || host!.webkitURL)!.revokeObjectURL(url!));
      return worker;
    } catch {
      const WorkerConstructor = host?.Worker ?? Worker;
      return new WorkerConstructor("data:text/javascript;charset=utf-8," + encodeURIComponent(source), { name: options?.name });
    }
  };
}
