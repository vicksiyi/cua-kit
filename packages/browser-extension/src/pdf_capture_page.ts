/** Original _g. Self-contained because Chrome serializes it into ISOLATED world. */
export async function capturePdfPage(
  expectedUrl: string,
  portName: string,
  maxBytes: number,
  chunkBytes: number,
  timeoutMs: number,
) {
  const controller = new AbortController();
  const port = chrome.runtime.connect({ name: portName });
  const timer = setTimeout(
    () => controller.abort(new Error("PDF capture timed out")),
    timeoutMs,
  );
  port.onDisconnect.addListener(() => controller.abort());
  let next: (() => void) | undefined;
  port.onMessage.addListener((message) => {
    if (message === "next") next?.();
  });
  const send = (message?: unknown) =>
    new Promise<void>((resolve, reject) => {
      controller.signal.throwIfAborted();
      const onAbort = () => reject(controller.signal.reason);
      controller.signal.addEventListener("abort", onAbort, { once: true });
      next = () => {
        controller.signal.removeEventListener("abort", onAbort);
        next = undefined;
        resolve();
      };
      if (message != null) port.postMessage(message);
    });
  try {
    await send();
    if (
      location.href !== expectedUrl ||
      document.contentType !== "application/pdf"
    )
      throw new Error("The PDF tab changed before capture");
    const response = await fetch(expectedUrl, {
      credentials: "include",
      redirect: "error",
      signal: controller.signal,
    });
    if (!response.ok || response.body == null)
      throw new Error(
        "Unable to read the PDF in this tab with a repeatable GET",
      );
    if (
      response.headers
        .get("content-type")
        ?.split(";")[0]
        ?.trim()
        .toLowerCase() !== "application/pdf"
    )
      throw new Error("The tab no longer returns a PDF");
    if (Number(response.headers.get("content-length")) > maxBytes)
      throw new Error("PDF tab context is limited to 128 MiB");
    const reader = response.body.getReader();
    let total = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > maxBytes)
          throw new Error("PDF tab context is limited to 128 MiB");
        for (let offset = 0; offset < value.length; offset += chunkBytes) {
          controller.signal.throwIfAborted();
          const chunk = value.subarray(offset, offset + chunkBytes);
          let binary = "";
          for (let part = 0; part < chunk.length; part += 32768)
            binary += String.fromCharCode(
              ...chunk.subarray(part, part + 32768),
            );
          await send({ data: btoa(binary) });
        }
      }
    } finally {
      await reader.cancel();
    }
    await send({ done: true });
  } catch (error) {
    if (!controller.signal.aborted)
      await send({
        error: error instanceof Error ? error.message : "PDF capture failed",
      }).catch(() => {});
  } finally {
    clearTimeout(timer);
    controller.abort();
    port.disconnect();
  }
}
