import type { Window } from "../../types/full-desktop/Window";
import type { AccessibilityNode } from "../../types/full-desktop/WindowState";
type NodeData = Omit<AccessibilityNode, "children" | "to_string"> & {
  children: NodeData[];
};
/** Restore presentation without replacing original enumerable tree data. */
export function accessibility_tree(
  node: NodeData,
  focused_modal?: Window,
): AccessibilityNode {
  for (const child of node.children) accessibility_tree(child);
  const render =
    focused_modal === undefined
      ? treeString
      : () =>
          `Focused modal window ${focused_modal.id}${focused_modal.title ? `: ${focused_modal.title}` : ""}\n${treeString.call(node)}`;
  return Object.defineProperties(node, {
    to_string: { value: render, configurable: true },
    [Symbol.for("nodejs.util.inspect.custom")]: {
      value: render,
      configurable: true,
    },
  }) as AccessibilityNode;
}
function treeString(this: NodeData) {
  const root = condense(this);
  if (root == null) return "";
  const lines: string[] = [];
  function visit(node: NodeData, depth: number) {
    lines.push(`${"\t".repeat(depth)}${node.id} ${describe(node)}`);
    for (const child of node.children) visit(child, depth + 1);
  }
  visit(root, 0);
  return lines.join("\n");
}
function describe(node: NodeData) {
  let role = node.role;
  if (container(node)) role = "container";
  else if (textNode(node)) role = "text";
  else if (role === "menu item") role = "";
  const flags: string[] = [],
    states = node.states;
  for (const state of [
    "focused",
    "selected",
    "expanded",
    "indeterminate",
  ] as const)
    if (states?.includes(state)) flags.push(state);
  if (states?.includes("checked")) flags.push("checked");
  else if (states?.includes("checkable") && !states.includes("indeterminate"))
    flags.push("unchecked");
  if (states?.includes("editable")) flags.push("settable");
  if (
    states != null &&
    !states.includes("enabled") &&
    !container(node) &&
    !textNode(node)
  )
    flags.push("disabled");
  const fields = content(node),
    singleContext =
      node.actions?.filter(
        (action) => action.toLowerCase() === "showcontextmenu",
      ).length === 1;
  const secondary = node.actions?.filter(
    (action, index) =>
      !(
        (index === 0 &&
          ["press", "click", "dodefault", "clickancestor"].includes(
            action.toLowerCase(),
          )) ||
        (singleContext && action.toLowerCase() === "showcontextmenu")
      ),
  );
  if (secondary?.length)
    fields.push({ title: "Secondary Actions", text: secondary.join(", ") });
  fields.sort((a, b) => Number(longText(a.text)) - Number(longText(b.text)));
  const description = fields
    .map((field) =>
      field.title == null ||
      (fields.length === 1 && field.title !== "Secondary Actions")
        ? field.text
        : `${field.title}: ${field.text}`,
    )
    .join(", ");
  return [role, flags.length ? `(${flags.join(", ")})` : "", description]
    .filter(Boolean)
    .join(" ")
    .replaceAll("\r", "\\r")
    .replaceAll("\n", "\\n")
    .replaceAll("\t", "\\t");
}
function condense(node: NodeData): NodeData | undefined {
  const children: NodeData[] = [];
  for (const child of node.children) {
    const reduced = condense(child);
    if (reduced != null) children.push(reduced);
  }
  const current = { ...node, children },
    hasContent = meaningful(current),
    interactive = actionable(current);
  if (!(
    hasContent ||
    children.length !== 0 ||
    (current.native_id ?? current.id).startsWith("x11:") ||
    (interactive &&
      (current.states == null ||
        current.states.includes("enabled") ||
        current.states.includes("focused")))
  ))
    return;
  if (!interactive && !hasContent && container(current)) {
    if (children.length === 1) return children[0];
    current.children = children.flatMap((child) =>
      child.role !== current.role || actionable(child) || meaningful(child)
        ? [child]
        : child.children,
    );
  }
  if (!current.children.some(interactiveSubtree)) {
    const ownText = content(current).map((field) => field.text);
    let changed = true;
    while (changed) {
      changed = false;
      current.children = current.children.flatMap((child) => {
        const fields = content(child);
        if (
          textNode(child) &&
          fields.length > 0 &&
          fields.every((field) =>
            ownText.some((text) => text.includes(field.text)),
          )
        ) {
          changed = true;
          return child.children;
        }
        return [child];
      });
    }
  }
  if (!interactive) {
    const merged: NodeData[] = [];
    let textRun: NodeData[] = [];
    function flush() {
      const first = textRun[0];
      if (first != null)
        merged.push(
          textRun.length === 1
            ? first
            : {
                ...first,
                role: "text",
                name: undefined,
                description: undefined,
                value: textRun
                  .flatMap((child) => content(child).map((field) => field.text))
                  .join(" "),
              },
        );
      textRun = [];
    }
    for (const child of current.children) {
      if (textNode(child) && !actionable(child) && child.children.length === 0)
        textRun.push(child);
      else {
        flush();
        merged.push(child);
      }
    }
    flush();
    current.children = merged;
  }
  return current;
}
function container(node: NodeData) {
  return ["group", "panel", "filler", "section", "generic"].includes(node.role);
}
function textNode(node: NodeData) {
  return ["text", "static", "label"].includes(node.role);
}
function actionable(node: NodeData) {
  return (
    node.actions?.some(
      (action) =>
        ![
          "dodefault",
          "clickancestor",
          "showcontextmenu",
          "scrolltovisible",
        ].includes(action.toLowerCase()),
    ) === true ||
    node.states?.some((state) =>
      [
        "focusable",
        "focused",
        "editable",
        "selected",
        "checkable",
        "checked",
        "indeterminate",
        "expanded",
      ].includes(state),
    ) === true ||
    [
      "push button",
      "button",
      "toggle button",
      "check box",
      "radio button",
      "entry",
      "password text",
      "link",
      "menu item",
      "check menu item",
      "radio menu item",
      "combo box",
      "slider",
      "spin button",
      "scroll bar",
      "scroll pane",
      "viewport",
    ].includes(node.role)
  );
}
function interactiveSubtree(node: NodeData): boolean {
  return actionable(node) || node.children.some(interactiveSubtree);
}
function meaningful(node: NodeData) {
  return (
    content(node).length > 0 || node.role === "image" || node.role === "icon"
  );
}
function content(node: NodeData) {
  const fields: Array<{ title: string | undefined; text: string }> = [],
    seen = new Set<string>();
  for (const [title, text] of [
    [undefined, node.name],
    ["Description", node.description],
    ["Value", node.value],
  ])
    if (text != null && text.trim() !== "" && !seen.has(text)) {
      fields.push({ title, text });
      seen.add(text);
    }
  return fields;
}
function longText(text: string) {
  return text.length > 100 || text.includes("\n");
}
