import test from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { originalServiceBindings } from "./service-source";
import { collectSnapshotMetadata } from "../packages/browser/src/service/accessibility/snapshot_metadata";
import {
  accessibilityNodeIdentity,
  convertAXDocument,
  mergeAXDocuments,
  axNameSource,
  referencesProtectedNode,
} from "../packages/browser/src/service/accessibility/tree_conversion";
const original = originalServiceBindings([
  "hre",
  "Fv",
  "ko",
  "qv",
  "_re",
  "vre",
  "wre",
  "yre",
  "H2",
]);

test("AX tree conversion matches original on real Chromium nodes and redacts credentials/closed roots", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(
      '<label for="normal">Public field</label><input id="normal" value="public-value"><label for="password">Password</label><input id="password" value="sensitive-value"><div id="closed"></div><button aria-describedby="description">Continue</button><p id="description">Details</p><select><option>One</option><option>Two</option></select>',
    );
    await page.evaluate(() => {
      document
        .querySelector("#closed")!
        .attachShadow({ mode: "closed" }).innerHTML =
        "<button>closed-secret</button>";
    });
    const session = await page.context().newCDPSession(page);
    await session.send("Accessibility.enable");
    const { nodes } = await session.send("Accessibility.getFullAXTree");
    const snapshot = await session.send("DOMSnapshot.captureSnapshot", {
      computedStyles: [],
    });
    const metadata = collectSnapshotMetadata(
      snapshot,
      new Set(
        nodes.flatMap((n) =>
          n.backendDOMNodeId == null ? [] : [n.backendDOMNodeId],
        ),
      ),
    );
    const document: any = {
      frame: { frameId: "main" },
      targetId: "tab:1",
      actionTargetId: null,
      nodes,
      metadata,
    };
    const actual = convertAXDocument(document);
    assert.deepEqual(actual, original.yre(document));
    assert(!JSON.stringify(actual).includes("sensitive-value"));
    assert(!JSON.stringify(actual).includes("closed-secret"));
    assert(JSON.stringify(actual).includes("<redacted>"));
    assert(JSON.stringify(actual).includes("public-value"));
  } finally {
    await browser.close();
  }
});

test("AX conversion preserves ignored ancestry, missing metadata, protected relations and frame offsets", () => {
  const value = (value: any) => ({ value });
  const meta = (
    tagName = "div",
    credential = false,
    closedShadow?: "inside" | "ancestor",
  ) => ({
    tagName,
    credential,
    closedShadow,
    attributes: { id: "id", class: "class", "aria-description": "hint" },
  });
  const nodes: any[] = [
    {
      nodeId: "root",
      backendDOMNodeId: 1,
      role: value("RootWebArea"),
      childIds: ["ignored", "host", "missing"],
    },
    { nodeId: "ignored", ignored: true, childIds: ["input", "owner"] },
    {
      nodeId: "input",
      backendDOMNodeId: 2,
      role: value("textbox"),
      name: {
        value: "secret",
        sources: [
          { type: "attribute", attribute: "value", value: value("secret") },
        ],
      },
      value: value("secret"),
      description: value("private"),
      properties: [
        { name: "valuetext", value: value("private") },
        { name: "disabled", value: value(false) },
      ],
      childIds: ["text"],
    },
    { nodeId: "text", role: value("StaticText"), name: value("secret child") },
    {
      nodeId: "owner",
      backendDOMNodeId: 3,
      role: value("Iframe"),
      properties: [
        {
          name: "controls",
          value: {
            relatedNodes: [
              { backendDOMNodeId: 2 },
              { backendDOMNodeId: 999, text: "external" },
              { backendDOMNodeId: 998 },
            ],
          },
        },
        { name: "unknown", value: value("ignored") },
      ],
    },
    {
      nodeId: "host",
      backendDOMNodeId: 4,
      name: { value: "closed text", sources: [{ type: "contents" }] },
      childIds: ["hidden"],
    },
    { nodeId: "hidden", backendDOMNodeId: 5, childIds: ["anonymous"] },
    { nodeId: "anonymous", name: value("hidden anonymous") },
    {
      nodeId: "missing",
      backendDOMNodeId: 6,
      name: value("missing metadata"),
      description: value("private"),
      value: value("private"),
    },
  ];
  const metadata = new Map([
    [1, meta()],
    [2, meta("input", true)],
    [3, meta("iframe")],
    [4, meta("div", false, "ancestor")],
    [5, meta("div", false, "inside")],
  ]);
  const root: any = {
    frame: { frameId: "root" },
    targetId: "tab:1",
    actionTargetId: null,
    nodes,
    metadata,
  };
  const child: any = {
    frame: { frameId: "child", parentFrameId: "root", ownerBackendNodeId: 3 },
    targetId: "child-target",
    actionTargetId: "child-target",
    nodes: [
      {
        nodeId: "child-root",
        backendDOMNodeId: 10,
        role: value("RootWebArea"),
        properties: [
          {
            name: "controls",
            value: {
              relatedNodes: [
                { backendDOMNodeId: 10 },
                { backendDOMNodeId: 100, text: "outside" },
              ],
            },
          },
        ],
      },
    ],
    metadata: new Map([[10, meta()]]),
  };
  for (const documents of [
    [root],
    [root, child],
    [child, root],
    [root, { ...child, frame: { ...child.frame, ownerBackendNodeId: 999 } }],
    [root, { ...child, frame: { ...child.frame, parentFrameId: "absent" } }],
  ]) {
    const warnings: string[] = [],
      expectedWarnings: string[] = [];
    assert.deepEqual(
      mergeAXDocuments(documents, warnings),
      original.H2(documents, expectedWarnings),
    );
    assert.deepEqual(warnings, expectedWarnings);
  }
  for (const node of [
    { nodeID: "汉字|💡", targetID: "例子" },
    { nodeID: "x", targetID: "a:b", backendDOMNodeID: 12 },
  ])
    assert.equal(accessibilityNodeIdentity(2, node), original.Fv(2, node));
  for (const source of [
    undefined,
    { sources: [{ type: "attribute", attribute: "placeholder" }] },
    {
      sources: [
        { type: "contents", superseded: true },
        { type: "relatedElement" },
      ],
    },
    { sources: [{ type: "unknown", value: value("x") }, { type: "contents" }] },
  ])
    assert.equal(axNameSource(source), original._re(source));
  for (const superseded of [false, true]) {
    const source = {
      sources: [
        {
          type: "relatedElement",
          superseded,
          nativeSourceValue: { relatedNodes: [{ backendDOMNodeId: 5 }] },
        },
      ],
    };
    assert.equal(
      referencesProtectedNode(source, new Set([5])),
      original.qv(source, new Set([5])),
    );
  }
});
