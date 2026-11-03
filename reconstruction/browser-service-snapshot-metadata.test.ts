import test from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { originalServiceBindings } from "./service-source";
import {
  collectSnapshotMetadata,
  snapshotString,
} from "../packages/browser/src/service/accessibility/snapshot_metadata";
const original = originalServiceBindings(["gre", "bre", "Bo", "j2"]);

test("AX metadata matches original for real DOM snapshots, closed roots, slots and credential fields", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(
      `<div style="height:1200px"></div><input id="normal" class="box" aria-description="hint" value="ordinary"><input id="secret" type="password" value="secret"><textarea name="password">text</textarea><div id="open"></div><div id="closed"><span slot="s">slotted</span></div><iframe srcdoc="<input type=password value=frame-secret>"></iframe><div style="height:2000px"></div>`,
    );
    await page.evaluate(() => {
      document
        .querySelector("#open")!
        .attachShadow({ mode: "open" }).innerHTML =
        '<input name="email"><div id="nested"></div>';
      document
        .querySelector("#open")!
        .shadowRoot!.querySelector("#nested")!
        .attachShadow({ mode: "closed" }).innerHTML =
        "<button>hidden nested</button>";
      const closed = document
        .querySelector("#closed")!
        .attachShadow({ mode: "closed" });
      closed.innerHTML =
        '<slot name="s"></slot><input value="hidden"><div id="inner"></div>';
      closed.querySelector("#inner")!.attachShadow({ mode: "open" }).innerHTML =
        "<button>open inside closed</button>";
      window.scrollTo(0, 700);
    });
    const session = await page.context().newCDPSession(page);
    const snapshot = await session.send("DOMSnapshot.captureSnapshot", {
      computedStyles: [],
      includePaintOrder: false,
      includeDOMRects: false,
    });
    const ids = snapshot.documents.flatMap((d) => d.nodes.backendNodeId);
    for (const selected of [
      new Set(ids),
      new Set(ids.filter((_, index) => index % 2 === 0)),
      new Set<number>(),
    ]) {
      const expected = original.j2(snapshot, selected),
        actual = collectSnapshotMetadata(snapshot, selected);
      assert.deepEqual(actual, expected);
    }
    const metadata = collectSnapshotMetadata(snapshot, new Set(ids));
    const values = [...metadata.values()];
    assert.equal(
      values.find((v) => v.attributes.id === "secret")?.credential,
      true,
    );
    assert.equal(
      values.find((v) => v.attributes.id === "normal")?.credential,
      false,
    );
    assert(values.some((v) => v.closedShadow === "inside"));
    assert(values.some((v) => v.closedShadow === "ancestor"));
    assert(values.some((v) => v.bounds && v.bounds[1] < 0));
    assert(
      values
        .filter((v) => v.tagName === "textarea")
        .every((v) => !v.credential),
    );
  } finally {
    await browser.close();
  }
});

test("AX metadata preserves sparse indexes, attribute casing, bounds and duplicate document overwrite", () => {
  const strings = [
    "INPUT",
    "DIV",
    "SLOT",
    "closed",
    "open",
    "ID",
    "ordinary",
    "type",
    "password",
    "value",
    "do-not-project",
  ];
  const document = {
    nodes: {
      backendNodeId: [1, 2, 3, 4, 5, 6],
      nodeName: [1, 1, 2, 0, 0, 0],
      parentIndex: [-1, 0, 1, 2, 1, 0],
      shadowRootType: { index: [1, 2, 3, 4], value: [3, 3, 4, 3] },
      attributes: [[], [], [], [5, 6, 7, 8, 9, 10], [], [5]],
    },
    layout: {
      nodeIndex: [0, 1, 3, 4],
      bounds: [
        [1, 2, 3],
        [5, 6, 7, 8],
        [10, 20, 30, 40],
        [11, 22, 33, 44],
      ],
    },
    scrollOffsetX: 3,
    scrollOffsetY: 4,
  };
  for (const selected of [
    new Set<number>(),
    new Set([1, 3, 4, 6]),
    new Set([1, 2, 3, 4, 5, 6]),
  ]) {
    for (const documents of [
      [document],
      [
        document,
        {
          nodes: { backendNodeId: [4], nodeName: [1] },
          layout: { nodeIndex: [], bounds: [] },
        },
      ],
    ]) {
      const snapshot = { strings, documents };
      assert.deepEqual(
        collectSnapshotMetadata(snapshot, selected),
        original.j2(snapshot, selected),
      );
    }
  }
  for (const index of [undefined, -1, 0, 100])
    assert.equal(snapshotString(strings, index), original.Bo(strings, index));
});
