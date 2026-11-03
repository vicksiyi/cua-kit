/** DOMSnapshot metadata consumed by the original AX capture builder (j2/Bo). */
export interface SnapshotDocument {
  nodes: {
    backendNodeId?: number[];
    nodeName?: number[];
    attributes?: number[][];
    parentIndex?: number[];
    shadowRootType?: { index: number[]; value: number[] };
  };
  layout: { nodeIndex: number[]; bounds: number[][] };
  scrollOffsetX?: number;
  scrollOffsetY?: number;
}
export interface SnapshotMetadata {
  tagName: string;
  attributes: Record<string, string>;
  credential: boolean;
  closedShadow?: "inside" | "ancestor";
  bounds?: [number, number, number, number];
}
const visibleAttributes = new Set(["id", "class", "role", "aria-description"]);
const credentialAttributes = new Set([
  "type",
  "autocomplete",
  "id",
  "name",
  "placeholder",
  "aria-label",
  "title",
]);
/** Original Bo: missing string indexes resolve to an empty string. */
export function snapshotString(
  strings: string[],
  index: number | undefined,
): string {
  return (index == null ? undefined : strings[index]) ?? "";
}
/** Original j2. Preserve source node order, closed-root ancestry and attribute casing. */
export function collectSnapshotMetadata(
  snapshot: { documents: SnapshotDocument[]; strings: string[] },
  includedBackendNodes: Set<number>,
): Map<number, SnapshotMetadata> {
  const result = new Map<number, SnapshotMetadata>();
  for (const document of snapshot.documents) {
    const backendIds = document.nodes.backendNodeId ?? [],
      names = document.nodes.nodeName ?? [],
      attributes = document.nodes.attributes ?? [];
    const bounds = new Map<number, [number, number, number, number]>(),
      closedNodes = new Map<number, "inside" | "ancestor">();
    const shadowRoots = document.nodes.shadowRootType,
      modes = new Map<number, string>();
    for (const [valueIndex, nodeIndex] of (
      shadowRoots?.index ?? []
    ).entries()) {
      const mode = snapshotString(
        snapshot.strings,
        shadowRoots?.value[valueIndex],
      );
      modes.set(nodeIndex, mode);
      if (mode === "closed") closedNodes.set(nodeIndex, "inside");
    }
    if (closedNodes.size > 0) {
      interface ShadowContext {
        mode: string;
        parent?: ShadowContext;
        insideClosedRoot: boolean;
      }
      const contexts: (ShadowContext | undefined)[] = [];
      for (let index = 0; index < backendIds.length; index++) {
        const parentIndex = document.nodes.parentIndex?.[index],
          mode = modes.get(index);
        let context = parentIndex == null ? undefined : contexts[parentIndex];
        if (mode == null) context = undefined;
        else if (mode !== context?.mode)
          context =
            snapshotString(
              snapshot.strings,
              parentIndex == null ? undefined : names[parentIndex],
            )
              .split(":")
              .at(-1)
              ?.toLowerCase() === "slot"
              ? context?.parent
              : {
                  mode,
                  parent: context,
                  insideClosedRoot:
                    mode === "closed" || context?.insideClosedRoot === true,
                };
        contexts[index] = context;
        if (context?.insideClosedRoot) closedNodes.set(index, "inside");
      }
      for (let index = backendIds.length - 1; index >= 0; index--) {
        const parentIndex = document.nodes.parentIndex?.[index];
        if (
          closedNodes.has(index) &&
          parentIndex != null &&
          parentIndex >= 0 &&
          !closedNodes.has(parentIndex)
        )
          closedNodes.set(parentIndex, "ancestor");
      }
    }
    for (let index = 0; index < document.layout.nodeIndex.length; index++) {
      const nodeIndex = document.layout.nodeIndex[index];
      if (nodeIndex == null) continue;
      const backendId = backendIds[nodeIndex];
      if (backendId == null || !includedBackendNodes.has(backendId)) continue;
      const rect = document.layout.bounds[index];
      if (rect == null || rect.length < 4) continue;
      bounds.set(nodeIndex, [
        (rect[0] ?? 0) - (document.scrollOffsetX ?? 0),
        (rect[1] ?? 0) - (document.scrollOffsetY ?? 0),
        rect[2] ?? 0,
        rect[3] ?? 0,
      ]);
    }
    for (let index = 0; index < backendIds.length; index++) {
      const backendId = backendIds[index];
      if (
        backendId == null ||
        (!includedBackendNodes.has(backendId) && !closedNodes.has(index))
      )
        continue;
      const projected: Record<string, string> = {},
        credentialValues: string[] = [],
        sourceAttributes = attributes[index] ?? [];
      for (
        let attributeIndex = 0;
        attributeIndex < sourceAttributes.length;
        attributeIndex += 2
      ) {
        const name = snapshotString(
            snapshot.strings,
            sourceAttributes[attributeIndex],
          ),
          value = snapshotString(
            snapshot.strings,
            sourceAttributes[attributeIndex + 1],
          ),
          lower = name.toLowerCase();
        if (visibleAttributes.has(lower)) projected[name] = value;
        if (credentialAttributes.has(lower)) credentialValues.push(value);
      }
      const tagName = snapshotString(
        snapshot.strings,
        names[index],
      ).toLowerCase();
      const credential =
        tagName === "input" &&
        /user[-_ ]?name|e[-_ ]?mail|one[-_ ]?time[-_ ]?code|password|passcode|passwd|\botp\b|\b(?:2fa|mfa)\b|phone|mobile|\btel\b/i.test(
          credentialValues.join(" "),
        );
      result.set(backendId, {
        tagName,
        attributes: projected,
        credential,
        closedShadow: closedNodes.get(index),
        bounds: bounds.get(index),
      });
    }
  }
  return result;
}
