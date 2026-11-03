import type { SnapshotMetadata } from "./snapshot_metadata";
export interface AXValue {
  value?: any;
  relatedNodes?: { backendDOMNodeId: number; text?: string; idref?: string }[];
  sources?: {
    superseded?: boolean;
    type: string;
    attribute?: string;
    value?: AXValue;
    attributeValue?: AXValue;
    nativeSourceValue?: AXValue;
  }[];
}
export interface RawAXNode {
  nodeId: string;
  ignored?: boolean;
  childIds?: string[];
  backendDOMNodeId?: number;
  role?: AXValue;
  chromeRole?: AXValue;
  name?: AXValue;
  value?: AXValue;
  description?: AXValue;
  properties?: { name: string; value: AXValue }[];
}
export interface AXDocument {
  frame: {
    frameId: string;
    parentFrameId?: string;
    ownerBackendNodeId?: number;
  };
  targetId: string;
  actionTargetId: string | null;
  nodes: RawAXNode[];
  metadata: Map<number, SnapshotMetadata>;
}
interface Property {
  value: any;
  relatedNodes: {
    targetIndex: number;
    text: string | null;
    idref: string | null;
  }[];
}
const allowedProperties = new Set([
  "atomic",
  "autocomplete",
  "busy",
  "checked",
  "controls",
  "describedby",
  "details",
  "disabled",
  "editable",
  "errormessage",
  "expanded",
  "flowto",
  "focusable",
  "focused",
  "hasPopup",
  "invalid",
  "keyshortcuts",
  "labelledby",
  "level",
  "live",
  "modal",
  "multiline",
  "multiselectable",
  "orientation",
  "placeholder",
  "pressed",
  "radiogroup",
  "relevant",
  "required",
  "roledescription",
  "selected",
  "settable",
  "url",
  "valuemax",
  "valuemin",
  "valuetext",
]);
/** Original Fv: byte-length-delimited identity, not JavaScript string length. */
export function accessibilityNodeIdentity(
  tabId: number,
  node: {
    targetID?: string | null;
    backendDOMNodeID?: number | null;
    nodeID: string;
  },
): string {
  return [
    String(tabId),
    node.targetID ?? "",
    node.backendDOMNodeID == null ? node.nodeID : String(node.backendDOMNodeID),
  ]
    .map((value) => `${new TextEncoder().encode(value).byteLength}:${value}`)
    .join("|");
}
/** Original ko/qv/_re. */
export function axValue(value?: AXValue): any {
  return value?.value ?? null;
}
export function referencesProtectedNode(
  value: AXValue | undefined,
  protectedNodes: Set<number>,
): boolean {
  return protectedNodes.size === 0
    ? false
    : value?.relatedNodes?.some((node) =>
        protectedNodes.has(node.backendDOMNodeId),
      ) === true ||
        value?.sources?.some(
          (source) =>
            source.superseded !== true &&
            [
              source.value,
              source.attributeValue,
              source.nativeSourceValue,
            ].some((nested) => referencesProtectedNode(nested, protectedNodes)),
        ) === true;
}
export function axNameSource(value?: AXValue): string | null {
  const source =
    value?.sources?.find(
      (source) =>
        source.superseded !== true &&
        (source.value != null || source.attributeValue != null),
    ) ?? value?.sources?.find((source) => source.superseded !== true);
  if (source == null) return null;
  switch (source.type) {
    case "contents":
    case "placeholder":
    case "relatedElement":
      return source.type;
    case "attribute":
      return source.attribute === "placeholder"
        ? "placeholder"
        : source.attribute === "value"
          ? "value"
          : "attribute";
    default:
      return null;
  }
}
/** Original wre. */
export function convertAXProperties(
  node: RawAXNode,
  indexes: Map<number, number>,
  protectedNodes: Set<number>,
): Record<string, Property> {
  const result: Record<string, Property> = {};
  for (const property of node.properties ?? []) {
    if (
      !allowedProperties.has(property.name) ||
      referencesProtectedNode(property.value, protectedNodes)
    )
      continue;
    const value = axValue(property.value),
      relatedNodes: Property["relatedNodes"] = [];
    for (const related of property.value.relatedNodes ?? []) {
      const targetIndex = indexes.get(related.backendDOMNodeId) ?? -1;
      if (targetIndex < 0 && related.text == null && related.idref == null)
        continue;
      relatedNodes.push({
        targetIndex,
        text: related.text ?? null,
        idref: related.idref ?? null,
      });
    }
    if (value != null || relatedNodes.length > 0)
      result[property.name] = { value, relatedNodes };
  }
  return result;
}
/** Original vre. */
export function convertAXDom(
  metadata: SnapshotMetadata | undefined,
  redact: boolean,
) {
  return metadata == null
    ? null
    : {
        bounds: metadata.bounds ?? null,
        identifier: (redact ? undefined : metadata.attributes.id) ?? null,
        className: (redact ? undefined : metadata.attributes.class) ?? null,
        declaredRole: (redact ? undefined : metadata.attributes.role) ?? null,
        hasAriaDescription:
          !redact && Object.hasOwn(metadata.attributes, "aria-description")
            ? true
            : null,
        tagName:
          !redact && ["input", "select", "textarea"].includes(metadata.tagName)
            ? metadata.tagName
            : null,
      };
}
/** Original yre: preserve node order while collapsing ignored ancestors and filtering protected content. */
export function convertAXDocument(document: AXDocument) {
  const byId = new Map(document.nodes.map((node) => [node.nodeId, node])),
    parents = new Map<string, string>(),
    hidden = new Set<string>(),
    ancestors = new Set<string>();
  const protectedNodes = new Set(
    [...document.metadata]
      .filter(([, metadata]) => metadata.closedShadow != null)
      .map(([id]) => id),
  );
  if (protectedNodes.size > 0) {
    const rawParents = new Map(
      document.nodes.flatMap((node) =>
        (node.childIds ?? []).map((child) => [child, node] as const),
      ),
    );
    const pending = document.nodes.filter(
      (node) =>
        node.backendDOMNodeId != null &&
        document.metadata.get(node.backendDOMNodeId)?.closedShadow === "inside",
    );
    while (pending.length > 0) {
      const node = pending.pop();
      if (node == null || hidden.has(node.nodeId)) continue;
      const metadata =
        node.backendDOMNodeId == null
          ? undefined
          : document.metadata.get(node.backendDOMNodeId);
      if (metadata != null && metadata.closedShadow !== "inside") continue;
      hidden.add(node.nodeId);
      if (node.backendDOMNodeId != null)
        protectedNodes.add(node.backendDOMNodeId);
      for (const child of node.childIds ?? []) {
        const target = byId.get(child);
        if (target != null) pending.push(target);
      }
    }
    for (const id of hidden) {
      let parent = rawParents.get(id);
      while (parent != null && !ancestors.has(parent.nodeId)) {
        ancestors.add(parent.nodeId);
        if (parent.backendDOMNodeId != null)
          protectedNodes.add(parent.backendDOMNodeId);
        parent = rawParents.get(parent.nodeId);
      }
    }
  }
  const safeValue =
    protectedNodes.size === 0
      ? axValue
      : (value: AXValue | undefined) =>
          referencesProtectedNode(value, protectedNodes)
            ? null
            : axValue(value);
  const visible = document.nodes.filter(
    (node) => !node.ignored && !hidden.has(node.nodeId),
  );
  for (const node of visible) {
    const pending = [...(node.childIds ?? [])],
      seen = new Set<string>();
    while (pending.length > 0) {
      const child = pending.pop();
      if (child == null || seen.has(child)) continue;
      seen.add(child);
      const target = byId.get(child);
      if (target == null) continue;
      if (!target.ignored && !hidden.has(child))
        parents.set(child, node.nodeId);
      else
        for (const descendant of target.childIds ?? [])
          pending.push(descendant);
    }
  }
  const indexes = new Map(visible.map((node, index) => [node.nodeId, index]));
  const backendIndexes = new Map(
    visible
      .filter((node) => node.backendDOMNodeId != null)
      .map((node) => [node.backendDOMNodeId!, indexes.get(node.nodeId)!]),
  );
  const credentialNodes = new Set(
    visible
      .filter((node) => {
        if (node.backendDOMNodeId == null) return false;
        const metadata = document.metadata.get(node.backendDOMNodeId);
        if (metadata != null) return metadata.credential;
        if (axValue(node.role) !== "MenuListPopup") return true;
        const parentId = parents.get(node.nodeId),
          parent = parentId == null ? undefined : byId.get(parentId),
          parentMetadata =
            parent?.backendDOMNodeId == null
              ? undefined
              : document.metadata.get(parent.backendDOMNodeId);
        return (
          parentMetadata?.tagName !== "select" ||
          parentMetadata.credential !== false
        );
      })
      .map((node) => node.nodeId),
  );
  return visible.map((node) => {
    const parentId = parents.get(node.nodeId),
      metadata =
        node.backendDOMNodeId == null
          ? undefined
          : document.metadata.get(node.backendDOMNodeId),
      credential =
        node.backendDOMNodeId != null && (metadata?.credential ?? true);
    let parent = parentId,
      credentialAncestor = false;
    while (parent != null) {
      if (credentialNodes.has(parent)) {
        credentialAncestor = true;
        break;
      }
      parent = parents.get(parent);
    }
    const rawValue = axValue(node.value),
      nameSource = axNameSource(node.name);
    const name =
      ((metadata?.closedShadow === "ancestor" || ancestors.has(node.nodeId)) &&
        nameSource === "contents") ||
      credentialAncestor ||
      (credential &&
        (nameSource === "value" || axValue(node.name) === rawValue))
        ? null
        : safeValue(node.name);
    const properties = convertAXProperties(
        node,
        backendIndexes,
        protectedNodes,
      ),
      redact = credential || credentialAncestor;
    if (redact) delete properties.valuetext;
    let value = safeValue(node.value);
    if (redact)
      value =
        metadata?.credential &&
        !credentialAncestor &&
        value !== null &&
        value !== ""
          ? "<redacted>"
          : null;
    return {
      parentIndex: (parentId == null ? undefined : indexes.get(parentId)) ?? -1,
      nodeID: `${document.targetId}:${document.frame.frameId}:${node.nodeId}`,
      role: axValue(node.role),
      chromeRole: axValue(node.chromeRole),
      name,
      nameSource,
      description: redact ? null : safeValue(node.description),
      value,
      properties,
      dom: convertAXDom(metadata, redact),
      backendDOMNodeID: node.backendDOMNodeId ?? null,
      targetID: document.actionTargetId,
      frameId: document.frame.frameId,
    };
  });
}
/** Original H2: join frame-local trees and rewrite relation indexes. */
export function mergeAXDocuments(documents: AXDocument[], warnings: string[]) {
  const result: ReturnType<typeof convertAXDocument> = [],
    owners = new Map<string, number>();
  for (const document of documents) {
    let parentIndex = -1;
    if (document.frame.parentFrameId != null) {
      const parent = documents.find(
        (item) => item.frame.frameId === document.frame.parentFrameId,
      );
      if (parent == null || document.frame.ownerBackendNodeId == null) {
        warnings.push(
          `Iframe ${document.frame.frameId} owner was not present in the accessibility tree`,
        );
        continue;
      }
      parentIndex =
        owners.get(`${parent.targetId}:${document.frame.ownerBackendNodeId}`) ??
        -1;
      if (parentIndex < 0) {
        warnings.push(
          `Iframe ${document.frame.frameId} owner was not present in the accessibility tree`,
        );
        continue;
      }
    }
    const nodes = convertAXDocument(document),
      offset = result.length;
    for (const node of nodes) {
      const properties = Object.fromEntries(
        Object.entries(node.properties).map(([name, property]) => [
          name,
          {
            ...property,
            relatedNodes: property.relatedNodes.map((related) => ({
              ...related,
              targetIndex:
                related.targetIndex < 0
                  ? related.targetIndex
                  : related.targetIndex + offset,
            })),
          },
        ]),
      );
      result.push({
        ...node,
        parentIndex:
          node.parentIndex >= 0 ? node.parentIndex + offset : parentIndex,
        properties,
      });
      if (node.backendDOMNodeID != null)
        owners.set(
          `${document.targetId}:${node.backendDOMNodeID}`,
          result.length - 1,
        );
    }
  }
  return result;
}
