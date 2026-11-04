import type { createChatApiClass } from "./chat_api";
import { decodeKernelBytes } from "./kernel_fetch";
import { uploadLibraryPdf } from "./library_pdf_upload";
import { deleteKernelLibraryFile } from "./kernel_tunnel_runtime";
import { capturePdfPage } from "./pdf_capture_page";
const changedTab = "The selected tab changed while being read";
const maxBytes = 128 * 1024 * 1024,
  chunkBytes = 256 * 1024,
  timeoutMs = 180000;
type Api = InstanceType<ReturnType<typeof createChatApiClass>>;
/** Original vg. */
export function pdfCaptureFileName(title: string, url: URL) {
  const name = (
    title.trim() ||
    url.pathname.split("/").at(-1) ||
    "Browser document"
  )
    .replace(/[\\/\p{Cc}]/gu, "_")
    .slice(0, 180);
  return name.toLowerCase().endsWith(".pdf") ? name : `${name}.pdf`;
}
export function createTabPdfCapture(host: {
  chrome: Pick<typeof chrome, "tabs" | "runtime" | "scripting">;
  randomUUID(): string;
  setInterval: typeof globalThis.setInterval;
  clearInterval: typeof globalThis.clearInterval;
  fetch?: typeof fetch;
}) {
  const browser = host.chrome;
  async function assertTab(tabId: number, expectedUrl: string) {
    const tab = await browser.tabs.get(tabId);
    if (tab.incognito === true || tab.url !== expectedUrl)
      throw new Error(changedTab);
  }
  async function assertDocument(
    tabId: number,
    expectedUrl: string,
    documentId: string,
  ) {
    await assertTab(tabId, expectedUrl);
    const [result] = await browser.scripting.executeScript({
      target: { tabId },
      world: "ISOLATED",
      func: () => location.href,
    });
    if (result?.documentId !== documentId || result.result !== expectedUrl)
      throw new Error(changedTab);
  }
  /** Original gg: backpressure, exact sender binding, bounded chunks and signature. */
  async function captureBytes(
    tabId: number,
    expectedUrl: string,
    documentId: string,
    fileName: string,
    callerSignal: AbortSignal,
  ) {
    const signal = AbortSignal.any([
      callerSignal,
      AbortSignal.timeout(timeoutMs),
    ]);
    signal.throwIfAborted();
    const portName = `pdf-capture:${host.randomUUID()}`;
    const parts: Blob[] = [];
    let size = 0,
      connected: chrome.runtime.Port | undefined;
    let onAbort = () => {},
      onConnect = (_port: chrome.runtime.Port) => {};
    const captured = new Promise<void>((resolve, reject) => {
      onAbort = () => reject(signal.reason);
      signal.addEventListener("abort", onAbort, { once: true });
      onConnect = (port) => {
        if (port.name !== portName) return;
        const sender = port.sender;
        if (
          signal.aborted ||
          connected != null ||
          sender?.id !== browser.runtime.id ||
          sender.tab?.id !== tabId ||
          sender.tab.incognito === true ||
          sender.frameId !== 0 ||
          sender.documentId !== documentId ||
          sender.url !== expectedUrl
        ) {
          port.disconnect();
          reject(signal.aborted ? signal.reason : new Error(changedTab));
          return;
        }
        connected = port;
        port.onDisconnect.addListener(() =>
          reject(
            new Error("The PDF capture connection closed before completion"),
          ),
        );
        port.onMessage.addListener((message) => {
          try {
            signal.throwIfAborted();
            if (typeof message !== "object" || message == null)
              throw new Error("Invalid PDF capture response");
            if ("error" in message && typeof message.error === "string")
              throw new Error(message.error);
            if ("done" in message && message.done === true) resolve();
            else {
              if (
                !("data" in message) ||
                typeof message.data !== "string" ||
                message.data.length > Math.ceil(chunkBytes / 3) * 4
              )
                throw new Error("Invalid PDF capture chunk");
              const bytes = decodeKernelBytes(message.data);
              size += bytes.byteLength;
              if (bytes.byteLength > chunkBytes || size > maxBytes)
                throw new Error("PDF tab context is limited to 128 MiB");
              parts.push(new Blob([bytes]));
            }
            port.postMessage("next");
          } catch (error) {
            reject(error);
            port.disconnect();
          }
        });
        port.postMessage("next");
      };
      browser.runtime.onConnect.addListener(onConnect);
    });
    const execution = browser.scripting.executeScript({
      target: { tabId, documentIds: [documentId] },
      world: "ISOLATED",
      args: [expectedUrl, portName, maxBytes, chunkBytes, timeoutMs],
      func: capturePdfPage,
    });
    execution
      .finally(() => {
        browser.runtime.onConnect.removeListener(onConnect);
      })
      .catch(() => {});
    try {
      const [, [result]] = await Promise.all([captured, execution]);
      signal.throwIfAborted();
      if (result?.documentId !== documentId) throw new Error(changedTab);
      const file = new File(parts, fileName, { type: "application/pdf" });
      if ((await file.slice(0, 5).text()) !== "%PDF-")
        throw new Error("The tab did not return a valid PDF");
      return file;
    } finally {
      signal.removeEventListener("abort", onAbort);
      connected?.disconnect();
      parts.length = 0;
    }
  }
  /** Original mg, using the real restored Library upload/delete implementation. */
  async function captureToLibrary(
    { tabId, expectedUrl }: { tabId: number; expectedUrl: string },
    api: Api,
    callerSignal: AbortSignal,
  ) {
    const signal = AbortSignal.any([callerSignal, api.signal]);
    signal.throwIfAborted();
    if (!Number.isSafeInteger(tabId) || tabId < 0)
      throw new Error("A valid tab id is required");
    const url = new URL(expectedUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:")
      throw new Error("Tab reads require an HTTP or HTTPS URL");
    await assertTab(tabId, expectedUrl);
    const [result] = await browser.scripting
      .executeScript({
        target: { tabId },
        world: "ISOLATED",
        func: () => ({
          contentType: document.contentType,
          title: document.title,
          url: location.href,
        }),
      })
      .catch(async (error) => {
        signal.throwIfAborted();
        await assertTab(tabId, expectedUrl);
        throw error;
      });
    signal.throwIfAborted();
    if (result?.result?.url !== expectedUrl || !result.documentId)
      throw new Error(changedTab);
    if (result.result.contentType !== "application/pdf") return null;
    const heartbeat = host.setInterval(() => {
      browser.runtime.getPlatformInfo().catch(() => {});
    }, 25000);
    try {
      const documentId = result.documentId;
      const fileName = `.browser-context-${pdfCaptureFileName(result.result.title, url)}`;
      const file = await captureBytes(
        tabId,
        expectedUrl,
        documentId,
        fileName,
        signal,
      );
      await assertDocument(tabId, expectedUrl, documentId);
      signal.throwIfAborted();
      const uploaded = await uploadLibraryPdf(api, file, signal, host.fetch);
      try {
        await assertDocument(tabId, expectedUrl, documentId);
        signal.throwIfAborted();
        return { ...uploaded, fileName, title: result.result.title };
      } catch (error) {
        await deleteKernelLibraryFile(api, uploaded).catch(() => {});
        throw error;
      }
    } finally {
      host.clearInterval(heartbeat);
    }
  }
  return { captureBytes, captureToLibrary, assertTab, assertDocument };
}
