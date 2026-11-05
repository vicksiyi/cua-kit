import test from "node:test";
import assert from "node:assert/strict";
import { decodeMediaMessage } from "../packages/runtime-supervisor/src/media";
test("media envelopes use data URLs only and preserve binary bytes", async () => {
  assert.deepEqual(
    await decodeMediaMessage({
      type: "emit_image",
      image_url: "data:image/png,%89PNG%0D%0A%1A%0A",
    }),
    {
      type: "image",
      mimeType: "image/png",
      data: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).toString("base64"),
    },
  );
  for (const url of [
    "https://example.com/image.png",
    "file:///tmp/image.png",
    "data:text/plain;base64,AA==",
    "data:image/png;base64,!!!!",
    "data:image/png;base64,",
    "data:image/png," + "x".repeat(8 * 1024 * 1024),
  ]) {
    await assert.rejects(
      decodeMediaMessage({ type: "emit_image", image_url: url }),
    );
  }
  await assert.rejects(
    decodeMediaMessage({
      type: "emit_audio",
      audio_url: "data:image/png;base64,AA==",
    }),
    /MIME/,
  );
});
