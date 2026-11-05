import test from "node:test";
import { createServer } from "node:http";
import { startCdpHost } from "../packages/cdp-host/src/host";
import { verifyIndependentMcpBrowser } from "./independent-mcp-browser";
test(
  "restored CUA navigates, clicks and captures through extension-free CDP",
  { timeout: 120000 },
  async () => {
    const server = createServer((req, res) => {
      res.setHeader("content-type", "text/html");
      res.end(
        req.url === "/next"
          ? "<h1>Navigation target</h1><button onclick=\"document.querySelector('p').textContent='action-completed-marker'\">Run action</button><p>Ready</p>"
          : "<h1>Actual browser capture</h1>",
      );
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    let host: Awaited<ReturnType<typeof startCdpHost>> | undefined;
    try {
      host = await startCdpHost({ headless: true });
      await verifyIndependentMcpBrowser(
        host.endpointFile,
        `http://127.0.0.1:${(server.address() as { port: number }).port}/`,
        undefined,
        "cdp",
      );
    } finally {
      await host?.close();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  },
);
