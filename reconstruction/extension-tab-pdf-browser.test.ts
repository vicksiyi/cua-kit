import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { build } from "esbuild";
import { chromium } from "playwright";

test(
  "real extension captures a PDF through Chrome isolated script and Port backpressure",
  { timeout: 60000 },
  async (t) => {
    const root = await mkdtemp(join(tmpdir(), "core-pdf-browser-"));
    t.after(() => rm(root, { recursive: true, force: true }));
    const extension = join(root, "extension");
    await mkdir(extension);
    await writeFile(
      join(extension, "manifest.json"),
      JSON.stringify({
        manifest_version: 3,
        name: "Core PDF capture fixture",
        version: "1.0.0",
        permissions: ["tabs", "scripting"],
        host_permissions: ["http://127.0.0.1/*"],
        background: { service_worker: "background.js" },
      }),
    );
    await build({
      stdin: {
        contents: `import {createTabPdfCapture} from './packages/browser-extension/src/tab_pdf_capture';globalThis.pdfCapture=createTabPdfCapture({chrome,randomUUID:()=>crypto.randomUUID(),setInterval,clearInterval});`,
        resolveDir: resolve("."),
        loader: "ts",
      },
      outfile: join(extension, "background.js"),
      bundle: true,
      format: "iife",
      platform: "browser",
      target: "chrome120",
    });
    let pdf: Buffer | undefined;
    let reads = 0;
    const server = createServer((req, res) => {
      if (req.url === "/fixture.pdf") {
        reads++;
        res.writeHead(200, {
          "Content-Type": "application/pdf",
          "Content-Length": pdf!.length,
          "Content-Disposition": "inline; filename=fixture.pdf",
        });
        res.end(pdf);
      } else {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(
          "<title>PDF fixture</title><h1>Local CUA PDF fixture</h1><p>No user data.</p>",
        );
      }
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    t.after(
      () => new Promise<void>((resolve) => server.close(() => resolve())),
    );
    const { port } = server.address() as { port: number };
    const context = await chromium.launchPersistentContext(
      join(root, "profile"),
      {
        channel: "chromium",
        headless: true,
        args: [
          `--disable-extensions-except=${extension}`,
          `--load-extension=${extension}`,
        ],
      },
    );
    try {
      const source = await context.newPage();
      await source.goto(`http://127.0.0.1:${port}/`);
      // Deterministic noise produces a PDF larger than two transport chunks.
      await source.evaluate(`(() => {
        const canvas=document.createElement('canvas');canvas.width=512;canvas.height=512;
        const context=canvas.getContext('2d');const image=context.createImageData(512,512);
        let seed=123456789;
        for(let i=0;i<image.data.length;i+=4){
          for(let channel=0;channel<3;channel++){
            seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;image.data[i+channel]=seed&255;
          }
          image.data[i+3]=255;
        }
        context.putImageData(image,0,0);document.body.append(canvas);
      })()`);
      pdf = await source.pdf();
      assert.ok(
        pdf.length > 2 * 256 * 1024,
        "fixture must exercise multiple chunks",
      );
      const page = await context.newPage();
      const url = `http://127.0.0.1:${port}/fixture.pdf`;
      await page.goto(url);
      const worker =
        context.serviceWorkers()[0] ??
        (await context.waitForEvent("serviceworker"));
      const result: any = await worker.evaluate(`(async()=>{
      const tab=(await chrome.tabs.query({})).find(tab=>tab.url===${JSON.stringify(url)});
      if(!tab)throw Error('PDF tab not found');
      const [state]=await chrome.scripting.executeScript({target:{tabId:tab.id},world:'ISOLATED',func:()=>({url:location.href,type:document.contentType})});
      if(state.result.type!=='application/pdf')throw Error('Unexpected PDF document: '+JSON.stringify(state));
      const file=await globalThis.pdfCapture.captureBytes(tab.id,${JSON.stringify(url)},state.documentId,'fixture.pdf',new AbortController().signal);
      const bytes=new Uint8Array(await file.arrayBuffer());
      const digest=await crypto.subtle.digest('SHA-256',bytes);
      return {name:file.name,type:file.type,size:file.size,hash:Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('')};
    })()`);
      const { createHash } = await import("node:crypto");
      assert.deepEqual(result, {
        name: "fixture.pdf",
        type: "application/pdf",
        size: pdf.length,
        hash: createHash("sha256").update(pdf).digest("hex"),
      });
      assert.ok(reads >= 2, "capture must issue its own repeatable GET");
    } finally {
      await context.close();
    }
  },
);
